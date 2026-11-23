import {reportLanguage} from './assistantLanguage';
import { intentText } from './assistantIntent';
import { planTrade } from './assistantTradePlan';
import type { TradeRange } from './assistantTradePlan';
import { listPayments } from './api';
import type { PaymentSummary } from './api';
export type CashPlan={direction:'RECEIPT'|'DISBURSEMENT'|'ALL';range:TradeRange;chart:boolean};
export function planCashReport(message:string,today:string):{plan:CashPlan}|{clarification:string}|null{
 let t=intentText(reportLanguage(message)).replace(/دریافت ها(?:ی)?/g,'دریافت').replace(/پرداخت ها(?:ی)?/g,'پرداخت');
 if(/(?:کردم|کردیم|گرفتم|دادم)/.test(t)&&!/(چقدر|گزارش|نمودار)/.test(t))return null;
 if(/(?:^| )(ثبت|فاکتور)(?: |$)/.test(t)||!/(دریافت|پرداخت)/.test(t))return null;
 if(!/(گزارش|نمودار|چقدر|امروز|دیروز|هفته|ماه|از \d|از [۰-۹])/.test(t))return null;
 const receipt=/(?:^| )دریافت(?: |$)/.test(t),payment=/(?:^| )پرداخت(?: |$)/.test(t);
 if(!receipt&&!payment)return null;
 t=t.replace(/دریافت و پرداخت|پرداخت و دریافت/g,'فروش').replace(/دریافت|پرداخت/g,'فروش').replace(/کردم|کردیم/g,' ').replace(/\s+/g,' ').trim();
 const decision=planTrade(t,today,null);
 if(!decision)return {clarification:'گزارش دریافت یا پرداخت را با بازهٔ زمانی مشخص بخواهید.'};
 if('clarification' in decision)return {clarification:'بازه یا فیلتر گزارش وجه مشخص نیست. نمونه: نمودار دریافت و پرداخت این هفته. فیلتر شخص و حساب فعلاً پشتیبانی نمی‌شود.'};
 if(decision.plan.compare)return {clarification:'مقایسهٔ دو بازهٔ دریافت و پرداخت فعلاً پشتیبانی نمی‌شود؛ هر بازه را جداگانه بخواهید.'};
 return {plan:{direction:receipt&&payment?'ALL':receipt?'RECEIPT':'DISBURSEMENT',range:decision.plan.range,chart:decision.plan.chart}};
}
const units=(v:string)=>{if(typeof v!=='string'||!/^\d{1,18}(?:\.\d{1,6})?$/.test(v))throw new Error('مبلغ گزارش معتبر نیست.');const [w,f='']=v.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'));};
const decimal=(v:bigint)=>{const sign=v<0n?'-':'';const a=v<0n?-v:v;const f=String(a%1000000n).padStart(6,'0').replace(/0+$/,'');return sign+String(a/1000000n)+(f?'.'+f:'');};
export function summarizeCash(rows:PaymentSummary[],plan:CashPlan,currency:string){
 let incoming=0n,outgoing=0n,receiptCount=0,paymentCount=0;const days=new Map<string,{incoming:bigint;outgoing:bigint}>();
 for(const row of rows){if(row.status!=='POSTED'||row.currency!==currency||!['RECEIPT','DISBURSEMENT'].includes(row.direction)||!/^\d{4}-\d{2}-\d{2}$/.test(row.documentDate)||isNaN(Date.parse(row.documentDate+'T12:00:00Z'))||new Date(row.documentDate+'T12:00:00Z').toISOString().slice(0,10)!==row.documentDate)throw new Error('اطلاعات گزارش معتبر نیست.');const amount=units(row.amount);if(amount<=0n)throw new Error('مبلغ گزارش معتبر نیست.');if(row.documentDate<plan.range.fromDate||row.documentDate>plan.range.toDate||plan.direction!=='ALL'&&row.direction!==plan.direction)continue;
 const d=days.get(row.documentDate)??{incoming:0n,outgoing:0n};if(row.direction==='RECEIPT'){incoming+=amount;d.incoming+=amount;receiptCount++;}else{outgoing+=amount;d.outgoing+=amount;paymentCount++;}days.set(row.documentDate,d);}
 return {incoming:decimal(incoming),outgoing:decimal(outgoing),net:decimal(incoming-outgoing),receiptCount,paymentCount,days:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,d])=>({date,incoming:decimal(d.incoming),outgoing:decimal(d.outgoing),net:decimal(d.incoming-d.outgoing)}))};
}
export type CashSnapshot=ReturnType<typeof summarizeCash>;
export async function fetchCashReport(businessId:string,plan:CashPlan,currency:string,signal:AbortSignal):Promise<CashSnapshot>{
 const rows:PaymentSummary[]=[];const ids=new Set<string>();let total:number|undefined,pages:number|undefined;
 for(let page=1;page<=200;page++){signal.throwIfAborted();const data=await listPayments(businessId,'ALL','POSTED',page,signal);signal.throwIfAborted();
 if(data.page!==page||!Number.isInteger(data.total)||data.total<0||!Number.isInteger(data.totalPages)||data.totalPages<0||data.totalPages>200||!Array.isArray(data.items)||total!==undefined&&total!==data.total||pages!==undefined&&pages!==data.totalPages)throw new Error('گزارش کامل دریافت نشد یا فهرست تغییر کرد؛ دوباره تلاش کنید.');
 total=data.total;pages=data.totalPages;for(const row of data.items){if(!row.id||ids.has(row.id))throw new Error('ردیف تکراری در گزارش دریافت شد.');ids.add(row.id);rows.push(row);}
 if(page>=data.totalPages){if(rows.length!==total)throw new Error('گزارش ناقص دریافت شد.');return summarizeCash(rows,plan,currency);}}
 throw new Error('حجم گزارش زیاد است؛ از بخش دریافت و پرداخت استفاده کنید.');
}
