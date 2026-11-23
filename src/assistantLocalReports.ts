import { intentText } from "./assistantIntent";
import { assistantName } from "./saleAssistantMatch";
import { sumDecimalStrings } from "./operationsDisplay";

export type AssistantStockRow = {
  id: string; quantity: string;
  product: { id: string; name: string; code: string; isActive: boolean; unit: { id: string; name: string } };
  warehouse: { id: string; name: string; code: string; isActive: boolean };
};
export type AssistantStockSnapshot = { items: AssistantStockRow[]; total: number; totalPages: number };
export type AssistantStockChoice = { id: string; name: string; code: string };

export function todaySalesQuestion(text: string): boolean {
  const t = intentText(text).replace(/^(?:لطفا|لطفاً) /, "");
  return /^(?:فروش امروز(?: چقدر(?:ه| بود| است| هست)?| چند بود)?|امروز (?:چقدر|چند) فروخت(?:م|یم)|امروز فروش(?:م|مان)? چقدر(?:ه| بود| است| هست)?|گزارش فروش امروز)$/.test(t);
}
export function inventoryQuestionProduct(text: string): string | null {
  const t = intentText(text).replace(/^(?:لطفا|لطفاً) /, "");
  if (/(?:^| )(?:امروز|دیروز|پریروز|فردا|هفته|ماه|سال|تاریخ|دوره|انبار|انبارها|صندوق|بانک|و|بخر|بفروش|پرداخت|فروش|خرید|ارزش|قیمت)(?: |$)/.test(t)) return null;
  const direct=t.match(/^(.+?) (?:چند تا داریم|چقدر داریم|چقدر مونده|چند تا مونده|موجودیش چقدره)$/);
  if(direct)return direct[1].trim();
  const front=t.match(/^(?:چند تا|چقدر) (.+?) (?:داریم|مونده)$/);
  if(front)return front[1].trim();
  const m = t.match(/^(?:موجودی|مقدار موجودی) (?:کالا |کالای )?(.+?)(?: (?:چقدر(?:ه| است| هست| بود)?|چند(?: تا)?(?: است| هست)?|را نشان بده|رو نشون بده))?$/);
  const q = m?.[1]?.trim();
  return q && q.length <= 200 && q !== "همه" && q !== "کل" ? q : null;
}
export function inventoryChoices(rows: AssistantStockRow[], query: string): AssistantStockChoice[] {
  const all = [...new Map(rows.map(r => [r.product.id, {id:r.product.id,name:r.product.name,code:r.product.code}])).values()];
  const q = assistantName(query);
  const exact = all.filter(p => assistantName(p.name) === q || assistantName(p.code) === q);
  if (exact.length) return exact;
  const words = q.split(" ").filter(Boolean);
  return all.filter(p => words.every(w => (" " + assistantName(p.name) + " ").includes(" " + w + " ")));
}
export function inventoryQuantities(rows: AssistantStockRow[], productId: string) {
  const selected = rows.filter(r => r.product.id === productId);
  if (!selected.length) throw new Error("NO_STOCK_ROWS");
  if (new Set(selected.map(r=>r.product.unit.id)).size !== 1) throw new Error("INCONSISTENT_STOCK_UNITS");
  if (selected.some(r=>!/^[-]?\d+(?:\.\d+)?$/.test(r.quantity))) throw new Error("INVALID_STOCK_QUANTITY");
  return {name:selected[0].product.name,unit:selected[0].product.unit.name,
    quantity:sumDecimalStrings(selected.map(r=>r.quantity)),
    warehouses:[...new Set(selected.map(r=>r.warehouse.id))].map(id=>{
      const records=selected.filter(r=>r.warehouse.id===id);
      return {id,name:records[0].warehouse.name,active:records[0].warehouse.isActive,quantity:sumDecimalStrings(records.map(r=>r.quantity))};
    })};
}
export function completeStockSnapshot(data: AssistantStockSnapshot): boolean {
  return Array.isArray(data.items) && Number.isInteger(data.total) && data.total === data.items.length && data.total <= 10000 && data.totalPages <= 1;
}
