import { normalizeMobile, validMobile } from "./authIdentifier";
import MasterNameHint from "./MasterNameHint";
import FormDrawer from "./FormDrawer";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, createParty, updateParty, errorText } from "./api";
import type { Business, Party } from "./api";
type Props = { business: Business; party: Party | null; initialRole?: "CUSTOMER" | "SUPPLIER"; allowCash?: boolean; onSaved: (party: Party) => void; onCancel: () => void; onSessionExpired: () => void };
export default function PartyForm({ business, party, initialRole = "CUSTOMER", allowCash = true, onSaved, onCancel, onSessionExpired }: Props) {
  const [name, setName] = useState(party?.name ?? ""), [code, setCode] = useState(party?.externalCode ?? "");
  const [mobile, setMobile] = useState(party?.mobile ?? "");
  const [customer, setCustomer] = useState(initialRole === "CUSTOMER"), [supplier, setSupplier] = useState(initialRole === "SUPPLIER"), [cash, setCash] = useState(false), [active, setActive] = useState(party?.isActive ?? true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return; setError("");
    if (!name.trim()) { setError("نام طرف‌حساب را وارد کنید."); return; }
    if (!party && !customer && !supplier) { setError("حداقل نقش مشتری یا تأمین‌کننده را انتخاب کنید."); return; }
    if (mobile.trim() && !validMobile(mobile)) { setError("شماره همراه معتبر وارد کنید. نمونه ۰۹۱۲۳۴۵۶۷۸۹"); return; }
    const normalizedMobile = mobile.trim() ? normalizeMobile(mobile) : null;
    const mobileChanged = normalizedMobile !== (party?.mobile ?? null);
    if (party && !mobileChanged && name.trim() === party.name && (code.trim() || null) === party.externalCode && active === party.isActive) { setError("تغییری برای ذخیره وجود ندارد."); return; }
    sending.current = true; setBusy(true);
    try {
      const saved = party ? await updateParty(business.id, party.id, { name: name.trim(), externalCode: code.trim() || null, isActive: active, ...(mobileChanged ? { mobile: normalizedMobile } : {}) }) : await createParty(business.id, { name: name.trim(), customerEnabled: customer, supplierEnabled: supplier, isCashCustomer: cash && customer, ...(normalizedMobile ? { mobile: normalizedMobile } : {}), ...(code.trim() ? { externalCode: code.trim() } : {}) });
      if (alive.current) onSaved(saved);
    } catch (cause) { if (alive.current) { setError(cause instanceof ApiError && cause.status === 403 ? "اجازه ثبت یا ویرایش طرف‌حساب را ندارید." : cause instanceof ApiError && cause.code?.startsWith("PARTY_DEACTIVATE_") ? errorText(cause) : cause instanceof ApiError && cause.status === 409 ? "ذخیره انجام نشد؛ طرف‌حساب ممکن است مانده یا سند پیش‌نویس داشته باشد. مشتری نقدی باید فعال بماند و فقط یک مشتری نقدی قابل ثبت است." : !(cause instanceof ApiError) ? "نتیجه ذخیره مشخص نیست؛ پیش از ارسال دوباره، فرم را ببندید و فهرست را بررسی کنید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  return <FormDrawer title={party ? `ویرایش ${party.name}` : "ثبت مشتری یا تأمین‌کننده"} busy={busy} onClose={onCancel}><section className="product-form-panel base-party-form"><p className="muted base-form-intro">اطلاعات اصلی را وارد کنید. کد خارجی اختیاری است و در صورت نیاز برای تطبیق با سیستم‌های دیگر استفاده می‌شود.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <form onSubmit={submit}><fieldset disabled={busy} className="product-form-fields">
      <label>نام شخص یا مجموعه<input placeholder="مثلاً محمد احمدی یا فروشگاه نمونه" autoFocus value={name} onChange={event => setName(event.target.value)} required maxLength={200} /></label>
      <label>شماره همراه (اختیاری)<input type="tel" dir="ltr" value={mobile} onChange={event => setMobile(event.target.value)} maxLength={24} placeholder="09123456789" /></label>
      <MasterNameHint key={business.id} businessId={business.id} kind="PARTY" name={name} excludeId={party?.id} onSessionExpired={onSessionExpired} />
      
      {!party && <><label>نقش<select value={customer && supplier ? "BOTH" : customer ? "CUSTOMER" : "SUPPLIER"} onChange={event => { setCustomer(event.target.value !== "SUPPLIER"); setSupplier(event.target.value !== "CUSTOMER"); if (event.target.value === "SUPPLIER") setCash(false); }}><option value="CUSTOMER">مشتری</option><option value="SUPPLIER">تأمین‌کننده</option><option value="BOTH">مشتری و تأمین‌کننده</option></select></label><label>نوع مشتری<select value={cash ? "CASH" : "NORMAL"} disabled={!customer || !allowCash} onChange={event => setCash(event.target.value === "CASH")}><option value="NORMAL">عادی</option><option value="CASH">مشتری نقدی فروشگاه</option></select></label></>}
      {party && <><p className="muted">نقش‌ها: {[party.customerEnabled ? "مشتری" : "", party.supplierEnabled ? "تأمین‌کننده" : "", party.isCashCustomer ? "مشتری نقدی" : ""].filter(Boolean).join("، ")}؛ نقش‌ها با ویرایش تغییر نمی‌کنند.</p><label>وضعیت (برای کنارگذاشتن مورد تکراری، غیرفعال را انتخاب کنید)<select value={active ? "ACTIVE" : "INACTIVE"} onChange={event => setActive(event.target.value === "ACTIVE")}><option value="ACTIVE">فعال</option><option value="INACTIVE" disabled={party.isCashCustomer}>غیرفعال</option></select><small>سوابق حفظ می‌شوند و مورد غیرفعال در انتخاب‌های جدید نمی‌آید. مانده تسویه‌نشده یا پیش‌نویس مرتبط مانع این کار است؛ مشتری نقدی باید فعال بماند.</small></label></>}
    </fieldset><details className="base-extra-details"><summary>اطلاعات بیشتر (اختیاری)</summary><label>کد خارجی<input dir="ltr" value={code} onChange={event => setCode(event.target.value)} maxLength={64} placeholder="اختیاری" /></label></details><div className="form-actions"><button className="primary" type="submit" disabled={busy}>{busy ? "در حال ذخیره…" : party?.isActive && !active ? "ذخیره و غیرفعال‌سازی" : "ذخیره"}</button><button className="secondary" type="button" disabled={busy} onClick={onCancel}>بستن فرم</button></div></form>
  </section></FormDrawer>;
}