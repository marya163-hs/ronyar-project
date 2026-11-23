import {
  calculateSaleLine,
  decimalString,
  normalizeDigits,
} from "./saleAmounts";
import { parseJalaliText } from "./jalaliDate";
export type PhotoProposal = {
  modelNotes?: {
    transcription: string[];
    proposal: string[];
    items: { row: number; notes: string[] }[];
  };
  transcription?: {
    kind: string;
    cells: {
      id: string;
      area: string;
      row: string | null;
      column: string | null;
      text: string;
      uncertain: boolean;
    }[];
    warnings: string[];
  };
  sourceReadings?: {
    path: string;
    sourceId: string | null;
    text: string | null;
    accepted: boolean;
  }[];
  supplier: string | null;
  documentDate: string | null;
  invoiceNumber: string | null;
  currency: "IRR" | "TOMAN" | null;
  subtotal: string | null;
  discountTotal: string | null;
  taxTotal: string | null;
  total: string | null;
  warnings: string[];
  items: {
    name: string | null;
    unit: string | null;
    kind: "GOODS" | "SERVICE" | null;
    quantity: string | null;
    unitPrice: string | null;
    discountAmount: string | null;
    taxRate: string | null;
    lineTotal: string | null;
    uncertain: string[];
  }[];
};
export type PhotoSession = {
  id: string;
  status: string;
  version: number;
  attempts: number;
  proposal: PhotoProposal | null;
  errorCode: string | null;
  purchaseId: string | null;
  expiresAt: string;
};
export const photoName = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s\u200c]+/g, " ")
    .trim()
    .toLocaleLowerCase();
export const photoNumber = (s: string) => {
  let n = normalizeDigits(s);
  if (/[,٬]/.test(n)) {
    if (
      (n.includes(",") && n.includes("٬")) ||
      !/^[1-9]\d{0,2}([,٬]\d{3})+(\.\d{1,8})?$/.test(n)
    )
      throw new Error(
        "گروه‌بندی رقم‌ها معتبر نیست؛ عدد را بدون جداکننده وارد کنید.",
      );
    n = n.replace(/[,٬]/g, "");
  }
  return n;
};
/** Convert the explicitly selected source money unit to IRR without floating point. */
export function photoMoney(s: string, currency: string): string {
  if (!["IRR", "TOMAN"].includes(currency))
    throw new Error("واحد پول فاکتور را انتخاب کنید.");
  const n = photoNumber(s);
  if (!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(n))
    throw new Error("عدد ناخوانا یا خالی را بررسی کنید.");
  const [a, b = ""] = n.split(".");
  let v = BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
  if (currency === "TOMAN") v *= 10n;
  return decimalString(v, 6).replace(/\.?0+$/, "") || "0";
}
export function photoDate(value: string | null) {
  if (!value) return "";
  const v = normalizeDigits(value).replace(/[/]/g, "-");
  if (/^1[2345]\d{2}-/.test(v)) return parseJalaliText(v) || "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (!m) return "";
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
    date = new Date(iso + "T00:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}
export function photoLine(
  r: {
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxRate: string;
  },
  currency: string,
  scale: number,
) {
  return {
    quantity: photoNumber(r.quantity),
    unitPrice: photoMoney(r.unitPrice, currency),
    discountAmount: photoMoney(r.discountAmount, currency),
    taxRate: photoNumber(r.taxRate),
  };
}
export function photoTotal(
  rows: Parameters<typeof photoLine>[0][],
  currency: string,
  scale: number,
) {
  return decimalString(
    rows.reduce(
      (v, r) =>
        v +
        calculateSaleLine(
          { productId: "", ...photoLine(r, currency, scale) },
          scale,
        ).total,
      0n,
    ),
    scale,
  );
}
