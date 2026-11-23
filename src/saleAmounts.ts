import type { SaleItemInput } from "./api";
export function normalizeDigits(value: string): string { return value.trim().replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/٫/g, "."); }
function parse(value: string, places: number): bigint {
  const clean = normalizeDigits(value); if (!/^(0|[1-9]\d{0,17})(\.\d+)?$/.test(clean)) throw new Error("عدد واردشده معتبر نیست.");
  const [whole, raw = ""] = clean.split("."); const fraction = raw.replace(/0+$/, ""); if (raw.length > 8 || fraction.length > places) throw new Error("تعداد رقم اعشار بیش از حد مجاز است.");
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0") || "0");
}
export function decimalString(value: bigint, scale: number): string { const raw = value.toString().padStart(scale + 1, "0"); return scale ? `${raw.slice(0, -scale)}.${raw.slice(-scale)}` : raw; }
export function calculateSaleLine(item: SaleItemInput, scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) throw new Error("دقت ارز پشتیبانی نمی‌شود.");
  const quantity = parse(item.quantity, 6), price = parse(item.unitPrice, scale), discount = parse(item.discountAmount, scale);
  if (quantity <= 0n) throw new Error("تعداد باید بزرگ‌تر از صفر باشد.");
  const amountPattern = /^(0|[1-9]\d{0,17})(\.\d{1,6})?$/;
  for (const value of [item.quantity, item.unitPrice, item.discountAmount]) if (!amountPattern.test(normalizeDigits(value)) || normalizeDigits(value).length > 25) throw new Error("قالب تعداد، قیمت یا تخفیف معتبر نیست.");
  const rateText = normalizeDigits(item.taxRate); if (!/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/.test(rateText)) throw new Error("نرخ مالیات باید بین صفر و یک باشد.");
  const rate = parse(rateText, 8), product = quantity * price; if (product % 1000000n !== 0n) throw new Error("مبلغ ردیف با دقت ارز سازگار نیست؛ تعداد یا قیمت را اصلاح کنید.");
  const gross = product / 1000000n; if (discount > gross) throw new Error("تخفیف از مبلغ ردیف بیشتر است.");
  const net = gross - discount, tax = (net * rate + 50000000n) / 100000000n, total = net + tax;
  const maximum = 1000000000000000000n * 10n ** BigInt(scale);
  if (quantity >= 1000000000000000000000000n || [price, gross, discount, net, tax, total].some(value => value >= maximum)) throw new Error("مبلغ از محدوده مجاز بیشتر است.");
  return { gross, discount, tax, total, grossText: decimalString(gross, scale), taxText: decimalString(tax, scale), totalText: decimalString(total, scale) };
}
/** Only truly empty optional fields default to zero; malformed values stay invalid. */
export function invoiceLineValues<T extends SaleItemInput>(row:T):T {
  return {...row,discountAmount:normalizeDigits(row.discountAmount)||"0",taxRate:normalizeDigits(row.taxRate)||"0"};
}
export function invoiceLineErrors(row:SaleItemInput,scale:number){
  const errors:Partial<Record<'quantity'|'unitPrice'|'discountAmount'|'taxRate',string>>={};
  const value=invoiceLineValues(row);
  for(const [key,label,places] of [['quantity','تعداد',6],['unitPrice','قیمت واحد',scale],['discountAmount','تخفیف ردیف',scale]] as const){
    const text=normalizeDigits(value[key]);
    if(!text){errors[key]=`${label} را وارد کنید.`;continue;}
    try{if(!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(text)||text.length>25)throw Error();const n=parse(text,places);if(key==='quantity'&&n<=0n){errors[key]='تعداد باید بزرگ‌تر از صفر باشد.';}}
    catch{errors[key]=`${label} معتبر وارد کنید؛ قالب عدد و دقت اعشار را بررسی کنید.`;}
  }
  if(!/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/.test(normalizeDigits(value.taxRate)))errors.taxRate='مالیات باید بین صفر و یک باشد؛ مثلاً ۰٫۱ یعنی ۱۰٪.';
  return errors;
}
