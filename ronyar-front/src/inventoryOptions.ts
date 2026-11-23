import { listActiveWarehouses, listProducts } from "./api";
import type { Product } from "./api";
export async function loadInventoryOptions(businessId: string, signal: AbortSignal) {
  const warehouses = await listActiveWarehouses(businessId, signal);
  const products: Product[] = []; let page = 1;
  while (true) { signal.throwIfAborted(); const result = await listProducts(businessId, "ALL", page, signal); signal.throwIfAborted(); products.push(...result.items); if (page >= result.totalPages) break; if (page >= 100000) throw new Error("Product list exceeds supported pagination"); page++; }
  return { warehouses, products: [...new Map(products.filter(item => item.kind === "GOODS").map(item => [item.id, item])).values()] };
}
