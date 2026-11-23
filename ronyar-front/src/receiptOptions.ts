import { getPayment, getSaleSettlement, listActiveAccounts, listFiscalPeriods, listReceiptPayments } from "./api";
import type { PaymentDetails } from "./api";
export async function loadReceiptOptions(businessId: string, saleId: string, signal: AbortSignal) {
  const [settlement, accounts, periods] = await Promise.all([getSaleSettlement(businessId, saleId, signal), listActiveAccounts(businessId, signal), listFiscalPeriods(businessId, signal)]);
  const payments: PaymentDetails[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listReceiptPayments(businessId, page, "ALL", signal); for (const item of batch.items) { if (item.partyId !== settlement.party.id) continue; const detail = await getPayment(businessId, item.id, signal); if (detail.allocations.some(allocation => allocation.targetType === "SALE" && allocation.targetId === saleId)) payments.push(detail); } if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Receipt list exceeds supported pagination"); page++; }
  return { settlement, accounts: accounts.filter(item => item.isActive && item.isCashBank && item.isPosting && item.type === "ASSET" && item.normalSide === "DEBIT"), periods: periods.filter(item => item.status === "OPEN"), payments };
}