import { resolveAssistantPrice } from "./assistantPrice";
import type { PurchaseSuggestion, PurchaseInput } from "./api";
import { assistantSupplierMatch, assistantProductMatch } from "./saleAssistantMatch";
import type { loadPurchaseOptions } from "./purchaseOptions";
import { tehranToday } from "./api";
import { periodForDate } from "./documentPeriod";
import { calculateSaleLine, normalizeDigits } from "./saleAmounts";
export type PurchaseAssistantOptions=Awaited<ReturnType<typeof loadPurchaseOptions>>;
export type PurchaseAssistantDraft={partyId:string;date:string;items:{productId:string;warehouseId:string;quantity:string;unitPrice:string;needsPriceChoice?:boolean;priceNote?:string;discountAmount?:string}[];messageNote?:string};
export function resolvePurchaseAssistantDraft(d:PurchaseSuggestion,o:PurchaseAssistantOptions,scale=0):PurchaseAssistantDraft{
  const warehouse=o.warehouses.filter(w=>w.isDefault);const defaultId=warehouse.length===1?warehouse[0].id:o.warehouses.length===1?o.warehouses[0].id:"";
  return {messageNote:d.defaultCurrencyUsed?`مبالغ بدون واحد با تنظیم ${d.sourceCurrency==="TOMAN"?"تومان":"ریال"} تفسیر شدند.`:"",partyId:assistantSupplierMatch(o.suppliers,d.supplier),date:tehranToday(),items:d.items.map(r=>{const productId=assistantProductMatch(o.products,r.product);return {productId,warehouseId:o.products.find(p=>p.id===productId)?.kind==="GOODS"?defaultId:"",quantity:r.quantity??"",unitPrice:resolveAssistantPrice(r,undefined,scale).unitPrice,discountAmount:resolveAssistantPrice(r,undefined,scale).discountAmount??"0",needsPriceChoice:resolveAssistantPrice(r,undefined,scale).needsChoice,priceNote:resolveAssistantPrice(r,undefined,scale).note};})};
}
export function purchaseAssistantDraftBody(d:PurchaseAssistantDraft,o:PurchaseAssistantOptions,scale:number):PurchaseInput|null{
  const period=periodForDate(o.periods,d.date);if(!period||!o.suppliers.some(p=>p.id===d.partyId))return null;
  if(d.items.some(r=>r.needsPriceChoice))return null;
  const items=[];let total=0n;
  try{for(const r of d.items){const product=o.products.find(p=>p.id===r.productId);if(!product)return null;if(product.kind==="GOODS"&&!o.warehouses.some(w=>w.id===r.warehouseId))return null;
    const item={productId:r.productId,...(product.kind==="GOODS"?{warehouseId:r.warehouseId}:{}),quantity:normalizeDigits(r.quantity),unitPrice:normalizeDigits(r.unitPrice),discountAmount:normalizeDigits(r.discountAmount??"0"),taxRate:"0"};total+=calculateSaleLine(item,scale).total;items.push(item);
  }}catch{return null;}if(!items.length||total<=0n||total>=1000000000000000000n*10n**BigInt(scale))return null;
  return {partyId:d.partyId,periodId:period.id,documentDate:d.date,items,notes:[d.messageNote,...d.items.map((r,i)=>r.priceNote?`ردیف ${i+1}: ${r.priceNote}`:"")].filter(Boolean).join("\n").slice(0,1000)};
}
export type PendingPurchaseAssistantDraft={key:string;body:PurchaseInput};
const slot=(b:string)=>`mahan.purchase-assistant.pending.v1:${b}`;
export function readPendingPurchaseAssistantDraft(b:string):PendingPurchaseAssistantDraft|null{
  try{const raw=sessionStorage.getItem(slot(b));if(!raw)return null;const value=JSON.parse(raw);if(typeof value.key!=="string"||!value.body||typeof value.body!=="object")throw new Error();return value;}catch{return null;}
}
export function storePendingPurchaseAssistantDraft(b:string,p:PendingPurchaseAssistantDraft){sessionStorage.setItem(slot(b),JSON.stringify(p));}
export function clearPendingPurchaseAssistantDraft(b:string){sessionStorage.removeItem(slot(b));}
