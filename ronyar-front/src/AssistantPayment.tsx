import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import {useEffect,useRef,useState} from 'react';
import {ApiError,errorText,formatDecimal,getAssistantSettings,listSales,listPurchases} from './api';
import type {Business,SaleSummary} from './api';
import {paymentAmountRial,paymentInvoiceCandidates} from './assistantPaymentPlan';
import type {PaymentProposal,AssistantPaymentSeed} from './assistantPaymentPlan';
import {useStoreCan} from './StorePermissions';
import {jalaliText} from './jalaliDate';
import ReceiptForm from './ReceiptForm';import DisbursementForm from './DisbursementForm';
export function paymentPermission(direction:PaymentProposal['direction'],can:(p:string)=>boolean){return ['payments.read','payments.manage','accounts.read','periods.read',direction==='RECEIPT'?'sales.read':'purchases.read'].every(can);}
export async function loadPaymentInvoices(businessId:string,direction:PaymentProposal['direction'],signal:AbortSignal){
 const read=direction==='RECEIPT'?listSales:listPurchases;const rows:SaleSummary[]=[];let expected:number|undefined;
 for(let page=1;page<=50;page++){
  signal.throwIfAborted();const data=await read(businessId,'POSTED',page,signal);
  if(!Array.isArray(data.items)||!Number.isInteger(data.total)||data.total<0||!Number.isInteger(data.totalPages)||data.totalPages>50||data.totalPages<0||data.page!==page||data.items.some(r=>r.status!=='POSTED'||!r.party?.id||!r.party?.name))throw new Error('فهرست کامل و معتبر فاکتورها دریافت نشد؛ از بخش دریافت و پرداخت استفاده کنید.');
  if(expected!==undefined&&expected!==data.total)throw new Error('فهرست فاکتورها هنگام دریافت تغییر کرد؛ دوباره تلاش کنید.');expected=data.total;rows.push(...data.items);
  if(page>=data.totalPages){if(rows.length!==data.total||new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('فهرست فاکتورها ناقص است؛ دوباره تلاش کنید.');return rows;}
 }
 throw new Error('فهرست فاکتورها بزرگ است؛ از بخش دریافت و پرداخت استفاده کنید.');
}
export default function AssistantPayment({business,proposal,onClose,onBusyChange,onSessionExpired}:{business:Business;proposal:PaymentProposal;onClose:()=>void;onBusyChange:(b:boolean)=>void;onSessionExpired:()=>void}){
 const can=useStoreCan(),allowed=paymentPermission(proposal.direction,can);
 const [rows,setRows]=useState<SaleSummary[]>([]),[seed,setSeed]=useState<AssistantPaymentSeed>({amount:'',accountQuery:proposal.accountQuery}),[selected,setSelected]=useState<SaleSummary|null>(null);
 const [query,setQuery]=useState(proposal.partyQuery),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[retry,setRetry]=useState(0),[done,setDone]=useState(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');setRows([]);
  if(!allowed){setError('دسترسی لازم برای آماده‌سازی این دریافت یا پرداخت را ندارید.');setLoading(false);return()=>c.abort();}
  if(business.baseCurrency!=='IRR'){setError('پرداخت گفت‌وگویی فعلاً برای فروشگاه با ارز ریال فعال است.');setLoading(false);return()=>c.abort();}
  (async()=>{
    let amount='';let currency=proposal.currency;
    if(proposal.amountText){if(!currency){currency=(await getAssistantSettings(business.id,c.signal)).currency;if(currency!=='IRR'&&currency!=='TOMAN')throw new Error('واحد پیش‌فرض معتبر نیست.');}
     amount=paymentAmountRial(proposal.amountText,currency);
    }
    const invoices=await loadPaymentInvoices(business.id,proposal.direction,c.signal);if(c.signal.aborted)return;
    setSeed({amount,accountQuery:proposal.accountQuery});setRows(invoices);
    setNote(proposal.amountText?`مبلغ پیشنهادی: ${formatStoreMoney(business, amount)} ${storeMoneyUnit(business)}؛ واحد ${proposal.currency?'صریح پیام':'پیش‌فرض فروشگاه'}: ${currency==='TOMAN'?'تومان':'ریال'}.`:'مبلغ در پیام نبود؛ آن را در فرم وارد کنید.');
  })().catch(e=>{if(!c.signal.aborted){setError(errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
 },[business.id,allowed,retry,proposal]);
 const candidates=paymentInvoiceCandidates(rows,{...proposal,partyQuery:query});
 function childBusy(value:boolean){if(alive.current){setBusy(value);onBusyChange(value);}}
 const title=proposal.direction==='RECEIPT'?'دریافت':'پرداخت';
 return <section className="assistant-trade-report" aria-label={`آماده‌سازی ${title}`}>
 <h3>{title}{proposal.partyQuery?`${proposal.direction==='RECEIPT'?' از ':' به '}${proposal.partyQuery}`:''}</h3>
 {!loading&&!error&&seed.amount&&<p><strong>{formatStoreMoney(business, seed.amount)} {storeMoneyUnit(business)}</strong>{proposal.accountQuery?` · حساب پیشنهادی: ${proposal.accountQuery}`:''}</p>}
 <details><summary>جزئیات بیشتر</summary><p>پیام: {proposal.message}</p>{note&&<p>{note}</p>}<p>وجه به یک فاکتور قطعی تخصیص می‌یابد؛ پرداخت بدون فاکتور و تقسیم بین چند فاکتور در این مسیر فعال نیست. ماندهٔ قابل تسویه بعد از انتخاب بررسی می‌شود. حساب فقط با تطبیق یکتا پیشنهاد می‌شود؛ حساب نهایی را در فرم بررسی کنید.</p><p>بستن این بخش پیش‌نویس ذخیره‌شده را لغو نمی‌کند؛ از بخش دریافت و پرداخت قابل پیگیری است.</p></details>
 {loading&&<p role="status">در حال بررسی…</p>}{error&&<p className="notice error" role="alert">{error}<button type="button" disabled={busy||loading} onClick={()=>setRetry(v=>v+1)}>تلاش دوباره</button></p>}
 {!loading&&!error&&allowed&&!done&&<>{!seed.amount&&<p>مبلغ را در فرم وارد کنید.</p>}{!selected?<>
 {!proposal.partyId&&<label>جست‌وجوی شخص<input aria-label="نام شخص برای انتخاب فاکتور" value={query} onChange={e=>setQuery(e.target.value)} /></label>}
 <p><strong>کدام فاکتور؟</strong> <small>مبالغ، کل فاکتور به {storeMoneyUnit(business)} هستند.</small></p>
 {candidates.length===0&&<p>فاکتور قطعی مرتبط پیدا نشد.{proposal.partyId?'':' نام را اصلاح کنید.'}</p>}{candidates.length>50&&<p>۵۰ نتیجهٔ اول؛ نام را دقیق‌تر بنویسید.</p>}
 <div className="pay-invoice-results">{candidates.slice(0,50).map(row=><button key={row.id} type="button" className="pay-invoice-row assistant-invoice-choice" onClick={()=>setSelected(row)}><span>{row.party.name} · فاکتور {row.number?formatDecimal(row.number):'—'} · {jalaliText(row.documentDate)}</span><strong>{formatStoreMoney(business, row.total)} {storeMoneyUnit(business)}</strong><span className="assistant-invoice-cta">انتخاب فاکتور <span aria-hidden="true">←</span></span></button>)}</div>
 </>:<div>{proposal.direction==='RECEIPT'?<ReceiptForm key={selected.id} business={business} saleId={selected.id} assistantSeed={seed} onBusyChange={childBusy} onChanged={()=>{setDone(true);onBusyChange(false);}} onSessionExpired={onSessionExpired}/>:<DisbursementForm key={selected.id} business={business} purchaseId={selected.id} assistantSeed={seed} onBusyChange={childBusy} onChanged={()=>{setDone(true);onBusyChange(false);}} onSessionExpired={onSessionExpired}/>}</div>}</>}
 {done&&<p role="status" className="notice success">{title} ثبت قطعی شد.</p>}
 <button type="button" className="secondary" disabled={busy} onClick={onClose}>بستن</button></section>;
}
