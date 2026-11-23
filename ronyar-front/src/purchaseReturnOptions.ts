import { getPurchase, getPurchaseReturn, listPurchases, listPurchaseReturns, listFiscalPeriods } from "./api";
import type { PurchaseSummary, PurchaseReturnDetails } from "./api";
export async function loadPurchaseReturnOptions(businessId: string, signal: AbortSignal) {
  const periods = await listFiscalPeriods(businessId, signal); const purchases: PurchaseSummary[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listPurchases(businessId, "POSTED", page, signal); signal.throwIfAborted(); purchases.push(...batch.items); if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Purchase list exceeds supported pagination"); page++; }
  return { periods: periods.filter(item => item.status === "OPEN"), purchases: [...new Map(purchases.map(item => [item.id, item])).values()] };
}
export async function loadPurchaseReturnSource(businessId: string, originalId: string, signal: AbortSignal) {
  const original = await getPurchase(businessId, originalId, signal); if (original.status !== "POSTED") throw new Error("Original purchase must be posted");
  const returns: PurchaseReturnDetails[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listPurchaseReturns(businessId, "POSTED", page, signal); for (const item of batch.items) { if (item.originalId !== originalId) continue; signal.throwIfAborted(); const detail = await getPurchaseReturn(businessId, item.id, signal); if (detail.status === "POSTED" && detail.originalId === originalId) returns.push(detail); } if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Return list exceeds supported pagination"); page++; }
  signal.throwIfAborted(); return { original, returns };
}
