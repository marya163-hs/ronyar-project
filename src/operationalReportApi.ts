import { readBusinessReport } from "./api";
import type { OperationalReportKind, OperationalResult, ReportFilters, SalesDailyReport, PurchasesDailyReport, SettlementReport, InventoryValueReport } from "./reportContracts";
import type { CashBalancePage, PartyBalancePage } from "./api";
export function reportQuery(kind: OperationalReportKind, page: number, filters: ReportFilters): URLSearchParams {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (["sales", "purchases", "receivables", "payables"].includes(kind)) {
    if (filters.fromDate) query.set("fromDate", filters.fromDate);
    if (filters.toDate) query.set("toDate", filters.toDate);
  }
  if ((kind === "receivables" || kind === "payables") && filters.settlementStatus) query.set("settlementStatus", filters.settlementStatus);
  if (kind === "inventory" && filters.warehouseId) query.set("warehouseId", filters.warehouseId);
  if (kind === "parties") { query.set("status", "ALL"); if (filters.role && filters.role !== "ALL") query.set("role", filters.role); }
  return query;
}
export async function loadOperationalReport(businessId: string, kind: OperationalReportKind, page: number, filters: ReportFilters, signal: AbortSignal): Promise<OperationalResult> {
  const q = reportQuery(kind, page, filters);
  switch (kind) {
    case "sales": return { kind, data: await readBusinessReport<SalesDailyReport>(businessId, "reports/sales", q, signal) };
    case "purchases": return { kind, data: await readBusinessReport<PurchasesDailyReport>(businessId, "reports/purchases", q, signal) };
    case "receivables": return { kind, data: await readBusinessReport<SettlementReport>(businessId, "reports/sales-settlements", q, signal) };
    case "payables": return { kind, data: await readBusinessReport<SettlementReport>(businessId, "reports/purchases-settlements", q, signal) };
    case "inventory": return { kind, data: await readBusinessReport<InventoryValueReport>(businessId, "reports/inventory-value", q, signal) };
    case "parties": return { kind, data: await readBusinessReport<PartyBalancePage>(businessId, "accounting/party-balances", q, signal) };
    case "cash": return { kind, data: await readBusinessReport<CashBalancePage>(businessId, "accounting/cash-balances", q, signal) };
  }
}
