import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useState } from "react";
import { ApiError, errorText, formatDecimal, getSaleSettlement } from "./api";
import type { Business, SaleSettlement } from "./api";
type Props = { business: Business; saleId: string; revision: number; onSessionExpired: () => void };
export default function SaleSettlementPanel({ business, saleId, revision, onSessionExpired }: Props) {
  const [report, setReport] = useState<SaleSettlement | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController(); setReport(null); setError(""); setLoading(true); getSaleSettlement(business.id, saleId, controller.signal).then(value => { if (!controller.signal.aborted) setReport(value); }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, saleId, revision, retry]);
  const labels = { UNPAID: "پرداخت‌نشده", PARTIAL: "پرداخت جزئی", PAID: "تسویه‌شده", OVERPAID: "دارای اعتبار مشتری" };
  return <section className="sale-post-action"><h3>وضعیت تسویه</h3>{loading && <p role="status">در حال دریافت مانده فاکتور…</p>}{error && <div className="notice error" role="alert">{error}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {report && <><span className={`status-badge ${report.settlementStatus === "PAID" ? "active" : "inactive"}`}>{labels[report.settlementStatus]}</span><p className="muted">ارقام به {storeMoneyUnit(business)}؛ فقط پرداخت‌ها و برگشت‌های ثبت قطعی محاسبه می‌شوند.</p><dl className="invoice-meta">
      <div><dt>مبلغ اصلی فاکتور</dt><dd><bdi>{formatStoreMoney(business, report.total)}</bdi></dd></div><div><dt>برگشت فروش</dt><dd><bdi>{formatStoreMoney(business, report.returnedAmount)}</bdi></dd></div><div><dt>مبلغ خالص فاکتور</dt><dd><bdi>{formatStoreMoney(business, report.netTotal)}</bdi></dd></div><div><dt>دریافت از مشتری</dt><dd><bdi>{formatStoreMoney(business, report.settledAmount)}</bdi></dd></div><div><dt>وجه برگشتی به مشتری</dt><dd><bdi>{formatStoreMoney(business, report.refundedAmount)}</bdi></dd></div><div><dt>دریافت خالص</dt><dd><bdi>{formatStoreMoney(business, report.netSettledAmount)}</bdi></dd></div><div><dt>مانده قابل دریافت</dt><dd><bdi>{formatStoreMoney(business, report.remainingAmount)}</bdi></dd></div><div><dt>اعتبار مشتری</dt><dd><bdi>{formatStoreMoney(business, report.creditAmount)}</bdi></dd></div>
    </dl></>}
  </section>;
}