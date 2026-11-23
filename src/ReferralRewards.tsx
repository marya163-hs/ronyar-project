import "./referral-rewards.css";
import { useEffect, useState } from "react";
import {
  getMyReferralRewards,
  requestReferralCash,
  errorText,
  type ReferralRewardData,
  type ReferralRewardTerms,
} from "./api";
export function referralTermsText(t: ReferralRewardTerms) {
  const labels: Record<string, string> = {
    REGISTERED: "ثبت‌نام موفق",
    INVOICES:
      "ثبت " +
      (t.rules.find((r) => r.kind === "INVOICES")?.value ?? 0) +
      " فاکتور قطعی معتبر",
    FIRST_PURCHASE: "خرید اشتراک",
    PLAN_PURCHASE:
      "خرید اشتراک " +
      (t.rules.find((r) => r.kind === "PLAN_PURCHASE")?.plan === "YEARLY"
        ? "سالانه"
        : "ماهانه"),
    PURCHASE_TOTAL:
      "مجموع خرید اشتراک " +
      new Intl.NumberFormat("fa-IR").format(
        t.rules.find((r) => r.kind === "PURCHASE_TOTAL")?.value ?? 0,
      ) +
      " تومان",
    MANUAL: "تأیید دستی مدیر",
  };
  return t.rules
    .map((r) => labels[r.kind])
    .join(t.mode === "ALL" ? " و " : " یا ");
}
function CashRequest({ id, onDone }: { id: string; onDone: () => void }) {
  const [card, setCard] = useState(""),
    [holder, setHolder] = useState(""),
    [ok, setOk] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ok) return;
    setBusy(true);
    setError("");
    try {
      await requestReferralCash(id, card, holder.trim());
      setCard("");
      setHolder("");
      onDone();
    } catch {
      setError(
        "درخواست تأیید نشد؛ شماره کارت را بررسی و وضعیت را به‌روز کنید.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)}>
      <label>
        شماره کارت به نام خودتان
        <input
          dir="ltr"
          required
          inputMode="numeric"
          autoComplete="off"
          minLength={16}
          maxLength={24}
          value={card}
          onChange={(e) => setCard(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        نام صاحب حساب
        <input
          required
          minLength={3}
          maxLength={100}
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={ok}
          onChange={(e) => setOk(e.target.checked)}
          disabled={busy}
        />
        مالک حساب هستم و شماره کارت را بررسی کردم.
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || !ok}>درخواست دریافت جایزه نقدی</button>
    </form>
  );
}
const tehranDate = (v: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
export default function ReferralRewards() {
  const [data, setData] = useState<ReferralRewardData | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    getMyReferralRewards(abort.signal)
      .then((v) => {
        if (!abort.signal.aborted) setData(v);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorText(e));
      });
    return () => abort.abort();
  }, [revision]);
  const number = (n: number) => new Intl.NumberFormat("fa-IR").format(n),
    reward = (t: ReferralRewardTerms) =>
      t.rewardKind === "CASH"
        ? number(t.amount) + " تومان جایزه نقدی"
        : number(t.amount) + " ماه اشتراک";
  return (
    <div className="referral-rewards">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {data?.active ? (
        <div>
          <h4>{data.active.title}</h4>
          <p>{reward(data.active.terms)}</p>
          <p>
            {referralTermsText(data.active.terms)}؛ تا{" "}
            {number(data.active.terms.withinDays)} روز پس از ثبت‌نام.
          </p>
          <small className="muted">
            سقف کل {number(data.active.terms.maxRewards)} پاداش؛ برای هر معرف{" "}
            {number(data.active.terms.perUserLimit)} پاداش. تخصیص پس از بررسی
            مدیر و در صورت باقی‌بودن ظرفیت است. شرایط هنگام ثبت‌نام دعوت‌شده حفظ
            می‌شود.
          </small>
        </div>
      ) : (
        data && (
          <small className="muted">
            در حال حاضر طرح پاداش جدیدی فعال نیست.
          </small>
        )
      )}
      {!!data?.rewards.length && (
        <details>
          <summary>پیگیری پاداش‌های من</summary>
          {data.rewards.map((r, i) => (
            <article
              key={r.id}
              style={{ borderTop: "1px solid #d9e5ed", padding: "12px 0" }}
            >
              <b>
                {r.title} · مورد {number(i + 1)}
              </b>
              <p>
                {reward(r.terms)} —{" "}
                {r.status === "REJECTED"
                  ? "ردشده"
                  : r.status === "APPROVED"
                    ? r.cashState === "PAID"
                      ? "پرداخت‌شده"
                      : r.cashState === "REQUESTED"
                        ? "در انتظار پرداخت"
                        : r.cashState === "AVAILABLE"
                          ? "آماده درخواست دریافت"
                          : "اشتراک افزوده شد"
                    : r.eligible
                      ? "شرایط انجام شده؛ در انتظار بررسی"
                      : new Date(r.deadlineAt) < new Date()
                        ? "مهلت انجام شرط پایان یافته"
                        : "در حال تکمیل شرط‌ها"}
              </p>
              <small>{referralTermsText(r.terms)}</small>
              {r.status === "WAITING" && (
                <p>
                  مهلت انجام شرط به وقت تهران: {tehranDate(r.deadlineAt)} ·
                  فاکتور معتبر: {number(r.invoices)} · خرید تأییدشده:{" "}
                  {number(r.purchases)}
                </p>
              )}
              {r.rewardExpiresAt && (
                <p>اشتراک تا {tehranDate(r.rewardExpiresAt)}</p>
              )}
              {r.maskedCard && <p dir="ltr">{r.maskedCard}</p>}
              {r.paymentReference && (
                <p>
                  پیگیری پرداخت: <span dir="ltr">{r.paymentReference}</span>
                </p>
              )}
              {r.cashState === "AVAILABLE" && (
                <CashRequest
                  id={r.id}
                  onDone={() => setRevision((v) => v + 1)}
                />
              )}
            </article>
          ))}
          <small>
            نمایش حداکثر ۵۰ مورد با اولویت جایزه‌های نقدی تسویه‌نشده و دعوت‌های
            در انتظار؛ تعداد کل دعوت‌ها در بخش بالا است.
          </small>
        </details>
      )}
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setError("");
          setRevision((v) => v + 1);
        }}
      >
        به‌روزرسانی پاداش‌ها
      </button>
    </div>
  );
}
