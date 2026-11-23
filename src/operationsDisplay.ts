/** Formatting and current-page presentation helpers; not the accounting engine. */
export const moneyUnit = (currency: string) => currency === "IRR" ? "ریال" : currency;
const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";
export function searchText(value: string): string {
  return value.replace(/[۰-۹]/g, n => String(faDigits.indexOf(n)))
    .replace(/[٠-٩]/g, n => String(arDigits.indexOf(n)))
    .replace(/[\s٬,،]/g, "").toLocaleLowerCase("fa-IR");
}
function decimalParts(value: string): [bigint, number] {
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!parts) return [0n, 0];
  const fraction = parts[3] ?? "";
  return [BigInt(`${parts[1]}${parts[2]}${fraction}`), fraction.length];
}
/** Exact decimal string addition so large money amounts never use JS floating point. */
export function sumDecimalStrings(values: string[]): string {
  const parts = values.map(decimalParts);
  const scale = parts.reduce((max, [, digits]) => Math.max(max, digits), 0);
  const total = parts.reduce((sum, [value, digits]) => sum + value * 10n ** BigInt(scale - digits), 0n);
  if (scale === 0) return String(total);
  const negative = total < 0n ? "-" : "";
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, "0");
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ""}`;
}
export function nonPositiveDecimal(value: string): boolean { return decimalParts(value)[0] <= 0n; }
export function positiveDecimal(value: string): boolean { return decimalParts(value)[0] > 0n; }
