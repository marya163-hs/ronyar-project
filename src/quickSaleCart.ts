import type { Product, SaleItemInput } from "./api";
import { calculateSaleLine, decimalString, normalizeDigits } from "./saleAmounts";
export type QuickRow={productId:string;quantity:string;unitPrice:string};
export function addQuickProduct(rows:QuickRow[],product:Product):QuickRow[]{
  const existing=rows.find(r=>r.productId===product.id);
  if(!existing){if(rows.length>=100)throw new Error("حداکثر ۱۰۰ قلم در هر فاکتور مجاز است.");return [...rows,{productId:product.id,quantity:"1",unitPrice:product.salePrice}];}
  const value=normalizeDigits(existing.quantity);if(!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(value))throw new Error("ابتدا تعداد این کالا را اصلاح کنید.");
  const [whole,fraction=""]=value.split(".");const quantity=decimalString(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,"0"))+1000000n,6).replace(/\.?0+$/,"");
  return rows.map(r=>r.productId===product.id?{...r,quantity}:r);
}
export function quickSaleItems(rows:QuickRow[],products:Product[],warehouseId:string,scale:number):{items:SaleItemInput[];total:bigint}{
  let total=0n;const items=rows.map(r=>{const product=products.find(p=>p.id===r.productId);if(!product)throw new Error("کالا در دسترس نیست.");if(product.kind==="GOODS"&&!warehouseId)throw new Error("انبار را انتخاب کنید.");const item={productId:r.productId,...(product.kind==="GOODS"?{warehouseId}:{}),quantity:normalizeDigits(r.quantity),unitPrice:normalizeDigits(r.unitPrice),discountAmount:"0",taxRate:"0"};total+=calculateSaleLine(item,scale).total;return item;});
  if(total>=1000000000000000000n*10n**BigInt(scale))throw new Error("مبلغ فاکتور بیش از محدوده مجاز است.");return {items,total};
}
export function matchingQuickProducts(products:Product[],query:string){const q=normalizeDigits(query).toLocaleLowerCase('fa');return q?products.filter(p=>p.name.toLocaleLowerCase('fa').includes(q)||p.code.toLocaleLowerCase('fa').includes(q)||Boolean(p.barcode?.includes(q))):[];}
