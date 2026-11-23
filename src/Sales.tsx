import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import type { AssistantRequest } from "./assistantRouting";
import QuickSale from "./QuickSale";
import SaleAssistant from "./SaleAssistant";
import type { SaleSuggestion } from "./api";
import { useStoreCan } from "./StorePermissions";
import DocumentListView from "./DocumentListView";
import SaleDetailsPanel from "./SaleDetailsPanel";
import SaleCancelForm from "./SaleCancelForm";
import SaleForm from "./SaleForm";
import { useEffect, useState } from "react";
import { ApiError, errorText, formatDecimal, listSales, getSale } from "./api";
import type { Business, SaleDetails, SalePage, SaleStatus, SaleSummary } from "./api";
type Props = { initialCreate?:boolean; onCreateConsumed?:()=>void; business: Business; assistantRequest?:AssistantRequest|null;onAssistantConsumed?:()=>void;onAssistantRedirect?:(kind:"sale"|"purchase"|"report",text:string)=>boolean|void; onSessionExpired: () => void };
export default function Sales({ initialCreate,onCreateConsumed,business, onSessionExpired,assistantRequest,onAssistantConsumed,onAssistantRedirect }: Props) {
  const [assistant,setAssistant]=useState(false),[suggestion,setSuggestion]=useState<SaleSuggestion|null>(null);
  const [quick,setQuick]=useState(false);
  const [assistantText,setAssistantText]=useState("");
  useEffect(()=>{if(assistantRequest){setAssistantText(assistantRequest.text);setAssistant(true);onAssistantConsumed?.();}},[assistantRequest?.id]);
  const can = useStoreCan();
  const mayManage = can("sales.manage");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null), [draft, setDraft] = useState<SaleDetails | null>(null), [editLoading, setEditLoading] = useState(false);
  const [cancelling, setCancelling] = useState<SaleSummary | null>(null);
  const [creating, setCreating] = useState(false), [success, setSuccess] = useState("");
  useEffect(()=>{if(initialCreate){if(mayManage){setCreating(true);setAssistant(false);}onCreateConsumed?.();}},[initialCreate]);
  const [status, setStatus] = useState<SaleStatus | "ALL">("ALL"), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<SalePage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); setResult(null); setError(""); setLoading(true); listSales(business.id, status, page, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.totalPages > 0 && page > value.totalPages) setPage(value.totalPages); else setResult(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, status, page, retry]);
  useEffect(() => { if (!editId) return; const controller = new AbortController(); setDraft(null); setEditLoading(true); setError(""); getSale(business.id, editId, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.status !== "DRAFT") { setError("فقط پیش‌نویس قابل ویرایش است."); setEditId(null); } else setDraft(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); setEditId(null); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setEditLoading(false); }); return () => controller.abort(); }, [business.id, editId]);
  const controlsBusy = quick || assistant || creating || editId !== null || cancelling !== null || detailsId !== null;
  return <section className="sales-section">
    {editLoading && editId && !draft && <p role="status">در حال دریافت پیش‌نویس…</p>}
    {success && <div className="notice success" role="status">{success}</div>}
    {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {mayManage && <div className="sale-assistant-entry"><button type="button" className="secondary" disabled={controlsBusy} onClick={()=>{setSuccess("");setAssistantText("");setAssistant(true);}}>دستیار فروشگاه · فروش با پیام</button><p>پیام را به پیشنهاد قابل بررسی تبدیل کنید.</p></div>}
    {mayManage && assistant && <SaleAssistant initialText={assistantText} onRedirect={onAssistantRedirect} onCreated={id=>{setAssistant(false);setDetailsId(id);setSuccess("پیش‌نویس دستیار ذخیره شد؛ برای ثبت قطعی آن را بررسی کنید.");setRetry(n=>n+1);}} business={business} onClose={()=>setAssistant(false)} onSessionExpired={onSessionExpired} onUse={value=>{setSuggestion(value);setAssistant(false);setCreating(true);}} />}
    {mayManage && can("sales.post") && <button type="button" className="primary" disabled={controlsBusy} onClick={()=>setQuick(true)}>فروش سریع · بارکد و جستجو</button>}
    {quick && mayManage && can("sales.post") && <QuickSale business={business} onSessionExpired={onSessionExpired} onClose={()=>{setQuick(false);setRetry(n=>n+1);}} onView={id=>{setQuick(false);setDetailsId(id);setRetry(n=>n+1);}}/>}
    <DocumentListView business={business} kind="sales" storeName={business.name} currency={business.baseCurrency}
    result={result} status={status} currentPage={page} loading={loading} busy={controlsBusy}
    canCreate={mayManage} canEdit={mayManage}
    onStatusChange={value => { setStatus(value); setPage(1); }} onPageChange={setPage}
    onRefresh={() => setRetry(value => value + 1)}
    onCreate={() => { if (!mayManage) return; setSuccess(""); setSuggestion(null); setCreating(true); }}
    onDetails={setDetailsId} onEdit={id => { if (!mayManage) return; setSuccess(""); setEditId(id); }}
    onCancelDraft={id => { if (!mayManage) return; const target = result?.items.find(item => item.id === id); if (target) { setSuccess(""); setCancelling(target); } }} />
    {mayManage && (creating || draft) && <SaleForm key={draft?.id ?? "new"} business={business} sale={draft} suggestion={creating ? suggestion : null} onSessionExpired={onSessionExpired} onSaved={sale => { setCreating(false); setSuggestion(null); setEditId(null); setDraft(null); setSuccess(`پیش‌نویس با مبلغ ${formatStoreMoney(business, sale.total)} ذخیره شد.`); setPage(1); setStatus("DRAFT"); setRetry(value => value + 1); }} onCancel={() => { setCreating(false); setSuggestion(null); setEditId(null); setDraft(null); setRetry(value => value + 1); }} />}
    {mayManage && cancelling && <SaleCancelForm business={business} sale={cancelling} onSessionExpired={onSessionExpired} onSaved={() => { setCancelling(null); setSuccess("پیش‌نویس لغو شد."); setPage(1); setStatus("CANCELLED"); setRetry(value => value + 1); }} onCancel={() => { setCancelling(null); setRetry(value => value + 1); }} />}
    {detailsId && <SaleDetailsPanel onViewInvoice={setDetailsId} onCorrected={result => { setDetailsId(result.id); setSuccess(`فاکتور جایگزین شمارهٔ ${result.number} ثبت شد.`); setStatus("POSTED"); setPage(1); setRetry(value => value + 1); }} onEdit={id=>{setDetailsId(null);setSuccess("");setEditId(id);}} key={detailsId} business={business} saleId={detailsId} onSessionExpired={onSessionExpired} onClose={() => { setDetailsId(null); setRetry(value => value + 1); }} />}
  </section>;
}
// Rev9.0d-installed
