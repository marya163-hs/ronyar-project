import {transactionLanguage} from './assistantLanguage';
import { assistantName } from './saleAssistantMatch';
import { normalizeDigits } from './saleAmounts';
export type PaymentDirection='RECEIPT'|'DISBURSEMENT';
export type AssistantPaymentSeed={amount:string;accountQuery:string};
export type PaymentProposal={direction:PaymentDirection;partyId?:string;partyQuery:string;amountText:string;currency:'IRR'|'TOMAN'|null;accountQuery:string;invoiceNumber:string;message:string};
export type PaymentDecision={proposal:PaymentProposal}|{issue:string}|null;
const paymentHelp='شخص، مبلغ و حساب را مشخص کنید؛ مثلاً «۱۰۰ هزار تومان از صندوق به سینا پرداخت کردم». چیزی ثبت نشد.';
const permutations=(slots:string[]):string[][]=>slots.length?slots.flatMap((v,i)=>permutations(slots.filter((_,j)=>i!==j)).map(t=>[v,...t])):[[]];
/** Slot grammar consumes the whole message. Every slot occurs at most once. */
export function paymentMessage(text:string):PaymentDecision{
 const t=transactionLanguage(text);
 const hasReceipt=/(?:^| )(?:دریافت|گرفتم|گرفتیم)(?: |$)/.test(t),hasPay=/(?:^| )(?:پرداخت|دادم|دادیم)(?: |$)/.test(t);
 if(!hasReceipt&&!hasPay)return null;
 if(/(?:^| )(?:گزارش|چقدر|چقدره|نمودار|مانده)(?: |$)/.test(t))return null;
 if(hasReceipt&&hasPay)return {issue:'دریافت و پرداخت را در دو پیام جدا بنویسید.'};
 const direction:PaymentDirection=hasReceipt?'RECEIPT':'DISBURSEMENT';
 if(new RegExp(`^(?:ثبت )?${hasReceipt?'دریافت':'پرداخت'}$`).test(t))return {proposal:{direction,partyQuery:'',amountText:'',currency:null,accountQuery:'',invoiceNumber:'',message:text}};
 if(/(?:^| )(?:دیروز|فردا|هفته|ماه|سال|نکن|نکنید|نه|نکردم|ندادم|نگرفتم|برگشت|تخفیف|مالیات|حذف|کن|و|یا)(?: |$)/.test(t))return {issue:paymentHelp};
 let body=t.replace(/^امروز /,'').replace(/ امروز$/,'');
 let invoiceNumber='';
 const invoice=body.match(/ بابت فاکتور(?: شماره)? ([0-9]+)(?= |$)/);
 if(invoice){invoiceNumber=BigInt(invoice[1]).toString();body=body.replace(invoice[0],'');}
 const number='(?:[0-9]{1,3}(?:[٬,][0-9]{3})+|[0-9]+)(?:[.][0-9]+)?';
 const pieces:Record<string,string>={
  amount:`(?<amount>${number}(?: (?:هزار|میلیون|میلیارد))?)(?: (?<currency>تومان|تومن|ریال))?`,
  person:`${hasReceipt?'از':'به'} (?<person>[\\p{L}\\p{M}]+(?: [\\p{L}\\p{M}]+){0,8}?)`,
  account:`${hasReceipt?'به':'از'} (?:(?:حساب )(?<account>[\\p{L}\\p{M}]+(?: [\\p{L}\\p{M}]+){0,8}?)|(?<cash>(?:صندوق|بانک)(?: [\\p{L}\\p{M}]+){0,8}?))`,
  verb:hasReceipt?'(?:دریافت کردم|گرفتم|گرفتیم)':'(?:پرداخت کردم|دادم|دادیم)'
 };
 const matches:PaymentProposal[]=[];
 for(const slots of [['amount','person','verb'],['amount','person','account','verb']])for(const order of permutations(slots)){
  const m=body.match(new RegExp('^'+order.map(k=>pieces[k]).join(' ')+'$','u'));
  if(!m?.groups)continue;const g=m.groups,person=g.person,account=g.account||g.cash||'';
  const invalid=/(?:^| )(?:از|به|حساب|صندوق|بانک|دریافت|پرداخت|دادم|گرفتم|بابت|ثبت|فاکتور|تومان|تومن|ریال|هزار|میلیون|خریدم|فروختم|بدهکارم|بدهکار|بستانکار|طلب|نیست|نیستم|نبود|نداده|نگرفته|ندارم|دارم|دیگه)(?: |$)/;
  if(invalid.test(person)||/(?:^| )(?:از|به|دریافت|پرداخت|دادم|گرفتم|ثبت|بابت|فاکتور|تومان|ریال)(?: |$)/.test(account))continue;
  matches.push({direction,partyQuery:person,amountText:g.amount,currency:g.currency==='ریال'?'IRR':g.currency?'TOMAN':null,accountQuery:account,invoiceNumber,message:text});
 }
 const unique=[...new Map(matches.map(p=>[JSON.stringify(p),p])).values()];
 return unique.length===1?{proposal:unique[0]}:{issue:paymentHelp};
}
export function paymentAmountRial(value:string,currency:'IRR'|'TOMAN'):string{
 const t=normalizeDigits(value).trim();const m=t.match(/^((?:[0-9]{1,3}(?:[٬,][0-9]{3})+|[0-9]+)(?:\.[0-9]+)?)(?: (هزار|میلیون|میلیارد))?$/);
 if(!m)throw new Error('مبلغ پیام معتبر نیست.');
 const clean=m[1].replace(/[٬,]/g,'');const [whole,fraction='']=clean.split('.');if(clean.length>30||fraction.length>8)throw new Error('مبلغ خارج از محدوده است.');
 const factor=m[2]==='هزار'?1000n:m[2]==='میلیون'?1000000n:m[2]==='میلیارد'?1000000000n:1n;
 const scale=10n**BigInt(fraction.length);const raw=BigInt(whole+fraction)*factor*(currency==='TOMAN'?10n:1n);
 if(raw%scale!==0n)throw new Error('مبلغ به ریال صحیح تبدیل نمی‌شود؛ آن را در فرم اصلاح کنید.');
 const result=raw/scale;if(result<=0n||result>=1000000000000000000n)throw new Error('مبلغ باید مثبت و کمتر از حد مجاز باشد.');return String(result);
}
export function paymentInvoiceCandidates<T extends {number:string|null;party:{id:string;name:string}}>(rows:T[],proposal:PaymentProposal):T[]{
 const q=assistantName(proposal.partyQuery),all=rows.filter(r=>(!proposal.partyId||r.party.id===proposal.partyId)&&(!proposal.invoiceNumber||r.number===proposal.invoiceNumber));
 if(!q)return all;
 const exact=all.filter(r=>assistantName(r.party.name)===q);if(exact.length)return exact;
 const words=q.split(' ').filter(Boolean);
 return all.filter(r=>words.every(w=>(' '+assistantName(r.party.name)+' ').includes(' '+w+' ')));
}
export function paymentAccountMatch<T extends {id:string;name:string}>(accounts:T[],query:string):string{
 const q=assistantName(query);if(!q)return '';const exact=accounts.filter(a=>assistantName(a.name)===q);if(exact.length)return exact.length===1?exact[0].id:'';const words=q.split(' ').filter(Boolean);const matches=accounts.filter(a=>words.every(w=>(' '+assistantName(a.name)+' ').includes(' '+w+' ')));return matches.length===1?matches[0].id:'';
}

/** Resolve pronouns only against a person explicitly selected in the current store. */
export function contextualPaymentMessage(text:string,context:{businessId:string;partyId:string;partyName:string}|null,businessId:string):PaymentDecision{
 const t=transactionLanguage(text);
 if(!/(?:^| )(?:بهش|ازش|به او|از او|به همین شخص|از همین شخص)(?: |$)/.test(t)||!/(?:پرداخت|دریافت|دادم|دادیم|گرفتم|گرفتیم)/.test(t))return null;
 if(!context||context.businessId!==businessId||!context.partyId||!context.partyName)return {issue:'اول شخص را مشخص کنید؛ چیزی ثبت نشد.'};
 const normalized=t.replace(/(?:^| )(بهش|به او|به همین شخص)(?= |$)/g,' به شخصگفتگو').replace(/(?:^| )(ازش|از او|از همین شخص)(?= |$)/g,' از شخصگفتگو').trim();
 const result=paymentMessage(normalized);
 if(!result||'issue' in result)return {issue:result&&'issue' in result?result.issue:paymentHelp};
 if(result.proposal.invoiceNumber)return {issue:'برای فاکتور مشخص، نام شخص را هم بنویسید.'};
 if(result.proposal.partyQuery!=='شخصگفتگو')return {issue:'ارجاع شخص مبهم است؛ نام او را بنویسید.'};
 return {proposal:{...result.proposal,partyId:context.partyId,partyQuery:context.partyName,message:text}};
}
