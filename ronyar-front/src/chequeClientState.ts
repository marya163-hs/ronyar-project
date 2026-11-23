import type {
  ChequeState,
  ChequeActionName,
  ChequeCreateInput,
  ChequeActionInput,
} from "./api";
export const chequeStateLabel: Record<ChequeState, string> = {
  IN_HAND: "نزد فروشگاه",
  ISSUED: "صادرشده",
  ENDORSED: "واگذارشده",
  CLEARED: "وصول / پاس‌شده",
  BOUNCED: "برگشتی",
  CANCELLED: "باطل‌شده",
};
export function chequeActions(
  kind: string,
  state: ChequeState,
): ChequeActionName[] {
  if (state === "IN_HAND" && kind === "RECEIVABLE")
    return ["ENDORSE", "CLEAR", "BOUNCE", "CANCEL"];
  if (state === "ENDORSED" && kind === "RECEIVABLE")
    return ["RETURN_ENDORSE", "CLEAR", "BOUNCE"];
  if (state === "ISSUED" && kind === "PAYABLE")
    return ["CLEAR", "BOUNCE", "CANCEL"];
  return [];
}
export const chequeActionLabel: Record<ChequeActionName, string> = {
  ENDORSE: "واگذاری به تأمین‌کننده",
  RETURN_ENDORSE: "عودت از تأمین‌کننده",
  CLEAR: "ثبت وصول / پاس‌شدن",
  BOUNCE: "ثبت برگشت چک",
  CANCEL: "ابطال چک",
};
export type PendingCheque = {
  scope: string;
  id: string | null;
  key: string;
  body: ChequeCreateInput | ChequeActionInput;
};
export function parsePendingCheque(
  raw: string | null,
  scope: string,
): PendingCheque | null {
  if (!raw) return null;
  const x = JSON.parse(raw) as PendingCheque;
  if (
    x.scope !== scope ||
    !/^web-cheque-[0-9a-f-]{36}$/i.test(x.key) ||
    !(x.id === null || /^[0-9a-f-]{36}$/i.test(x.id)) ||
    !x.body ||
    typeof x.body !== "object"
  )
    throw Error(
      "درخواست قبلی قابل شناسایی نیست؛ قبل از ثبت جدید، سوابق را بررسی کنید.",
    );
  return x;
}
export function chequeDigits(s: string) {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
