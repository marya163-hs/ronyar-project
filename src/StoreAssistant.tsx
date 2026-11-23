import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import DetailedLedger from "./DetailedLedger";
import FormDrawer from "./FormDrawer";
import {planPartyFollowup} from "./assistantPartyFollowup";
import type {PartyConversation} from "./assistantPartyFollowup";
import AssistantPartyReport from "./AssistantPartyReport";
import type {PartyAnswer} from "./AssistantPartyReport";
import {fetchPartyReport,resolveReportParties} from "./partyReportData";
import {classifyPartyReport} from "./api";
import AssistantCashReport from "./AssistantCashReport";
import type {CashAnswer} from "./AssistantCashReport";
import {planCashReport,fetchCashReport} from "./cashReportPlan";
import type {CashPlan} from "./cashReportPlan";
import AssistantPayment, { paymentPermission } from "./AssistantPayment";
import { paymentMessage, contextualPaymentMessage } from "./assistantPaymentPlan";
import type { PaymentProposal } from "./assistantPaymentPlan";
import AssistantTradeReport, { fetchTradeSnapshot } from "./AssistantTradeReport";
import type { TradeAnswer } from "./AssistantTradeReport";
import { planTrade } from "./assistantTradePlan";
import type { TradePlan } from "./assistantTradePlan";
import { inventoryQuestionProduct, inventoryChoices, inventoryQuantities, completeStockSnapshot } from "./assistantLocalReports";
import type { AssistantStockChoice, AssistantStockSnapshot } from "./assistantLocalReports";
import VoiceMessageInput from "./VoiceMessageInput";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorText, formatDecimal, readBusinessReport, readDetailedLedger, tehranToday } from "./api";
import type { Business, PartyBalancePage, PartyBalanceRow } from "./api";
import type { SalesDailyReport } from "./reportContracts";
import { useStoreCan } from "./StorePermissions";
import { reportAllowed, reportCatalog } from "./reportCatalog";
import type { ReportId } from "./reportCatalog";
import { assistantIntent } from "./assistantIntent";
import { assistantPartyQuery, assistantReport, isTodaySalesQuestion } from "./assistantRouting";
import { assistantName } from "./saleAssistantMatch";
import { jalaliText } from "./jalaliDate";
import "./StoreAssistant.css";
type Props={business:Business;onDocument:(kind:"sale"|"purchase",text:string)=>boolean|void;onCreate:(kind:"sale"|"purchase"|"RECEIPT"|"DISBURSEMENT")=>void;onReport:(id:ReportId)=>void;onSessionExpired:()=>void};
export default function StoreAssistant({business,onDocument,onCreate,onReport,onSessionExpired}:Props){
  const [partyContext,setPartyContext]=useState<PartyConversation|null>(null);
  const [partyLedger,setPartyLedger]=useState<PartyConversation|null>(null);
  function showPartyAnswer(result:PartyAnswer){
    setPartyAnswer(result);
    const p=result.selectedParty?.party;
    setPartyContext(p?{businessId:business.id,partyId:p.id,partyName:p.name}:null);
  }
  function freshConversation(){controller.current?.abort();setPartyContext(null);setPartyLedger(null);pendingParty.current=null;tradeContext.current=null;updateMessage("");}
  const pendingParty=useRef<PartyAnswer|null>(null);
  const [partyAnswer,setPartyAnswer]=useState<PartyAnswer|null>(null);
  const [cashAnswer,setCashAnswer]=useState<CashAnswer|null>(null);
  const [paymentProposal,setPaymentProposal]=useState<PaymentProposal|null>(null);
  const [paymentBusy,setPaymentBusy]=useState(false);
  const messageInput=useRef<HTMLTextAreaElement|null>(null);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const voiceActive=useRef(false);
  const can=useStoreCan();const [text,setText]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[choice,setChoice]=useState(false),[answer,setAnswer]=useState(""),[report,setReport]=useState<ReportId|null>(null),[parties,setParties]=useState<PartyBalanceRow[]>([]);
  const [stockChoices,setStockChoices]=useState<AssistantStockChoice[]>([]);
  const [tradeAnswer,setTradeAnswer]=useState<TradeAnswer|null>(null);
  const tradeContext=useRef<TradePlan|null>(null);
  const stockReceivedAt=useRef("");
  const stockSnapshot=useRef<AssistantStockSnapshot|null>(null);
  function clearStock(){setStockChoices([]);stockSnapshot.current=null;stockReceivedAt.current="";}
  function showStock(productId:string){
    if(!can("inventory.read")){clearStock();setError("دسترسی گزارش موجودی را ندارید.");return;}
    if(!stockSnapshot.current)return;
    const data=inventoryQuantities(stockSnapshot.current.items,productId);
    setAnswer(`موجودی فعلی ${data.name}: ${formatDecimal(data.quantity)} ${data.unit} — جمع همه انبارها.\n${data.warehouses.map(w=>`${w.name}${w.active?"":" (غیرفعال)"}: ${formatDecimal(w.quantity)} ${data.unit}`).join("\n")}\nبر پایهٔ مانده‌های ثبت‌شدهٔ انبار؛ پیش‌نویس‌ها لحاظ نمی‌شوند. زمان دریافت: ${stockReceivedAt.current}.`);
    setStockChoices([]);
  }
  const controller=useRef<AbortController|null>(null),flight=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  function fail(e:unknown){if(alive.current){setError(e instanceof ApiError&&e.code==="REPORT_EXPORT_LIMIT"?"تعداد ردیف‌های موجودی زیاد است؛ گزارش موجودی را باز کنید و فیلتر بگذارید.":errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}}
  function route(kind:"sale"|"purchase"){if(voiceActive.current)return;if(!can(kind==="sale"?"sales.manage":"purchases.manage")||!can(kind==="sale"?"sales.read":"purchases.read")){setError("دسترسی ثبت این نوع فاکتور را ندارید.");return;}flight.current=true;if(onDocument(kind,text.trim())===false){flight.current=false;setError("دسترسی بخش مقصد را ندارید.");}}
  async function partyBalance(partyId:string,signal:AbortSignal){
    const data=await readDetailedLedger(business.id,"party",partyId,new URLSearchParams({page:"1",limit:"1"}),signal);
    if(signal.aborted)return;if(data.party?.id!==partyId||data.currency!==business.baseCurrency)throw new Error("صورت‌حساب شخص معتبر نیست.");setPartyContext({businessId:business.id,partyId,partyName:data.party.name});const value=data.closingBalance,zero=/^-?0(?:\.0+)?$/.test(value);
    setAnswer(`${data.party?.name??"طرف‌حساب"}: ${formatStoreMoney(business, value.startsWith("-")?value.slice(1):value)} ${storeMoneyUnit(business)}${zero?"؛ مانده صفر است.":value.startsWith("-")?" بستانکار":" بدهکار"} — مانده همه ثبت‌های قطعی، در تمام دوره‌ها.`);setParties([]);
  }
  async function selectParty(id:string){if(voiceActive.current||flight.current)return;flight.current=true;setBusy(true);setError("");const c=new AbortController();controller.current=c;try{if(!id)return;if(!can("journals.read"))throw new Error("دسترسی گزارش ماندهٔ اشخاص را ندارید.");if(pendingParty.current){const pending=pendingParty.current;const selected=pending.snapshot.rows.find(r=>r.party.id===id);if(!selected)throw new Error("شخص انتخاب‌شده معتبر نیست.");showPartyAnswer({...pending,selectedParty:selected});setParties([]);setAnswer("");pendingParty.current=null;}else await partyBalance(id,c.signal);}catch(e){if(!c.signal.aborted)fail(e);}finally{flight.current=false;if(alive.current)setBusy(false);}}
  async function reportRequest(){
    if(voiceActive.current)return;
    clearStock();const id=assistantReport(text);setReport(id);
    if(!reportAllowed(id,can)){setError("دسترسی گزارش موردنظر را ندارید.");return;}
    flight.current=true;setBusy(true);const c=new AbortController();controller.current=c;
    try{
      if(id==="sales"&&isTodaySalesQuestion(text)){
        const today=tehranToday(),query=new URLSearchParams({page:"1",limit:"1",fromDate:today,toDate:today});
        const data=await readBusinessReport<SalesDailyReport>(business.id,"reports/sales",query,c.signal);if(c.signal.aborted)return;
        setAnswer(`فروش امروز ${jalaliText(today)}: ${formatStoreMoney(business, data.totalSales)} ${storeMoneyUnit(business)}؛ برگشت: ${formatStoreMoney(business, data.totalReturns)}؛ خالص فروش: ${formatStoreMoney(business, data.netSales)}. فقط اسناد قطعی در تاریخ امروز.`);
      }else if(id==="inventory"&&inventoryQuestionProduct(text)!==null){
        const data=await readBusinessReport<AssistantStockSnapshot>(business.id,"reports/inventory-value/export",new URLSearchParams(),c.signal);
        if(c.signal.aborted||!alive.current)return;
        if(!completeStockSnapshot(data)){setAnswer("گزارش کامل دریافت نشد؛ برای بررسی موجودی، گزارش مرتبط را باز کنید.");return;}
        stockSnapshot.current=data;stockReceivedAt.current=new Date().toLocaleTimeString("fa-IR",{timeZone:"Asia/Tehran"});
        const matches=inventoryChoices(data.items,inventoryQuestionProduct(text)!);
        if(matches.length===1)showStock(matches[0].id);
        else if(matches.length>1){setStockChoices(matches);setAnswer("چند کالا با این نام پیدا شد؛ کدام کالا را می‌گویید؟");}
        else setAnswer("برای این نام، ماندهٔ انبار ثبت‌شده‌ای پیدا نشد؛ ممکن است نام متفاوت باشد یا کالا هنوز گردش نداشته باشد. این نتیجه به معنی موجودی صفر نیست.");
      }else if(id==="parties"&&!/(دیروز|امروز|هفته|ماه|سال|دوره|تاریخ|[0-9۰-۹]{4})/.test(text)){
        const found:PartyBalanceRow[]=[];let page=1;
        while(true){const result=await readBusinessReport<PartyBalancePage>(business.id,"accounting/party-balances",new URLSearchParams({page:String(page),limit:"20",status:"ALL"}),c.signal);if(c.signal.aborted)return;if(result.totalPages>25){setAnswer("برای انتخاب شخص در این فروشگاه، گزارش مانده اشخاص را باز کنید.");return;}found.push(...result.items);if(page>=result.totalPages)break;if(page>=25){setAnswer("برای انتخاب شخص در این فروشگاه، گزارش مانده اشخاص را باز کنید.");return;}page++;}
        const q=assistantName(assistantPartyQuery(text));
        const selection=resolveReportParties(found,q);
        if(selection.automatic)await partyBalance(selection.automatic.party.id,c.signal);
        else{setParties(selection.matches);setAnswer(selection.approximate?"تطبیق مستقیمی پیدا نشد؛ این نام‌ها نزدیک‌اند. شخص موردنظر را انتخاب کنید.":selection.matches.length?"چند شخص مرتبط پیدا شد؛ کدام شخص را می‌گویید؟":"نام شخص پیدا نشد؛ نام کامل را بنویسید یا گزارش اشخاص را باز کنید.");}
      }else setAnswer("گزارش مرتبط آماده است؛ برای تعیین بازه و جزئیات آن را باز کنید.");
    }catch(e){if(!c.signal.aborted)fail(e);}finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  async function runTrade(plan:TradePlan){
    const id=plan.kind;setReport(id);
    if(!can(id==="sales"?"sales.read":"purchases.read")){setError("دسترسی گزارش موردنظر را ندارید.");return;}
    flight.current=true;setBusy(true);const c=new AbortController();controller.current=c;
    try{
      const current=await fetchTradeSnapshot(business.id,plan.kind,plan.range,c.signal);
      const previous=plan.compare?await fetchTradeSnapshot(business.id,plan.kind,plan.compare,c.signal):undefined;
      if(c.signal.aborted||!alive.current)return;
      if(previous&&previous.currency!==current.currency)throw new Error("ارز دو گزارش متفاوت است؛ امکان مقایسه وجود ندارد.");
      tradeContext.current=plan;
      setTradeAnswer({plan,current,previous,receivedAt:new Date().toLocaleString("fa-IR",{timeZone:"Asia/Tehran"})});
    }catch(e){if(!c.signal.aborted)fail(e);}finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  async function runCash(plan:CashPlan){
    if(!can("payments.read")){setError("دسترسی گزارش دریافت و پرداخت را ندارید.");return;}
    flight.current=true;setBusy(true);const c=new AbortController();controller.current=c;
    try{const snapshot=await fetchCashReport(business.id,plan,business.baseCurrency,c.signal);if(!c.signal.aborted&&alive.current)setCashAnswer({plan,snapshot,currency:business.baseCurrency,receivedAt:new Date().toLocaleString("fa-IR",{timeZone:"Asia/Tehran"})});}
    catch(e){if(!c.signal.aborted)fail(e);}finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  async function runPartyQuestion(){
    if(!can("journals.read")){setError("دسترسی گزارش ماندهٔ اشخاص را ندارید.");return;}
    flight.current=true;setBusy(true);const c=new AbortController();controller.current=c;
    try{
      const decision=await classifyPartyReport(business.id,text.trim(),c.signal);
      if(c.signal.aborted||!alive.current)return;
      if(decision.intent==="CLARIFY"){setAnswer("منظورتان طلب شما از دیگران است یا بدهی شما به دیگران؟ برای شخص مشخص مثلاً بنویسید: از سینا چقدر طلب دارم؟ فیلتر تاریخ و مبلغ هنوز پشتیبانی نمی‌شود.");setReport("parties");return;}
      if(decision.intent==="OTHER"){setAnswer("این پیام را به گزارش طلب و بدهی تبدیل نکردم. برای این گزارش مثلاً بنویسید: از کی طلب دارم؟ یا به کی بدهکارم؟");return;}
      if(!["RECEIVABLES","PAYABLES","BOTH"].includes(decision.intent))throw new Error("پاسخ تشخیص درخواست معتبر نیست.");
      const snapshot=await fetchPartyReport(business.id,business.baseCurrency,c.signal);
      if(!c.signal.aborted&&alive.current){
        const result:PartyAnswer={side:decision.intent as PartyAnswer["side"],snapshot,receivedAt:new Date().toLocaleString("fa-IR",{timeZone:"Asia/Tehran"})};setReport("parties");
        if(decision.partyQuery!==undefined){
          if(typeof decision.partyQuery!=="string"||!decision.partyQuery.trim())throw new Error("نام تشخیص‌داده‌شده معتبر نیست.");
          const selection=resolveReportParties(snapshot.rows,decision.partyQuery);
          if(selection.automatic){showPartyAnswer({...result,selectedParty:selection.automatic});}
          else {pendingParty.current=result;setParties(selection.matches);setAnswer(selection.approximate?"تطبیق مستقیمی پیدا نشد؛ این نام‌ها نزدیک‌اند. شخص موردنظر را انتخاب کنید.":selection.matches.length?"چند شخص مرتبط پیدا شد؛ شخص موردنظر را انتخاب کنید.":"شخصی با این نام پیدا نشد؛ نام کامل را بنویسید. این نتیجه به معنی ماندهٔ صفر نیست.");}
        }else showPartyAnswer(result);
      }
    }catch(e){if(!c.signal.aborted)fail(e);}finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  function send(){
    if(paymentProposal||voiceActive.current||flight.current||text.trim().length<3)return;
    const followup=planPartyFollowup(text,partyContext,business.id,can("journals.read"));
    if(followup){setError("");if(followup.kind==="clarify"){setAnswer(followup.message);}else{setAnswer("");setPartyLedger(followup.party);}return;}
    const contextualPayment=contextualPaymentMessage(text,partyContext,business.id);
    if(!contextualPayment)setPartyContext(null);setPartyLedger(null);
    pendingParty.current=null;setPartyAnswer(null);setError("");setAnswer("");setTradeAnswer(null);setParties([]);clearStock();setReport(null);setChoice(false);
    setCashAnswer(null);
    const cash=planCashReport(text,tehranToday());
    if(cash){tradeContext.current=null;if("clarification" in cash){setAnswer(cash.clarification);return;}void runCash(cash.plan);return;}
    const payment=contextualPayment||paymentMessage(text);
    if(payment){tradeContext.current=null;if("issue" in payment){setAnswer(payment.issue);return;}if(!paymentPermission(payment.proposal.direction,can)){setError("دسترسی آماده‌سازی این دریافت یا پرداخت را ندارید.");return;}setPaymentProposal(payment.proposal);return;}
    const decision=planTrade(text,tehranToday(),tradeContext.current);
    if(decision){if("clarification" in decision){setAnswer(decision.clarification);return;}void runTrade(decision.plan);return;}
    tradeContext.current=null;
    const kind=assistantIntent(text);if(inventoryQuestionProduct(text)!==null){void reportRequest();return;}if(/طلب|بدهکار|بستانکار|بدهی|طلبکار/.test(text)||kind==="unclear"){void runPartyQuestion();return;}if(kind==="sale"||kind==="purchase")route(kind);else if(kind==="report")void reportRequest();else{setChoice(true);setAnswer(kind==="mixed"?"پیام شامل خرید و فروش است؛ هر عملیات را در یک پیام جدا بنویسید.":"این پیام برای فروش، خرید یا گزارش است؟");}
  }
  function updateMessage(value:string){pendingParty.current=null;setPartyAnswer(null);setCashAnswer(null);setTradeAnswer(null);clearStock();setText(value);setAnswer("");setError("");setChoice(false);setReport(null);setParties([]);}
  const allowedReport=report&&reportAllowed(report,can)&&!(report==="parties"&&partyAnswer?.selectedParty);
  return <section className="store-assistant-card" aria-label="دستیار فروشگاه" dir="rtl"><header className="command-heading"><span className="command-avatar" aria-hidden="true">✦</span><div><h2>دستیار رانیار</h2><p>بگو یا بنویس؛ با هم انجامش می‌دهیم.</p></div><span className="command-label">همراه فروشگاه</span></header><div className="command-suggestions" aria-label="شروع کار با دستیار">{(can("sales.manage")&&can("sales.read"))&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>onCreate("sale")}>＋ ثبت فروش</button>}{(can("purchases.manage")&&can("purchases.read"))&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>onCreate("purchase")}>＋ ثبت خرید</button>}{can("purchases.manage")&&can("purchases.read")&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>onDocument("purchase","__PHOTO_PURCHASE__")}>▧ خرید از عکس</button>}{can("sales.read")&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>{updateMessage("امروز چقدر فروختم؟");messageInput.current?.focus();}}>↗ فروش امروز</button>}{can("inventory.read")&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>{updateMessage("موجودی ");messageInput.current?.focus();}}>▦ موجودی کالا</button>}{paymentPermission("RECEIPT",can)&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>onCreate("RECEIPT")}>＋ ثبت دریافت</button>}{paymentPermission("DISBURSEMENT",can)&&<button type="button" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>onCreate("DISBURSEMENT")}>＋ ثبت پرداخت</button>}</div><textarea ref={messageInput} aria-label="پیام به دستیار فروشگاه" rows={2} maxLength={4000} disabled={busy||voiceBusy||!!paymentProposal} value={text} placeholder="۳ تا چیپس به سینا فروختم… یا امروز چقدر فروختم؟" onChange={e=>updateMessage(e.target.value)}/>
    <VoiceMessageInput value={text} disabled={busy||!!paymentProposal} onChange={updateMessage} onActiveChange={active=>{voiceActive.current=active;setVoiceBusy(active);}}/>
    <div className="assistant-actions"><button type="button" className="primary" disabled={busy||voiceBusy||!!paymentProposal||text.trim().length<3} onClick={send}>{busy?"در حال دریافت گزارش…":"ارسال"}</button></div>
    {paymentProposal&&<AssistantPayment business={business} proposal={paymentProposal} onBusyChange={setPaymentBusy} onSessionExpired={onSessionExpired} onClose={()=>{if(!paymentBusy){setPaymentProposal(null);updateMessage("");}}}/>}
    {partyAnswer&&<AssistantPartyReport business={business} answer={partyAnswer}/>}
    {partyContext&&can("journals.read")&&<div className="assistant-actions"><button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>{if(!voiceActive.current)setPartyLedger(partyContext);}}>صورت‌حساب {partyContext.partyName}</button></div>}
    {partyLedger&&partyLedger.businessId===business.id&&can("journals.read")&&<FormDrawer title={`صورت‌حساب ${partyLedger.partyName}`} busy={false} onClose={()=>setPartyLedger(null)}><DetailedLedger key={`${business.id}:${partyLedger.partyId}`} business={business} kind="party" subjectId={partyLedger.partyId} onClose={()=>setPartyLedger(null)} onSessionExpired={onSessionExpired}/></FormDrawer>}
    {partyContext&&<button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={freshConversation}>گفت‌وگوی تازه</button>}
    {cashAnswer&&<AssistantCashReport business={business} answer={cashAnswer}/>}
    {tradeAnswer&&<AssistantTradeReport business={business} answer={tradeAnswer}/>}
    {tradeContext.current&&<button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>{tradeContext.current=null;setTradeAnswer(null);updateMessage("");setReport(null);}}>گفت‌وگوی تازه</button>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {(answer||choice||allowedReport)&&<div className="store-assistant-answer" role="status">{answer&&<p style={{whiteSpace:"pre-line"}}>{answer}</p>}{stockChoices.length>0&&<label>انتخاب کالا<select aria-label="انتخاب کالای گزارش موجودی" disabled={busy||voiceBusy||!!paymentProposal} value="" onChange={e=>{if(!voiceActive.current&&e.target.value){try{showStock(e.target.value);}catch(cause){clearStock();fail(cause);}}}}><option value="">انتخاب کالا</option>{stockChoices.map(p=><option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}</select></label>}{parties.length>0&&<label>انتخاب شخص<select disabled={busy||voiceBusy||!!paymentProposal} value="" onChange={e=>selectParty(e.target.value)}><option value="">انتخاب شخص</option>{parties.map(p=><option key={p.party.id} value={p.party.id}>{p.party.name}{!p.party.isActive?" · غیرفعال":""} · {p.party.id.slice(0,8)}</option>)}</select></label>}
      <div className="assistant-actions">{choice&&<>{can("sales.manage")&&can("sales.read")&&<button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>route("sale")}>فروش</button>}{can("purchases.manage")&&can("purchases.read")&&<button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>route("purchase")}>خرید</button>}{reportCatalog.some(r=>reportAllowed(r.id,can))&&<button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>void reportRequest()}>گزارش</button>}</>}{allowedReport&&<button type="button" className="secondary" disabled={busy||voiceBusy||!!paymentProposal} onClick={()=>{if(!voiceActive.current)onReport(report!);}}>باز کردن {reportCatalog.find(r=>r.id===report)?.title}</button>}</div>
    </div>}

  </section>;
}
