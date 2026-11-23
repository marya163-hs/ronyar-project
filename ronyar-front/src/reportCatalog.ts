export type ReportId = "paymentsReport" | "books" | "financial" | "sales" | "purchases" | "receivables" | "payables" | "inventory" | "parties" | "cash";
export const reportCatalog: { id: ReportId; group: string; title: string; description: string; permissions: string[] }[] = [
  { id: "paymentsReport", group: "صندوق و بانک", title: "گزارش دریافت‌ها و پرداخت‌ها", description: "ریز دریافت و پرداخت قطعی به اشخاص با بازه تاریخ و جمع مبالغ", permissions: ["payments.read"] },
  { id: "books", group: "دفاتر حسابداری", title: "دفتر کل و معین", description: "کدینگ حساب‌ها، مانده ابتدا، گردش و مانده پایان", permissions: ["journals.read"] },
  { id: "financial", group: "گزارش‌های مالی", title: "گزارش‌های مالی", description: "تراز آزمایشی، سود و زیان و ترازنامه", permissions: ["journals.read", "periods.read"] },
  { id: "parties", group: "گزارش اشخاص", title: "مانده و صورت‌حساب اشخاص", description: "بدهکاران و بستانکاران از همه ثبت‌های قطعی دفتر", permissions: ["journals.read"] },
  { id: "cash", group: "صندوق و بانک", title: "مانده و گردش صندوق و بانک", description: "مانده و گردش حساب‌های نقد و بانک", permissions: ["journals.read"] },
  { id: "sales", group: "فروش و خرید", title: "گزارش فروش", description: "روزانه، به تفکیک شخص و کالا؛ همراه برگشت و خالص فروش", permissions: ["sales.read"] },
  { id: "purchases", group: "فروش و خرید", title: "گزارش خرید", description: "روزانه، به تفکیک شخص و کالا؛ همراه برگشت و خالص خرید", permissions: ["purchases.read"] },
  { id: "receivables", group: "فروش و خرید", title: "تسویه فاکتورهای فروش", description: "مانده دریافتنی و اعتبار مشتری به تفکیک فاکتور", permissions: ["sales.read"] },
  { id: "payables", group: "فروش و خرید", title: "تسویه فاکتورهای خرید", description: "مانده پرداختنی و اعتبار نزد تأمین‌کننده به تفکیک فاکتور", permissions: ["purchases.read"] },
  { id: "inventory", group: "گزارش موجودی", title: "مقدار و ارزش موجودی", description: "موجودی فعلی به تفکیک کالا و انبار", permissions: ["inventory.read"] },
];
export const reportAllowed = (id: ReportId, can: (code: string) => boolean) => reportCatalog.find(item => item.id === id)?.permissions.every(can) ?? false;
export const canOpenReports = (can: (code: string) => boolean) => reportCatalog.some(item => item.permissions.every(can));
