import { useEffect, useState } from "react";
import { BasePanel } from "./BaseUi";
import { ApiError, errorText, formatDecimal, getYearEndFinalReview } from "./api";
import type { YearEndFinalReview } from "./api";
import { jalaliText } from "./jalaliDate";
import "./YearEndFinalReviewPanel.css";

type Props = { businessId: string; periodId: string; destinationAccountId: string;
  refreshToken: number; onSessionExpired: () => void };
const statusLabel: Record<YearEndFinalReview["status"], string> = {
  BLOCKED: "مسدود", NEEDS_REVIEW: "نیازمند بررسی", READY_FOR_REVIEW: "آماده برای بررسی کارشناسی",
};
const sourceLabel: Record<string, string> = {
  PERIOD: "دوره مالی", ACCOUNTING: "حسابداری", RECONCILIATION: "تطبیق‌های داخلی",
  CASH_BANK: "بانک و صندوق", CONSISTENCY: "سازگاری گزارش‌ها", SECURITY: "ایمنی دیتابیس",
  ENGINE: "موتور اختتام", EVIDENCE: "مستندات مستقل",
};

export default function YearEndFinalReviewPanel({ businessId, periodId, destinationAccountId, refreshToken, onSessionExpired }: Props) {
  const [data, setData] = useState<YearEndFinalReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localReload, setLocalReload] = useState(0);
  useEffect(() => {
    if (!periodId) { setData(null); return; }
    const c = new AbortController();
    setBusy(true); setError(""); setData(null);
    getYearEndFinalReview(businessId, periodId, destinationAccountId || undefined, c.signal)
      .then(result => { if (!c.signal.aborted) setData(result); })
      .catch(e => {
        if (c.signal.aborted) return;
        setError(errorText(e));
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
      }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [businessId, periodId, destinationAccountId, refreshToken, localReload, onSessionExpired]);
  return <div className="ye-final" dir="rtl">
    <BasePanel title="ارزیابی یکپارچه آمادگی پایان سال — Rev8.3l"
      note="نتیجه فقط برای بررسی کارشناسی است؛ هیچ فرمانی برای صدور اختتام یا افتتاحیه در این بخش وجود ندارد.">
      <div className="ye-final-actions">
        <p>دوره مالی، دفتر کل، انبار، اشخاص، بانک و صندوق و حفاظت‌های اختتام در یک گزارش کنترل می‌شوند.</p>
        <button type="button" className="secondary" disabled={busy} onClick={() => setLocalReload(x => x + 1)}>
          {busy ? "در حال کنترل…" : "ارزیابی مجدد"}
        </button>
      </div>
      {busy && <p role="status">در حال محاسبه کنترل‌های پایان سال از یک تصویر سازگار از داده‌ها…</p>}
      {error && <p className="notice error" role="alert">ارزیابی نهایی در دسترس نیست: {error}. تا رفع خطا، وضعیت آمادگی قابل تأیید نیست.</p>}
      {data && <>
        <div className={`ye-final-status ${data.status === "BLOCKED" ? "ye-final-blocked" : data.status === "NEEDS_REVIEW" ? "ye-final-pending" : "ye-final-review-ready"}`}>
          <div><span>وضعیت کنترل‌ها</span><strong>{statusLabel[data.status]}</strong></div>
          <p>دوره: {data.period.name} — تا {jalaliText(data.period.endDate)}. اجرای قطعی اختتام مستقل از این ارزیابی همچنان ممنوع است.</p>
        </div>
        <div className="ye-final-metrics" aria-label="خلاصه کنترل‌ها">
          <div><span>موانع قطعی و فنی</span><strong>{formatDecimal(String(data.summary.blockers))}</strong></div>
          <div><span>نیازمند بررسی</span><strong>{formatDecimal(String(data.summary.needsReview))}</strong></div>
          <div><span>کنترل داخلی بدون اختلاف</span><strong>{formatDecimal(String(data.summary.internalPassed))}</strong></div>
          <div><span>پوشش بانک و صندوق</span><strong>{formatDecimal(String(data.summary.accountsCovered))} از {formatDecimal(String(data.summary.accountsRequired))}</strong></div>
        </div>
        {data.blockers.length > 0 && <div className="ye-final-section">
          <h4>موانع قطعی</h4>
          <ul>{data.blockers.map(item => <li key={item.code}>
            <strong>{item.title}</strong><span className="ye-final-source">{sourceLabel[item.source] ?? item.source}</span>
            <p>{item.message}</p>
          </li>)}</ul>
        </div>}
        {data.reviews.length > 0 && <div className="ye-final-section">
          <h4>موارد باقی‌مانده برای بررسی</h4>
          <ul>{data.reviews.map(item => <li key={item.code}>
            <strong>{item.title}</strong><span className="ye-final-source">{sourceLabel[item.source] ?? item.source}</span>
            <p>{item.message}</p>
          </li>)}</ul>
        </div>}
        <div className="ye-final-safety">
          <span>منع سند سیستمی: <strong>{data.protections.systemJournalsBlocked ? "فعال" : "نیازمند بررسی فوری"}</strong></span>
          <span>منع اجرای عملیات اختتام: <strong>{data.protections.operationsBlocked ? "فعال" : "نیازمند بررسی فوری"}</strong></span>
          <span>تطبیق ارقام گزارش‌ها: <strong>{data.summary.reportValuesConsistent ? "تأیید" : "اختلاف"}</strong></span>
        </div>
        <p className="ye-final-disclaimer">{data.note} این سامانه اصالت منابع بیرونی را تأیید نمی‌کند. ثبت حساب پیشنهادی نیز به‌هیچ‌وجه مجوز اختتام نیست.</p>
      </>}
    </BasePanel>
  </div>;
}
