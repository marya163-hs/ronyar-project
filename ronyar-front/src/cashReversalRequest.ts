import type { CashReversalInput } from "./api";
export type PendingCashReversal = { key: string; body: CashReversalInput };
const storageName = (businessId: string, entryId: string) => `mahan:cash-reversal:${businessId}:${entryId}`;
export function readCashReversal(businessId: string, entryId: string): PendingCashReversal | null { const raw = sessionStorage.getItem(storageName(businessId, entryId)); if (!raw) return null; const value = JSON.parse(raw) as PendingCashReversal; if (!value || typeof value.key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value.key) || !value.body || typeof value.body.periodId !== "string" || typeof value.body.documentDate !== "string" || typeof value.body.reason !== "string") throw new Error("درخواست برگشت قبلی معتبر نیست؛ پیش از ثبت جدید باید بررسی شود."); return value; }
export function saveCashReversal(businessId: string, entryId: string, request: PendingCashReversal): void { sessionStorage.setItem(storageName(businessId, entryId), JSON.stringify(request)); }
export function clearCashReversal(businessId: string, entryId: string): void { sessionStorage.removeItem(storageName(businessId, entryId)); }
