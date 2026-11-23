import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { jalaliText } from "./jalaliDate";
import { useEffect, useRef, useState } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import MoneyInput from "./MoneyInput";
import { useStoreCan } from "./StorePermissions";
import { loadSaleOptions } from "./saleOptions";
import { periodForDate } from "./documentPeriod";
import { addQuickProduct,matchingQuickProducts,quickSaleItems } from "./quickSaleCart";
import type { QuickRow } from "./quickSaleCart";
import { ApiError,checkoutQuickSale,errorText,formatDecimal,listBaseAccounts,tehranToday } from "./api";
import type { Business,Product,Account,QuickSaleInput,QuickSaleResult } from "./api";
import { decimalString,normalizeDigits } from "./saleAmounts";
import "./QuickSale.css";
type Options=Awaited<ReturnType<typeof loadSaleOptions>>&{accounts:Account[]};
type Pending={key:string;body:QuickSaleInput};
const slot=(b:string)=>`mahan.quick-sale.pending.v1:${b}`;
function pendingFor(b:string):Pending|null{try{const s=sessionStorage.getItem(slot(b));if(!s)return null;const p=JSON.parse(s);return typeof p.key==="string"&&p.body?p:null;}catch{return null;}}
export default function QuickSale({business,onClose,onView,onSessionExpired}:{business:Business;onClose:()=>void;onView:(id:string)=>void;onSessionExpired:()=>void}){
  const can=useStoreCan(),mayReceive=can("payments.manage")&&can("payments.post")&&can("accounts.read");
  const [options,setOptions]=useState<Options|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [rows,setRows]=useState<QuickRow[]>([]),[query,setQuery]=useState(""),[partyId,setPartyId]=useState(""),[warehouseId,setWarehouseId]=useState(""),[accountId,setAccountId]=useState("");
  const [date,setDate]=useState(tehranToday),[mode,setMode]=useState<"FULL"|"PARTIAL"|"CREDIT">(mayReceive?"FULL":"CREDIT"),[received,setReceived]=useState(""),[busy,setBusy]=useState(false),[last,setLast]=useState<QuickSaleResult|null>(null),[pending,setPending]=useState<Pending|null>(()=>pendingFor(business.id));
  const rowRef=useRef(rows),flight=useRef(false),alive=useRef(true),search=useRef<HTMLInputElement>(null);rowRef.current=rows;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{const c=new AbortController();setLoading(true);setOptions(null);setError("");Promise.all([loadSaleOptions(business.id,c.signal),mayReceive?listBaseAccounts(business.id,c.signal):Promise.resolve([])]).then(([o,a])=>{
    if(c.signal.aborted)return;const accounts=a.filter(x=>x.isActive&&x.isPosting&&x.isCashBank&&x.type==="ASSET"&&x.normalSide==="DEBIT"&&!a.some(child=>child.parentId===x.id));setOptions({...o,accounts});
    const cash=o.customers.filter(p=>p.isCashCustomer);setPartyId(cash.length===1?cash[0].id:"");const warehouses=o.warehouses.filter(w=>w.isDefault);setWarehouseId(warehouses.length===1?warehouses[0].id:o.warehouses.length===1?o.warehouses[0].id:"");const defaultCash=accounts.filter(a=>a.code==="SYS-CASH");setAccountId(defaultCash.length===1?defaultCash[0].id:accounts.length===1?accounts[0].id:"");
  }).catch(e=>{if(!c.signal.aborted){setError(errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[business.id,retry,mayReceive]);
  useEffect(()=>{if(!busy&&!loading&&!pending)search.current?.focus();},[busy,loading,pending]);
  function commit(next:QuickRow[]){rowRef.current=next;setRows(next);}
  function add(product:Product){if(busy||pending)return;try{commit(addQuickProduct(rowRef.current,product));setQuery("");setError("");search.current?.focus();}catch(e){setError(e instanceof Error?e.message:"افزودن کالا ممکن نشد.");}}
  const results=options?matchingQuickProducts(options.products,query):[];
  function scan(){const q=normalizeDigits(query);if(!q||!options)return;const exact=options.products.filter(p=>p.barcode===q||p.code===q);if(exact.length===1)add(exact[0]);else if(exact.length>1)setError("این بارکد یا کد به چند کالا می‌رسد؛ کالا را از نتایج انتخاب کنید.");else if(results.length===1)add(results[0]);else setError(results.length?"کالا را از نتایج انتخاب کنید.":"کالایی پیدا نشد؛ نام یا کد را بررسی کنید.");}
  let calculation:{items:QuickSaleInput['sale']['items'];total:bigint}|null=null,validation="";
  try{if(options)calculation=quickSaleItems(rows,options.products,warehouseId,business.currencyScale);}catch(e){validation=e instanceof Error?e.message:"سبد معتبر نیست.";}
  const total=calculation?decimalString(calculation.total,business.currencyScale):"0",period=options?periodForDate(options.periods,date):null,customer=options?.customers.find(p=>p.id===partyId),locked=busy||Boolean(pending);
  function body():QuickSaleInput{
    if(!options||!calculation||!rows.length||calculation.total<=0n)throw new Error(validation||"سبد فروش را تکمیل کنید.");if(!customer)throw new Error("مشتری را انتخاب کنید.");if(!period)throw new Error("تاریخ باید در دوره مالی باز باشد.");
    const amount=mode==="FULL"?total:mode==="CREDIT"?"0":normalizeDigits(received);
    const probe=quickSaleItems([{productId:rows[0].productId,quantity:"1",unitPrice:amount}],options.products,warehouseId,business.currencyScale).total;
    if(probe>calculation.total)throw new Error("مبلغ دریافت از مبلغ فاکتور بیشتر است.");if(mode==="PARTIAL"&&(probe<=0n||probe>=calculation.total))throw new Error("دریافت جزئی باید بیشتر از صفر و کمتر از مبلغ فاکتور باشد.");
    if(probe<calculation.total&&customer.isCashCustomer)throw new Error("برای فروش نسیه یا تسویه جزئی، مشتری مشخص انتخاب کنید.");if(probe>0n&&(!mayReceive||!options.accounts.some(a=>a.id===accountId)))throw new Error("حساب دریافت و مجوزهای دریافت لازم است.");
    return {sale:{partyId,periodId:period.id,documentDate:date,items:calculation.items},receivedAmount:amount,...(probe>0n?{cashBankAccountId:accountId}:{})};
  }
  async function checkout(){if(flight.current)return;flight.current=true;setError("");setLast(null);let attempt=pending;const recovering=Boolean(attempt);let dispatched=false;
    try{if(!attempt)attempt={key:crypto.randomUUID(),body:body()};try{sessionStorage.setItem(slot(business.id),JSON.stringify(attempt));}catch{throw new Error("ذخیره‌سازی مرورگر در دسترس نیست؛ ثبت ارسال نشد.");}if(alive.current)setPending(attempt);setBusy(true);dispatched=true;
      const result=await checkoutQuickSale(business.id,attempt.body,attempt.key);if(!alive.current)return;
      sessionStorage.removeItem(slot(business.id));setPending(null);setLast(result);commit([]);setQuery("");setReceived("");setMode(mayReceive?"FULL":"CREDIT");search.current?.focus();
    }catch(e){if(!alive.current)return;if(!dispatched){setError(e instanceof Error?e.message:"ثبت ارسال نشد.");return;}if(e instanceof ApiError&&e.status===401)onSessionExpired();
      if(attempt&&(recovering||!(e instanceof ApiError)||![400,403,404,409,422].includes(e.status)||e.code==="QUICK_SALE_IDEMPOTENCY_CONFLICT")){setPending(attempt);setError("نتیجه ثبت مشخص نیست. «بررسی نتیجه ثبت» همان درخواست را پیگیری می‌کند؛ دوباره فروش جدید ثبت نکنید.");}
      else{if(attempt){sessionStorage.removeItem(slot(business.id));setPending(null);}setError(e instanceof ApiError?({QUICK_SALE_NAMED_CUSTOMER_REQUIRED:"برای مانده نسیه مشتری مشخص انتخاب کنید.",QUICK_SALE_INSUFFICIENT_STOCK:"موجودی یکی از کالاها کافی نیست؛ تعداد یا انبار را بررسی کنید. فروش و دریافت ثبت نشدند.",QUICK_SALE_PERIOD_CLOSED:"دوره مالی بسته شده است؛ تاریخ را بررسی کنید.",QUICK_SALE_CASH_ACCOUNT_UNAVAILABLE:"حساب دریافت در دسترس نیست؛ حساب دیگری انتخاب کنید."} as Record<string,string>)[e.code]??errorText(e):e instanceof Error?e.message:"ثبت انجام نشد.");}
    }finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  const money=(v:string)=>`${formatStoreMoney(business, v)} ${storeMoneyUnit(business)}`;
  return <FormDrawer title="فروش سریع" busy={busy} onClose={onClose}><section className="quick-sale" dir="rtl">
    {loading&&<p role="status">در حال دریافت کالاها…</p>}{error&&<p className="notice error" role="alert">{error}{!options&&!loading&&<button type="button" onClick={()=>setRetry(n=>n+1)}>تلاش دوباره</button>}</p>}
    {last&&<div className="notice success" role="status">فروش شماره {formatDecimal(last.number)} با مبلغ {money(last.total)} ثبت شد. دریافت: {money(last.receivedAmount)}؛ مانده: {money(last.remainingAmount)}. <button type="button" className="text-button" onClick={()=>onView(last.saleId)}>مشاهده فاکتور</button></div>}
    {pending&&<p className="notice">یک درخواست در انتظار تعیین نتیجه است؛ اطلاعات آن هنگام پیگیری تغییر نمی‌کند.</p>}
    {options&&<fieldset disabled={locked} className="quick-sale-fields"><div className="quick-sale-settings"><label>مشتری<select value={partyId} onChange={e=>setPartyId(e.target.value)}><option value="">انتخاب مشتری</option>{options.customers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><details className="quick-sale-extra"><summary>انبار و تاریخ: {options.warehouses.find(w=>w.id===warehouseId)?.name??"انتخاب نشده"} · {jalaliText(date)}</summary><label>انبار<select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">انتخاب انبار</option>{options.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><JalaliDateField id="quick-sale-date" label="تاریخ فروش" value={date} onChange={setDate}/></details></div>
      <label>بارکد، کد یا نام کالا<input ref={search} autoFocus value={query} maxLength={100} placeholder="اسکن کنید یا نام کالا را بنویسید؛ سپس Enter" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();scan();}}}/></label>
      {query.trim()&&<div className="quick-sale-results">{results.slice(0,20).map(p=><button type="button" className="secondary" key={p.id} onClick={()=>add(p)}><strong>{p.name}</strong><span>{p.code} · {money(p.salePrice)}</span></button>)}{results.length>20&&<p>۲۰ نتیجه اول؛ جستجو را دقیق‌تر کنید.</p>}{!results.length&&<p>کالایی پیدا نشد.</p>}</div>}
      <div className="quick-sale-cart">{rows.length?rows.map(r=>{const p=options.products.find(p=>p.id===r.productId);return <article className="quick-sale-row" key={r.productId}><strong>{p?.name??"کالا"}</strong><label>تعداد ({p?.unit.name})<input dir="ltr" inputMode="decimal" maxLength={25} value={r.quantity} onChange={e=>commit(rowRef.current.map(x=>x.productId===r.productId?{...x,quantity:e.target.value}:x))}/></label><label>قیمت واحد ({storeMoneyUnit(business)})<MoneyInput business={business} value={r.unitPrice} onChange={unitPrice=>commit(rowRef.current.map(x=>x.productId===r.productId?{...x,unitPrice}:x))}/></label><button type="button" className="text-button" onClick={()=>commit(rowRef.current.filter(x=>x.productId!==r.productId))}>حذف</button></article>;}):<p className="muted">سبد خالی است. اسکن مجدد یک کالا، تعداد همان ردیف را بیشتر می‌کند.</p>}</div>
      {validation&&<p className="notice error">{validation}</p>}
      <div className="quick-sale-settings"><label>تسویه<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="FULL" disabled={!mayReceive}>دریافت کامل</option><option value="PARTIAL" disabled={!mayReceive}>دریافت جزئی</option><option value="CREDIT">نسیه</option></select></label>{mode!=="CREDIT"&&<label>واریز به<select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">انتخاب صندوق یا بانک</option>{options.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{mode==="PARTIAL"&&<label>مبلغ دریافت‌شده<MoneyInput business={business} value={received} onChange={setReceived}/></label>}</div>
      {!mayReceive&&<p className="notice">مجوز دریافت وجه در این حساب کاربری فعال نیست؛ ثبت نسیه فقط برای مشتری مشخص امکان‌پذیر است.</p>}
    </fieldset>}
    <div className="quick-sale-total"><strong>جمع: {money(total)}</strong><button type="button" className="primary" disabled={busy||(!pending&&(loading||!options||!rows.length||Boolean(validation)))} onClick={checkout}>{busy?"در حال ثبت…":pending?"بررسی نتیجه ثبت":mode==="CREDIT"?"ثبت فروش نسیه":"دریافت و ثبت فروش"}</button></div>
    <small>با زدن دکمه، فروش قطعی می‌شود؛ موجودی و حسابداری تغییر می‌کنند. بارکد وزنی و تخفیف/مالیات این مرحله باید در فرم معمول فروش ثبت شوند.</small>
  </section></FormDrawer>;
}
