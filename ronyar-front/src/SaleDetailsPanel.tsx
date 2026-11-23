import SaleForm from "./SaleForm";
import type { InvoiceCorrectionResult } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useStoreCan } from "./StorePermissions";
import { jalaliText } from "./jalaliDate";
import { printSale } from "./printSale";
import ReceiptForm from "./ReceiptForm";
import SaleSettlementPanel from "./SaleSettlementPanel";
import SalePostAction from "./SalePostAction";
import { useEffect, useState } from "react";
import FormDrawer from "./FormDrawer";
import { ApiError, errorText, formatDecimal, getSale } from "./api";
import type { Business, SaleDetails } from "./api";
type Props = { onViewInvoice?: (id: string) => void; onCorrected?: (result: InvoiceCorrectionResult) => void; business: Business; saleId: string; onEdit?: (id:string)=>void; onClose: () => void; onSessionExpired: () => void };
export default function SaleDetailsPanel({ business, saleId, onEdit, onViewInvoice, onCorrected, onClose, onSessionExpired }: Props) {
  const can = useStoreCan();
  const [posting, setPosting] = useState(false), [postMessage, setPostMessage] = useState("");
  const [sale, setSale] = useState<(SaleDetails & { party: { id: string; name: string } }) | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  useEffect(() => { const controller = new AbortController(); setSale(null); setError(""); setLoading(true); getSale(business.id, saleId, controller.signal).then(value => { if (!controller.signal.aborted) setSale(value as SaleDetails & { party: { id: string; name: string } }); }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, saleId, retry]);
  const money = (value: string) => formatStoreMoney(business, value);
  if (correcting && sale && onCorrected) return <SaleForm business={business} sale={sale} onSaved={() => {}} onCorrected={onCorrected} onCancel={() => setCorrecting(false)} onSessionExpired={onSessionExpired} />;
  return <FormDrawer title="جزئیات فاکتور فروش" busy={posting} onClose={onClose}><section className="product-form-panel sale-details-panel">
    {postMessage && <div className="notice success" role="status">{postMessage}</div>}
    {loading && <p role="status">در حال دریافت جزئیات…</p>}{error && <div className="notice error" role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {sale && <>{sale.correctionResult && <p role="status">جایگزین‌شده با فاکتور {formatDecimal(sale.correctionResult.number ?? "")} {onViewInvoice && <button type="button" className="text-button" onClick={() => onViewInvoice(sale.correctionResult!.id)}>مشاهده فاکتور جایگزین</button>}</p>}
    {sale.correctionSource && <p>جایگزین فاکتور {formatDecimal(sale.correctionSource.number ?? "")} {onViewInvoice && <button type="button" className="text-button" onClick={() => onViewInvoice(sale.correctionSource!.id)}>مشاهده فاکتور قبلی</button>}</p>}<dl className="invoice-meta"><div><dt>شماره</dt><dd>{sale.number ? formatDecimal(sale.number) : "بدون شماره"}</dd></div><div><dt>وضعیت</dt><dd>{sale.status === "DRAFT" ? "پیش‌نویس" : sale.status === "POSTED" ? "ثبت قطعی" : "لغوشده"}</dd></div><div><dt>مشتری</dt><dd>{sale.party.name}</dd></div><div><dt>تاریخ (شمسی)</dt><dd><bdi>{jalaliText(sale.documentDate)}</bdi></dd></div></dl>
      <p className="muted">ارقام به {storeMoneyUnit(business)}</p>
      {sale.items.map(item => <article className="sale-line-card" key={item.id}><strong>{formatDecimal(String(item.lineNumber))}. {item.productName}</strong><dl className="invoice-meta"><div><dt>تعداد</dt><dd><bdi>{formatDecimal(item.quantity)}</bdi> {item.unitName}</dd></div><div><dt>قیمت واحد</dt><dd><bdi>{money(item.unitPrice)}</bdi></dd></div><div><dt>تخفیف ردیف</dt><dd><bdi>{money(item.discountAmount)}</bdi></dd></div><div><dt>مالیات</dt><dd><bdi>{money(item.taxAmount)}</bdi></dd></div><div><dt>مبلغ ردیف</dt><dd><bdi>{money(item.lineTotal)}</bdi></dd></div></dl>{item.recipeSnapshot&&<details><summary>دستور مصرف نسخهٔ {formatDecimal(String(item.recipeSnapshot.version))}</summary>{item.materialConsumptions?.length?<ul>{item.materialConsumptions.map(c=><li key={c.id}>{c.productName}: {formatDecimal(c.quantity)} {c.unitName} · بهای مصرف {money(c.inventoryCost)} {storeMoneyUnit(business)}</li>)}</ul>:<p>مواد هنگام ثبت قطعی مصرف می‌شوند.</p>}<p>برگشت مبلغ، مواد و هزینهٔ مصرف‌شده را برنمی‌گرداند.</p></details>}</article>)}
      <dl className="invoice-meta invoice-totals"><div><dt>جمع قبل از تخفیف و مالیات</dt><dd><bdi>{money(sale.subtotal)}</bdi></dd></div><div><dt>تخفیف</dt><dd><bdi>{money(sale.discountTotal)}</bdi></dd></div><div><dt>مالیات</dt><dd><bdi>{money(sale.taxTotal)}</bdi></dd></div><div><dt>تعدیل گردکردن</dt><dd><bdi>{money(sale.roundingAmount)}</bdi></dd></div></dl><div className="sale-total">مبلغ نهایی: <bdi>{money(sale.total)}</bdi></div>
      {sale.status === "POSTED" && !sale.correctionResult && <>{can("payments.read") && <SaleSettlementPanel business={business} saleId={sale.id} revision={retry} onSessionExpired={onSessionExpired} />}{can("payments.manage") && <ReceiptForm key={sale.id} business={business} saleId={sale.id} onChanged={() => setRetry(value => value + 1)} onBusyChange={setPosting} onSessionExpired={onSessionExpired} />}</>}
      {sale.status === "DRAFT" && can("sales.post") && <SalePostAction key={`${sale.id}:${sale.version}`} business={business} sale={sale} onBusyChange={setPosting} onSessionExpired={onSessionExpired} onPosted={result => { setPostMessage(`فاکتور شماره ${formatDecimal(result.number)} ثبت قطعی شد.`); setRetry(value => value + 1); }} />}
      {sale.notes && <p className="invoice-notes">یادداشت: {sale.notes}</p>}
    </>}<div className="form-actions">{sale?.status === "POSTED" && !sale.correctionResult && onCorrected && can("sales.manage") && can("sales.post") && <button type="button" className="secondary" disabled={posting} onClick={() => setCorrecting(true)}>اصلاح فاکتور</button>}{sale?.status === "DRAFT" && onEdit && can("sales.manage") && <button type="button" className="secondary" disabled={posting} onClick={()=>onEdit(sale.id)}>ویرایش پیش‌نویس</button>}<button type="button" className="primary" disabled={posting || loading || !sale} onClick={() => { if (sale && !printSale(business, sale)) setError("مرورگر پنجره چاپ را مسدود کرده است؛ اجازه بازشدن پنجره را بدهید و دوباره تلاش کنید."); }}>چاپ فاکتور</button><button type="button" className="secondary" disabled={posting} onClick={onClose}>بستن جزئیات</button></div>
  </section></FormDrawer>;
}
// Rev9.0d-installed
