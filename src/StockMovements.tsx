import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useState } from "react";
import { ApiError, errorText, formatDecimal, listStockMovements } from "./api";
import type { Business, StockMovementPage, StockMovementRow } from "./api";
import { jalaliText } from "./jalaliDate";
import { moneyUnit, positiveDecimal } from "./operationsDisplay";

type Props = { business: Business; warehouseId: string; productId: string; onSessionExpired: () => void };
const sourceLabels: Record<StockMovementRow["source"]["type"], string> = {
  SALE: "فروش", PURCHASE: "خرید", SALE_RETURN: "برگشت از فروش", PURCHASE_RETURN: "برگشت از خرید", STOCK_ADJUSTMENT: "تعدیل / افتتاحیه",
};
export default function StockMovements({ business, warehouseId, productId, onSessionExpired }: Props) {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<StockMovementPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    setResult(null); setError("");
    if (!warehouseId) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    listStockMovements(business.id, warehouseId, page, productId, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        if (value.totalPages > 0 && page > value.totalPages) setPage(value.totalPages);
        else setResult(value);
      }
    }).catch(cause => {
      if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, warehouseId, productId, page, retry]);
  const currency = moneyUnit(business.baseCurrency);
  return <section className="ops-movement-list" aria-label="گردش کالا">
    {loading && <div className="doc-loading" role="status">در حال دریافت گردش کالا…</div>}
    {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {result && <>
      <div className="ops-list-meta"><span>{formatDecimal(String(result.total))} گردش در محدوده انتخابی</span><span>عدد مثبت: ورود · عدد منفی: خروج · مبلغ به {currency}</span></div>
      {result.items.length ? <>
        <div className="ops-table-scroller"><table className="ops-table"><thead><tr><th>تاریخ شمسی</th><th>کالا</th><th>نوع گردش</th><th>تغییر تعداد</th><th>تغییر ارزش</th></tr></thead><tbody>{result.items.map(item => <tr key={item.id}>
          <td className="ops-muted-cell"><bdi>{jalaliText(item.occurredOn)}</bdi></td><td><strong>{item.product.name}</strong><small className="ops-cell-sub">{item.product.code}</small></td>
          <td><span className="ops-pill neutral">{sourceLabels[item.source.type]}</span></td>
          <td className={positiveDecimal(item.quantityDelta) ? "ops-amount in" : "ops-amount out"}><bdi>{formatDecimal(item.quantityDelta)}</bdi> <small>{item.product.unit.name}</small></td>
          <td className="ops-amount"><bdi>{formatStoreMoney(business, item.valueDelta)}</bdi> <small>{currency}</small></td>
        </tr>)}</tbody></table></div>
        <div className="ops-mobile-cards">{result.items.map(item => <article className="ops-mobile-card" key={item.id}>
          <div className="ops-mobile-card-head"><strong>{item.product.name}</strong><span className="ops-pill neutral">{sourceLabels[item.source.type]}</span></div>
          <small><bdi>{jalaliText(item.occurredOn)}</bdi> · {item.product.code}</small>
          <div className="ops-mobile-card-data"><span>تغییر تعداد <strong className={positiveDecimal(item.quantityDelta) ? "ops-positive" : "ops-negative"}><bdi>{formatDecimal(item.quantityDelta)}</bdi> {item.product.unit.name}</strong></span><span>تغییر ارزش <strong><bdi>{formatStoreMoney(business, item.valueDelta)}</bdi> {currency}</strong></span></div>
        </article>)}</div>
      </> : <div className="ops-empty"><h2>گردشی پیدا نشد</h2><p>در انبار یا برای کالای انتخابی فعلاً گردشی ثبت نشده است.</p></div>}
      <nav className="ops-pagination" aria-label="صفحه‌بندی گردش کالا"><button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>صفحه قبل</button><span>{result.totalPages ? `صفحه ${formatDecimal(String(page))} از ${formatDecimal(String(result.totalPages))}` : "بدون نتیجه"}</span><button type="button" className="secondary" disabled={page >= result.totalPages || loading} onClick={() => setPage(value => value + 1)}>صفحه بعد</button></nav>
    </>}
  </section>;
}
