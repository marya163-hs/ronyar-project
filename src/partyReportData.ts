import {readBusinessReport} from './api';
import type {PartyBalanceRow,PartyBalancePage} from './api';
import {sumDecimalStrings} from './operationsDisplay';
export type PartyReportSide='RECEIVABLES'|'PAYABLES'|'BOTH';
const valid=(v:unknown):v is string=>typeof v==='string'&&/^-?\d{1,80}(?:\.\d{1,6})?$/.test(v);
const zero=(v:string)=>/^-?0(?:\.0+)?$/.test(v);
const minus=(v:string)=>v.startsWith('-')?v.slice(1):'-'+v;
const equal=(a:string,b:string)=>zero(sumDecimalStrings([a,minus(b)]));
export function validatePartyRows(rows:PartyBalanceRow[],data:PartyBalancePage){
 const amounts=['totalDebit','totalCredit','totalDebitBalance','totalCreditBalance','netBalance'] as const;
 if(amounts.some(k=>!valid(data[k])))throw new Error('جمع گزارش اشخاص معتبر نیست.');
 for(const r of rows){if(!r?.party?.id||typeof r.party.name!=='string'||!r.party.name.trim()||![r.totalDebit,r.totalCredit,r.balance,r.balanceAmount].every(valid)||r.totalDebit.startsWith('-')||r.totalCredit.startsWith('-')||r.balanceAmount.startsWith('-'))throw new Error('ردیف گزارش اشخاص معتبر نیست.');
  const side=zero(r.balance)?'ZERO':r.balance.startsWith('-')?'CREDIT':'DEBIT';if(side!==r.balanceSide||!equal(r.balance,sumDecimalStrings([r.totalDebit,minus(r.totalCredit)]))||!equal(r.balanceAmount,r.balance.replace(/^-/,'')))throw new Error('ماندهٔ شخص با گردش دفتر مطابقت ندارد.');}
 const debits=rows.filter(r=>r.balanceSide==='DEBIT'),credits=rows.filter(r=>r.balanceSide==='CREDIT');
 const checks:[string,string][]=[[sumDecimalStrings(rows.map(r=>r.totalDebit)),data.totalDebit],[sumDecimalStrings(rows.map(r=>r.totalCredit)),data.totalCredit],[sumDecimalStrings(rows.map(r=>r.balance)),data.netBalance],[sumDecimalStrings(debits.map(r=>r.balanceAmount)),data.totalDebitBalance],[sumDecimalStrings(credits.map(r=>r.balanceAmount)),data.totalCreditBalance]];
 if(checks.some(([a,b])=>!equal(a,b)))throw new Error('گزارش اشخاص ناقص است یا هنگام دریافت تغییر کرده؛ دوباره تلاش کنید.');
 return {rows,debtors:debits,creditors:credits,currency:data.currency,receivable:data.totalDebitBalance,payable:data.totalCreditBalance};
}
export type PartyReportSnapshot=ReturnType<typeof validatePartyRows>;
export async function fetchPartyReport(businessId:string,currency:string,signal:AbortSignal):Promise<PartyReportSnapshot>{
 const rows:PartyBalanceRow[]=[];const ids=new Set<string>();let first:PartyBalancePage|undefined;
 for(let page=1;page<=100;page++){
  signal.throwIfAborted();const data=await readBusinessReport<PartyBalancePage>(businessId,'accounting/party-balances',new URLSearchParams({page:String(page),limit:'100',status:'ALL'}),signal);signal.throwIfAborted();
  if(!data||data.currency!==currency||data.role!==null||data.periodId!==null||data.asOfDate!==null||data.page!==page||!Number.isInteger(data.total)||data.total<0||!Number.isInteger(data.totalPages)||data.totalPages<0||data.totalPages>100||!Array.isArray(data.items))throw new Error('گزارش کامل ماندهٔ اشخاص دریافت نشد.');
  if(first&&(['total','totalPages','currency','totalDebit','totalCredit','totalDebitBalance','totalCreditBalance','netBalance'] as const).some(k=>data[k]!==first![k]))throw new Error('گزارش اشخاص هنگام دریافت تغییر کرد؛ دوباره تلاش کنید.');
  first??=data;for(const r of data.items){if(!r?.party?.id||ids.has(r.party.id))throw new Error('ردیف نامعتبر یا تکراری در گزارش اشخاص.');ids.add(r.party.id);rows.push(r);}
  if(page>=data.totalPages){if(rows.length!==data.total)throw new Error('فهرست اشخاص ناقص دریافت شد.');return validatePartyRows(rows,data);}
 }
 throw new Error('فهرست اشخاص بزرگ است؛ گزارش ماندهٔ اشخاص را باز کنید.');
}

/** Direct candidates match whole words; approximate names are suggestions only. */
const normalizePartyName=(v:string)=>v.normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim().toLocaleLowerCase();
function oneEdit(a:string,b:string){
 if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
 return edits+(i<a.length||j<b.length?1:0)<=1;
}
export function resolveReportParties(rows:PartyBalanceRow[],query:string){
 const q=normalizePartyName(query);if(!q)return {matches:[] as PartyBalanceRow[],approximate:false,automatic:null as PartyBalanceRow|null};
 const direct=rows.filter(r=>(' '+normalizePartyName(r.party.name)+' ').includes(' '+q+' '));
 if(direct.length)return {matches:direct,approximate:false,automatic:direct.length===1?direct[0]:null};
 const words=q.split(' ');
 const near=rows.filter(r=>{
  const name=normalizePartyName(r.party.name).split(' ');
  return name.some((_,start)=>words.every((w,i)=>name[start+i]!==undefined&&(w===name[start+i]||(w.length>=4&&name[start+i].length>=4&&oneEdit(w,name[start+i])))));
 }).slice(0,10);
 return {matches:near,approximate:near.length>0,automatic:null};
}
export function matchReportParties(rows:PartyBalanceRow[],query:string){return resolveReportParties(rows,query).matches;}
