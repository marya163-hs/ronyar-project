import { correctInvoice } from "./api";
import type { InvoiceCorrectionResult } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { searchInvoiceOptions } from "./invoiceSearch";
import "./InvoiceSearch.css";
import PurchaseQuickCreate from "./PurchaseQuickCreate";
import { upsertQuickItem, quickProductChange, usableQuickSupplier } from "./purchaseQuickCreateUtils";
import { assistantSupplierMatch, assistantProductMatch } from "./saleAssistantMatch";
import { periodForDate } from "./documentPeriod";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import InvoiceStep from "./InvoiceStep";
import MoneyInput from "./MoneyInput";
import { ApiError, createPurchase, updatePurchase, errorText, formatDecimal, tehranToday } from "./api";
import type { Business, Product, Party, PurchaseDetails, PurchaseItemInput, PurchaseSuggestion } from "./api";
import { loadPurchaseOptions } from "./purchaseOptions";
import { invoiceLineValues, invoiceLineErrors, calculateSaleLine, decimalString, normalizeDigits } from "./saleAmounts";
type Props = { onCorrected?: (result: InvoiceCorrectionResult) => void; business: Business; purchase: PurchaseDetails | null; assistantSeed?:PurchaseSuggestion|null; onSaved: (purchase: PurchaseDetails) => void; onCancel: () => void; onSessionExpired: () => void };
type Row = PurchaseItemInput & { key: string };
const newRow = (): Row => ({ key: crypto.randomUUID(), productId: "", quantity: "1", unitPrice: "", discountAmount: "", taxRate: "" });
export default function PurchaseForm({ business, purchase, assistantSeed, onSaved, onCorrected, onCancel, onSessionExpired }: Props) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(purchase?.documentDate ?? tehranToday()), [partyId, setPartyId] = useState(purchase?.partyId ?? ""), [notes, setNotes] = useState(purchase?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() => purchase ? purchase.items.map(item => ({ key: crypto.randomUUID(), productId: item.productId, ...(item.warehouseId ? { warehouseId: item.warehouseId } : {}), quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount, taxRate: item.taxRate })) : assistantSeed ? assistantSeed.items.map(item=>({...newRow(),quantity:item.quantity??"",unitPrice:item.unitPrice??"",discountAmount:item.discountAmount??"0"})) : [newRow()]);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadPurchaseOptions>> | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0), [uncertain, setUncertain] = useState(false);
  const [quick, setQuick] = useState<{ mode: "SUPPLIER" } | { mode: "PRODUCT"; rowKey: string } | null>(null);
  const [quickNotice, setQuickNotice] = useState("");
  const [partyQuery, setPartyQuery] = useState(""), [productQueries, setProductQueries] = useState<Record<string, string>>({});
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(""); loadPurchaseOptions(business.id, controller.signal).then(value => { if (!controller.signal.aborted) { setOptions(value); if(assistantSeed&&!purchase){
        setPartyId(assistantSupplierMatch(value.suppliers,assistantSeed.supplier));
        const defaults=value.warehouses.filter(w=>w.isDefault);const defaultId=defaults.length===1?defaults[0].id:value.warehouses.length===1?value.warehouses[0].id:undefined;
        setRows(assistantSeed.items.map(item=>{const productId=assistantProductMatch(value.products,item.product);return {...newRow(),productId,quantity:item.quantity??"",unitPrice:item.unitPrice??"",discountAmount:item.discountAmount??"0",warehouseId:value.products.find(p=>p.id===productId)?.kind==="GOODS"?defaultId:undefined};}));
      } } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, retry]);
  const [validationError,setValidationError]=useState("");
  useEffect(()=>{setValidationError("");},[rows,partyId,date,notes]);
  const fields=rows.map(row=>invoiceLineErrors(row,business.currencyScale));
  const previews = rows.map((row,index) => { const fieldError=Object.values(fields[index])[0];if(fieldError)return {value:null,error:fieldError};try { return { value: calculateSaleLine(invoiceLineValues(row), business.currencyScale), error: "" }; } catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : "مبلغ نامعتبر است." }; } });
  const total = previews.reduce((sum, item) => sum + (item.value?.total ?? 0n), 0n);
  const patchRow = (key: string, change: Partial<PurchaseItemInput>) => setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  function chooseProduct(key: string, productId: string) { const product = options?.products.find(item => item.id === productId); patchRow(key, { productId, unitPrice: "", warehouseId: product?.kind === "GOODS" ? options?.warehouses.find(item => item.isDefault)?.id ?? options?.warehouses[0]?.id : undefined }); }
  const periodId = periodForDate(options?.periods ?? [], date)?.id ?? "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current || loading || uncertain || quick || !options) return; setError("");setValidationError("");
    try {
      const period = options.periods.find(item => item.id === periodId); const parsedDate = new Date(`${date}T00:00:00.000Z`);
      if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || !period || date < period.startDate || date > period.endDate) throw new Error("تاریخ باید داخل دوره مالی باز انتخاب‌شده باشد.");
      if (!options.suppliers.some(item => item.id === partyId)) throw new Error("یک تأمین‌کننده فعال انتخاب کنید.");
      for (const [index, row] of rows.entries()) { const product = options.products.find(item => item.id === row.productId); if (!product) throw new Error(`ردیف ${index + 1}: کالا یا خدمت فعال انتخاب کنید.`); if (product.kind === "GOODS" && !options.warehouses.some(item => item.id === row.warehouseId)) throw new Error(`ردیف ${index + 1}: انبار فعال انتخاب کنید.`); if (previews[index].error) throw new Error(`ردیف ${index + 1}: ${previews[index].error}`); }
      if (total <= 0n || total >= 1000000000000000000n * 10n ** BigInt(business.currencyScale)) throw new Error("جمع فاکتور باید مثبت و کمتر از محدوده مجاز باشد.");
    } catch (cause) { setValidationError(cause instanceof Error ? cause.message : "اطلاعات فاکتور معتبر نیست."); return; }
    sending.current = true; setBusy(true);
    const body = { partyId, periodId, documentDate: date, notes: notes.trim(), items: rows.map(row => ({ productId: row.productId, ...(options.products.find(item => item.id === row.productId)?.kind === "GOODS" ? { warehouseId: row.warehouseId } : {}), quantity: normalizeDigits(row.quantity), unitPrice: normalizeDigits(row.unitPrice), discountAmount: invoiceLineValues(row).discountAmount, taxRate: invoiceLineValues(row).taxRate })) };
    try {
      if (purchase && onCorrected) {
        const result = await correctInvoice(business.id, "purchases", purchase.id, { ...body, reason: reason.trim() || "اصلاح فاکتور", version: purchase.version }, crypto.randomUUID());
        if (alive.current) onCorrected(result);
        return;
      }
      const result = purchase ? await updatePurchase(business.id, purchase.id, { ...body, version: purchase.version }) : await createPurchase(business.id, body); if (alive.current) onSaved(result); }
    catch (cause) { if (alive.current) { if (!(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408)) setUncertain(true); setError(!(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408) ? "نتیجه ذخیره مشخص نیست؛ فرم را ببندید و فهرست را بررسی کنید. ارسال دوباره در این فرم متوقف شده است." : onCorrected && cause.status === 409 ? errorText(cause) : cause.status === 409 ? "ذخیره رد شد؛ نسخه فاکتور یا وضعیت دوره مالی تغییر کرده است. فرم را ببندید و دوباره بررسی کنید." : cause.status === 403 ? "اجازه ساخت یا ویرایش فاکتور ندارید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  async function refreshQuickOptions() {
    const value = await loadPurchaseOptions(business.id, new AbortController().signal);
    if (alive.current) setOptions(value);
  }
  function quickProductSelected(product: Product) {
    if (!alive.current || quick?.mode !== "PRODUCT" || !options || !product.isActive) return;
    const rowKey = quick.rowKey;
    setOptions(current => current ? { ...current, products: upsertQuickItem(current.products, product) } : current);
    setRows(current => current.map(row => row.key === rowKey ? { ...row, ...quickProductChange(product, options.warehouses, row) } : row));
    setQuickNotice(`«${product.name}» در ردیف فاکتور انتخاب شد.`); setQuick(null);
  }
  function quickSupplierSelected(supplier: Party) {
    if (!alive.current || !usableQuickSupplier(supplier)) return;
    setOptions(current => current ? { ...current, suppliers: upsertQuickItem(current.suppliers, supplier) } : current);
    setPartyId(supplier.id); setQuickNotice(`«${supplier.name}» به‌عنوان تأمین‌کننده انتخاب شد.`); setQuick(null);
  }
  const money = (amount: bigint) => formatStoreMoney(business, decimalString(amount, business.currencyScale));
  const partyChoices = searchInvoiceOptions(options?.suppliers ?? [], partyQuery, partyId);
  const currency = storeMoneyUnit(business);
  const validRows = previews.every(item => Boolean(item.value));
  const validPeriod = periodForDate(options?.periods ?? [], date);
  const isAllowedDate = (iso: string) => (options?.periods ?? []).some(item => iso >= item.startDate && iso <= item.endDate);
  const totals = previews.reduce((acc, item) => {
    if (item.value) { acc.gross += item.value.gross; acc.discount += item.value.discount; acc.tax += item.value.tax; }
    return acc;
  }, { gross: 0n, discount: 0n, tax: 0n });
  return <><FormDrawer title={onCorrected ? "اصلاح فاکتور خرید" : purchase ? "ویرایش پیش‌نویس خرید" : "فاکتور خرید جدید"} busy={busy || !!quick} onClose={onCancel}>
    <section className="product-form-panel sale-form-panel sale-return-form invoice-draft-form" dir="rtl">
      {assistantSeed&&<p className="notice">پیشنهاد دستیار را بررسی کنید؛ تاریخ پیش‌فرض امروز است. پرداخت، تخفیف، مالیات و تاریخ ذکرشده در پیام خودکار اعمال نمی‌شوند و باید در فرم کنترل شوند.</p>}
      <div className="return-intro"><span className="return-draft-mark">{onCorrected ? "اصلاح فاکتور" : "پیش‌نویس"}</span>
        <p>{onCorrected ? "اطلاعات فاکتور را اصلاح کنید. تغییرات با ثبت قطعی نسخهٔ جایگزین اعمال می‌شوند." : "اطلاعات خرید و اقلام را وارد کنید. تا زمان ثبت قطعی، موجودی انبار و حسابداری تغییر نمی‌کند."}</p></div>
      {loading && <div className="return-info" role="status">در حال دریافت اطلاعات فروشگاه و دوره‌های مالی…</div>}
      {(error||validationError) && <div className="notice error" role="alert">{error||validationError}
        {!options && !loading && <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button>}</div>}
      {quickNotice && <p className="notice" role="status">{quickNotice}</p>}
      <form noValidate onSubmit={submit}><fieldset disabled={busy || loading || uncertain || !!quick || !options} className="product-form-fields return-form-sections">
        <InvoiceStep index={1} id="invoice-party-date" title="مشخصات فاکتور" hint="طرف حساب و تاریخ شمسی فاکتور را مشخص کنید.">
          <div className="invoice-search-field"><label>جست‌وجوی تأمین‌کننده<input type="search" autoComplete="off" value={partyQuery} placeholder="بخشی از نام را بنویسید" onChange={event => setPartyQuery(event.target.value)} /></label>
          <label>تأمین‌کننده<span className="return-required"> *</span>
            <select value={partyId} onChange={event => setPartyId(event.target.value)} required>
              <option value="">انتخاب تأمین‌کننده</option>
              {partyChoices.items.map(item => <option key={item.id} value={item.id}>{item.name}{partyChoices.keptSelected && item.id === partyId ? " — انتخاب فعلی" : ""}</option>)}
            </select></label>
          {partyQuery.trim() && <small role="status">{partyChoices.matchCount ? `${partyChoices.matchCount} نتیجه؛ از فهرست انتخاب کنید.` : "موردی با این نام پیدا نشد."}{partyChoices.keptSelected ? " انتخاب قبلی حفظ شده است." : ""}</small>}</div>
          <button type="button" className="secondary purchase-inline-create" onClick={() => setQuick({ mode: "SUPPLIER" })}>＋ تأمین‌کننده جدید</button>
          <JalaliDateField id="purchase-invoice-date" label="تاریخ فاکتور (شمسی) *" value={date} onChange={setDate}
            disabled={busy || loading || uncertain || !!onCorrected} isDateAllowed={isAllowedDate} />
          <div className={validPeriod ? "return-period-info" : "return-period-info is-warning"}>
            {validPeriod ? `دوره مالی: ${validPeriod.name}` : "برای این تاریخ دوره مالی باز پیدا نشد."}
          </div>
        </InvoiceStep>
        <InvoiceStep index={2} id="invoice-items" title="اقلام فاکتور" hint="کالا، مقدار، قیمت، تخفیف و مالیات را وارد کنید.">
          {rows.map((row, index) => { const item = options?.products.find(item => item.id === row.productId); const productChoices = searchInvoiceOptions(options?.products ?? [], productQueries[row.key] ?? "", row.productId); return <article className="return-item invoice-line-item" key={row.key}>
            <div className="return-item-top"><strong>قلم {formatDecimal(String(index + 1))}</strong>
              <button type="button" className="text-button" disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>حذف قلم</button></div>
            <div className="invoice-search-field"><label>جست‌وجوی کالا<input type="search" autoComplete="off" aria-label={`جست‌وجوی کالا برای قلم ${index + 1}`} value={productQueries[row.key] ?? ""} placeholder="نام، کد یا بارکد را بنویسید" onChange={event => setProductQueries(current => ({...current, [row.key]: event.target.value}))} /></label>
            <label>کالا یا خدمت <span className="return-required">*</span><select value={row.productId} required onChange={event => chooseProduct(row.key, event.target.value)}>
              <option value="">انتخاب کالا یا خدمت</option>
              {productChoices.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.code}{productChoices.keptSelected && item.id === row.productId ? " — انتخاب فعلی" : ""}</option>)}</select></label>
            {(productQueries[row.key] ?? "").trim() && <small role="status">{productChoices.matchCount ? `${productChoices.matchCount} نتیجه؛ از فهرست انتخاب کنید.` : "کالایی با این مشخصات پیدا نشد."}{productChoices.keptSelected ? " انتخاب قبلی این ردیف حفظ شده است." : ""}</small>}</div>
            <button type="button" className="secondary purchase-inline-create" aria-label={`ثبت سریع کالا یا خدمت برای قلم ${index + 1}`} onClick={() => setQuick({ mode: "PRODUCT", rowKey: row.key })}>＋ کالا یا خدمت جدید</button>
            {item?.kind === "GOODS" && <label>انبار<select required value={row.warehouseId ?? ""} onChange={event => patchRow(row.key, { warehouseId: event.target.value })}>
              <option value="">انتخاب انبار</option>{options?.warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            <div className="invoice-line-grid">
              <label>تعداد {item ? `(${item.unit.name})` : ""}<input type="text" dir="ltr" inputMode="decimal" value={row.quantity} onFocus={event => event.currentTarget.select()} required maxLength={25} onChange={event => patchRow(row.key, { quantity: event.target.value })} />{fields[index].quantity&&<small className="line-error" role="status">{fields[index].quantity}</small>}</label>
              <label>قیمت واحد ({currency})<MoneyInput business={business} selectZeroOnFocus placeholder="قیمت را وارد کنید" value={row.unitPrice} required onChange={value => patchRow(row.key, { unitPrice: value })} />{fields[index].unitPrice&&<small className="line-error" role="status">{fields[index].unitPrice}</small>}</label>
              <label>تخفیف ردیف ({currency})<MoneyInput business={business} selectZeroOnFocus placeholder="بدون تخفیف" value={row.discountAmount} onChange={value => patchRow(row.key, { discountAmount: value })} />{fields[index].discountAmount&&<small className="line-error" role="status">{fields[index].discountAmount}</small>}</label>
              <label>مالیات (مثلاً ۰٫۱ برای ۱۰٪)<input type="text" dir="ltr" inputMode="decimal" value={row.taxRate} placeholder="بدون مالیات" onFocus={event=>{if(/^0(?:\.0*)?$/.test(normalizeDigits(event.currentTarget.value)))event.currentTarget.select();}} maxLength={10} onChange={event => patchRow(row.key, { taxRate: event.target.value })} />{fields[index].taxRate&&<small className="line-error" role="status">{fields[index].taxRate}</small>}</label>
            </div>
            {previews[index].value ? <div className="return-item-total"><span>مبلغ این قلم</span><strong><bdi>{formatStoreMoney(business, previews[index].value!.totalText)}</bdi> {currency}</strong></div> : Object.keys(fields[index]).length===0 ? <div className="line-error" role="status">{previews[index].error}</div> : null}
          </article>; })}
          <button type="button" className="secondary invoice-add-line" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, newRow()])}>＋ افزودن قلم جدید</button>
        </InvoiceStep>
        <InvoiceStep index={3} id="invoice-notes" title="توضیحات" hint="توضیحات اختیاری را می‌توانید برای پیگیری‌های بعدی بنویسید.">
          <label>توضیحات فاکتور (اختیاری)<textarea value={notes} maxLength={1000} rows={3} placeholder="مثلاً توضیحات تحویل یا سفارش…" onChange={event => setNotes(event.target.value)} /></label>
        </InvoiceStep>
        <InvoiceStep index={4} id="invoice-review" className="return-review" title="بررسی و ذخیره" hint={onCorrected ? "مبلغ نهایی را پیش از ثبت قطعی بررسی کنید." : "مبلغ نهایی را کنترل کنید و پیش‌نویس را ذخیره کنید."}>
          <dl className="return-totals"><div><dt>جمع اقلام</dt><dd><bdi>{money(totals.gross)}</bdi> {currency}</dd></div>
            <div><dt>تخفیف</dt><dd>− <bdi>{money(totals.discount)}</bdi> {currency}</dd></div>
            <div><dt>مالیات</dt><dd>+ <bdi>{money(totals.tax)}</bdi> {currency}</dd></div>
            <div className="return-grand-total"><dt>مبلغ کل فاکتور</dt><dd><bdi>{money(total)}</bdi> {currency}</dd></div></dl>
          <p className="return-accounting-note">{onCorrected ? "نسخهٔ جایگزین با شمارهٔ مستقل قطعی می‌شود." : "این فرم فقط پیش‌نویس می‌سازد. ثبت قطعی از صفحه جزئیات فاکتور انجام می‌شود."}</p>
          {onCorrected && <details><summary>افزودن دلیل اصلاح (اختیاری)</summary><label>دلیل اصلاح <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} /></label></details>}
        </InvoiceStep>
      </fieldset><div className="form-actions return-form-actions">
        <button type="submit" className="primary" disabled={busy || loading || uncertain || !!quick || !options || !partyId || !validPeriod || !validRows || total <= 0n}>{busy ? "در حال ذخیره…" : onCorrected ? "ثبت قطعی فاکتور جایگزین" : "ذخیره پیش‌نویس"}</button>
        <button className="secondary" type="button" disabled={busy || !!quick} onClick={onCancel}>انصراف</button>
      </div></form>
    </section>
  </FormDrawer>
    {quick && options && <PurchaseQuickCreate key={`${business.id}-${quick.mode}-${quick.mode === "PRODUCT" ? quick.rowKey : "supplier"}`} business={business} mode={quick.mode}
      products={options.products} suppliers={options.suppliers} onProduct={quickProductSelected} onSupplier={quickSupplierSelected}
      onRefresh={refreshQuickOptions} onCancel={() => setQuick(null)} onSessionExpired={onSessionExpired} />}
  </>;
}
