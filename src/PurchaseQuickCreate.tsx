import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import { ApiError, createProduct, getProduct, createParty, listUnits, errorText } from "./api";
import type { Business, Product, Party, ProductUnit } from "./api";
import { similarQuickItems, usableQuickSupplier } from "./purchaseQuickCreateUtils";
import "./PurchaseQuickCreate.css";

type Props = {
  business: Business; mode: "PRODUCT" | "SUPPLIER" | "CUSTOMER"; products: Product[]; suppliers: Party[];
  onProduct: (product: Product) => void; onSupplier: (party: Party) => void;
  onRefresh: () => Promise<void>; onCancel: () => void; onSessionExpired: () => void;
};
export default function PurchaseQuickCreate({ business, mode, products, suppliers, onProduct, onSupplier, onRefresh, onCancel, onSessionExpired }: Props) {
  const [name, setName] = useState(""), [kind, setKind] = useState<"GOODS" | "SERVICE">("GOODS"), [unitId, setUnitId] = useState("");
  const [units, setUnits] = useState<ProductUnit[]>([]), [loading, setLoading] = useState(mode === "PRODUCT");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [createdId, setCreatedId] = useState(""), [retry, setRetry] = useState(0);
  const alive = useRef(true), sending = useRef(false), created = useRef(""), blocked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (mode !== "PRODUCT") return;
    const controller = new AbortController(); setLoading(true); setError("");
    listUnits(business.id, controller.signal).then(value => {
      if (controller.signal.aborted) return; setUnits(value);
      setUnitId(current => value.some(unit => unit.id === current) ? current : (value.find(unit => unit.name.trim() === "عدد" || ["PCS", "EA", "NUMBER"].includes(unit.code.toUpperCase())) ?? value[0])?.id ?? "");
    }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, mode, retry]);
  const isCustomer = mode === "CUSTOMER";
  const usableParty = (party: Party) => isCustomer ? party.isActive && party.customerEnabled : usableQuickSupplier(party);
  const matches = mode === "PRODUCT" ? similarQuickItems(products.filter(p => p.isActive), name) : similarQuickItems(suppliers.filter(usableParty), name);
  async function resolveProduct(id: string) {
    const saved = await getProduct(business.id, id);
    if (!saved.isActive) throw new Error("کالای ثبت‌شده فعال نیست؛ وضعیت آن را از اطلاعات پایه بررسی کنید.");
    if (alive.current) onProduct(saved);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current || blocked.current || loading) return;
    const trimmed = name.trim(); if (!trimmed || trimmed.length > 200 || (mode === "PRODUCT" && !units.some(unit => unit.id === unitId))) { setError("نام و واحد معتبر را مشخص کنید."); return; }
    sending.current = true; setBusy(true); setError("");
    try {
      if (created.current) { await resolveProduct(created.current); return; }
      if (mode === "PRODUCT") {
        const saved = await createProduct(business.id, { name: trimmed, kind, unitId, salePrice: "0" });
        // After a confirmed POST, retry only this GET; never create the item a second time.
        created.current = saved.id; if (alive.current) setCreatedId(saved.id);
        await resolveProduct(saved.id);
      } else {
        const saved = await createParty(business.id, { name: trimmed, supplierEnabled: !isCustomer, customerEnabled: isCustomer, isCashCustomer: false });
        created.current = saved.id;
        if (!usableParty(saved)) throw new Error("طرف حساب ثبت شده است؛ وضعیت آن را از اطلاعات پایه بررسی کنید.");
        if (alive.current) onSupplier(saved);
      }
    } catch (cause) {
      if (!alive.current) return;
      if (created.current) {
        setError(mode === "PRODUCT" ? "کالا یا خدمت ثبت شد، اما دریافت مشخصات آن کامل نشد. «دریافت مورد ثبت‌شده» را بزنید؛ مورد جدیدی ساخته نمی‌شود." : "طرف حساب ثبت شد؛ فهرست را به‌روزرسانی و آن را بررسی کنید.");
        if (mode !== "PRODUCT") { blocked.current = true; setUncertain(true); }
      } else if (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408) {
        blocked.current = true; setUncertain(true);
        setError("نتیجه ثبت مشخص نیست؛ برای جلوگیری از ثبت تکراری، ارسال دوباره متوقف شد. فهرست را به‌روزرسانی و مورد ثبت‌شده را بررسی کنید.");
      } else setError(cause.status === 403 ? "اجازه ثبت این مورد را ندارید؛ از مسئول فروشگاه بخواهید دسترسی لازم را بدهد." : cause.status === 409 ? "ثبت رد شد؛ فهرست را بررسی کنید و در صورت وجود، همان مورد را انتخاب کنید." : errorText(cause));
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
    } finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  async function refresh() {
    if (sending.current) return; sending.current = true; setBusy(true);
    try { await onRefresh(); }
    catch (cause) { if (alive.current) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  return <FormDrawer title={mode === "PRODUCT" ? "ثبت سریع کالا یا خدمت" : isCustomer ? "ثبت سریع مشتری" : "ثبت سریع تأمین‌کننده"} busy={busy} onClose={onCancel}>
    <section className="product-form-panel purchase-quick-create" dir="rtl">
      <p className="muted">اطلاعات فاکتور حفظ می‌شود. پس از ثبت، این مورد در فاکتور انتخاب خواهد شد.</p>
      <p className="quick-master-note">این ثبت در اطلاعات پایه ذخیره می‌شود؛ موجودی، پرداخت و سند حسابداری ایجاد نمی‌کند. با بستن فاکتور نیز باقی می‌ماند.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {loading && <p role="status">در حال دریافت واحدها…</p>}
      <form onSubmit={submit} noValidate>
        <fieldset className="product-form-fields" disabled={busy || !!createdId}>
          <label>{mode === "PRODUCT" ? "نام کالا یا خدمت *" : "نام شخص یا مجموعه *"}<input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder={mode === "PRODUCT" ? "مثلاً آب معدنی" : "مثلاً شرکت پخش نمونه"} /></label>
          {mode === "PRODUCT" && <>
            <label>نوع<select value={kind} onChange={event => setKind(event.target.value as "GOODS" | "SERVICE")}><option value="GOODS">کالا</option><option value="SERVICE">خدمت</option></select></label>
            <label>واحد *<select value={unitId} onChange={event => setUnitId(event.target.value)} disabled={loading}><option value="">انتخاب واحد</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <small className="muted">کد به‌صورت خودکار ساخته می‌شود. قیمت خرید را در ردیف فاکتور وارد کنید؛ قیمت فروش فعلاً صفر است.</small>
            {!loading && !units.length && <div className="notice">واحدی در دسترس نیست؛ ابتدا یک واحد در اطلاعات پایه تعریف کنید. اطلاعات فاکتور حفظ می‌شود.</div>}
          </>}
          {mode !== "PRODUCT" && <p className="muted">با نقش «{isCustomer ? "مشتری" : "تأمین‌کننده"}» ثبت می‌شود. اطلاعات تکمیلی را بعداً می‌توانید ویرایش کنید.</p>}
        </fieldset>
        {!!matches.length && !createdId && <div className="quick-matches"><strong>موارد مشابه موجود</strong><p>اگر همین مورد است، آن را انتخاب کنید تا دوباره ثبت نشود.</p><ul>{matches.map(match => <li key={match.id}><button type="button" disabled={busy} onClick={() => {
          if (sending.current) return;
          if (mode === "PRODUCT") { const product = products.find(p => p.id === match.id); if (product) onProduct(product); }
          else { const supplier = suppliers.find(p => p.id === match.id); if (supplier) onSupplier(supplier); }
        }}>{match.name}{"code" in match ? ` · ${match.code}` : ""}</button></li>)}</ul></div>}
        <button type="button" className="text-button quick-refresh" disabled={busy} onClick={refresh}>به‌روزرسانی فهرست موارد موجود</button>
        {mode === "PRODUCT" && !units.length && <button type="button" className="text-button" disabled={busy || loading} onClick={() => setRetry(value => value + 1)}>دریافت دوباره واحدها</button>}
        <div className="form-actions"><button type="submit" className="primary" disabled={busy || loading || uncertain || !name.trim() || (mode === "PRODUCT" && !unitId)}>{busy ? "در حال انجام…" : createdId ? "دریافت مورد ثبت‌شده" : mode === "PRODUCT" ? "ثبت و انتخاب کالا/خدمت" : isCustomer ? "ثبت و انتخاب مشتری" : "ثبت و انتخاب تأمین‌کننده"}</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>بازگشت به فاکتور</button></div>
      </form>
    </section>
  </FormDrawer>;
}
