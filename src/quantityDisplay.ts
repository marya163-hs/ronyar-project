import { formatDecimal } from "./api";
// Preserve fractional quantities and exact digits; remove only insignificant zeros.
export function quantityText(value: string): string {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  const trimmed = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return /^-?0+$/.test(trimmed) ? "0" : trimmed;
}
export function formatQuantity(value: string): string { return formatDecimal(quantityText(value)); }
