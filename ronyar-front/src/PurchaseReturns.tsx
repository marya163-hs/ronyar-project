import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useStoreCan } from "./StorePermissions";
import DocumentListView from "./DocumentListView";
import PurchaseReturnDetailsPanel from "./PurchaseReturnDetailsPanel";
import PurchaseReturnCancelForm from "./PurchaseReturnCancelForm";
import PurchaseReturnForm from "./PurchaseReturnForm";
import { useEffect, useState } from "react";
import { ApiError, errorText, formatDecimal, listPurchaseReturns, getPurchaseReturn } from "./api";
import type { Business, PurchaseReturnDetails, PurchaseReturnPage, SaleStatus, PurchaseReturnSummary } from "./api";
type Props = { business: Business; onSessionExpired: () => void };
export default function PurchaseReturns({ business, onSessionExpired }: Props) {
  const can = useStoreCan();
  const mayManage = can("purchase-returns.manage");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null), [draft, setDraft] = useState<PurchaseReturnDetails | null>(null), [editLoading, setEditLoading] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseReturnSummary | null>(null);
  const [creating, setCreating] = useState(false), [success, setSuccess] = useState("");
  const [status, setStatus] = useState<SaleStatus | "ALL">("ALL"), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<PurchaseReturnPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); setResult(null); setError(""); setLoading(true); listPurchaseReturns(business.id, status, page, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.totalPages > 0 && page > value.totalPages) setPage(value.totalPages); else setResult(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, status, page, retry]);
  useEffect(() => { if (!editId) return; const controller = new AbortController(); setDraft(null); setEditLoading(true); setError(""); getPurchaseReturn(business.id, editId, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.status !== "DRAFT") { setError("فقط پیش‌نویس قابل ویرایش است."); setEditId(null); } else setDraft(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); setEditId(null); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setEditLoading(false); }); return () => controller.abort(); }, [business.id, editId]);
  const controlsBusy = creating || editId !== null || cancelling !== null || detailsId !== null;
  return <section className="sales-section">
    {editLoading && editId && !draft && <p role="status">در حال دریافت پیش‌نویس…</p>}
    {success && <div className="notice success" role="status">{success}</div>}
    {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    <DocumentListView business={business} kind="purchaseReturns" storeName={business.name} currency={business.baseCurrency}
    result={result} status={status} currentPage={page} loading={loading} busy={controlsBusy}
    canCreate={mayManage} canEdit={mayManage}
    onStatusChange={value => { setStatus(value); setPage(1); }} onPageChange={setPage}
    onRefresh={() => setRetry(value => value + 1)}
    onCreate={() => { if (!mayManage) return; setSuccess(""); setCreating(true); }}
    onDetails={setDetailsId} onEdit={id => { if (!mayManage) return; setSuccess(""); setEditId(id); }}
    onCancelDraft={id => { if (!mayManage) return; const target = result?.items.find(item => item.id === id); if (target) { setSuccess(""); setCancelling(target); } }} />
    {mayManage && (creating || draft) && <PurchaseReturnForm key={draft?.id ?? "new"} business={business} document={draft} onSessionExpired={onSessionExpired} onSaved={document => { setCreating(false); setEditId(null); setDraft(null); setSuccess(`پیش‌نویس با مبلغ ${formatStoreMoney(business, document.total)} ذخیره شد.`); setPage(1); setStatus("DRAFT"); setRetry(value => value + 1); }} onCancel={() => { setCreating(false); setEditId(null); setDraft(null); setRetry(value => value + 1); }} />}
    {mayManage && cancelling && <PurchaseReturnCancelForm business={business} document={cancelling} onSessionExpired={onSessionExpired} onSaved={() => { setCancelling(null); setSuccess("پیش‌نویس لغو شد."); setPage(1); setStatus("CANCELLED"); setRetry(value => value + 1); }} onCancel={() => { setCancelling(null); setRetry(value => value + 1); }} />}
    {detailsId && <PurchaseReturnDetailsPanel key={detailsId} business={business} returnId={detailsId} onSessionExpired={onSessionExpired} onClose={() => { setDetailsId(null); setRetry(value => value + 1); }} />}
  </section>;
}
// Rev9.0d-installed
