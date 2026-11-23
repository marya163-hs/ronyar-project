import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorText, formatDecimal, postSale } from "./api";
import type { Business, SaleDetails, SalePostingResult } from "./api";
type Props = { business: Business; sale: SaleDetails; onPosted: (result: SalePostingResult) => void; onBusyChange: (busy: boolean) => void; onSessionExpired: () => void };
export default function SalePostAction({ business, sale, onPosted, onBusyChange, onSessionExpired }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit() {
    if (sending.current || blocked || sale.status !== "DRAFT") return;
    const storageName = `mahan:sale-post:${business.id}:${sale.id}:${sale.version}`; let key: string;
    try { const stored = sessionStorage.getItem(storageName); if (stored && !/^[A-Za-z0-9_-]{16,128}$/.test(stored)) throw new Error("Invalid stored key"); key = stored ?? `web-sale-${crypto.randomUUID()}`; sessionStorage.setItem(storageName, key); }
    catch { setError("مرورگر امکان نگهداری کلید درخواست را نمیدهد تنظیمات ذخیرهسازی را بررسی کنید."); return; }
    sending.current = true; setBusy(true); onBusyChange(true); setError("");
    try { const result = await postSale(business.id, sale.id, sale.version, key); if (alive.current) { setBlocked(true); setUncertain(false); onPosted(result); } }
    catch (cause) { if (alive.current) { const unknown = !(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408); setUncertain(unknown); if (cause instanceof ApiError && cause.status === 409) setBlocked(true); setError(unknown ? "نتیجه ثبت مشخص نیست. میتوانید با همان کلید درخواست دوباره بررسی و ارسال کنید ثبت تکراری ایجاد نمیشود." : cause.status === 409 && (cause.code === "SALE_INSUFFICIENT_STOCK" || /^(SALE_MATERIAL_|SALE_RECIPE_)/.test(cause.code)) ? errorText(cause) : cause.status === 409 ? "ثبت رد شد نسخه فاکتور دوره مالی موجودی یا تنظیمات حسابها را بررسی کنید. جزئیات را ببندید و دوباره باز کنید." : cause.status === 403 ? "اجازه ثبت قطعی فروش را ندارید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
  }
  return <section className="sale-post-action"><h3>ثبت قطعی فروش</h3><p className="muted">با ثبت قطعی موجودی کالا کاهش مییابد و سند حسابداری ایجاد میشود. فاکتور پس از آن قابل ویرایش یا لغو پیشنویس نیست.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <button type="button" className="primary" disabled={busy || blocked || sale.status !== "DRAFT"} onClick={submit}>{busy ? "در حال ثبت قطعی…" : uncertain ? "بررسی و تلاش مجدد با همان درخواست" : `ثبت قطعی فروش ${formatStoreMoney(business, sale.total)} ${storeMoneyUnit(business)}`}</button>
  </section>;
}