import PurchaseForm from "./PurchaseForm";
import type { InvoiceCorrectionResult } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useStoreCan } from "./StorePermissions";
import { jalaliText } from "./jalaliDate";
import { printPurchase } from "./printPurchase";
import DisbursementForm from "./DisbursementForm";
import PurchaseSettlementPanel from "./PurchaseSettlementPanel";
import PurchasePostAction from "./PurchasePostAction";
import { useEffect, useState } from "react";
import FormDrawer from "./FormDrawer";
import { ApiError, errorText, formatDecimal, getPurchase } from "./api";
import type { Business, PurchaseDetails } from "./api";
type Props = { onViewInvoice?: (id: string) => void; onCorrected?: (result: InvoiceCorrectionResult) => void; business: Business; purchaseId: string; onEdit?:(id:string)=>void; onClose: () => void; onSessionExpired: () => void };
export default function PurchaseDetailsPanel({ business, purchaseId, onEdit, onViewInvoice, onCorrected, onClose, onSessionExpired }: Props) {
  const can = useStoreCan();
  const [posting, setPosting] = useState(false), [postMessage, setPostMessage] = useState("");
  const [purchase, setPurchase] = useState<(PurchaseDetails & { party: { id: string; name: string } }) | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  useEffect(() => { const controller = new AbortController(); setPurchase(null); setError(""); setLoading(true); getPurchase(business.id, purchaseId, controller.signal).then(value => { if (!controller.signal.aborted) setPurchase(value as PurchaseDetails & { party: { id: string; name: string } }); }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, purchaseId, retry]);
  const money = (value: string) => formatStoreMoney(business, value);
  if (correcting && purchase && onCorrected) return <PurchaseForm business={business} purchase={purchase} onSaved={() => {}} onCorrected={onCorrected} onCancel={() => setCorrecting(false)} onSessionExpired={onSessionExpired} />;
  return <FormDrawer title="جزئیات فاکتور خرید" busy={posting} onClose={onClose}><section className="product-form-panel sale-details-panel">
    {postMessage && <div className="notice success" role="status">{postMessage}</div>}
    {loading && <p role="status">در حال دریافت جزئیات…</p>}{error && <div className="notice error" role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {purchase && <>{purchase.correctionResult && <p role="status">جایگزین‌شده با فاکتور {formatDecimal(purchase.correctionResult.number ?? "")} {onViewInvoice && <button type="button" className="text-button" onClick={() => onViewInvoice(purchase.correctionResult!.id)}>مشاهده فاکتور جایگزین</button>}</p>}
    {purchase.correctionSource && <p>جایگزین فاکتور {formatDecimal(purchase.correctionSource.number ?? "")} {onViewInvoice && <button type="button" className="text-button" onClick={() => onViewInvoice(purchase.correctionSource!.id)}>مشاهده فاکتور قبلی</button>}</p>}<dl className="invoice-meta"><div><dt>شماره</dt><dd>{purchase.number ? formatDecimal(purchase.number) : "بدون شماره"}</dd></div><div><dt>وضعیت</dt><dd>{purchase.status === "DRAFT" ? "پیش‌نویس" : purchase.status === "POSTED" ? "ثبت قطعی" : "لغوشده"}</dd></div><div><dt>تأمین‌کننده</dt><dd>{purchase.party.name}</dd></div><div><dt>تاریخ (شمسی)</dt><dd><bdi>{jalaliText(purchase.documentDate)}</bdi></dd></div></dl>
      <p className="muted">ارقام به {storeMoneyUnit(business)}</p>
      {purchase.items.map(item => <article className="sale-line-card" key={item.id}><strong>{formatDecimal(String(item.lineNumber))}. {item.productName}</strong><dl className="invoice-meta"><div><dt>تعداد</dt><dd><bdi>{formatDecimal(item.quantity)}</bdi> {item.unitName}</dd></div><div><dt>قیمت واحد</dt><dd><bdi>{money(item.unitPrice)}</bdi></dd></div><div><dt>تخفیف ردیف</dt><dd><bdi>{money(item.discountAmount)}</bdi></dd></div><div><dt>مالیات</dt><dd><bdi>{money(item.taxAmount)}</bdi></dd></div><div><dt>مبلغ ردیف</dt><dd><bdi>{money(item.lineTotal)}</bdi></dd></div></dl></article>)}
      <dl className="invoice-meta invoice-totals"><div><dt>جمع قبل از تخفیف و مالیات</dt><dd><bdi>{money(purchase.subtotal)}</bdi></dd></div><div><dt>تخفیف</dt><dd><bdi>{money(purchase.discountTotal)}</bdi></dd></div><div><dt>مالیات</dt><dd><bdi>{money(purchase.taxTotal)}</bdi></dd></div><div><dt>تعدیل گردکردن</dt><dd><bdi>{money(purchase.roundingAmount)}</bdi></dd></div></dl><div className="sale-total">مبلغ نهایی: <bdi>{money(purchase.total)}</bdi></div>
      {purchase.status === "POSTED" && !purchase.correctionResult && <>{can("payments.read") && <PurchaseSettlementPanel business={business} purchaseId={purchase.id} revision={retry} onSessionExpired={onSessionExpired} />}{can("payments.manage") && <DisbursementForm key={purchase.id} business={business} purchaseId={purchase.id} onChanged={() => setRetry(value => value + 1)} onBusyChange={setPosting} onSessionExpired={onSessionExpired} />}</>}
      {purchase.status === "DRAFT" && can("purchases.post") && <PurchasePostAction key={`${purchase.id}:${purchase.version}`} business={business} purchase={purchase} onBusyChange={setPosting} onSessionExpired={onSessionExpired} onPosted={result => { setPostMessage(`فاکتور شماره ${formatDecimal(result.number)} ثبت قطعی شد.`); setRetry(value => value + 1); }} />}
      {purchase.notes && <p className="invoice-notes">یادداشت: {purchase.notes}</p>}
    </>}<div className="form-actions">{purchase?.status === "POSTED" && !purchase.correctionResult && onCorrected && can("purchases.manage") && can("purchases.post") && <button type="button" className="secondary" disabled={posting} onClick={() => setCorrecting(true)}>اصلاح فاکتور</button>}{purchase?.status==="DRAFT"&&can("purchases.manage")&&onEdit&&<button type="button" className="secondary" disabled={posting} onClick={()=>onEdit(purchase.id)}>ویرایش پیش‌نویس</button>}<button type="button" className="primary" disabled={posting || loading || !purchase} onClick={() => { if (purchase && !printPurchase(business, purchase)) setError("مرورگر پنجره چاپ را مسدود کرده است؛ اجازه بازشدن پنجره را بدهید و دوباره تلاش کنید."); }}>چاپ فاکتور</button><button type="button" className="secondary" disabled={posting} onClick={onClose}>بستن جزئیات</button></div>
  </section></FormDrawer>;
}
// Rev9.0d-installed
