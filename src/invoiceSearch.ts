type Searchable = { id: string; name: string; code?: string | null; barcode?: string | null; externalCode?: string | null };
export function invoiceSearchText(value: string): string {
  return value.normalize("NFKC").replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u200c\u200d]/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("fa");
}
const alphabet = new Intl.Collator("fa", { numeric: true, sensitivity: "base" });
export function searchInvoiceOptions<T extends Searchable>(source: readonly T[], query: string, selectedId: string) {
  const q = invoiceSearchText(query), tokens = q.split(" ").filter(Boolean);
  const ranked = source.map((item, index) => {
    const fields = [item.name, item.code, item.barcode, item.externalCode].filter((v): v is string => typeof v === "string").map(invoiceSearchText);
    const haystack = fields.join(" ");
    return { item, index, matches: tokens.every(t => haystack.includes(t)), rank: fields.includes(q) ? 0 : fields.some(f => f.startsWith(q)) ? 1 : 2 };
  }).filter(x => x.matches).sort((a, b) => (q ? a.rank - b.rank : 0) || alphabet.compare(a.item.name, b.item.name) || a.index - b.index);
  const items = ranked.map(x => x.item), selected = source.find(item => item.id === selectedId);
  const keptSelected = !!selected && !items.some(item => item.id === selectedId);
  if (selected && keptSelected) items.unshift(selected);
  return { items, matchCount: ranked.length, keptSelected };
}
