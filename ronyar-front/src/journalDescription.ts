import { formatDecimal } from "./api";
export function journalDescription(text: string | null | undefined): string {
  if (!text) return "بدون شرح";
  const labels: Record<string, string> = { Payment: "دریافت/پرداخت", Sale: "فروش", Purchase: "خرید", "Sale return": "برگشت از فروش", "Purchase return": "برگشت از خرید" };
  const match = /^(Payment|Sale return|Purchase return|Sale|Purchase) (\d+)$/.exec(text);
  return match ? `${labels[match[1]]} شماره ${formatDecimal(match[2])}` : text;
}
