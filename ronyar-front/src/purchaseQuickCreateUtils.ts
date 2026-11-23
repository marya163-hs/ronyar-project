import type { Product, Party, PurchaseItemInput, Warehouse } from "./api";
// Keep matching local and advisory: product/party names are not unique identifiers.
export function quickName(value: string): string {
  return value.normalize("NFKC").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[\s\u200c\u200d]+/g, " ").trim().toLocaleLowerCase("fa");
}
export function similarQuickItems<T extends { name: string }>(items: T[], name: string): T[] {
  const query = quickName(name); if (query.length < 2) return [];
  return items.filter(item => { const candidate = quickName(item.name); return candidate.includes(query) || query.includes(candidate); })
    .sort((a, b) => Number(quickName(b.name) === query) - Number(quickName(a.name) === query)).slice(0, 5);
}
export function upsertQuickItem<T extends { id: string }>(items: T[], saved: T): T[] {
  return items.some(item => item.id === saved.id) ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved];
}
export function quickProductChange(product: Product, warehouses: Warehouse[], row: PurchaseItemInput): Partial<PurchaseItemInput> {
  return { productId: product.id, warehouseId: product.kind === "GOODS" ? warehouses.find(w => w.id === row.warehouseId)?.id ?? warehouses.find(w => w.isDefault)?.id ?? warehouses[0]?.id : undefined };
}
export function usableQuickSupplier(party: Party): boolean { return party.isActive && party.supplierEnabled; }
