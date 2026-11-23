import { listParties, listProducts, listActiveWarehouses, listFiscalPeriods } from "./api";
import type { Party, Product } from "./api";
async function allPages<T>(fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>, signal: AbortSignal): Promise<T[]> {
  const items: T[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const result = await fetchPage(page); signal.throwIfAborted(); items.push(...result.items); if (page >= result.totalPages) return items; if (page >= 100000) throw new Error("Selection list exceeds supported pagination"); page++; }
}
export async function loadSaleOptions(businessId: string, signal: AbortSignal) {
  const [customers, products, warehouses, periods] = await Promise.all([allPages<Party>(page => listParties(businessId, "ACTIVE", "CUSTOMER", page, signal), signal), allPages<Product>(page => listProducts(businessId, "ACTIVE", page, signal), signal), listActiveWarehouses(businessId, signal), listFiscalPeriods(businessId, signal)]);
  return { customers: [...new Map(customers.map(item => [item.id, item])).values()], products: [...new Map(products.map(item => [item.id, item])).values()], warehouses, periods: periods.filter(item => item.status === "OPEN") };
}