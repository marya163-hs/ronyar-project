import type { SaleDetails } from "./api";
import { decimalString, normalizeDigits } from "./saleAmounts";
type Amounts = Pick<SaleDetails["items"][number], "quantity" | "unitPrice" | "discountAmount" | "taxAmount" | "inventoryCost" | "lineTotal">;
export function returnUnits(value: string, scale: number): bigint {
  const clean = normalizeDigits(value); if (!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(clean)) throw new Error("عدد معتبر نیست.");
  const [whole, raw = ""] = clean.split("."); const fraction = raw.replace(/0+$/, ""); if (fraction.length > scale) throw new Error("دقت اعشار معتبر نیست.");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
}
export function remainingReturnQuantity(original: Amounts, previous: Amounts[]): string {
  const remaining = returnUnits(original.quantity, 6) - previous.reduce((sum, item) => sum + returnUnits(item.quantity, 6), 0n); if (remaining < 0n) throw new Error("مقادیر برگشت قبلی ناسازگارند."); return decimalString(remaining, 6);
}
export function calculateReturnLine(quantity: string, original: Amounts, previous: Amounts[], scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) throw new Error("دقت ارز پشتیبانی نمی‌شود.");
  const qty = returnUnits(quantity, 6), originalQty = returnUnits(original.quantity, 6), usedQty = previous.reduce((sum, item) => sum + returnUnits(item.quantity, 6), 0n), cumulative = usedQty + qty;
  if (qty <= 0n || originalQty <= 0n) throw new Error("مقدار برگشت باید مثبت باشد."); if (cumulative > originalQty) throw new Error("مقدار برگشت از باقی‌مانده فروش بیشتر است.");
  const product = qty * returnUnits(original.unitPrice, scale); if (product % 1000000n !== 0n) throw new Error("مبلغ برگشت با دقت ارز سازگار نیست."); const gross = product / 1000000n;
  const portion = (field: "discountAmount" | "taxAmount" | "inventoryCost") => { const total = returnUnits(original[field], scale), used = previous.reduce((sum, item) => sum + returnUnits(item[field], scale), 0n); const target = cumulative === originalQty ? total : (2n * total * cumulative + originalQty) / (2n * originalQty); const amount = target - used; if (amount < 0n || amount > total - used) throw new Error("مبلغ برگشت قبلی ناسازگار است."); return amount; };
  const discount = portion("discountAmount"), tax = portion("taxAmount"), cost = portion("inventoryCost"), total = gross - discount + tax;
  const usedTotal = previous.reduce((sum, item) => sum + returnUnits(item.lineTotal, scale), 0n); if (discount > gross || total < 0n || total + usedTotal > returnUnits(original.lineTotal, scale)) throw new Error("مبلغ برگشت از مبلغ باقی‌مانده بیشتر است.");
  return { gross, discount, tax, cost, total, totalText: decimalString(total, scale), taxText: decimalString(tax, scale), discountText: decimalString(discount, scale) };
}
