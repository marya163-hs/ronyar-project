import { calculateSaleLine, decimalString, normalizeDigits } from "./saleAmounts";
import type { AssistantPriceReference } from "./api";
const factor=1000000n;
function number(s:string){const n=normalizeDigits(s);if(!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(n))throw new Error();const [w,f=""]=n.split(".");return BigInt(w)*factor+BigInt(f.padEnd(6,"0"));}
function decimal(n:bigint){const f=(n%factor).toString().padStart(6,"0").replace(/0+$/,"");return (n/factor).toString()+(f?"."+f:"");}
export function totalToUnit(amount:string,quantity:string):string|null{
  try{const a=number(amount),q=number(quantity);if(q<=0n||a*factor%q!==0n)return null;const p=a*factor/q;if(p>=1000000000000000000000000n)return null;return decimal(p);}catch{return null;}
}
export type PriceResolution={unitPrice:string;discountAmount?:string;needsChoice:boolean;note:string};
/** Smallest representable unit price whose gross covers the agreed total; discount preserves that total exactly. */
export function resolveTotalPrice(amount:string,quantity:string,scale=0):PriceResolution|null{
 try{
  if(!Number.isInteger(scale)||scale<0||scale>6)return null;
  const a=number(amount),q=number(quantity),currencyFactor=10n**BigInt(scale),divisor=factor/currencyFactor;
  if(a<=0n||q<=0n||a%divisor!==0n)return null;
  const target=a/divisor;
  const gcd=(a:bigint,b:bigint):bigint=>b===0n?a:gcd(b,a%b);
  const step=factor/gcd(q,factor),denominator=q*step;
  const price=((target*factor+denominator-1n)/denominator)*step;
  const gross=q*price/factor,discount=gross-target;
  const unitPrice=decimalString(price,scale),discountAmount=decimalString(discount,scale);
  const check=calculateSaleLine({productId:'preview',quantity:normalizeDigits(quantity),unitPrice,discountAmount,taxRate:'0'},scale);
  if(check.total!==target)return null;
  return {unitPrice,discountAmount,needsChoice:false,note:discount>0n?`گردکردن قیمت واحد؛ تخفیف تعدیل ${discountAmount} ریال برای حفظ جمع ردیف`:'محاسبه از جمع ردیف'};
 }catch{return null;}
}
export function resolveAssistantPrice(item:{quantity:string|null;unitPrice:string|null;amountRial?:string|null;priceBasis?:string},reference?:AssistantPriceReference,scale=0):PriceResolution{
  // Already resolved manual/form seeds remain compatible. No catalog price fills a missing amount.
  if(!item.priceBasis)return {unitPrice:item.unitPrice??"",needsChoice:false,note:""};
  const amount=item.amountRial;if(amount==null)return {unitPrice:"",needsChoice:false,note:""};
  if(item.priceBasis==="UNIT")return {unitPrice:amount,needsChoice:false,note:""};
  const divided=item.quantity?totalToUnit(amount,item.quantity):null;
  if(item.priceBasis==="TOTAL")return (item.quantity?resolveTotalPrice(amount,item.quantity,scale):null)??{unitPrice:"",needsChoice:false,note:"جمع ردیف یا تعداد معتبر نیست؛ آن را اصلاح کنید."};
  if(divided===amount)return {unitPrice:amount,needsChoice:false,note:""};
  if(reference&&((reference.source==="catalog"&&reference.prices.length===1)||(reference.source!=="none"&&reference.prices.length>=2))){
    try{
      const refs=reference.prices.map(number).filter(r=>r>0n),unit=number(amount),total=divided?number(divided):null;
      const near=(candidate:bigint,ref:bigint)=>candidate*100n>=ref*80n&&candidate*100n<=ref*120n;
      const u=refs.length>0&&refs.every(r=>near(unit,r)),t=total!==null&&refs.length>0&&refs.every(r=>near(total,r));
      // All recent samples must agree; the competing interpretation must miss every sample.
      const unitOnly=u&&(total===null||refs.every(r=>!near(total,r))),totalOnly=t&&refs.every(r=>!near(unit,r));
      if(unitOnly||totalOnly){const basis=reference.source==="same-party"?"سابقه طرف‌حساب":reference.source==="catalog"?"قیمت فروش":"سابقه قطعی";if(totalOnly){const adjusted=item.quantity?resolveTotalPrice(amount,item.quantity,scale):null;if(adjusted)return {...adjusted,note:`پیشنهاد جمع ردیف؛ ${basis}. ${adjusted.note}`};}
      return {unitPrice:unitOnly?amount:"",needsChoice:!unitOnly,note:`پیشنهاد: ${unitOnly?"هر واحد":"جمع ردیف"}؛ ${basis}`};}
    }catch{}
  }
  return {unitPrice:"",needsChoice:true,note:""};
}
