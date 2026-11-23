import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import { ApiError, cancelPurchaseReturn, errorText, formatDecimal } from "./api";
import type { Business, PurchaseReturnSummary } from "./api";
type Props = { business: Business; document: PurchaseReturnSummary; onSaved: () => void; onCancel: () => void; onSessionExpired: () => void };
export default function PurchaseReturnCancelForm({ business, document, onSaved, onCancel, onSessionExpired }: Props) {
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [blocked, setBlocked] = useState(false); const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current || blocked) return; if (!reason.trim()) { setError("دلیل لغو را وارد کنید."); return; } sending.current = true; setBusy(true); setError("");
    try { await cancelPurchaseReturn(business.id, document.id, { version: document.version, reason: reason.trim() }); if (alive.current) onSaved(); }
    catch (cause) { if (alive.current) { if (!(cause instanceof ApiError) || cause.status === 409 || (cause.status >= 500 || cause.status === 408)) setBlocked(true); setError(!(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408) ? "نتیجه لغو مشخص نیست؛ فرم را ببندید و وضعیت فاکتور را بررسی کنید." : cause.status === 409 ? "نسخه یا وضعیت فاکتور تغییر کرده است؛ فرم را ببندید و فهرست را دوباره بررسی کنید." : cause.status === 403 ? "اجازه لغو پیش‌نویس را ندارید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  return <FormDrawer title="لغو پیش‌نویس برگشت خرید" busy={busy} onClose={onCancel}><section className="product-form-panel"><p>دلیل برگشت: {document.reason}</p><p>مبلغ: <bdi>{formatStoreMoney(business, document.total)}</bdi> {storeMoneyUnit(business)}</p><p className="muted">فاکتور و ردیف‌ها حفظ می‌شوند؛ پیش‌نویس لغوشده قابل ویرایش یا ثبت قطعی نیست.</p>{error && <div className="notice error" role="alert">{error}</div>}
    <form onSubmit={submit}><fieldset className="product-form-fields" disabled={busy || blocked}><label>دلیل لغو<input value={reason} onChange={event => setReason(event.target.value)} required maxLength={1000} /></label></fieldset><div className="form-actions"><button type="submit" className="primary" disabled={busy || blocked}>{busy ? "در حال لغو…" : "تأیید لغو پیش‌نویس"}</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>انصراف</button></div></form>
  </section></FormDrawer>;
}