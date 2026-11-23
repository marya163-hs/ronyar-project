import type { PartyLedgerExport, TrialBalanceExport } from "./api";
import { jalaliText } from "./jalaliDate";
import { journalDescription } from "./journalDescription";
import { numberCell, textCell } from "./reportOutput";
import type { ReportOutput } from "./reportOutput";
const side=(v:string)=>/^-?0(?:\.0+)?$/.test(v)?"صفر":v.startsWith("-")?"بستانکار":"بدهکار";
const abs=(v:string)=>v.startsWith("-")?v.slice(1):v;
const typeName=(v:string)=>({ASSET:"دارایی",LIABILITY:"بدهی",EQUITY:"حقوق مالکانه",REVENUE:"درآمد",EXPENSE:"هزینه"} as Record<string,string>)[v]??"حساب";
const complete=(count:number,rows:unknown[],at?:string)=>{if(count!==rows.length||!at||!Number.isFinite(+new Date(at)))throw new Error("INCOMPLETE_EXPORT");};
export function trialBalanceOutput(d:TrialBalanceExport):ReportOutput{
  complete(d.total,d.items,d.exportedAt);
  return {title:"تراز آزمایشی",businessName:d.businessName,scope:[d.scopeLabel,`ارقام به ${d.currency==="IRR"?"ریال":d.currency}`,d.isBalanced?"تراز برابر است":"تراز دارای اختلاف است"],exportedAt:d.exportedAt,fileStem:"ronyar-trial-balance",columns:["حساب","نوع حساب","گردش بدهکار","گردش بستانکار","مانده بدهکار","مانده بستانکار"],rows:d.items.map(r=>[textCell(r.account.name),textCell(typeName(r.account.type)),numberCell(r.totalDebit),numberCell(r.totalCredit),numberCell(r.debitBalance),numberCell(r.creditBalance)]),summary:[{label:"گردش بدهکار",cell:numberCell(d.totalDebit)},{label:"گردش بستانکار",cell:numberCell(d.totalCredit)},{label:"مانده بدهکار",cell:numberCell(d.totalDebitBalance)},{label:"مانده بستانکار",cell:numberCell(d.totalCreditBalance)}]};
}
export function partyLedgerOutput(d:PartyLedgerExport):ReportOutput{
  complete(d.total,d.items,d.exportedAt);if(!d.party)throw new Error("INCOMPLETE_EXPORT");
  const range=d.fromDate||d.toDate?`${d.fromDate?jalaliText(d.fromDate):"ابتدای ثبت‌ها"} تا ${d.toDate?jalaliText(d.toDate):"آخرین ثبت"}`:"همه تاریخ‌ها";
  return {title:`صورت‌حساب شخص: ${d.party.name}`,businessName:d.businessName,scope:[range,`ارقام به ${d.currency==="IRR"?"ریال":d.currency}`],exportedAt:d.exportedAt,fileStem:"ronyar-party-statement",columns:["تاریخ شمسی","شماره سند","حساب","شرح","بدهکار","بستانکار","مانده","ماهیت مانده"],rows:d.items.map(r=>[textCell(jalaliText(r.entry.documentDate)),r.entry.entryNumber?numberCell(r.entry.entryNumber):textCell("بدون شماره"),textCell(r.account.name),textCell(journalDescription(r.description||r.entry.description)),numberCell(r.debit),numberCell(r.credit),numberCell(abs(r.runningBalance)),textCell(side(r.runningBalance))]),summary:[{label:`مانده ابتدا (${side(d.openingBalance)})`,cell:numberCell(abs(d.openingBalance))},{label:"گردش بدهکار",cell:numberCell(d.totalDebit)},{label:"گردش بستانکار",cell:numberCell(d.totalCredit)},{label:`مانده پایان (${side(d.closingBalance)})`,cell:numberCell(abs(d.closingBalance))}]};
}
