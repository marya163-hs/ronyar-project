import type { Business } from "./api";
import { formatStoreMoney } from "./storeMoney";
import { formatQuantity } from "./quantityDisplay";
import { formatDecimal } from "./api";
import { jalaliText } from "./jalaliDate";
import type { OperationalResult } from "./reportContracts";
export const settlementLabel = (status: string) => ({ UNPAID: "تسویه‌نشده", PARTIAL: "تسویه جزئی", PAID: "تسویه کامل", OVERPAID: "دارای اعتبار" } as Record<string, string>)[status] ?? "نامشخص";
type Row = { key: string; cells: string[]; accountId?: string; accountCode?: string };
export type ReportView = { columns: string[]; rows: Row[]; stats: { label: string; value: string }[] };
const n = (v: string | number) => formatDecimal(String(v));
export function operationalReportView(result: OperationalResult,business?:Business): ReportView {
  const d = result.data;
  const m=(v:string)=>formatStoreMoney(business,v);
  switch (result.kind) {
    case "sales": return { columns: ["تاریخ شمسی", "تعداد فروش", "تعداد برگشت", "فروش", "برگشت", "خالص فروش"], stats: [{ label: "جمع فروش", value: m(result.data.totalSales) }, { label: "جمع برگشت", value: m(result.data.totalReturns) }, { label: "خالص فروش", value: m(result.data.netSales) }], rows: result.data.items.map(r => ({ key: r.documentDate, cells: [jalaliText(r.documentDate), n(r.saleCount), n(r.returnCount), m(r.saleAmount), m(r.returnAmount), m(r.netAmount)] })) };
    case "purchases": return { columns: ["تاریخ شمسی", "تعداد خرید", "تعداد برگشت", "خرید", "برگشت", "خالص خرید"], stats: [{ label: "جمع خرید", value: m(result.data.totalPurchases) }, { label: "جمع برگشت", value: m(result.data.totalReturns) }, { label: "خالص خرید", value: m(result.data.netPurchases) }], rows: result.data.items.map(r => ({ key: r.documentDate, cells: [jalaliText(r.documentDate), n(r.purchaseCount), n(r.returnCount), m(r.purchaseAmount), m(r.returnAmount), m(r.netAmount)] })) };
    case "receivables": case "payables": return { columns: ["شماره فاکتور", "تاریخ شمسی", result.kind === "receivables" ? "مشتری" : "تأمین‌کننده", "خالص فاکتور", "تسویه خالص", "مانده", "اعتبار", "وضعیت"], stats: [{ label: "خالص فاکتورها", value: m(result.data.netTotal) }, { label: result.kind === "receivables" ? "مانده قابل دریافت" : "مانده قابل پرداخت", value: m(result.data.remainingAmount) }, { label: result.kind === "receivables" ? "اعتبار مشتریان" : "اعتبار نزد تأمین‌کنندگان", value: m(result.data.creditAmount) }], rows: result.data.items.map(r => ({ key: r.id, cells: [r.number ? n(r.number) : "—", jalaliText(r.documentDate), r.party.name, m(r.netTotal), m(r.netSettledAmount), m(r.remainingAmount), m(r.creditAmount), settlementLabel(r.settlementStatus)] })) };
    case "inventory": return { columns: ["کد کالا", "کالا", "انبار", "تعداد", "واحد", "ارزش موجودی", "آخرین گردش"], stats: [{ label: "ارزش کل موجودی", value: m(result.data.totalInventoryValue) }, { label: "ردیف کالا و انبار", value: n(d.total) }], rows: result.data.items.map(r => ({ key: r.id, cells: [r.product.code, r.product.name, r.warehouse.name, formatQuantity(r.quantity), r.product.unit.name, m(r.inventoryValue), r.lastMovementDate ? jalaliText(r.lastMovementDate) : "—"] })) };
    case "parties": return { columns: ["شخص", "وضعیت شخص", "گردش بدهکار", "گردش بستانکار", "مانده", "ماهیت مانده"], stats: [{ label: "جمع مانده بدهکار", value: m(result.data.totalDebitBalance) }, { label: "جمع مانده بستانکار", value: m(result.data.totalCreditBalance) }, { label: "تعداد اشخاص", value: n(d.total) }], rows: result.data.items.map(r => ({ key: r.party.id, cells: [r.party.name, r.party.isActive ? "فعال" : "غیرفعال", m(r.totalDebit), m(r.totalCredit), m(r.balanceAmount), r.balanceSide === "DEBIT" ? "بدهکار" : r.balanceSide === "CREDIT" ? "بستانکار" : "صفر"] })) };
    case "cash": return { columns: ["حساب", "وضعیت", "افزایش", "کاهش", "مانده"], stats: [{ label: "مجموع مانده", value: m(result.data.totalBalance) }, { label: "جمع افزایش", value: m(result.data.totalDebit) }, { label: "جمع کاهش", value: m(result.data.totalCredit) }], rows: result.data.items.map(r => ({ key: r.account.id, accountId: r.account.id, accountCode: r.account.code, cells: [r.account.name, r.account.isActive ? "فعال" : "غیرفعال", m(r.totalDebit), m(r.totalCredit), m(r.balance)] })) };
  }
}
