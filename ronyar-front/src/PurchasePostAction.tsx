import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorText, formatDecimal, postPurchase } from "./api";
import type { Business, PurchaseDetails, PurchasePostingResult } from "./api";
type Props = { business: Business; purchase: PurchaseDetails; onPosted: (result: PurchasePostingResult) => void; onBusyChange: (busy: boolean) => void; onSessionExpired: () => void };
export default function PurchasePostAction({ business, purchase, onPosted, onBusyChange, onSessionExpired }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit() {
    if (sending.current || blocked || purchase.status !== "DRAFT") return;
    const storageName = `mahan:purchase-post:${business.id}:${purchase.id}:${purchase.version}`; let key: string;
    try { const stored = sessionStorage.getItem(storageName); if (stored && !/^[A-Za-z0-9_-]{16,128}$/.test(stored)) throw new Error("Invalid stored key"); key = stored ?? `web-purchase-${crypto.randomUUID()}`; sessionStorage.setItem(storageName, key); }
    catch { setError("مرورگر امکان نگهداری کلید درخواست را نمیدهد تنظیمات ذخیرهسازی را بررسی کنید."); return; }
    sending.current = true; setBusy(true); onBusyChange(true); setError("");
    try { const result = await postPurchase(business.id, purchase.id, purchase.version, key); if (alive.current) { setBlocked(true); setUncertain(false); onPosted(result); } }
    catch (cause) { if (alive.current) { const unknown = !(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408); setUncertain(unknown); if (cause instanceof ApiError && cause.status === 409) setBlocked(true); setError(unknown ? "نتیجه ثبت مشخص نیست. میتوانید با همان کلید درخواست دوباره بررسی و ارسال کنید ثبت تکراری ایجاد نمیشود." : cause.status === 409 ? "ثبت رد شد نسخه فاکتور دوره مالی موجودی یا تنظیمات حسابها را بررسی کنید. جزئیات را ببندید و دوباره باز کنید." : cause.status === 403 ? "اجازه ثبت قطعی خرید را ندارید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
  }
  return <section className="sale-post-action"><h3>ثبت قطعی خرید</h3><p className="muted">با ثبت قطعی موجودی کالا افزایش می‌یابد، بدهی تأمین‌کننده ثبت می‌شود و سند حسابداری ایجاد می‌شود. فاکتور پس از آن قابل ویرایش یا لغو پیشنویس نیست.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <button type="button" className="primary" disabled={busy || blocked || purchase.status !== "DRAFT"} onClick={submit}>{busy ? "در حال ثبت قطعی…" : uncertain ? "بررسی و تلاش مجدد با همان درخواست" : `ثبت قطعی خرید ${formatStoreMoney(business, purchase.total)} ${storeMoneyUnit(business)}`}</button>
  </section>;
}