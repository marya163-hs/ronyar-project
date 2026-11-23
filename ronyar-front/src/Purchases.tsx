import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import type { AssistantRequest } from "./assistantRouting";
import PurchaseAssistant from "./PurchaseAssistant";
import { useStoreCan } from "./StorePermissions";
import DocumentListView from "./DocumentListView";
import PurchaseDetailsPanel from "./PurchaseDetailsPanel";
import PurchaseCancelForm from "./PurchaseCancelForm";
import PurchaseForm from "./PurchaseForm";
import { useEffect, useState } from "react";
import { ApiError, errorText, formatDecimal, listPurchases, getPurchase } from "./api";
import type { Business, PurchaseDetails, PurchasePage, PurchaseStatus, PurchaseSummary, PurchaseSuggestion } from "./api";
type Props = { initialCreate?:boolean; onCreateConsumed?:()=>void; business: Business; assistantRequest?:AssistantRequest|null;onAssistantConsumed?:()=>void;onAssistantRedirect?:(kind:"sale"|"purchase"|"report",text:string)=>boolean|void; onSessionExpired: () => void };
export default function Purchases({ initialCreate,onCreateConsumed,business, onSessionExpired,assistantRequest,onAssistantConsumed,onAssistantRedirect }: Props) {
  const [assistantText,setAssistantText]=useState("");
  useEffect(()=>{if(assistantRequest){setAssistantText(assistantRequest.text);setAssistant(true);onAssistantConsumed?.();}},[assistantRequest?.id]);
  const can = useStoreCan();
  const mayManage = can("purchases.manage");
  const [assistant,setAssistant]=useState(false),[assistantSeed,setAssistantSeed]=useState<PurchaseSuggestion|null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null), [draft, setDraft] = useState<PurchaseDetails | null>(null), [editLoading, setEditLoading] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseSummary | null>(null);
  const [creating, setCreating] = useState(false), [success, setSuccess] = useState("");
  useEffect(()=>{if(initialCreate){if(mayManage){setCreating(true);setAssistant(false);}onCreateConsumed?.();}},[initialCreate]);
  const [status, setStatus] = useState<PurchaseStatus | "ALL">("ALL"), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<PurchasePage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); setResult(null); setError(""); setLoading(true); listPurchases(business.id, status, page, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.totalPages > 0 && page > value.totalPages) setPage(value.totalPages); else setResult(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, status, page, retry]);
  useEffect(() => { if (!editId) return; const controller = new AbortController(); setDraft(null); setEditLoading(true); setError(""); getPurchase(business.id, editId, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.status !== "DRAFT") { setError("فقط پیش‌نویس قابل ویرایش است."); setEditId(null); } else setDraft(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); setEditId(null); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setEditLoading(false); }); return () => controller.abort(); }, [business.id, editId]);
  const controlsBusy = assistant || creating || editId !== null || cancelling !== null || detailsId !== null;
  return <section className="sales-section">
    {editLoading && editId && !draft && <p role="status">در حال دریافت پیش‌نویس…</p>}
    {success && <div className="notice success" role="status">{success}</div>}
    {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {mayManage&&<div className="form-actions"><button type="button" className="secondary" disabled={controlsBusy} onClick={()=>{setSuccess("");setAssistantText("");setAssistant(true);}}>دستیار فروشگاه · خرید</button><button type="button" className="secondary" disabled={controlsBusy} onClick={()=>{setAssistantText("__PHOTO_PURCHASE__");setAssistant(true);}}>خرید از عکس فاکتور</button></div>}
    <DocumentListView business={business} kind="purchases" storeName={business.name} currency={business.baseCurrency}
    result={result} status={status} currentPage={page} loading={loading} busy={controlsBusy}
    canCreate={mayManage} canEdit={mayManage}
    onStatusChange={value => { setStatus(value); setPage(1); }} onPageChange={setPage}
    onRefresh={() => setRetry(value => value + 1)}
    onCreate={() => { if (!mayManage) return; setSuccess(""); setAssistantSeed(null); setCreating(true); }}
    onDetails={setDetailsId} onEdit={id => { if (!mayManage) return; setSuccess(""); setEditId(id); }}
    onCancelDraft={id => { if (!mayManage) return; const target = result?.items.find(item => item.id === id); if (target) { setSuccess(""); setCancelling(target); } }} />
    {mayManage && (creating || draft) && <PurchaseForm key={draft?.id ?? "new"} business={business} purchase={draft} assistantSeed={assistantSeed} onSessionExpired={onSessionExpired} onSaved={purchase => { setCreating(false); setEditId(null); setDraft(null); setSuccess(`پیش‌نویس با مبلغ ${formatStoreMoney(business, purchase.total)} ذخیره شد.`); setPage(1); setStatus("DRAFT"); setRetry(value => value + 1); }} onCancel={() => { setCreating(false); setEditId(null); setDraft(null); setRetry(value => value + 1); }} />}
    {mayManage && cancelling && <PurchaseCancelForm business={business} purchase={cancelling} onSessionExpired={onSessionExpired} onSaved={() => { setCancelling(null); setSuccess("پیش‌نویس لغو شد."); setPage(1); setStatus("CANCELLED"); setRetry(value => value + 1); }} onCancel={() => { setCancelling(null); setRetry(value => value + 1); }} />}
    {mayManage&&assistant&&<PurchaseAssistant initialText={assistantText} onRedirect={onAssistantRedirect} business={business} onSessionExpired={onSessionExpired} onClose={()=>{setAssistant(false);setRetry(v=>v+1);}} onUse={seed=>{setAssistant(false);setAssistantSeed(seed);setCreating(true);}} onCreated={id=>{setAssistant(false);setDetailsId(id);setRetry(v=>v+1);}}/>}
    {detailsId && <PurchaseDetailsPanel onViewInvoice={setDetailsId} onCorrected={result => { setDetailsId(result.id); setSuccess(`فاکتور جایگزین شمارهٔ ${result.number} ثبت شد.`); setStatus("POSTED"); setPage(1); setRetry(value => value + 1); }} key={detailsId} business={business} purchaseId={detailsId} onEdit={mayManage?id=>{setDetailsId(null);setEditId(id);setAssistantSeed(null);}:undefined} onSessionExpired={onSessionExpired} onClose={() => { setDetailsId(null); setRetry(value => value + 1); }} />}
  </section>;
}
// Rev9.0d-installed
