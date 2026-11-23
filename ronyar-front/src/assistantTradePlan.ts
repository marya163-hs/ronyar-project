import {reportLanguage} from './assistantLanguage';
import { intentText } from './assistantIntent';
import { isoToJalali, jalaliToISO, parseJalaliText } from './jalaliDate';
export type TradeKind = 'sales' | 'purchases';
export type TradeRange = { fromDate: string; toDate: string; label: string };
export type TradePlan = { kind: TradeKind; range: TradeRange; compare?: TradeRange; chart: boolean };
export type TradeDecision = { plan: TradePlan } | { clarification: string } | null;
const shift = (iso:string,n:number) => new Date(Date.parse(iso+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function tradeRange(token:string,today:string):TradeRange|null {
  if(token==='امروز'||token==='دیروز') {const d=shift(today,token==='دیروز'?-1:0);return {fromDate:d,toDate:d,label:token};}
  if(token==='این هفته'||token==='هفته قبل') {
    const offset=(new Date(today+'T12:00:00Z').getUTCDay()+1)%7;
    const start=shift(today,-offset+(token==='هفته قبل'?-7:0));
    return {fromDate:start,toDate:token==='هفته قبل'?shift(start,6):today,label:token==='این هفته'?'این هفته تا امروز':'هفته قبل (کامل)'};
  }
  const p=isoToJalali(today);if(!p)return null;
  if(token==='این ماه'||token==='ماه قبل') {
    const prev=token==='ماه قبل';const y=p.year-(prev&&p.month===1?1:0),m=prev?(p.month===1?12:p.month-1):p.month;
    const start=jalaliToISO(y,m,1),next=jalaliToISO(m===12?y+1:y,m===12?1:m+1,1);
    return start&&next?{fromDate:start,toDate:prev?shift(next,-1):today,label:prev?'ماه قبل (کامل شمسی)':'این ماه شمسی تا امروز'}:null;
  }
  return null;
}
/** Deliberately closed grammar: unsupported filters never silently become whole-store totals. */
export function planTrade(text:string,today:string,context:TradePlan|null):TradeDecision {
  let t=intentText(reportLanguage(text)).replace(/نمودارش/g,'نمودار').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const mentionsSales=/(?:^| )فروش(?: |$)/.test(t),mentionsPurchases=/(?:^| )خرید(?: |$)/.test(t);
  const transactional=/(?:^| )(?:فروختم|فروختیم|خریدم|خریدیم|بخر|بفروش|ثبت|فاکتور)(?: |$)/.test(t);
  if(transactional)return null;
  const contextual=!!context&&/^(?:حالا|نمودار|با |ماه قبل|این ماه|امروز|دیروز|این هفته|هفته قبل)/.test(t);
  if(!mentionsSales&&!mentionsPurchases&&!contextual)return null;
  if(mentionsSales&&mentionsPurchases)return {clarification:'گزارش خرید و فروش را فعلاً در دو درخواست جدا بپرسید.'};
  if(!mentionsSales&&!mentionsPurchases&&/(موجودی|سود|زیان|شخص|بانک|صندوق|بدهکار|بستانکار)/.test(t))return null;
  const kind:TradeKind=mentionsPurchases?'purchases':mentionsSales?'sales':context!.kind;
  const wantsCompare=/مقایسه/.test(t),chart=/نمودار/.test(t)||(contextual&&!!context?.chart);
  const explicit=t.match(/از (\d{4}[/-]\d{1,2}[/-]\d{1,2}) تا (\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
  let range:TradeRange|undefined,compare:TradeRange|undefined;
  if(explicit){
    const parse=(s:string)=>Number(s.slice(0,4))<1700?parseJalaliText(s):(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s?s:null);
    const a=parse(explicit[1]),b=parse(explicit[2]);if(!a||!b||a>b||Date.parse(b)-Date.parse(a)>370*86400000)return {clarification:'بازهٔ معتبر تا ۳۷۱ روز وارد کنید؛ نمونه: از ۱۴۰۵/۰۷/۰۱ تا ۱۴۰۵/۰۷/۳۰.'};
    range={fromDate:a,toDate:b,label:'بازهٔ انتخابی'};t=t.replace(explicit[0],' ');
  }
  const tokens=t.match(/امروز|دیروز|این هفته|هفته قبل|این ماه|ماه قبل/g)??[];
  if(tokens.length>2||(!wantsCompare&&tokens.length>1)||(explicit&&tokens.length))return {clarification:'یک بازه یا دو بازه برای مقایسه مشخص کنید.'};
  if(wantsCompare){
    if(tokens.length===2){range=tradeRange(tokens[0],today)??undefined;compare=tradeRange(tokens[1],today)??undefined;}
    else if(tokens.length===1&&context){range=context.range;compare=tradeRange(tokens[0],today)??undefined;}
    else return {clarification:'برای مقایسه دو بازه مشخص کنید؛ مثلاً فروش این ماه را با ماه قبل مقایسه کن.'};
  }else if(tokens.length===1)range=tradeRange(tokens[0],today)??undefined;
  else if(!range&&contextual){range=context!.range;compare=context!.compare;}
  const remaining=t.replace(/امروز|دیروز|این هفته|هفته قبل|این ماه|ماه قبل/g,' ').replace(/(?:^| )(?:گزارش|فروش|خرید|نمودار|مقایسه|کن|بده|نشان|نشون|را|رو|با|و|حالا|لطفا|لطفاً|چقدر|چقدره|بود|است|هست|بکش|بکشید|بدهید|نمایش|مبلغ|میزان|خالص|بوده)(?= |$)/g,' ').replace(/\s+/g,' ').trim();
  if(remaining)return {clarification:'این فیلتر یا عبارت هنوز در گزارش گفت‌وگویی پشتیبانی نمی‌شود. فعلاً گزارش کل فروش یا خرید را با بازهٔ زمانی بخواهید، یا گزارش کامل را باز کنید.'};
  if(!range)return {clarification:'برای گزارش '+(kind==='sales'?'فروش':'خرید')+' بازه را مشخص کنید: امروز، دیروز، این هفته، هفته قبل، این ماه، ماه قبل یا از تاریخ تا تاریخ.'};
  return {plan:{kind,range,compare,chart}};
}
