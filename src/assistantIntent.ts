import {transactionLanguage} from './assistantLanguage';
export type AssistantIntent="sale"|"purchase"|"report"|"mixed"|"unclear";
export function intentText(text:string){return transactionLanguage(text).replace(/[،,؛;.!؟?:\n]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
/** This initial router handles explicit operations; unknown language requires a user choice. */
export function assistantIntent(text:string):AssistantIntent {
  const t=intentText(text),word=(pattern:string)=>new RegExp(`(?:^| )(?:${pattern})(?: |$)`,"i").test(t);
  const sale=word("فروختم|فروختیم|فروخته ام|فروخته ایم|بفروش|بفروشید|می فروشم|فاکتور فروش|ثبت فروش|sell|sold");
  const purchase=word("خریدم|خریدیم|خریده ام|خریده ایم|بخر|بخرید|می خرم|خریداری کردم|فاکتور خرید|ثبت خرید|buy|bought");
  const question=word("گزارش|چقدر|چقدره|مانده|بدهکار|بستانکار|موجودی|سود|زیان|تراز|گردش حساب|صورت حساب|چطور بوده|چطور بود")||/چند ?تا.*فرو/.test(t);
  // Explicit past-tense transactions with a question about their price still need review, not posting.
  if(question)return "report";
  if(sale&&purchase)return "mixed";
  return sale?"sale":purchase?"purchase":"unclear";
}
