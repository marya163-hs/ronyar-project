import { getSale, getSaleReturn, listSales, listSaleReturns, listFiscalPeriods } from "./api";
import type { SaleSummary, SaleReturnDetails } from "./api";
export async function loadSaleReturnOptions(businessId: string, signal: AbortSignal) {
  const periods = await listFiscalPeriods(businessId, signal); const sales: SaleSummary[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listSales(businessId, "POSTED", page, signal); signal.throwIfAborted(); sales.push(...batch.items); if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Sale list exceeds supported pagination"); page++; }
  return { periods: periods.filter(item => item.status === "OPEN"), sales: [...new Map(sales.map(item => [item.id, item])).values()] };
}
export async function loadSaleReturnSource(businessId: string, originalId: string, signal: AbortSignal) {
  const original = await getSale(businessId, originalId, signal); if (original.status !== "POSTED") throw new Error("Original sale must be posted");
  const returns: SaleReturnDetails[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listSaleReturns(businessId, "POSTED", page, signal); for (const item of batch.items) { if (item.originalId !== originalId) continue; signal.throwIfAborted(); const detail = await getSaleReturn(businessId, item.id, signal); if (detail.status === "POSTED" && detail.originalId === originalId) returns.push(detail); } if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Return list exceeds supported pagination"); page++; }
  signal.throwIfAborted(); return { original, returns };
}
