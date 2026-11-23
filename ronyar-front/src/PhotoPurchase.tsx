import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  errorText,
  formatDecimal,
  listUnits,
  photoCommand,
} from "./api";
import type { Business, ProductUnit } from "./api";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import { loadPurchaseOptions } from "./purchaseOptions";
import { periodForDate } from "./documentPeriod";
import {
  photoDate,
  photoLine,
  photoMoney,
  photoName,
  photoTotal,
} from "./photoPurchasePlan";
import type { PhotoSession } from "./photoPurchasePlan";
import { useStoreCan } from "./StorePermissions";
import "./PhotoPurchase.css";
type Props = {
  business: Business;
  onClose: () => void;
  onCreated: (id: string) => void;
  onSessionExpired: () => void;
};
type Row = {
  name: string;
  productId: string;
  kind: "GOODS" | "SERVICE" | "";
  unitId: string;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  taxRate: string;
  confirmSimilar: boolean;
};
const placeholder = "00000000-0000-4000-8000-000000000001";
const messages: Record<string, string> = {
  AI_NOT_CONFIGURED: "این قابلیت فعلاً فعال نیست.",
  PHOTO_TRANSCRIPTION_LAYOUT:
    "ردیف‌های عکس درست تفکیک نشدند؛ پردازش پیش از مرحلهٔ دوم متوقف شد. عکس واضح‌تر و کامل‌تری بفرستید.",
  PHOTO_ROW_MISMATCH:
    "تعداد ردیف‌های پیشنهاد با رونویسی برابر نیست؛ برای جلوگیری از خرید ناقص، خروجی رد شد.",
  PHOTO_OUTPUT_NUMBER:
    "مدل عددی با قالب نامعتبر برگرداند؛ مقدار حدس زده یا ثبت نشده است.",
  PHOTO_FILE: "عکس باید PNG یا JPEG و حداکثر ۲ مگابایت باشد.",
  PHOTO_DAILY_LIMIT: "سقف روزانه خواندن عکس پر شده است.",
  ASSISTANT_DAILY_LIMIT:
    "سهمیهٔ امروز برای خواندن عکس کافی نیست؛ این کار ۲ واحد سهمیه لازم دارد.",
  PHOTO_DUPLICATE:
    "این عکس یا شماره فاکتور قبلاً استفاده شده است؛ فهرست خرید را بررسی کنید.",
  PHOTO_PROCESSING: "خواندن عکس در جریان است؛ کمی بعد وضعیت را بررسی کنید.",
  PHOTO_VERSION:
    "وضعیت تغییر کرده یا مهلت بازبینی تمام شده است؛ وضعیت را تازه کنید.",
  PHOTO_TOTAL_MISMATCH: "جمع ردیف‌ها با جمع فاکتور برابر نیست.",
  PHOTO_PARTY_EXISTS: "شخصی با همین نام وجود دارد؛ از فهرست انتخاب کنید.",
  PHOTO_PRODUCT_EXISTS: "کالا یا خدمت هم‌نام وجود دارد؛ از فهرست انتخاب کنید.",
  PHOTO_REVIEW_SIMILAR: "موارد مشابه را بررسی و تعریف مورد تازه را تأیید کنید.",
  AI_CREDIT_REQUIRED: "اعتبار سرویس خواندن عکس کافی نیست.",
  AI_PROVIDER_ERROR:
    "خواندن عکس انجام نشد؛ تلاش دوباره ممکن است هزینه داشته باشد.",
  AI_INVALID_OUTPUT:
    "عکس به پاسخ قابل بررسی تبدیل نشد؛ تصویر واضح‌تری لازم است.",
  PHOTO_ALREADY_DRAFTED:
    "پیش‌نویس این عکس قبلاً ساخته شده است؛ وضعیت را بررسی کنید.",
};
export default function PhotoPurchase({
  business,
  onClose,
  onCreated,
  onSessionExpired,
}: Props) {
  const key = `ranyar.photo-purchase:${business.id}`,
    can = useStoreCan();
  const [configLoaded, setConfigLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [files, setFiles] = useState<{ mime: string; base64: string }[]>([]),
    [session, setSession] = useState<PhotoSession | null>(null);
  const [options, setOptions] = useState<Awaited<
      ReturnType<typeof loadPurchaseOptions>
    > | null>(null),
    [units, setUnits] = useState<ProductUnit[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [supplier, setSupplier] = useState(""),
    [partyId, setPartyId] = useState(""),
    [newParty, setNewParty] = useState(false),
    [partyConfirmed, setPartyConfirmed] = useState(false),
    [currency, setCurrency] = useState(""),
    [date, setDate] = useState(""),
    [invoice, setInvoice] = useState(""),
    [total, setTotal] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [pending, setPending] = useState<unknown | null>(null);
  const flight = useRef(false),
    alive = useRef(true);
  function fail(e: unknown) {
    if (!alive.current) return;
    setError(
      e instanceof ApiError
        ? (messages[e.code] ?? errorText(e))
        : e instanceof Error
          ? e.message
          : errorText(e),
    );
    if (e instanceof ApiError && e.status === 401) onSessionExpired();
  }
  async function run(fn: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function receive(r: PhotoSession) {
    setSession(r);
    if (r.errorCode) setError(messages[r.errorCode] ?? "خواندن عکس انجام نشد.");
    if (r.purchaseId) {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(key + ":command");
      onCreated(r.purchaseId);
    }
  }
  async function refresh(id: string) {
    const r = await photoCommand<PhotoSession>(business.id, id);
    if (!alive.current) return;
    receive(r);
    const images = await photoCommand<{ mime: string; base64: string }[]>(
      business.id,
      `${id}/images`,
    );
    if (alive.current) setFiles(images);
  }
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void run(async () => {
      const cfg = await photoCommand<{ enabled: boolean }>(
        business.id,
        "config",
      );
      if (alive.current) { setEnabled(cfg.enabled); setConfigLoaded(true); }
      const [o, u] = await Promise.all([
        loadPurchaseOptions(business.id, abort.signal),
        listUnits(business.id, abort.signal),
      ]);
      if (!alive.current) return;
      setOptions(o);
      setUnits(u);
      const id = sessionStorage.getItem(key);
      if (id) {
        await refresh(id);
        const saved = sessionStorage.getItem(key + ":command");
        if (saved && alive.current) setPending(JSON.parse(saved));
      }
    });
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, [business.id]);
  useEffect(() => {
    const p = session?.proposal;
    if (!p || !options) return;
    setCurrency(p.currency ?? "");
    setSupplier(p.supplier ?? "");
    setInvoice(p.invoiceNumber ?? "");
    setDate(photoDate(p.documentDate));
    setTotal(p.total ?? "");
    setReviewed(false);
    const parties = options.suppliers.filter(
      (x) => photoName(x.name) === photoName(p.supplier ?? ""),
    );
    setPartyId(parties.length === 1 ? parties[0].id : "");
    const defaults = options.warehouses.filter((w) => w.isDefault);
    const warehouse =
      defaults.length === 1
        ? defaults[0].id
        : options.warehouses.length === 1
          ? options.warehouses[0].id
          : "";
    setRows(
      p.items.map((r) => {
        const matches = options.products.filter(
            (x) => photoName(x.name) === photoName(r.name ?? ""),
          ),
          product = matches.length === 1 ? matches[0] : null;
        const unit = units.filter(
          (x) => photoName(x.name) === photoName(r.unit ?? ""),
        );
        return {
          name: r.name ?? "",
          productId: product?.id ?? "",
          kind: product?.kind ?? r.kind ?? "",
          unitId: product?.unit.id ?? (unit.length === 1 ? unit[0].id : ""),
          warehouseId: (product?.kind ?? r.kind) === "SERVICE" ? "" : warehouse,
          quantity: r.quantity ?? "",
          unitPrice: r.unitPrice ?? "",
          lineTotal: r.lineTotal ?? "",
          discountAmount: r.discountAmount ?? "",
          taxRate: r.taxRate ?? "",
          confirmSimilar: false,
        };
      }),
    );
  }, [session?.proposal, options, units]);
  const patch = (i: number, c: Partial<Row>) => {
    setReviewed(false);
    setRows(rows.map((r, j) => (i === j ? { ...r, ...c } : r)));
  };
  async function choose(list: FileList | null) {
    if (!list) return;
    await run(async () => {
      const chosen = Array.from(list);
      if (chosen.length < 1 || chosen.length > 3)
        throw new Error("یک تا سه عکس از یک فاکتور انتخاب کنید.");
      const result = [];
      for (const f of chosen) {
        if (!["image/png", "image/jpeg"].includes(f.type) || f.size > 2097152)
          throw new Error(messages.PHOTO_FILE);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("فایل خوانده نشد."));
          reader.readAsDataURL(f);
        });
        result.push({ mime: f.type, base64 });
      }
      setFiles(result);
      setConsent(false);
    });
  }
  async function upload() {
    await run(async () => {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      const r = await photoCommand<PhotoSession>(business.id, "upload", {
        id,
        consent,
        images: files,
      });
      sessionStorage.setItem(key, r.id);
      receive(r);
    });
  }
  async function extract() {
    if (!session) return;
    await run(async () => {
      const r = await photoCommand<PhotoSession>(
        business.id,
        `${session.id}/extract`,
        { version: session.version },
      );
      if (alive.current) receive(r);
    });
  }
  function reset() {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(key + ":command");
    setSession(null);
    setPending(null);
    setFiles([]);
    setRows([]);
    setConsent(false);
    setError("");
  }
  let computed = "",
    reconcile = "";
  try {
    if (rows.length)
      computed = photoTotal(rows, currency, business.currencyScale);
    if (
      rows.some(
        (r) =>
          photoMoney(r.lineTotal, currency) !==
          photoMoney(photoTotal([r], currency, business.currencyScale), "IRR"),
      )
    )
      reconcile = "جمع یک یا چند ردیف با اعداد آن برابر نیست.";
    if (computed && photoMoney(total, currency) !== photoMoney(computed, "IRR"))
      reconcile = "جمع ردیف‌ها با جمع فاکتور برابر نیست.";
  } catch (e) {
    reconcile = e instanceof Error ? e.message : "اطلاعات ردیف‌ها ناقص است.";
  }
  async function save() {
    if (!session || !options) return;
    await run(async () => {
      let command = pending;
      if (!command) {
        const period = periodForDate(options.periods, date);
        if (!period || !reviewed)
          throw new Error("تاریخ، دوره باز و تأیید بازبینی لازم است.");
        if (reconcile) throw new Error(reconcile);
        if (!newParty && !partyId)
          throw new Error("تأمین‌کننده را انتخاب کنید.");
        if (newParty && (!supplier.trim() || !partyConfirmed))
          throw new Error("تعریف تأمین‌کننده جدید را تأیید کنید.");
        for (const r of rows) {
          if (
            !r.productId &&
            (!r.kind || !r.unitId || !r.name.trim() || !r.confirmSimilar)
          )
            throw new Error("انتخاب کالا یا تأیید تعریف آن لازم است.");
          const kind =
            options.products.find((p) => p.id === r.productId)?.kind ?? r.kind;
          if (kind === "GOODS" && !r.warehouseId)
            throw new Error("انبار کالا را انتخاب کنید.");
        }
        command = {
          version: session.version,
          sourceCurrency: currency,
          printedTotalRial: photoMoney(total, currency),
          reviewedLineTotalsRial: rows.map((r) =>
            photoMoney(r.lineTotal, currency),
          ),
          invoiceNumber: invoice.trim() || undefined,
          reviewed: true,
          purchase: {
            partyId: newParty ? placeholder : partyId,
            periodId: period.id,
            documentDate: date,
            items: rows.map((r) => {
              const kind =
                options.products.find((p) => p.id === r.productId)?.kind ??
                r.kind;
              return {
                productId: r.productId || placeholder,
                ...(kind === "GOODS" ? { warehouseId: r.warehouseId } : {}),
                ...photoLine(r, currency, business.currencyScale),
              };
            }),
          },
          newParty: newParty
            ? { name: supplier.trim(), confirmSimilar: partyConfirmed }
            : undefined,
          newProducts: rows.flatMap((r, i) =>
            r.productId
              ? []
              : [
                  {
                    line: i,
                    product: {
                      name: r.name.trim(),
                      unitId: r.unitId,
                      kind: r.kind,
                      confirmSimilar: r.confirmSimilar,
                    },
                  },
                ],
          ),
        };
        sessionStorage.setItem(key + ":command", JSON.stringify(command));
        setPending(command);
      }
      try {
        const r = await photoCommand<{ id: string }>(
          business.id,
          `${session.id}/draft`,
          command,
        );
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(key + ":command");
        onCreated(r.id);
      } catch (e) {
        if (
          e instanceof ApiError &&
          [400, 403, 404, 409, 422].includes(e.status)
        ) {
          sessionStorage.removeItem(key + ":command");
          setPending(null);
        }
        throw e;
      }
    });
  }
  const locked = busy || !!pending,
    unit =
      currency === "TOMAN"
        ? "تومان"
        : currency === "IRR"
          ? "ریال"
          : "واحد نامشخص";
  return (
    <FormDrawer title="خرید از عکس" busy={busy} onClose={onClose}>
      <section className="photo-purchase" dir="rtl">
        {(enabled || session) && <p className="photo-intro">عکس فاکتور را بفرست؛ اطلاعات را بررسی و تأیید کن.</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {!configLoaded && !error && <p role="status">در حال آماده‌سازی…</p>}
        {configLoaded && !enabled && !session && (
          <p className="notice" role="status">این قابلیت به‌زودی فعال می‌شود.</p>
        )}
        {!session && enabled && (
          <>
            <label className="photo-upload">
              <span className="photo-file-button">انتخاب عکس فاکتور</span>
              <input
                className="photo-file-input"
                aria-label="انتخاب عکس فاکتور"
                type="file"
                accept="image/png,image/jpeg"
                multiple
                disabled={busy}
                onChange={(e) => void choose(e.target.files)}
              />
              <small>تا ۳ عکس، هر عکس حداکثر ۲ مگابایت</small>
              <small role="status">{files.length ? `${files.length.toLocaleString("fa-IR")} عکس انتخاب شد` : "عکس واضح از یک فاکتور چاپی"}</small>
            </label>
            <label className="photo-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>با ارسال عکس به سرویس هوش مصنوعی AvalAI موافقم.</span>
            </label>
            <small>هر بار خواندن، ۲ واحد از سهمیهٔ دستیار مصرف می‌کند؛ حتی اگر کامل نشود.</small>
            <details className="photo-info">
              <summary>اطلاعات بیشتر</summary>
              <p>عکس‌ها عمومی نیستند؛ تا ۷ روز برای بازبینی در رانیار نگهداری و حداکثر یک ساعت بعد پاک می‌شوند. اطلاعات غیرضروری را پیش از ارسال بپوشانید. نگهداری نسخه‌های ارسالی به AvalAI تابع سیاست اوست.</p>
              <p>اطلاعات استخراج‌شده را با عکس تطبیق دهید. ثبت نهایی فقط با تأیید شما انجام می‌شود.</p>
            </details>
            <button
              type="button"
              className="primary"
              disabled={busy || !consent || !files.length}
              onClick={upload}
            >
              {busy ? "در حال ارسال…" : "خواندن فاکتور"}
            </button>
          </>
        )}
        <div className="photo-layout">
          <aside className="photo-images">
            {files.map((f, i) => (
              <a
                key={i}
                href={`data:${f.mime};base64,${f.base64}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`data:${f.mime};base64,${f.base64}`}
                  alt={`صفحه ${i + 1} فاکتور؛ برای بزرگ‌نمایی باز کنید`}
                />
              </a>
            ))}
          </aside>
          <div>
            {session && (
              <>
                <div className="form-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => refresh(session.id))}
                  >
                    بررسی وضعیت
                  </button>
                  {session.status !== "DRAFTED" &&
                    session.status !== "READY" &&
                    session.attempts < 2 && (
                      <button
                        type="button"
                        className="primary"
                        disabled={busy || !enabled}
                        onClick={extract}
                      >
                        {session.attempts
                          ? "تلاش دوباره برای خواندن"
                          : "خواندن فاکتور"}
                      </button>
                    )}
                </div>
                {session.status === "PROCESSING" && (
                  <p role="status">
                    در حال خواندن… پس از قطع ارتباط، وضعیت همین درخواست را بررسی
                    کنید.
                  </p>
                )}
                {session.status === "FAILED" && (
                  <p>
                    ثبت حسابداری انجام نشده است. هر تلاش خواندن از سهمیه دستیار
                    مصرف می‌کند.
                  </p>
                )}
              </>
            )}
            {session?.proposal && options && (
              <fieldset disabled={locked} className="photo-review">
                <legend>اطلاعات را با عکس تطبیق دهید</legend>
                {session.proposal.transcription && (
                  <details className="photo-transcription">
                    <summary>رونویسی اولیهٔ تصویر</summary>
                    <p>
                      این متن هم ممکن است خطای خواندن داشته باشد؛ اعداد و نام‌ها
                      را با عکس تطبیق دهید. هیچ عددی برای جورشدن جمع اصلاح نشده
                      است.
                    </p>
                    {session.proposal.transcription.cells.map((c) => (
                      <p key={c.id}>
                        {c.row ? `ردیف ${c.row} · ` : ""}
                        {c.column ? `${c.column}: ` : ""}
                        <b dir="auto">{c.text}</b>
                        {c.uncertain && <span> — ناخوانا یا نامطمئن</span>}
                      </p>
                    ))}
                  </details>
                )}
                {session.proposal.modelNotes &&
                  (session.proposal.modelNotes.transcription.length > 0 ||
                    session.proposal.modelNotes.proposal.length > 0 ||
                    session.proposal.modelNotes.items.length > 0) && (
                    <details className="photo-model-notes">
                      <summary>یادداشت‌های مدل (تأییدنشده)</summary>
                      <p>
                        این یادداشت‌ها ممکن است نادرست باشند؛ نتیجهٔ محاسبهٔ
                        برنامه نیستند. آن‌ها را با عکس تطبیق دهید.
                      </p>
                      {session.proposal.modelNotes.transcription.map(
                        (note, i) => (
                          <p key={`transcription-${i}`}>رونویسی: {note}</p>
                        ),
                      )}
                      {session.proposal.modelNotes.proposal.map((note, i) => (
                        <p key={`proposal-${i}`}>تفسیر: {note}</p>
                      ))}
                      {session.proposal.modelNotes.items.map((row) => (
                        <div key={row.row}>
                          <b>ردیف {row.row}</b>
                          {row.notes.map((note, i) => (
                            <p key={i}>{note}</p>
                          ))}
                        </div>
                      ))}
                    </details>
                  )}
                {session.proposal.warnings.map((w, i) => (
                  <p className="notice" key={i}>
                    {w}
                  </p>
                ))}
                <label>
                  واحد پول روی فاکتور
                  <select
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setReviewed(false);
                    }}
                  >
                    <option value="">انتخاب کنید</option>
                    <option value="IRR">ریال</option>
                    <option value="TOMAN">تومان</option>
                  </select>
                </label>
                <label>
                  تأمین‌کننده
                  <select
                    value={newParty ? "NEW" : partyId}
                    onChange={(e) => {
                      setNewParty(e.target.value === "NEW");
                      setPartyId(
                        e.target.value === "NEW" ? "" : e.target.value,
                      );
                      setReviewed(false);
                    }}
                  >
                    <option value="">انتخاب تأمین‌کننده</option>
                    {options.suppliers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {can("parties.manage") && (
                      <option value="NEW">＋ تأمین‌کننده جدید</option>
                    )}
                  </select>
                </label>
                <small>
                  نام خوانده‌شده: {session.proposal.supplier ?? "ناخوانا"}
                </small>
                {newParty && (
                  <>
                    <label>
                      نام شخص جدید
                      <input
                        value={supplier}
                        onChange={(e) => {
                          setSupplier(e.target.value);
                          setPartyConfirmed(false);
                        }}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={partyConfirmed}
                        onChange={(e) => setPartyConfirmed(e.target.checked)}
                      />
                      فهرست اشخاص را بررسی کردم؛ شخص تازه تعریف شود.
                    </label>
                  </>
                )}
                <JalaliDateField
                  id="photo-date"
                  label="تاریخ فاکتور"
                  value={date}
                  disabled={locked}
                  onChange={(d) => {
                    setDate(d);
                    setReviewed(false);
                  }}
                />
                <small>
                  تاریخ خوانده‌شده: {session.proposal.documentDate ?? "ناخوانا"}
                </small>
                <label>
                  شماره فاکتور فروشنده
                  <input
                    value={invoice}
                    maxLength={100}
                    onChange={(e) => {
                      setInvoice(e.target.value);
                      setReviewed(false);
                    }}
                  />
                </label>
                {rows.map((r, i) => (
                  <article className="photo-row" key={i}>
                    <h3>
                      {i + 1}.{" "}
                      {r.name ||
                        (session.proposal?.items[i]?.name ?? "قلم ناخوانا")}
                    </h3>
                    {session.proposal?.items[i]?.uncertain.map((w, j) => (
                      <p key={j} className="notice">
                        {w}
                      </p>
                    ))}
                    <label>
                      کالا یا خدمت
                      <select
                        value={r.productId}
                        onChange={(e) => {
                          const p = options.products.find(
                            (x) => x.id === e.target.value,
                          );
                          patch(i, {
                            productId: e.target.value,
                            kind: p?.kind ?? r.kind,
                            unitId: p?.unit.id ?? r.unitId,
                          });
                        }}
                      >
                        <option value="">
                          {can("catalog.manage")
                            ? "انتخاب یا تعریف جدید"
                            : "انتخاب کنید"}
                        </option>
                        {options.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.unit.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!r.productId && can("catalog.manage") && (
                      <>
                        <label>
                          نام جدید
                          <input
                            value={r.name}
                            onChange={(e) =>
                              patch(i, {
                                name: e.target.value,
                                confirmSimilar: false,
                              })
                            }
                          />
                        </label>
                        <div className="photo-fields">
                          <label>
                            نوع
                            <select
                              value={r.kind}
                              onChange={(e) =>
                                patch(i, {
                                  kind: e.target.value as Row["kind"],
                                })
                              }
                            >
                              <option value="">انتخاب کنید</option>
                              <option value="GOODS">کالا</option>
                              <option value="SERVICE">خدمت</option>
                            </select>
                          </label>
                          <label>
                            واحد
                            <select
                              value={r.unitId}
                              onChange={(e) =>
                                patch(i, { unitId: e.target.value })
                              }
                            >
                              <option value="">انتخاب کنید</option>
                              {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            checked={r.confirmSimilar}
                            onChange={(e) =>
                              patch(i, { confirmSimilar: e.target.checked })
                            }
                          />
                          موارد مشابه را بررسی کردم؛ این مورد تازه تعریف شود.
                        </label>
                      </>
                    )}
                    {(options.products.find((p) => p.id === r.productId)
                      ?.kind ?? r.kind) === "GOODS" && (
                      <label>
                        انبار
                        <select
                          value={r.warehouseId}
                          onChange={(e) =>
                            patch(i, { warehouseId: e.target.value })
                          }
                        >
                          <option value="">انتخاب کنید</option>
                          {options.warehouses.map((w) => (
                            <option value={w.id} key={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="photo-fields">
                      {(
                        [
                          ["quantity", "تعداد"],
                          ["unitPrice", `قیمت واحد (${unit})`],
                          ["discountAmount", `تخفیف ردیف (${unit})`],
                          ["taxRate", "نرخ مالیات (مثلاً ۰٫۱ برای ۱۰٪)"],
                          ["lineTotal", `جمع تأییدشده ردیف (${unit})`],
                        ] as const
                      ).map(([field, label]) => (
                        <label key={field}>
                          {label}
                          <input
                            inputMode="decimal"
                            dir="ltr"
                            value={r[field]}
                            onChange={(e) =>
                              patch(i, { [field]: e.target.value })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <small>
                      جمع ردیف روی عکس:{" "}
                      {session.proposal?.items[i]?.lineTotal ?? "ناخوانا"}{" "}
                      {unit} · واحد خوانده‌شده:{" "}
                      {session.proposal?.items[i]?.unit ?? "نامشخص"}
                    </small>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setRows(rows.filter((_, j) => j !== i));
                        setReviewed(false);
                      }}
                    >
                      حذف این ردیف
                    </button>
                  </article>
                ))}
                <button
                  type="button"
                  disabled={rows.length >= 50}
                  onClick={() => {
                    setRows([
                      ...rows,
                      {
                        name: "",
                        productId: "",
                        kind: "",
                        unitId: "",
                        warehouseId: "",
                        quantity: "",
                        unitPrice: "",
                        discountAmount: "",
                        taxRate: "",
                        lineTotal: "",
                        confirmSimilar: false,
                      },
                    ]);
                    setReviewed(false);
                  }}
                >
                  ＋ ردیف جاافتاده
                </button>
                <label>
                  جمع نهایی روی فاکتور ({unit})
                  <input
                    inputMode="decimal"
                    dir="ltr"
                    value={total}
                    onChange={(e) => {
                      setTotal(e.target.value);
                      setReviewed(false);
                    }}
                  />
                </label>
                <p>
                  جمع محاسبه‌شده:{" "}
                  <strong>
                    {computed ? formatStoreMoney(business,computed) : "—"} {storeMoneyUnit(business)}
                  </strong>
                </p>
                {reconcile && <p className="notice error">{reconcile}</p>}
                <details>
                  <summary>جمع‌های خوانده‌شده و موارد خاص</summary>
                  <p>
                    قبل از تخفیف: {session.proposal.subtotal ?? "ناخوانا"} ·
                    تخفیف: {session.proposal.discountTotal ?? "ناخوانا"} ·
                    مالیات: {session.proposal.taxTotal ?? "ناخوانا"} ({unit})
                  </p>
                  <p>
                    تخفیف و هزینه‌های کلی باید با بررسی شما به ردیف‌ها تخصیص
                    داده شوند. عدد خالی به معنی صفر نیست؛ نبود تخفیف یا مالیات
                    را با واردکردن صفر تأیید کنید.
                  </p>
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  همه سطرها، واحدها، اعداد نامطمئن، تاریخ، جمع‌ها و موارد جدید
                  را با عکس بررسی کردم.
                </label>
              </fieldset>
            )}
            {session?.status === "READY" && (
              <button
                type="button"
                className="primary"
                disabled={
                  busy ||
                  (!pending && (!reviewed || !!reconcile || !rows.length))
                }
                onClick={save}
              >
                {pending
                  ? "بررسی نتیجه همان ذخیره"
                  : "تأیید و ساخت پیش‌نویس خرید"}
              </button>
            )}
            {!!pending && (
              <p className="notice">
                تا مشخص‌شدن نتیجه، اطلاعات قفل است. بررسی مجدد، همان پیش‌نویس را
                بازیابی می‌کند.
              </p>
            )}
            {session && !pending && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={reset}
              >
                فاکتور دیگری
              </button>
            )}
          </div>
        </div>
        {busy && <p role="status">در حال انجام…</p>}
      </section>
    </FormDrawer>
  );
}
