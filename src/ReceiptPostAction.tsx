import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorText, formatDecimal, postPayment } from "./api";
import type { Business, PaymentDetails, PaymentPostingResult } from "./api";
type Props = { business: Business; payment: PaymentDetails; onPosted: (result: PaymentPostingResult) => void; onBusyChange: (busy: boolean) => void; onSessionExpired: () => void };
export default function ReceiptPostAction({ business, payment, onPosted, onBusyChange, onSessionExpired }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false); const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit() {
    if (sending.current || blocked || payment.status !== "DRAFT") return;
    const storageName = `mahan:payment-post:${business.id}:${payment.id}:${payment.version}`; let key: string;
    try { const stored = sessionStorage.getItem(storageName); if (stored && !/^[A-Za-z0-9_-]{16,128}$/.test(stored)) throw new Error("Invalid stored key"); key = stored ?? `web-payment-${crypto.randomUUID()}`; sessionStorage.setItem(storageName, key); } catch { setError("امکان نگهداری کلید درخواست در مرورگر وجود ندارد."); return; }
    sending.current = true; setBusy(true); onBusyChange(true); setError("");
    try { const result = await postPayment(business.id, payment.id, payment.version, key); if (alive.current) { setBlocked(true); setUncertain(false); onPosted(result); } }
    catch (cause) { if (alive.current) { const unknown = !(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408); setUncertain(unknown); if (cause instanceof ApiError && cause.status === 409) setBlocked(true); setError(unknown ? "نتیجه ثبت دریافت مشخص نیست؛ تلاش مجدد با همان درخواست انجام می‌شود تا پرداخت تکراری ایجاد نشود." : cause.status === 409 ? "ثبت دریافت رد شد؛ مانده فاکتور، نسخه پرداخت یا دوره مالی تغییر کرده است. جزئیات را ببندید و دوباره بررسی کنید." : cause.status === 403 ? "اجازه ثبت قطعی دریافت را ندارید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
  }
  return <div><p className="muted">ثبت قطعی، موجودی صندوق یا بانک را افزایش می‌دهد و مانده فاکتور را کاهش می‌دهد.</p>{error && <div className="notice error" role="alert">{error}</div>}
    <button type="button" className="primary" disabled={busy || blocked || payment.status !== "DRAFT"} onClick={submit}>{busy ? "در حال ثبت دریافت…" : uncertain ? "تلاش مجدد با همان درخواست" : `ثبت دریافت ${formatStoreMoney(business, payment.amount)} ${storeMoneyUnit(business)}`}</button>
  </div>;
}