import { readBusinessReport } from "./api";
import type { TradeBreakdownPage } from "./api";
import type { SalesDailyReport, PurchasesDailyReport, InventoryValueReport, ReportFilters } from "./reportContracts";
import { jalaliText } from "./jalaliDate";
import { quantityText } from "./quantityDisplay";
import { numberCell, textCell } from "./reportOutput";
import type { ReportOutput } from "./reportOutput";
type Metadata = { businessName: string; exportedAt: string };
type Range = { fromDate: string | null; toDate: string | null };
export type SalesExport = SalesDailyReport & Metadata & Range;
export type PurchasesExport = PurchasesDailyReport & Metadata & Range;
export type InventoryExport = InventoryValueReport & Metadata & { warehouseName: string | null; productName: string | null };
export type TradeExport = TradeBreakdownPage & Metadata & { search: string | null };
function complete(d: Metadata & { total: number; items: unknown[] }) {
  if (!Number.isInteger(d.total) || d.total < 0 || d.total > 10000 || d.items.length !== d.total || !d.businessName || !d.exportedAt || !Number.isFinite(+new Date(d.exportedAt))) throw new Error("INCOMPLETE_EXPORT");
}
const range = (d: Range) => d.fromDate || d.toDate ? `${d.fromDate ? jalaliText(d.fromDate) : "ابتدای ثبت‌ها"} تا ${d.toDate ? jalaliText(d.toDate) : "آخرین ثبت"}` : "همه تاریخ‌ها";
const currency = (v: string) => `ارقام به ${v === "IRR" ? "ریال" : v}`;
const posted = "فقط اسناد قطعی؛ هر برگشت در تاریخ ثبت خودش محاسبه می‌شود.";
export function dailyOutput(kind: "sales", d: SalesExport): ReportOutput;
export function dailyOutput(kind: "purchases", d: PurchasesExport): ReportOutput;
export function dailyOutput(kind: "sales" | "purchases", d: SalesExport | PurchasesExport): ReportOutput {
  complete(d);
  const noun = kind === "sales" ? "فروش" : "خرید";
  const gross = "totalSales" in d ? d.totalSales : d.totalPurchases;
  const net = "netSales" in d ? d.netSales : d.netPurchases;
  return { title: `گزارش روزانه ${noun}`, businessName: d.businessName, exportedAt: d.exportedAt, fileStem: `ronyar-${kind}-daily`, scope: [range(d),currency(d.currency),posted], columns: ["تاریخ شمسی",`تعداد فاکتور ${noun}`,"تعداد برگشت",`مبلغ ${noun}`,"مبلغ برگشت","مبلغ خالص"], rows: d.items.map(r => [textCell(jalaliText(r.documentDate)),numberCell(String("saleCount" in r ? r.saleCount : r.purchaseCount)),numberCell(String(r.returnCount)),numberCell("saleAmount" in r ? r.saleAmount : r.purchaseAmount),numberCell(r.returnAmount),numberCell(r.netAmount)]), summary: [{label:`مبلغ ${noun}`,cell:numberCell(gross)},{label:"مبلغ برگشت",cell:numberCell(d.totalReturns)},{label:`خالص ${noun}`,cell:numberCell(net)}] };
}
export function tradeOutput(d: TradeExport): ReportOutput {
  complete(d);
  const noun = d.kind === "sales" ? "فروش" : "خرید", product = d.dimension === "product";
  return { title: `${noun} به تفکیک ${product ? "کالا" : "شخص"}`, businessName:d.businessName, exportedAt:d.exportedAt, fileStem:`ronyar-${d.kind}-by-${d.dimension}`, scope:[range(d),currency(d.currency),...(d.search ? [`جستجو: ${d.search}`] : []),posted,...(product ? ["مبالغ ردیف‌های فاکتور پس از تخفیف و با مالیات؛ گردکردن نهایی فاکتور تخصیص داده نمی‌شود. تعدادها با واحد ثبت‌شده در سند هستند و با هم جمع نمی‌شوند."] : [])], columns:[...(product ? ["کد کالا"] : []),product ? "کالا" : d.kind === "sales" ? "مشتری" : "تأمین‌کننده",...(product ? ["واحد",`تعداد ${noun}`,"تعداد برگشت","تعداد خالص"] : []),`مبلغ ${noun}`,"مبلغ برگشت","مبلغ خالص"], rows:d.items.map(r=>[...(product ? [textCell(r.code??"—")] : []),textCell(r.name+(r.isActive ? "" : " (غیرفعال)")),...(product ? [textCell(r.unitName??"—"),numberCell(quantityText(r.grossQuantity??"0")),numberCell(quantityText(r.returnQuantity??"0")),numberCell(quantityText(r.netQuantity??"0"))] : []),numberCell(r.grossAmount),numberCell(r.returnAmount),numberCell(r.netAmount)]), summary:[{label:`مبلغ ${noun}`,cell:numberCell(d.totalGross)},{label:"مبلغ برگشت",cell:numberCell(d.totalReturns)},{label:`خالص ${noun}`,cell:numberCell(d.netAmount)}] };
}
export function inventoryOutput(d: InventoryExport): ReportOutput {
  complete(d);
  return {title:"مقدار و ارزش موجودی",businessName:d.businessName,exportedAt:d.exportedAt,fileStem:"ronyar-inventory-value",scope:["موجودی فعلی؛ این گزارش موجودی تاریخی نیست.",d.warehouseName ? `انبار: ${d.warehouseName}` : "همه انبارها",...(d.productName ? [`کالا: ${d.productName}`] : []),currency(d.currency),"تعدادها با واحد هر کالا نمایش داده می‌شوند و با هم جمع نمی‌شوند."],columns:["کد کالا","کالا","انبار","تعداد","واحد","ارزش موجودی","آخرین گردش شمسی"],rows:d.items.map(r=>[textCell(r.product.code),textCell(r.product.name),textCell(r.warehouse.name),numberCell(quantityText(r.quantity)),textCell(r.product.unit.name),numberCell(r.inventoryValue),textCell(r.lastMovementDate ? jalaliText(r.lastMovementDate) : "—")]),summary:[{label:"ارزش کل موجودی",cell:numberCell(d.totalInventoryValue)},{label:"ردیف کالا و انبار",cell:numberCell(String(d.total))}]};
}
export async function loadOperationalOutput(businessId:string,kind:"sales"|"purchases"|"inventory",filters:ReportFilters,signal:AbortSignal):Promise<ReportOutput> {
  const q = new URLSearchParams();
  if(kind === "inventory") {
    if(filters.warehouseId)q.set("warehouseId",filters.warehouseId);
    return inventoryOutput(await readBusinessReport<InventoryExport>(businessId,"reports/inventory-value/export",q,signal));
  }
  if(filters.fromDate)q.set("fromDate",filters.fromDate);
  if(filters.toDate)q.set("toDate",filters.toDate);
  return kind === "sales" ? dailyOutput(kind,await readBusinessReport<SalesExport>(businessId,"reports/sales/export",q,signal)) : dailyOutput(kind,await readBusinessReport<PurchasesExport>(businessId,"reports/purchases/export",q,signal));
}
export async function loadTradeOutput(businessId:string,kind:"sales"|"purchases",dimension:"party"|"product",filters:{fromDate?:string;toDate?:string;search?:string},signal:AbortSignal):Promise<ReportOutput> {
  const q = new URLSearchParams(filters);
  const d = await readBusinessReport<TradeExport>(businessId,`reports/${kind}/by-${dimension}/export`,q,signal);
  if(d.kind!==kind || d.dimension!==dimension)throw new Error("INCOMPLETE_EXPORT");
  return tradeOutput(d);
}
