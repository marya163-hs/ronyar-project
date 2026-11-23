import { correctInvoice } from "./api";
import type { InvoiceCorrectionResult } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { searchInvoiceOptions } from "./invoiceSearch";
import "./InvoiceSearch.css";
import { assistantFormSeed } from "./saleAssistantMatch";
import type { SaleSuggestion } from "./api";
import "./SaleAssistant.css";
import { periodForDate } from "./documentPeriod";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import InvoiceStep from "./InvoiceStep";
import ProductForm from "./ProductForm";
import PurchaseQuickCreate from "./PurchaseQuickCreate";
import MoneyInput from "./MoneyInput";
import { ApiError, getProduct, createSale, updateSale, errorText, formatDecimal, tehranToday } from "./api";
import type { Business, Party, Product, SaleDetails, SaleItemInput } from "./api";
import { loadSaleOptions } from "./saleOptions";
import { invoiceLineValues, invoiceLineErrors, calculateSaleLine, decimalString, normalizeDigits } from "./saleAmounts";
type Props = { onCorrected?: (result: InvoiceCorrectionResult) => void; suggestion?: SaleSuggestion | null; business: Business; sale: SaleDetails | null; onSaved: (sale: SaleDetails) => void; onCancel: () => void; onSessionExpired: () => void };
type Row = SaleItemInput & { key: string };
const newRow = (): Row => ({ key: crypto.randomUUID(), productId: "", quantity: "1", unitPrice: "", discountAmount: "", taxRate: "" });
export default function SaleForm({ business, sale, suggestion, onSaved, onCorrected, onCancel, onSessionExpired }: Props) {
  const customerLocked = Boolean(onCorrected && sale?.correctionCustomerLocked);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(sale?.documentDate ?? tehranToday()), [partyId, setPartyId] = useState(sale?.partyId ?? ""), [notes, setNotes] = useState(sale?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() => sale ? sale.items.map(item => ({ key: crypto.randomUUID(), productId: item.productId, ...(item.warehouseId ? { warehouseId: item.warehouseId } : {}), quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount, taxRate: item.taxRate })) : [newRow()]);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadSaleOptions>> | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0), [uncertain, setUncertain] = useState(false);
  const [partyQuery, setPartyQuery] = useState(""), [productQueries, setProductQueries] = useState<Record<string, string>>({});
  const [quick,setQuick]=useState<{mode:"CUSTOMER"}|{mode:"PRODUCT";rowKey:string;createdId?:string;warehouseId?:string}|null>(null);
  const [quickError,setQuickError]=useState(""),[quickBusy,setQuickBusy]=useState(false);
  const quickReading=useRef(false);
  async function refreshQuickOptions(){const value=await loadSaleOptions(business.id,new AbortController().signal);if(alive.current)setOptions(value);}
  function customerSelected(party:Party){if(!alive.current||!party.isActive||!party.customerEnabled)return;setOptions(current=>current?{...current,customers:[...current.customers.filter(x=>x.id!==party.id),party]}:current);setPartyId(party.id);setPartyQuery("");setQuick(null);}
  async function productCreated(id?:string,warehouseId?:string){
    if(!id||quick?.mode!=="PRODUCT"||quickReading.current)return;
    const rowKey=quick.rowKey;setQuick({mode:"PRODUCT",rowKey,createdId:id,warehouseId});quickReading.current=true;setQuickBusy(true);setQuickError("");
    try{const product:Product=await getProduct(business.id,id);if(!product.isActive)throw new Error("کالای ثبت‌شده فعال نیست.");
      if(alive.current){setOptions(current=>current?{...current,products:[...current.products.filter(x=>x.id!==id),product]}:current);
        setRows(current=>current.map(row=>row.key===rowKey?{...row,productId:id,unitPrice:product.salePrice,warehouseId:product.kind==="GOODS"?warehouseId??options?.warehouses.find(w=>w.isDefault)?.id??options?.warehouses[0]?.id:undefined}:row));setProductQueries(current=>({...current,[rowKey]:""}));setQuick(null);}
    }catch(cause){if(alive.current){setQuickError("کالا ثبت شد؛ دریافت مشخصات کامل نشد. دریافت دوباره فقط فهرست را می‌خواند و کالای تازه نمی‌سازد.");if(cause instanceof ApiError&&cause.status===401)onSessionExpired();}}
    finally{quickReading.current=false;if(alive.current)setQuickBusy(false);}
  }
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(""); loadSaleOptions(business.id, controller.signal).then(value => { if (!controller.signal.aborted) { setOptions(value);  } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, retry]);
  const seeded=useRef(false);
  useEffect(()=>{
    if(!options||!suggestion||sale||seeded.current)return;
    seeded.current=true;
    const seed=assistantFormSeed(suggestion,options.customers,options.products);
    setPartyId(seed.partyId);
    setRows(seed.items.map(item=>{const product=options.products.find(p=>p.id===item.productId);return {...item,key:crypto.randomUUID(),...(product?.kind==="GOODS"?{warehouseId:options.warehouses.find(w=>w.isDefault)?.id??options.warehouses[0]?.id}: {})};}));
  },[options,suggestion,sale]);
  const [validationError,setValidationError]=useState("");
  useEffect(()=>{setValidationError("");},[rows,partyId,date,notes]);
  const fields=rows.map(row=>invoiceLineErrors(row,business.currencyScale));
  const previews = rows.map((row,index) => { const fieldError=Object.values(fields[index])[0];if(fieldError)return {value:null,error:fieldError};try { return { value: calculateSaleLine(invoiceLineValues(row), business.currencyScale), error: "" }; } catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : "مبلغ نامعتبر است." }; } });
  const total = previews.reduce((sum, item) => sum + (item.value?.total ?? 0n), 0n);
  const patchRow = (key: string, change: Partial<SaleItemInput>) => setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  function chooseProduct(key: string, productId: string) { const product = options?.products.find(item => item.id === productId); patchRow(key, { productId, unitPrice: suggestion ? rows.find(row=>row.key===key)?.unitPrice ?? "" : product?.salePrice ?? "", warehouseId: product?.kind === "GOODS" ? options?.warehouses.find(item => item.isDefault)?.id ?? options?.warehouses[0]?.id : undefined }); }
  const periodId = periodForDate(options?.periods ?? [], date)?.id ?? "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current || loading || uncertain || quick || !options) return; setError("");setValidationError("");
    try {
      const period = options.periods.find(item => item.id === periodId); const parsedDate = new Date(`${date}T00:00:00.000Z`);
      if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || !period || date < period.startDate || date > period.endDate) throw new Error("تاریخ باید داخل دوره مالی باز انتخاب‌شده باشد.");
      if (!options.customers.some(item => item.id === partyId)) throw new Error("یک مشتری فعال انتخاب کنید.");
      for (const [index, row] of rows.entries()) { const product = options.products.find(item => item.id === row.productId); if (!product) throw new Error(`ردیف ${index + 1}: کالا یا خدمت فعال انتخاب کنید.`); if (product.kind === "GOODS" && !options.warehouses.some(item => item.id === row.warehouseId)) throw new Error(`ردیف ${index + 1}: انبار فعال انتخاب کنید.`); if (previews[index].error) throw new Error(`ردیف ${index + 1}: ${previews[index].error}`); }
      if (total <= 0n || total >= 1000000000000000000n * 10n ** BigInt(business.currencyScale)) throw new Error("جمع فاکتور باید مثبت و کمتر از محدوده مجاز باشد.");
    } catch (cause) { setValidationError(cause instanceof Error ? cause.message : "اطلاعات فاکتور معتبر نیست."); return; }
    sending.current = true; setBusy(true);
    const body = { partyId, periodId, documentDate: date, notes: notes.trim(), items: rows.map(row => ({ productId: row.productId, ...(options.products.find(item => item.id === row.productId)?.kind === "GOODS" ? { warehouseId: row.warehouseId } : {}), quantity: normalizeDigits(row.quantity), unitPrice: normalizeDigits(row.unitPrice), discountAmount: invoiceLineValues(row).discountAmount, taxRate: invoiceLineValues(row).taxRate })) };
    try {
      if (sale && onCorrected) {
        const result = await correctInvoice(business.id, "sales", sale.id, { ...body, reason: reason.trim() || "اصلاح فاکتور", version: sale.version }, crypto.randomUUID());
        if (alive.current) onCorrected(result);
        return;
      }
      const result = sale ? await updateSale(business.id, sale.id, { ...body, version: sale.version }) : await createSale(business.id, body); if (alive.current) onSaved(result); }
    catch (cause) { if (alive.current) { if (!(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408)) setUncertain(true); setError(!(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408) ? "نتیجه ذخیره مشخص نیست؛ فرم را ببندید و فهرست را بررسی کنید. ارسال دوباره در این فرم متوقف شده است." : onCorrected && cause.status === 409 ? errorText(cause) : cause.status === 409 ? "ذخیره رد شد؛ نسخه فاکتور یا وضعیت دوره مالی تغییر کرده است. فرم را ببندید و دوباره بررسی کنید." : cause.status === 403 ? "اجازه ساخت یا ویرایش فاکتور ندارید." : errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  const money = (amount: bigint) => formatStoreMoney(business, decimalString(amount, business.currencyScale));
  const partyChoices = searchInvoiceOptions(options?.customers ?? [], partyQuery, partyId);
  const currency = storeMoneyUnit(business);
  const validRows = previews.every(item => Boolean(item.value));
  const validPeriod = periodForDate(options?.periods ?? [], date);
  const isAllowedDate = (iso: string) => (options?.periods ?? []).some(item => iso >= item.startDate && iso <= item.endDate);
  const totals = previews.reduce((acc, item) => {
    if (item.value) { acc.gross += item.value.gross; acc.discount += item.value.discount; acc.tax += item.value.tax; }
    return acc;
  }, { gross: 0n, discount: 0n, tax: 0n });
  return <><FormDrawer title={onCorrected ? "اصلاح فاکتور فروش" : sale ? "ویرایش پیش‌نویس فروش" : "فاکتور فروش جدید"} busy={busy || !!quick} onClose={onCancel}>
    <section className="product-form-panel sale-form-panel sale-return-form invoice-draft-form" dir="rtl">
      <div className="return-intro"><span className="return-draft-mark">{onCorrected ? "اصلاح فاکتور" : "پیش‌نویس"}</span>
        <p>{onCorrected ? "اطلاعات فاکتور را اصلاح کنید. تغییرات با ثبت قطعی نسخهٔ جایگزین اعمال می‌شوند." : "اطلاعات فروش و اقلام را وارد کنید. تا زمان ثبت قطعی، موجودی انبار و حسابداری تغییر نمی‌کند."}</p></div>
      {suggestion && <div className="sale-assistant-prefill"><strong>پیشنهاد دستیار؛ نیازمند بررسی شما</strong><p>مشتری در پیام: {suggestion.customer??"نامشخص"}. نام‌های منطبق و یکتا انتخاب شده‌اند؛ موارد مبهم را انتخاب کنید. تاریخ فرم امروز است؛ انبار پیش‌فرض را کنترل کنید. قیمت‌های پیشنهادی با انتخاب کالا تغییر نمی‌کنند.</p><ol>{suggestion.items.map((item,i)=><li key={i}>قلم {formatDecimal(String(i+1))}: {item.product??"نامشخص"}</li>)}</ol></div>}
      {loading && <div className="return-info" role="status">در حال دریافت اطلاعات فروشگاه و دوره‌های مالی…</div>}
      {(error||validationError) && <div className="notice error" role="alert">{error||validationError}
        {!options && !loading && <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button>}</div>}
      <form noValidate onSubmit={submit}><fieldset disabled={busy || loading || uncertain || !!quick || !options} className="product-form-fields return-form-sections">
        <InvoiceStep index={1} id="invoice-party-date" title="مشخصات فاکتور" hint="طرف حساب و تاریخ شمسی فاکتور را مشخص کنید.">
          <div className="invoice-search-field"><label>جست‌وجوی مشتری<input type="search" disabled={customerLocked} autoComplete="off" value={partyQuery} placeholder="بخشی از نام را بنویسید" onChange={event => setPartyQuery(event.target.value)} /></label>
          <label>مشتری<span className="return-required"> *</span>
            <select disabled={customerLocked} value={partyId} onChange={event => setPartyId(event.target.value)} required>
              <option value="">انتخاب مشتری</option>
              {partyChoices.items.map(item => <option key={item.id} value={item.id}>{item.name}{partyChoices.keptSelected && item.id === partyId ? " — انتخاب فعلی" : ""}</option>)}
            </select></label>
          {partyQuery.trim() && <small role="status">{partyChoices.matchCount ? `${partyChoices.matchCount} نتیجه؛ از فهرست انتخاب کنید.` : "موردی با این نام پیدا نشد."}{partyChoices.keptSelected ? " انتخاب قبلی حفظ شده است." : ""}</small>}</div>
          {customerLocked ? <small>دریافت‌های قبلی حفظ می‌شوند و مشتری این فاکتور ثابت است.</small> : <button type="button" className="secondary quick-create-trigger" onClick={()=>setQuick({mode:"CUSTOMER"})}>＋ مشتری جدید</button>}<button type="button" className="text-button" onClick={()=>{void refreshQuickOptions().catch(cause=>{setError(errorText(cause));if(cause instanceof ApiError&&cause.status===401)onSessionExpired();});}}>به‌روزرسانی فهرست مشتریان و کالاها</button>
          <JalaliDateField id="sale-invoice-date" label="تاریخ فاکتور (شمسی) *" value={date} onChange={setDate}
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
            <button type="button" className="secondary quick-create-trigger" onClick={()=>setQuick({mode:"PRODUCT",rowKey:row.key})}>＋ کالا یا خدمت جدید</button>
            {item?.recipe && <p className="notice">مواد این محصول با ثبت قطعی از انبارهای دستور مصرف کم می‌شوند. برگشت فروش، مواد مصرف‌شده را برنمی‌گرداند.</p>}
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
  {quick?.mode==="CUSTOMER"&&options&&<PurchaseQuickCreate key={business.id+"-customer"} business={business} mode="CUSTOMER" products={options.products} suppliers={options.customers} onProduct={()=>{}} onSupplier={customerSelected} onRefresh={refreshQuickOptions} onCancel={()=>setQuick(null)} onSessionExpired={onSessionExpired}/>}
  {quick?.mode==="PRODUCT"&&!quick.createdId&&<ProductForm key={business.id+quick.rowKey} business={business} product={null} requireOpeningForGoods initialOpeningDate={date} onSaved={(id,warehouseId)=>{void productCreated(id,warehouseId);}} onCancel={()=>setQuick(null)} onSessionExpired={onSessionExpired}/>}
  {quick?.mode==="PRODUCT"&&quick.createdId&&<FormDrawer title="دریافت کالای ثبت‌شده" busy={quickBusy} onClose={()=>setQuick(null)}><section className="product-form-panel"><p role="status">{quickBusy?"در حال دریافت…":quickError}</p><button type="button" disabled={quickBusy} onClick={()=>void productCreated(quick.createdId,quick.warehouseId)}>دریافت دوباره مشخصات</button><button type="button" disabled={quickBusy} onClick={()=>setQuick(null)}>بازگشت به فاکتور</button></section></FormDrawer>}
  </>;
}
