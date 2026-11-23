import type { Business } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useState } from "react";
import { BasePanel } from "./BaseUi";
import { jalaliText } from "./jalaliDate";
import { ApiError, errorText, formatDecimal, getCashBankYearEndCoverage } from "./api";
import type { CashBankYearEndCoverage, CashBankYearEndCoverageStatus } from "./api";
import "./YearEndCashBankCoveragePanel.css";

type Props = { business?: Business; businessId: string; periodId: string; refreshToken: number; onSessionExpired: () => void };
const statusText: Record<CashBankYearEndCoverageStatus, string> = {
  MATCHED_DECLARED: "منطبق با اظهار ثبت‌شده",
  MISSING: "فاقد بررسی در پایان دوره",
  STALE: "نیازمند تطبیق مجدد",
  DIFFERENCE: "دارای اختلاف",
  UNCONFIRMED: "بدون تأیید مشاهده منبع",
  FUTURE_DATE: "پایان دوره هنوز فرا نرسیده",
  INVALID_ACCOUNT: "ساختار حساب نیازمند بررسی",
  INACTIVE_WITH_POSTINGS: "حساب غیرفعال دارای گردش",
  EXCLUDED_INACTIVE_EMPTY: "غیرفعال و بدون گردش — خارج از پوشش",
};
const statusClass = (status: CashBankYearEndCoverageStatus) =>
  status === "MATCHED_DECLARED" ? "ye-coverage-ok" :
  status === "EXCLUDED_INACTIVE_EMPTY" ? "ye-coverage-muted" :
  status === "FUTURE_DATE" || status === "MISSING" || status === "UNCONFIRMED" ? "ye-coverage-pending" : "ye-coverage-problem";
const formatTime = (value: string) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));

export default function YearEndCashBankCoveragePanel({ business, businessId, periodId, refreshToken, onSessionExpired }: Props) {
  const [data, setData] = useState<CashBankYearEndCoverage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localReload, setLocalReload] = useState(0);
  useEffect(() => {
    if (!periodId) { setData(null); return; }
    const c = new AbortController();
    setBusy(true); setData(null); setError("");
    getCashBankYearEndCoverage(businessId, periodId, c.signal)
      .then(r => { if (!c.signal.aborted) setData(r); })
      .catch(e => {
        if (c.signal.aborted) return;
        setError(errorText(e));
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
      }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [businessId, periodId, refreshToken, localReload, onSessionExpired]);
  return <div className="ye-coverage" dir="rtl">
    <BasePanel title="پوشش مغایرت‌گیری بانک و صندوق در پایان دوره — Rev8.3k"
      note="فقط آخرین بررسی هر حساب در تاریخ پایان دوره ملاک است؛ بررسی‌های میانه دوره، جایگزین آن نیستند.">
      <div className="ye-coverage-actions">
        <p>این گزارش فقط‌خواندنی است؛ برای ثبت مدرک از فرم «مغایرت‌گیری بانک و شمارش صندوق» در پایین همین صفحه استفاده کن.</p>
        <button type="button" className="secondary" disabled={busy} onClick={() => setLocalReload(v => v + 1)}>بررسی مجدد</button>
      </div>
      {busy && <p role="status">در حال بررسی پوشش حساب‌ها و اثرانگشت گردش‌های قطعی…</p>}
      {error && <p className="notice error" role="alert">پوشش حساب‌های بانک و صندوق قابل بررسی نیست: {error}</p>}
      {data && <>
        <div className="ye-coverage-info">
          <div><span>تاریخ لازم برای تطبیق</span><strong>{jalaliText(data.asOfDate)}</strong></div>
          <div><span>حساب‌های مشمول</span><strong>{formatDecimal(String(data.summary.requiredCount))}</strong></div>
          <div><span>اظهارهای منطبق و به‌روز</span><strong>{formatDecimal(String(data.summary.matchedCount))}</strong></div>
          <div><span>نیازمند بررسی / اختلاف / مانع</span><strong>{formatDecimal(String(data.summary.requiredCount - data.summary.matchedCount + data.summary.exceptionCount))}</strong></div>
        </div>
        {data.asOfDate > data.today && <p className="notice">
          <strong>پایان این دوره هنوز فرا نرسیده است.</strong> بررسی‌های امروز، حتی اگر بدون اختلاف باشند،
          نمی‌توانند برای تاریخ {jalaliText(data.asOfDate)} پذیرفته شوند. این مانده‌ها تا رسیدن پایان دوره، نهایی نیستند و وضعیت این کنترل نباید «تکمیل» شود.
        </p>}
        {data.summary.allDeclaredMatched && <p className="notice">
          همه حساب‌های مشمول، بر اساس ارقام اظهارشده در تاریخ پایان دوره منطبق‌اند؛ این نتیجه تأیید اصالت مدارک نیست و اجازه صدور سند اختتام ایجاد نمی‌کند.
        </p>}
        {!data.summary.allDeclaredMatched && data.asOfDate <= data.today && <p className="notice">
          پوشش تطبیق کامل نیست. سوابق دارای اختلاف، منقضی‌شده یا مربوط به تاریخ دیگر، قابل جایگزینی با آخرین بررسی معتبر پایان دوره نیستند.
        </p>}
        <div className="base-table-scroll"><table className="base-table ye-coverage-table"><thead><tr>
          <th>حساب</th><th>مانده طبق اسناد قطعی تا تاریخ مبنا</th><th>وضعیت بررسی</th><th>آخرین مرجع در همان تاریخ</th>
        </tr></thead><tbody>{data.accounts.map(row => <tr key={row.account.id}>
          <td><strong>{row.account.name}</strong><small dir="ltr">{row.account.code}</small></td>
          <td>{formatStoreMoney(business, row.bookBalance)} {storeMoneyUnit(business)} <small>{formatDecimal(String(row.journalLineCount))} ردیف قطعی</small></td>
          <td><span className={`ye-coverage-state ${statusClass(row.status)}`}>{statusText[row.status]}</span></td>
          <td>{row.record ? <><bdi dir="ltr">{row.record.evidenceReference}</bdi><small>{formatTime(row.record.createdAt)}</small></> : "—"}</td>
        </tr>)}</tbody></table></div>
        {!data.accounts.length && <p className="notice error">هیچ حساب بانک یا صندوق شناسایی نشد؛ کنترل پوشش قابل تکمیل نیست.</p>}
        <p className="ye-coverage-disclaimer">اصالت مدارک خارجی توسط سامانه تأیید نمی‌شود. این کنترل فقط یک شاهد کمکی برای حسابدار است؛ اختتام و اسناد افتتاحیه همچنان غیرفعال‌اند.</p>
      </>}
    </BasePanel>
  </div>;
}
