import MoneyInput from "./MoneyInput";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import PhotoPurchase from './PhotoPurchase';
import { assistantIntent } from "./assistantIntent";
import AssistantCurrencySetting from "./AssistantCurrencySetting";
import { resolveAssistantPrice, resolveTotalPrice } from "./assistantPrice";
import { getAssistantPriceContext } from "./api";
import AssistantProductChoice from "./AssistantProductChoice";
import { useEffect, useRef, useState } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import { ApiError, errorText, previewPurchaseMessage, createAssistantPurchaseDraft, formatDecimal } from "./api";
import type { Business, PurchaseSuggestion } from "./api";
import { loadPurchaseOptions } from "./purchaseOptions";
import { purchaseAssistantDraftBody, resolvePurchaseAssistantDraft, readPendingPurchaseAssistantDraft, storePendingPurchaseAssistantDraft, clearPendingPurchaseAssistantDraft } from "./purchaseAssistantDraft";
import type { PurchaseAssistantDraft, PurchaseAssistantOptions, PendingPurchaseAssistantDraft } from "./purchaseAssistantDraft";
import { calculateSaleLine, decimalString } from "./saleAmounts";
import { periodForDate } from "./documentPeriod";
import "./SaleAssistant.css";
type Props={business:Business;initialText?:string;onRedirect?:(kind:"sale"|"purchase"|"report",text:string)=>boolean|void;onClose:()=>void;onUse:(suggestion:PurchaseSuggestion)=>void;onCreated:(id:string)=>void;onSessionExpired:()=>void};
const extra:Record<string,string>={payment:"پرداخت یا تسویه",date:"تاریخ مشخص",discount:"تخفیف",tax:"مالیات",return:"برگشت",sale:"فروش",other:"درخواست دیگری غیر از خرید"};
const errors:Record<string,string>={AI_NOT_CONFIGURED:"دستیار فعال نشده است؛ از خرید دستی استفاده کنید.",AI_CURRENCY_UNSUPPORTED:"دستیار فعلاً فقط خرید ریالی را پشتیبانی می‌کند.",AI_CREDIT_REQUIRED:"اعتبار سرویس کافی نیست.",AI_PROVIDER_ERROR:"سرویس پاسخ نداد؛ دوباره تلاش کنید.",AI_INVALID_OUTPUT:"پاسخ معتبر نبود؛ پیام را روشن‌تر بنویسید."};
function TextPurchaseAssistant({onPhoto,business,onClose,onUse,onCreated,onSessionExpired,initialText="",onRedirect}:Props & {onPhoto:()=>void}){
  const [text,setText]=useState(initialText),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const [proposal,setProposal]=useState<PurchaseSuggestion|null>(null),[options,setOptions]=useState<PurchaseAssistantOptions|null>(null),[draft,setDraft]=useState<PurchaseAssistantDraft|null>(null);
  const [settingsReady,setSettingsReady]=useState(false);
  const [amountQuestions,setAmountQuestions]=useState<boolean[]>([]);
  const [pending,setPending]=useState<PendingPurchaseAssistantDraft|null>(()=>readPendingPurchaseAssistantDraft(business.id));
  const autoStarted=useRef(Boolean(pending));
  const active=useRef(true),flight=useRef(false),controller=useRef<AbortController|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();};},[]);
  useEffect(()=>{if(initialText&&text===initialText&&settingsReady&&!pending&&!autoStarted.current){autoStarted.current=true;void send();}},[initialText,text,settingsReady,pending]);
  function report(e:unknown){if(!active.current)return;setError(e instanceof ApiError?errors[e.code]??errorText(e):errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}
  async function save(p:PendingPurchaseAssistantDraft,recovering=false){
    setSaving(true);setPending(p);let dispatched=false;
    try{
      storePendingPurchaseAssistantDraft(business.id,p);
      dispatched=true;const sale=await createAssistantPurchaseDraft(business.id,p.body,p.key);
      if(!active.current)return;
      clearPendingPurchaseAssistantDraft(business.id);setPending(null);onCreated(sale.id);
    }catch(e){report(e);if((!dispatched&&!recovering)||(!recovering&&e instanceof ApiError && [400,403,404,409,422].includes(e.status))){try{clearPendingPurchaseAssistantDraft(business.id);}catch{}if(active.current)setPending(null);return;}if(active.current)setError("پیش‌نویس ممکن است ذخیره شده باشد. «بررسی نتیجه ذخیره» همان درخواست را تکرار می‌کند و پیش‌نویس دیگری نمی‌سازد. اگر دسترسی یا دوره تغییر کرده، فهرست خرید را بررسی کنید.");}
    finally{if(active.current)setSaving(false);}
  }
  async function withPrices(d:PurchaseAssistantDraft,suggestion:PurchaseSuggestion,signal:AbortSignal):Promise<PurchaseAssistantDraft>{
    const productIds=[...new Set(d.items.filter((r,i)=>r.productId&&suggestion.items[i].priceBasis==="AMBIGUOUS").map(r=>r.productId))];
    let references:Awaited<ReturnType<typeof getAssistantPriceContext>>["items"]=[];
    if(productIds.length){try{references=(await getAssistantPriceContext(business.id,"purchase",productIds,d.partyId,signal)).items;}catch(e){if(signal.aborted)throw e;if(e instanceof ApiError&&e.status===401){onSessionExpired();throw e;}}}
    return {...d,items:d.items.map((r,i)=>{const price=resolveAssistantPrice({...suggestion.items[i],quantity:r.quantity},references.find(x=>x.productId===r.productId),business.currencyScale);return {...r,unitPrice:price.unitPrice,discountAmount:price.discountAmount??"0",needsPriceChoice:price.needsChoice,priceNote:price.note};})};
  }
  async function chooseProduct(i:number,productId:string){
    if(!draft||!options||!proposal||flight.current)return;
    const product=options.products.find(p=>p.id===productId),w=options.warehouses.filter(w=>w.isDefault);
    const next={...draft,items:draft.items.map((r,j)=>j===i?{...r,productId,warehouseId:product?.kind==="GOODS"?(w.length===1?w[0].id:options.warehouses.length===1?options.warehouses[0].id:""):""}:r)};
    // Resolve only the changed row; preserve previous user choices on all other rows.
    flight.current=true;setBusy(true);setDraft(next);const c=new AbortController();controller.current=c;
    try{const resolved=await withPrices(next,proposal,c.signal);if(!c.signal.aborted)setDraft({...next,items:next.items.map((r,j)=>j===i?resolved.items[j]:r)});}
    catch(e){if(!c.signal.aborted)report(e);}finally{flight.current=false;if(active.current)setBusy(false);}
  }
  async function send(){
    if(flight.current||pending||!settingsReady||text.trim().length<3)return;flight.current=true;setBusy(true);setError("");setProposal(null);setDraft(null);setOptions(null);
    const detected=assistantIntent(text);
    if(detected==="sale"||detected==="report"||detected==="mixed"){setProposal(null);setError(detected==="mixed"?"خرید و فروش را در پیام‌های جدا بنویسید.":detected==="report"?"این درخواست گزارش است؛ از مرکز گزارش‌ها استفاده کنید.":"این پیام مربوط به فروش است، نه خرید.");flight.current=false;setBusy(false);return;}
    const c=new AbortController();controller.current=c;
    try{
      const d=await previewPurchaseMessage(business.id,text.trim(),c.signal);if(c.signal.aborted)return;setProposal(d);
      if(d.unsupported.length)return;
      const o=await loadPurchaseOptions(business.id,c.signal);if(c.signal.aborted)return;const resolved=await withPrices(resolvePurchaseAssistantDraft(d,o,business.currencyScale),d,c.signal);if(c.signal.aborted)return;setOptions(o);setDraft(resolved);setAmountQuestions(resolved.items.map(r=>{try{return calculateSaleLine({...r,discountAmount:r.discountAmount??"0",taxRate:"0"},business.currencyScale).total<=0n;}catch{return true;}}));
      const body=purchaseAssistantDraftBody(resolved,o,business.currencyScale);if(body)await save({key:crypto.randomUUID(),body});
    }catch(e){if(!c.signal.aborted)report(e);}
    finally{flight.current=false;if(active.current)setBusy(false);}
  }
  async function complete(){if(flight.current||!draft||!options||pending)return;const body=purchaseAssistantDraftBody(draft,options,business.currencyScale);if(!body)return;flight.current=true;setError("");try{await save({key:crypto.randomUUID(),body});}finally{flight.current=false;}}
  function patch(i:number,change:Partial<PurchaseAssistantDraft['items'][number]>){setDraft(d=>d?{...d,items:d.items.map((r,j)=>j===i?{...r,...(("quantity" in change||"unitPrice" in change)&&!("discountAmount" in change)?{discountAmount:"0",priceNote:"قیمت یا تعداد توسط شما اصلاح شد"}:{}),...change}:r)}:d);}
  function manual(){if(!proposal)return;onUse(draft&&options?{...proposal,currency:"IRR",sourceCurrency:"IRR",supplier:options.suppliers.find(p=>p.id===draft.partyId)?.name??proposal.supplier,items:draft.items.map((r,i)=>({product:options.products.find(p=>p.id===r.productId)?.name??proposal.items[i].product,quantity:r.quantity||null,unitPrice:r.unitPrice||null,discountAmount:r.discountAmount??"0"}))}:proposal);}
  const ready=draft&&options?purchaseAssistantDraftBody(draft,options,business.currencyScale):null;
  const locked=busy||saving||Boolean(pending);
  return <FormDrawer title="دستیار فروشگاه · خرید" busy={saving} onClose={onClose}><section className="sale-assistant" dir="rtl">
    <button type="button" className="secondary" disabled={locked} onClick={onPhoto}>خرید از عکس فاکتور</button><p>پیش‌نویس خرید را با پیام آماده کنید؛ ثبت قطعی با شماست.</p>
    <AssistantCurrencySetting businessId={business.id} disabled={locked} onReady={setSettingsReady} onSessionExpired={onSessionExpired}/>
    <label>پیام خرید<textarea rows={3} maxLength={4000} value={text} disabled={locked} placeholder="از تأمین‌کننده احمدی دو عدد کالا تست دانه‌ای ۱۵۰ هزار تومان خریدم" onChange={e=>{autoStarted.current=true;setText(e.target.value);setProposal(null);setDraft(null);setOptions(null);setError("");}} /></label>
    <button type="button" className="primary" disabled={locked||!settingsReady||text.trim().length<3} onClick={send}>{saving?"در حال ساخت پیش‌نویس…":busy?"در حال بررسی…":"ارسال"}</button>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {onRedirect&&!locked&&["sale","report"].includes(assistantIntent(text))&&<button type="button" className="secondary" onClick={()=>{if(onRedirect(assistantIntent(text) as "sale"|"purchase"|"report",text)===false)setError("دسترسی بخش مقصد را ندارید.");}}>{assistantIntent(text)==="report"?"ادامه در گزارش‌ها":"ادامه در دستیار فروش"}</button>}
    {pending&&!saving&&<><p className="notice">یک درخواست ذخیره ناتمام دارید؛ ابتدا نتیجه همان درخواست را بررسی کنید.</p><button type="button" className="primary" onClick={async()=>{if(flight.current)return;flight.current=true;setError("");try{await save(pending,true);}finally{flight.current=false;}}}>بررسی نتیجه ذخیره</button></>}
    {proposal&&!pending&&<>
      {draft?.messageNote&&<details><summary>جزئیات پیشنهاد</summary><small>{draft.messageNote}</small></details>}
      {proposal.unsupported.length>0?<p className="notice error">این پیام شامل {proposal.unsupported.map(x=>extra[x]??"عملیات دیگر").join("، ")} است. فعلاً پیام را فقط برای خرید ساده بنویسید.</p>:draft&&options&&<section className="sale-assistant-proposal"><h3>فقط این موارد را تکمیل کنید</h3>
        {!draft.partyId&&<label>کدام تأمین‌کننده؟ ({proposal.supplier??"نام مشخص نشده"})<select disabled={locked} value={draft.partyId} onChange={e=>setDraft({...draft,partyId:e.target.value})}><option value="">انتخاب تأمین‌کننده</option>{options.suppliers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {!periodForDate(options.periods,draft.date)&&<><p className="notice error">برای تاریخ انتخابی دوره باز ندارید؛ یک تاریخ در دوره باز انتخاب کنید.</p><JalaliDateField id="assistant-date" label="تاریخ خرید" value={draft.date} onChange={date=>setDraft({...draft,date})}/></>}
        <ol>{draft.items.map((r,i)=>{const product=options.products.find(p=>p.id===r.productId);const totalPrice=proposal.items[i].amountRial?resolveTotalPrice(proposal.items[i].amountRial!,r.quantity,business.currencyScale):null;let invalid=false;try{invalid=calculateSaleLine({...r,discountAmount:r.discountAmount??"0",taxRate:"0"},business.currencyScale).total<=0n;}catch{invalid=true;}
          return <li key={i}><strong>{product?.name??proposal.items[i].product??"قلم خرید"}</strong>
            {!r.productId&&<AssistantProductChoice key={`${i}:${proposal.items[i].product??""}`} products={options.products} name={proposal.items[i].product} disabled={locked} onChange={productId=>chooseProduct(i,productId)}/>}
            {product?.kind==="GOODS"&&!r.warehouseId&&<label>به کدام انبار؟<select disabled={locked} value={r.warehouseId} onChange={e=>patch(i,{warehouseId:e.target.value})}><option value="">انتخاب انبار</option>{options.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
            {r.discountAmount&&Number(r.discountAmount)>0&&<p>تخفیف تعدیل: <strong>{formatStoreMoney(business, r.discountAmount)} {storeMoneyUnit(business)}</strong> · جمع ردیف حفظ شده است.</p>}{r.priceNote&&<details><summary>مبنای قیمت</summary><small>{r.priceNote}</small></details>}
            {r.needsPriceChoice&&proposal.items[i].amountRial&&<div className="notice"><p>{formatStoreMoney(business, proposal.items[i].amountRial!)} {storeMoneyUnit(business)} برای هر واحد است یا جمع {formatDecimal(r.quantity)} واحد؟</p>
              <label>تعداد<input disabled={locked} value={r.quantity} dir="ltr" onChange={e=>patch(i,{quantity:e.target.value})}/></label>
              <label>یا قیمت هر واحد را به {storeMoneyUnit(business)} وارد کنید<MoneyInput business={business} disabled={locked} value={r.unitPrice} onChange={e=>patch(i,{unitPrice:e,needsPriceChoice:false,priceNote:"قیمت واحد اصلاح‌شده توسط کاربر"})}/></label>
              <button type="button" className="secondary" disabled={locked} onClick={()=>patch(i,{unitPrice:proposal.items[i].amountRial!,needsPriceChoice:false,priceNote:"قیمت هر واحد با انتخاب کاربر"})}>برای هر واحد</button>
              <button type="button" className="secondary" disabled={locked||!totalPrice} onClick={()=>{if(totalPrice)patch(i,{unitPrice:totalPrice.unitPrice,discountAmount:totalPrice.discountAmount??"0",needsPriceChoice:false,priceNote:totalPrice.note});}}>جمع ردیف</button>
              {totalPrice&&Number(totalPrice.discountAmount??"0")>0&&<small>در حالت جمع ردیف، قیمت گرد و اختلاف با تخفیف تعدیل می‌شود.</small>}
            </div>}
            {!r.needsPriceChoice&&((invalid||amountQuestions[i])?<><label>تعداد {product?.unit.name}<input disabled={locked} value={r.quantity} dir="ltr" onChange={e=>patch(i,{quantity:e.target.value})}/></label><label>قیمت واحد ({storeMoneyUnit(business)})<MoneyInput business={business} disabled={locked} value={r.unitPrice} onChange={value=>patch(i,{unitPrice:value})}/></label></>:<span>{formatDecimal(r.quantity)} {product?.unit.name??"واحد"} × {formatStoreMoney(business, r.unitPrice)} {storeMoneyUnit(business)}</span>)}
          </li>;})}</ol>
        {ready&&<><p>مبلغ کل: <strong>{formatStoreMoney(business, decimalString(ready.items.reduce((s,r)=>s+calculateSaleLine(r,business.currencyScale).total,0n),business.currencyScale))} {storeMoneyUnit(business)}</strong></p><button type="button" className="primary" disabled={busy||saving} onClick={complete}>ادامه و ساخت پیش‌نویس</button></>}
      </section>}
      <button type="button" className="text-button" disabled={busy||saving} onClick={manual}>ویرایش در فرم خرید</button>
    </>}
    <details><summary>دربارهٔ دستیار</summary><small>متن پیام برای سرویس هوش مصنوعی ارسال می‌شود. این مرحله پرداخت وجه و تخفیف را پشتیبانی نمی‌کند.</small></details>
  </section></FormDrawer>;
}

export default function PurchaseAssistant(props:Props){const [photo,setPhoto]=useState(props.initialText==='__PHOTO_PURCHASE__');return photo?<PhotoPurchase business={props.business} onClose={props.onClose} onCreated={props.onCreated} onSessionExpired={props.onSessionExpired}/>:<TextPurchaseAssistant {...props} onPhoto={()=>setPhoto(true)}/>;}
