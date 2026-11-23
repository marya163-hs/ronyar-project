import { getPayment, getPurchaseSettlement, listActiveAccounts, listFiscalPeriods, listDisbursementPayments } from "./api";
import type { PaymentDetails } from "./api";
export async function loadDisbursementOptions(businessId: string, purchaseId: string, signal: AbortSignal) {
  const [settlement, accounts, periods] = await Promise.all([getPurchaseSettlement(businessId, purchaseId, signal), listActiveAccounts(businessId, signal), listFiscalPeriods(businessId, signal)]);
  const payments: PaymentDetails[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const batch = await listDisbursementPayments(businessId, page, "ALL", signal); for (const item of batch.items) { if (item.partyId !== settlement.party.id) continue; const detail = await getPayment(businessId, item.id, signal); if (detail.allocations.some(allocation => allocation.targetType === "PURCHASE" && allocation.targetId === purchaseId)) payments.push(detail); } if (page >= batch.totalPages) break; if (page >= 100000) throw new Error("Disbursement list exceeds supported pagination"); page++; }
  return { settlement, accounts: accounts.filter(item => item.isActive && item.isCashBank && item.isPosting && item.type === "ASSET" && item.normalSide === "DEBIT"), periods: periods.filter(item => item.status === "OPEN"), payments };
}