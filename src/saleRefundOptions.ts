import { getSaleReturn, getSaleSettlement, getPayment, listDisbursementPayments, listActiveAccounts, listFiscalPeriods } from "./api";
import type { PaymentDetails } from "./api";
import { returnUnits } from "./saleReturnAmounts";
import { decimalString } from "./saleAmounts";
export async function loadSaleRefundOptions(businessId: string, returnId: string, scale: number, signal: AbortSignal) {
  const document = await getSaleReturn(businessId, returnId, signal); if (document.status !== "POSTED") throw new Error("Refund requires a posted sale return");
  const [settlement, accounts, periods] = await Promise.all([getSaleSettlement(businessId, document.originalId, signal), listActiveAccounts(businessId, signal), listFiscalPeriods(businessId, signal)]);
  const payments: PaymentDetails[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listDisbursementPayments(businessId, page, "ALL", signal); for (const item of batch.items) { if (item.partyId !== document.partyId) continue; const detail = await getPayment(businessId, item.id, signal); if (detail.allocations.some(allocation => allocation.targetType === "SALE_RETURN" && allocation.targetId === returnId)) payments.push(detail); } if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Refund list exceeds supported pagination"); page++; }
  const refundedHere = payments.filter(item => item.status === "POSTED").flatMap(item => item.allocations).filter(item => item.targetType === "SALE_RETURN" && item.targetId === returnId).reduce((sum, item) => sum + returnUnits(item.amount, scale), 0n);
  const returnRemaining = returnUnits(document.total, scale) - refundedHere; if (returnRemaining < 0n) throw new Error("Refund amounts are inconsistent");
  const credit = returnUnits(settlement.creditAmount, scale); const available = returnRemaining < credit ? returnRemaining : credit;
  signal.throwIfAborted(); return { document, settlement, availableAmount: decimalString(available, scale), returnRemaining: decimalString(returnRemaining, scale), accounts: accounts.filter(item => item.isActive && item.isCashBank && item.isPosting && item.type === "ASSET" && item.normalSide === "DEBIT"), periods: periods.filter(item => item.status === "OPEN"), payments };
}
