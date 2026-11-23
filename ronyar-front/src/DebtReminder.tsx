import { useEffect, useRef, useState } from "react";
import { ApiError, formatDecimal, getParty, previewDebtReminder, sendDebtReminder, updateParty } from "./api";
import type { DebtReminderPreview, DebtReminderResult } from "./api";
import { normalizeMobile, validMobile } from "./authIdentifier";

export default function DebtReminder({ businessId, partyId, onSessionExpired }: {
  businessId: string;
  partyId: string;
  onSessionExpired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState("");
  const [savedMobile, setSavedMobile] = useState("");
  const [loadingMobile, setLoadingMobile] = useState(false);
  const [mobileNotice, setMobileNotice] = useState("");
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;
  const [card, setCard] = useState("");
  const [preview, setPreview] = useState<(DebtReminderPreview & { commandId: string }) | null>(null);
  const [result, setResult] = useState<DebtReminderResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingMobile(true);
    getParty(businessId, partyId, controller.signal).then(party => {
      if (controller.signal.aborted) return;
      const value = normalizeMobile(party.mobile ?? "");
      setSavedMobile(value);
      setMobile(value.startsWith("+98") ? "0" + value.slice(3) : value);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) expired.current();
      else setMobileNotice("شمارهٔ ثبت‌شده بارگیری نشد. می‌توانید شمارهٔ صحیح را وارد و ذخیره کنید.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingMobile(false);
    });
    return () => controller.abort();
  }, [open, businessId, partyId]);

  async function saveMobile() {
    if (inFlight.current) return;
    if (!validMobile(mobile)) {
      setError("شمارهٔ موبایل معتبر وارد کنید.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMobileNotice("");
    setPreview(null);
    try {
      const party = await updateParty(businessId, partyId, { mobile: normalizeMobile(mobile) });
      const value = normalizeMobile(party.mobile ?? "");
      setSavedMobile(value);
      setMobile(value.startsWith("+98") ? "0" + value.slice(3) : value);
      setMobileNotice("شمارهٔ موبایل در پروندهٔ مشتری ذخیره شد.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      else setError("شمارهٔ موبایل ذخیره نشد. دوباره تلاش کنید.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    if (inFlight.current) return;
    if (!/^[0-9]{16}$/.test(card)) {
      setError("شماره کارت ۱۶ رقمی فروشگاه را وارد کنید.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        const response = await previewDebtReminder(businessId, partyId, card);
        setPreview({ ...response, commandId: crypto.randomUUID() });
      } else {
        setAttempted(true);
        setResult(await sendDebtReminder(businessId, partyId, card, preview.token, preview.commandId));
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      if (cause instanceof ApiError && cause.status === 409) {
        setPreview(null);
        setAttempted(false);
      }
      const message = cause instanceof ApiError ? cause.serverMessage : undefined;
      setError(message && /[\u0600-\u06ff]/.test(message) ? message
        : cause instanceof ApiError && cause.status === 404 ? "ارسال یادآوری برای این حساب در دسترس نیست."
        : "نتیجهٔ درخواست دریافت نشد. برای پیگیری، همین درخواست را دوباره بررسی کنید.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className="secondary" onClick={() => setOpen(true)}>یادآوری بدهی با پیامک</button>;

  const mobileChanged = normalizeMobile(mobile) !== savedMobile;
  return <section className="notice" aria-label="یادآوری بدهی با پیامک">
    {!result && <div>
      <label>شماره موبایل مشتری
        <input type="tel" dir="ltr" autoComplete="off" value={mobile} disabled={loadingMobile || busy || attempted}
          placeholder="09xxxxxxxxx" onChange={event => {
            setMobile(event.target.value);
            setPreview(null);
            setError("");
            setMobileNotice("");
          }} />
      </label>
      <button type="button" className="secondary" disabled={loadingMobile || busy || attempted || !mobileChanged}
        onClick={saveMobile}>ذخیرهٔ شماره موبایل</button>
      {loadingMobile && <p role="status">در حال دریافت شمارهٔ مشتری…</p>}
      {mobileNotice && <p role="status">{mobileNotice}</p>}
    </div>}
    {!result && <label>شماره کارت فروشگاه
      <input dir="ltr" inputMode="numeric" autoComplete="off" value={card} disabled={busy || attempted}
        onChange={event => {
          setCard(event.target.value.replace(/[۰-۹٠-٩]/g, digit => String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit) % 10)).replace(/[\s-]/g, ""));
          setPreview(null);
          setError("");
        }} />
    </label>}
    {preview && !result && <>
      <p>گیرنده: {preview.customer} · <bdi>{preview.mobile}</bdi></p>
      <p>سلام، مانده بدهی شما به فروشگاه {preview.store} مبلغ {formatDecimal(preview.amount)} تومان است.<br />
        لطفاً برای تسویه، مبلغ را به شماره کارت <bdi>{card}</bdi> واریز کنید.<br />رانیار</p>
    </>}
    {error && <p role="alert">{error}</p>}
    {result && <p role="status">{result.state === "ACCEPTED" ? "درخواست ارسال را پیام‌رسان پذیرفت."
      : result.state === "REJECTED" ? "پیام‌رسان درخواست ارسال را رد کرد."
      : "نتیجهٔ ارسال هنوز مشخص نیست. همین پیام را دوباره نفرستید."}
      {result.providerId && <> شناسهٔ پیامک: <bdi>{result.providerId}</bdi></>}
    </p>}
    {!result && <button type="button" className="primary" disabled={busy || loadingMobile || mobileChanged} onClick={submit}>
      {busy ? "در حال انجام…" : attempted ? "پیگیری همین درخواست" : preview ? "تأیید و ارسال پیامک" : "پیش‌نمایش پیامک"}
    </button>}
    {!attempted && <button type="button" className="secondary" disabled={busy} onClick={() => {
      setOpen(false); setCard(""); setMobile(""); setSavedMobile(""); setMobileNotice(""); setPreview(null); setError("");
    }}>انصراف</button>}
  </section>;
}
