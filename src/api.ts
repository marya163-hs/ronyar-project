import type { IssueInput, IssueReport, IssueProgress, IssueClaim } from "./issueTypes";
export type BusinessSubscription = {plan:'LEGACY'|'TRIAL'|'FREE'|'MONTHLY'|'YEARLY';expiresAt:string|null;active:boolean;aiDailyLimit:number|null;usedToday:number;remainingToday:number|null;version:number};
import { loginIdentifier } from "./authIdentifier";
export type User = { id: string; displayName: string; email: string | null; phone?: string | null; createdAt?: string; emailVerifiedAt?: string | null; phoneVerifiedAt?: string | null };
export type Business = { id: string; name: string; baseCurrency: string; currencyScale: number; moneyUnit?: "IRR"|"TOMAN"; moneyUnitVersion?: number; trialEndsAt?: string | null; subscription?:BusinessSubscription };
export type Dashboard = { currency: string; date: string; timeZone: string; dailySales: { saleCount: number; returnCount: number; saleAmount: string; returnAmount: string; netAmount: string }; profitToDate: { totalRevenue: string; totalExpense: string; netProfit: string; result: "PROFIT" | "LOSS" | "BREAK_EVEN" }; cashBankBalance: string; partyBalances: { debtorCount: number; creditorCount: number; debtorAmount: string; creditorAmount: string }; inventory: { totalValue: string; activeGoodsCount: number; outOfStockProductCount: number } };
export class ApiError extends Error { constructor(public status: number, public code: string, public serverMessage?: string) { super(code); } }
export const subscriptionExpiredEvent = "ranyar-subscription-expired";
export let lastIssueFailure: {businessId:string;requestId?:string;errorCode?:string;method?:string;at:number}|null=null;
let accessToken: string | null = null;
let refreshFlight: Promise<void> | null = null;
let generation = 0;

type ApiRequestInit = RequestInit & { timeoutMs?: number };

async function raw<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs, signal: callerSignal, ...options } = init;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  const duration = timeoutMs ?? (callerSignal ? undefined : 15000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
    if (!controller.signal.aborted && duration !== undefined) {
      timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), duration);
    }
    const response = await fetch(url, { ...options, headers, credentials: "include", cache: "no-store", signal: controller.signal });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(error => {
      if (controller.signal.aborted) throw controller.signal.reason ?? error;
      return null;
    });
    if (!response.ok) { const code=typeof data?.code === "string" ? data.code : "HTTP_ERROR"; const b=/\/businesses\/([0-9a-f-]{36})(?:\/|$)/i.exec(url)?.[1]; const id=response.headers?.get?.("X-Request-ID"); if(b&&!url.includes('/issues'))lastIssueFailure={businessId:b,requestId:id&&/^[0-9a-f-]{36}$/i.test(id)?id:undefined,errorCode:/^[A-Z0-9_]{1,64}$/.test(code)?code:undefined,method:options.method||"GET",at:Date.now()}; if (b && !callerSignal?.aborted && (code === "SUBSCRIPTION_EXPIRED" || code === "TRIAL_EXPIRED"))
      window.dispatchEvent(new CustomEvent(subscriptionExpiredEvent, { detail: b }));
      throw new ApiError(response.status,code,typeof data?.message==="string"?data.message.slice(0,1000):undefined); }
    return data as T;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

async function refresh(): Promise<void> {
  if (!refreshFlight) { const started = generation; refreshFlight = raw<{ accessToken: string }>("/v2/auth/refresh", { method: "POST", headers: { "X-Mahan-CSRF": "1" } }).then(result => { if (started !== generation) throw new ApiError(401, "UNAUTHORIZED"); accessToken = result.accessToken; }).catch(error => { if (started === generation) accessToken = null; throw error; }).finally(() => { refreshFlight = null; }); }
  return refreshFlight;
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (!accessToken) await refresh();
  try { return await raw<T>(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal }); }
  catch (error) { if (!(error instanceof ApiError) || error.status !== 401 || signal?.aborted) throw error; await refresh(); return raw<T>(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal }); }
}

export async function login(identifier: string, password: string): Promise<User> {
  generation++; accessToken = null; lastIssueFailure=null; const started = generation;
  const result = await raw<{ accessToken: string; user: User }>("/v2/auth/login", { method: "POST", body: JSON.stringify({ ...loginIdentifier(identifier), password }) });
  if (started !== generation) throw new ApiError(401, "UNAUTHORIZED"); accessToken = result.accessToken; return result.user;
}
export async function restoreSession(): Promise<User> { await refresh(); return get<User>("/v2/me"); }
export async function logout(): Promise<void> {
  try { if (!accessToken) await refresh(); await raw<void>("/v2/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }); }
  finally { generation++; accessToken = null; lastIssueFailure=null; }
}
export const renameBusiness = (businessId: string, name: string) =>
  write<Pick<Business, "id" | "name">>(`/v2/businesses/${encodeURIComponent(businessId)}`, "PATCH", { name });
export const listBusinesses = (signal?: AbortSignal) => get<Business[]>("/v2/businesses", signal);
export const getDashboard = (businessId: string, date: string, signal?: AbortSignal) => get<Dashboard>(`/v2/businesses/${encodeURIComponent(businessId)}/dashboard?date=${encodeURIComponent(date)}`, signal);

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if(error.status<500 && /^(RECIPE_|SALE_RECIPE_|SALE_MATERIAL_)/.test(error.code) && /[\u0600-\u06ff]/.test(error.serverMessage??"")) return error.serverMessage!;

    if (error.status === 409 && /^INVOICE_(CORRECTION_|SUPERSEDED$)/.test(error.code) && /[\u0600-\u06ff]/.test(error.serverMessage ?? "")) return error.serverMessage!;

    const masterMessages:Record<string,string>={"PRODUCT_DEACTIVATE_STOCK": "این کالا هنوز موجودی یا ارزش موجودی دارد؛ ابتدا موجودی و اسناد انبار را بررسی کنید. برای حذف مورد تکراری، موجودی را بدون سند صفر نکنید.", "PRODUCT_DEACTIVATE_DRAFTS": "این کالا در پیش‌نویس خرید، فروش، برگشت یا تعدیل انبار استفاده شده است؛ ابتدا آن پیش‌نویس‌ها را اصلاح یا لغو کنید.", "PARTY_DEACTIVATE_CASH": "مشتری نقدی پیش‌فرض فروشگاه باید فعال بماند.", "PARTY_DEACTIVATE_BALANCE": "این طرف حساب مانده تسویه‌نشده دارد؛ ابتدا ریز حساب و تسویه‌های آن را بررسی کنید. برای غیرفعال‌کردن، سند صوری ثبت نکنید.", "PARTY_DEACTIVATE_DRAFTS": "این طرف حساب در سند پیش‌نویس استفاده شده است؛ ابتدا پیش‌نویس‌های خرید، فروش، برگشت یا دریافت و پرداخت را اصلاح یا لغو کنید."};
    if(error.status<500&&masterMessages[error.code])return masterMessages[error.code];
    const chequeMessages:Record<string,string>={CHEQUE_ALLOCATION:"مانده یا وضعیت سند با مبلغ چک سازگار نیست؛ سند و مبلغ را بررسی کنید.",CHEQUE_STATE:"این عملیات با وضعیت فعلی چک سازگار نیست؛ فهرست را تازه کنید.",CHEQUE_VERSION:"وضعیت چک تغییر کرده؛ فرم را ببندید و فهرست را تازه کنید.",CHEQUE_KEY:"شناسه درخواست با اطلاعات قبلی تطابق ندارد؛ نتیجه قبلی را بررسی کنید.",CHEQUE_PERIOD:"تاریخ عملیات باید در یک دوره مالی باز باشد.",CHEQUE_BANK:"حساب معتبر صندوق یا بانک انتخاب کنید.",CHEQUE_ACCOUNT:"حساب اسناد دریافتنی یا پرداختنی نیاز به بررسی تنظیمات دارد.",CHEQUE_DUPLICATE:"این شناسه صیادی یا شماره چک قبلاً ثبت شده است؛ سوابق را بررسی کنید.",CHEQUE_REVERSE:"دریافت یا پرداخت چک در وضعیت فعلی قابل برگشت نیست."};
    if(chequeMessages[error.code])return chequeMessages[error.code];
    const periodEdits:Record<string,string>={PERIOD_EDIT_CLOSED:"ابتدا دوره بسته را از مسیر بازگشایی باز کنید.",PERIOD_EDIT_STALE:"دوره توسط کاربر دیگری تغییر کرده؛ فرم را ببندید و فهرست را تازه کنید.",PERIOD_EDIT_OVERLAP:"بازه دوره با دوره دیگری هم‌پوشانی دارد.",PERIOD_EDIT_DOCUMENTS_OUTSIDE:"با این تغییر، سند یا مغایرت‌گیری خارج از دوره می‌ماند؛ بازه را اصلاح کنید.",PERIOD_EDIT_YEAR_END:"برای این دوره آماده‌سازی پایان سال ثبت شده؛ تغییر بازه مجاز نیست."};
    if(periodEdits[error.code])return periodEdits[error.code];
    if(error.code==='ISSUE_RATE_LIMIT')return 'حداکثر ۱۰ گزارش در ساعت مجاز است؛ بعداً ادامه دهید.';
    if(error.code==='ISSUE_CHALLENGE_CLOSED')return 'بازه پذیرش گزارش چالش تمام شده یا متوقف است. می‌توانید گزارش عادی ارسال کنید.';
    if(error.code==='ISSUE_NOT_ELIGIBLE')return 'هنوز ۱۰ باگ معتبر تأییدشده برای جایزه ندارید؛ وضعیت گزارش‌ها را بررسی کنید.';
    if(error.code==='ISSUE_KEY_CONFLICT')return 'شناسه گزارش با درخواست دیگری تطابق دارد؛ نتیجه قبلی را بررسی کنید.';
    if (error.status === 409 && error.code === "SALE_INSUFFICIENT_STOCK") return "موجودی انبار کافی نیست؛ تعداد یا انبارِ پیش‌نویس را اصلاح کنید و دوباره ثبت کنید. فروش قطعی نشد.";
    if(error.code === "SUBSCRIPTION_EXPIRED") return "اعتبار فروشگاه پایان یافته است؛ گزارش‌ها و داده‌ها محفوظ‌اند. برای تمدید به بخش اشتراک در پروفایل بروید.";
    if(error.code === "ASSISTANT_DAILY_LIMIT") return "سهمیهٔ امروز دستیار تمام شده است؛ کارها را می‌توانید از فرم‌های دستی ادامه دهید.";
    if(error.code === "ASSISTANT_DISABLED") return "دستیار برای این فروشگاه سهمیه ندارد؛ فرم‌های دستی در دسترس‌اند.";
    if(error.code === "TRIAL_EXPIRED") return "دورهٔ آزمایشی فروشگاه پایان یافته است. گزارش‌ها حفظ شده‌اند؛ برای ادامه به بخش اشتراک در پروفایل بروید.";
    if(error.code === "TRIAL_AI_LIMIT") return "سهمیهٔ امروز دستیار در دورهٔ آزمایشی تمام شده است؛ فردا دوباره امتحان کنید. فرم‌های دستی در دسترس‌اند.";
    if (error.code === "AUTH_RATE_LIMIT") return "تعداد تلاش‌ها زیاد است؛ چند دقیقه دیگر دوباره تلاش کنید.";
    if (error.code === "AUTH_SMS_INVALID") return "کد یا تأیید شماره معتبر نیست یا منقضی شده است. دوباره کد بگیرید.";
    if (error.code === "AUTH_SMS_RESET_UNAVAILABLE") return "بازیابی برای این شماره در دسترس نیست. با پشتیبانی تماس بگیرید.";
    if (error.code === "AUTH_BUSY") return "سامانه مشغول است؛ چند لحظه دیگر دوباره تلاش کنید.";
    if (error.status === 401) return "نشست شما پایان یافته؛ دوباره وارد شوید.";
    if (error.status === 403 && error.code === "PERIOD_ACCESS_DENIED") return "اجازه مشاهده دوره‌های مالی این فروشگاه را ندارید؛ با مدیر فروشگاه تماس بگیرید.";
    if (error.status === 403) return "اجازه انجام این کار یا مشاهده این بخش را ندارید؛ با مدیر فروشگاه تماس بگیرید.";
    if (error.status === 404) return "فروشگاه یا اطلاعات موردنظر در دسترس نیست.";
    if (error.status === 429) return "تعداد درخواست‌ها زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.";
    if (error.status === 408) return "پاسخ در مهلت مقرر دریافت نشد؛ پیش از ثبت دوباره، نتیجهٔ عملیات قبلی را بررسی کنید.";
    if (error.status >= 500) return "خطایی در سرور رخ داد. دوباره تلاش کنید.";
    const messages: Record<string, string> = { UNAUTHORIZED: "نشست شما پایان یافته؛ دوباره وارد شوید.", FORBIDDEN: "اجازه انجام این کار یا مشاهده این بخش را ندارید.", NOT_FOUND: "فروشگاه یا اطلاعات موردنظر در دسترس نیست.", VALIDATION_ERROR: "اطلاعات واردشده معتبر نیست.", BAD_REQUEST: "درخواست معتبر نیست.", CONFLICT: "اطلاعات تغییر کرده است؛ دوباره بررسی کنید.", INTERNAL_ERROR: "خطایی در سرور رخ داد. دوباره تلاش کنید." };
    return messages[error.code] ?? "درخواست انجام نشد. دوباره تلاش کنید.";
  }
  return "ارتباط با سرور برقرار نشد. اتصال را بررسی کنید.";
}

export function permissionErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === "SUBSCRIPTION_EXPIRED" || error.code === "TRIAL_EXPIRED") return errorText(error);
    if (error.status === 403) return "دسترسی شما به این فروشگاه مجاز نیست؛ با مدیر فروشگاه تماس بگیرید.";
    if (error.status === 404) return "فروشگاه در دسترس نیست یا عضویت شما فعال نیست؛ فروشگاه دیگری انتخاب کنید یا با مدیر تماس بگیرید.";
    return errorText(error);
  }
  return "دریافت دسترسی‌های فروشگاه ممکن نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.";
}
export function tehranToday(): string { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (type: string) => parts.find(item => item.type === type)!.value; return `${part("year")}-${part("month")}-${part("day")}`; }
export function formatDecimal(value: string): string { const negative = value.startsWith("-"); const clean = negative ? value.slice(1) : value; const [whole, fraction] = clean.split("."); const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "٬"); return ((negative ? "−" : "") + grouped + (fraction ? "٫" + fraction : "")).replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]); }

export type ProductUnit = { id: string; code: string; name: string };
export type ProductCategory = { id: string; name: string; parentId?: string | null };
export type RecipeMaterial = {productId:string;warehouseId:string;quantity:string;consumptionUnit:string;conversionFactor:string;baseQuantity?:string;productName?:string;unitName?:string};
export type ProductRecipe = {revenueKind?:"GOODS"|"SERVICE";version:number;materials:RecipeMaterial[]};
export type Product = { recipe?:ProductRecipe|null; recipeVersion?:number; id: string; code: string; name: string; kind: "GOODS" | "SERVICE"; salePrice: string; barcode: string | null; isActive: boolean; unit: ProductUnit; category: ProductCategory | null };
export type ProductPage = { items: Product[]; page: number; limit: number; total: number; totalPages: number };
export type ProductStatus = "ACTIVE" | "INACTIVE" | "ALL";
export type CreateProductInput = { code?: string; name: string; kind: "GOODS" | "SERVICE"; salePrice: string; unitId: string; categoryId?: string; barcode?: string };
export type UpdateProductInput = { code?: string; name?: string; salePrice?: string; barcode?: string | null; isActive?: boolean };
const catalogPath = (businessId: string) => `/v2/businesses/${encodeURIComponent(businessId)}/catalog`;
export const listProducts = (businessId: string, status: ProductStatus, page: number, signal?: AbortSignal) => get<ProductPage>(`${catalogPath(businessId)}/products?status=${status}&page=${page}&limit=20`, signal);
export const listUnits = (businessId: string, signal?: AbortSignal) => get<ProductUnit[]>(`${catalogPath(businessId)}/units`, signal);
export const listCategories = (businessId: string, signal?: AbortSignal) => get<ProductCategory[]>(`${catalogPath(businessId)}/categories`, signal);

async function write<T>(url: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<T> {
  if (!accessToken) await refresh();
  const send = () => raw<T>(url, { method, headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) });
  try { return await send(); } catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; await refresh(); return send(); }
}
export const getProduct = (businessId: string, productId: string, signal?: AbortSignal) => get<Product>(`${catalogPath(businessId)}/products/${encodeURIComponent(productId)}`, signal);
export const createProduct = (businessId: string, body: CreateProductInput) => write<{ id: string }>(`${catalogPath(businessId)}/products`, "POST", body);
export const updateProduct = (businessId: string, productId: string, body: UpdateProductInput) => write<{ id: string }>(`${catalogPath(businessId)}/products/${encodeURIComponent(productId)}`, "PATCH", body);
export type Party = { mobile?: string | null; id: string; name: string; customerEnabled: boolean; supplierEnabled: boolean; isCashCustomer: boolean; isActive: boolean; externalCode: string | null };
export type PartyRole = "ALL" | "CUSTOMER" | "SUPPLIER";
export type PartyPage = { items: Party[]; page: number; limit: number; total: number; totalPages: number };
export type CreatePartyInput = { mobile?: string; name: string; customerEnabled: boolean; supplierEnabled: boolean; isCashCustomer: boolean; externalCode?: string };
export type UpdatePartyInput = { mobile?: string | null; name?: string; externalCode?: string | null; isActive?: boolean };
export type PartyBalanceRow = { party: Omit<Party, "externalCode">; totalDebit: string; totalCredit: string; balance: string; balanceSide: "ZERO" | "DEBIT" | "CREDIT"; balanceAmount: string };
export type PartyBalancePage = { debtReminderEnabled?: boolean; currency: string; role: "CUSTOMER" | "SUPPLIER" | null; periodId: string | null; asOfDate: string | null; totalDebit: string; totalCredit: string; totalDebitBalance: string; totalCreditBalance: string; netBalance: string; items: PartyBalanceRow[]; page: number; limit: number; total: number; totalPages: number };
const partiesPath = (businessId: string) => `/v2/businesses/${encodeURIComponent(businessId)}/parties`;
export const listParties = (businessId: string, status: ProductStatus, role: PartyRole, page: number, signal?: AbortSignal) => get<PartyPage>(`${partiesPath(businessId)}?status=${status}&page=${page}&limit=20${role === "ALL" ? "" : `&role=${role}`}`, signal);
export const createParty = (businessId: string, body: CreatePartyInput) => write<Party>(partiesPath(businessId), "POST", body);
export const getParty = (businessId: string, partyId: string, signal?: AbortSignal) =>
  get<Party>(`${partiesPath(businessId)}/${encodeURIComponent(partyId)}`, signal);
export const updateParty = (businessId: string, partyId: string, body: UpdatePartyInput) => write<Party>(`${partiesPath(businessId)}/${encodeURIComponent(partyId)}`, "PATCH", body);
export const listPartyBalances = (businessId: string, role: PartyRole, page: number, signal?: AbortSignal) => get<PartyBalancePage>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/party-balances?page=${page}&limit=20${role === "ALL" ? "" : `&role=${role}`}`, signal);

export type SaleStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type SaleSummary = { id: string; status: SaleStatus; number: string | null; documentDate: string; currency: string; total: string; version: number; party: { id: string; name: string } };
export type SalePage = { items: SaleSummary[]; page: number; limit: number; total: number; totalPages: number };
export type SaleItemInput = { productId: string; warehouseId?: string; quantity: string; unitPrice: string; discountAmount: string; taxRate: string };
export type SaleInput = { partyId: string; periodId: string; documentDate: string; notes?: string; items: SaleItemInput[] };
export type SaleItem = { recipeSnapshot?:ProductRecipe|null; materialConsumptions?:{id:string;productName:string;unitName:string;quantity:string;inventoryCost:string}[]; id: string; lineNumber: number; productId: string; warehouseId: string | null; productName: string; unitName: string; quantity: string; unitPrice: string; discountAmount: string; taxRate: string; taxAmount: string; lineTotal: string; inventoryCost: string };
export type InvoiceLink = { id: string; number: string | null };
export type SaleDetails = { correctionCustomerLocked?: boolean; correctionSource?: InvoiceLink | null; correctionResult?: InvoiceLink | null; id: string; status: SaleStatus; number: string | null; documentDate: string; currency: string; partyId: string; periodId: string; notes: string | null; version: number; journalEntryId: string | null; subtotal: string; discountTotal: string; taxTotal: string; roundingAmount: string; total: string; items: SaleItem[] };
export type FiscalPeriod = { id: string; name: string; startDate: string; endDate: string; status: "OPEN" | "CLOSED" };
const salesPath = (businessId: string) => `/v2/businesses/${encodeURIComponent(businessId)}/sales`;
export const listSales = (businessId: string, status: SaleStatus | "ALL", page: number, signal?: AbortSignal) => get<SalePage>(`${salesPath(businessId)}?page=${page}&limit=20${status === "ALL" ? "" : `&status=${status}`}`, signal);
export const getSale = (businessId: string, saleId: string, signal?: AbortSignal) => get<SaleDetails>(`${salesPath(businessId)}/${encodeURIComponent(saleId)}`, signal);
export const createSale = (businessId: string, body: SaleInput) => write<SaleDetails>(salesPath(businessId), "POST", body);
export const updateSale = (businessId: string, saleId: string, body: SaleInput & { version: number }) => write<SaleDetails>(`${salesPath(businessId)}/${encodeURIComponent(saleId)}`, "PUT", body);
export const cancelSale = (businessId: string, saleId: string, version: number, reason: string) => write<{ id: string; status: SaleStatus; version: number }>(`${salesPath(businessId)}/${encodeURIComponent(saleId)}/cancel`, "POST", { version, reason });
export const listFiscalPeriods = async (businessId: string, signal?: AbortSignal) => {
  try { return await get<FiscalPeriod[]>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods`, signal); }
  catch (error) {
    if (error instanceof ApiError && error.status === 403) throw new ApiError(403, "PERIOD_ACCESS_DENIED");
    throw error;
  }
};

export type Warehouse = { id: string; code: string; name: string; isActive: boolean; isDefault: boolean };
export const listActiveWarehouses = (businessId: string, signal?: AbortSignal) => get<Warehouse[]>(`/v2/businesses/${encodeURIComponent(businessId)}/inventory/warehouses?status=ACTIVE`, signal);

export type SalePostingResult = { id: string; status: "POSTED"; version: number; number: string; journalEntryId: string; entryNumber: string; documentDate: string; total: string; goodsRevenue: string; serviceRevenue: string; taxTotal: string; inventoryCost: string };
export async function postSale(businessId: string, saleId: string, version: number, key: string): Promise<SalePostingResult> {
  if (!accessToken) await refresh();
  const send = () => raw<SalePostingResult>(`${salesPath(businessId)}/${encodeURIComponent(saleId)}/post`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify({ version }), timeoutMs:40000 });
  try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}

export type InvoiceCorrectionResult = { id: string; number: string; replacesId: string; reversalJournalId: string };
export async function correctInvoice(businessId: string, kind: "sales" | "purchases", id: string, body: SaleInput & { version: number; reason: string }, key: string) {
  if (!accessToken) await refresh();
  const send = () => raw<InvoiceCorrectionResult>(`/v2/businesses/${encodeURIComponent(businessId)}/${kind}/${encodeURIComponent(id)}/correct`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify(body), timeoutMs: 40000,
  });
  try { return await send(); }
  catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}

export type SaleSettlement = { id: string; number: string | null; documentDate: string; currency: string; party: { id: string; name: string }; total: string; returnedAmount: string; netTotal: string; settledAmount: string; refundedAmount: string; netSettledAmount: string; remainingAmount: string; creditAmount: string; settlementStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID" };
export type Account = { id: string; code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"; normalSide: "DEBIT" | "CREDIT"; isPosting: boolean; isCashBank: boolean; isActive: boolean; parentId: string | null };
export type PaymentAllocation = { targetType: "SALE" | "PURCHASE" | "SALE_RETURN" | "PURCHASE_RETURN" | "OPENING_RECEIVABLE" | "OPENING_PAYABLE"; targetId: string; targetNumber?: string | null; amount: string };
export type PaymentInput = { direction: "RECEIPT" | "DISBURSEMENT"; partyId: string; periodId: string; cashBankAccountId: string; documentDate: string; amount: string; notes?: string; externalReference?: string; allocations: PaymentAllocation[] };
export type PaymentDetails = { id: string; status: SaleStatus | "REVERSED"; version: number; number: string | null; direction: "RECEIPT" | "DISBURSEMENT"; documentDate: string; currency: string; amount: string; partyId: string; party?: { id: string; name: string }; periodId: string; cashBankAccountId: string; journalEntryId: string | null; notes: string | null; externalReference: string | null; allocations: PaymentAllocation[] };
export type PaymentPostingResult = { id: string; status: "POSTED"; version: number; number: string; direction: "RECEIPT" | "DISBURSEMENT"; journalEntryId: string; entryNumber: string; documentDate: string; currency: string; amount: string; partyId: string; cashBankAccountId: string; allocations: PaymentAllocation[] };
const paymentsPath = (businessId: string) => `/v2/businesses/${encodeURIComponent(businessId)}/payments`;
export const getSaleSettlement = (businessId: string, saleId: string, signal?: AbortSignal) => get<SaleSettlement>(`${salesPath(businessId)}/${encodeURIComponent(saleId)}/settlement`, signal);
export const listActiveAccounts = (businessId: string, signal?: AbortSignal) => get<Account[]>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/accounts?status=ACTIVE`, signal);
export const createPayment = (businessId: string, body: PaymentInput) => write<PaymentDetails>(paymentsPath(businessId), "POST", body);
export const getPayment = (businessId: string, paymentId: string, signal?: AbortSignal) => get<PaymentDetails>(`${paymentsPath(businessId)}/${encodeURIComponent(paymentId)}`, signal);
export async function postPayment(businessId: string, paymentId: string, version: number, key: string): Promise<PaymentPostingResult> {
  if (!accessToken) await refresh();
  const send = () => raw<PaymentPostingResult>(`${paymentsPath(businessId)}/${encodeURIComponent(paymentId)}/post`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify({ version }), timeoutMs:40000 });
  try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}

export type PaymentSummary = Omit<PaymentDetails, "notes" | "externalReference" | "allocations">;
export type PaymentPage = { items: PaymentSummary[]; page: number; limit: number; total: number; totalPages: number };
/** Server-paginated payment register; filters are enforced by payments.read on the backend. */
export const listPayments = (businessId: string, direction: "RECEIPT" | "DISBURSEMENT" | "ALL", status: SaleStatus | "ALL", page: number, signal?: AbortSignal) =>
  get<PaymentPage>(`${paymentsPath(businessId)}?page=${page}&limit=20${direction === "ALL" ? "" : `&direction=${direction}`}${status === "ALL" ? "" : `&status=${status}`}`, signal);
export const listReceiptPayments = (businessId: string, page: number, status: SaleStatus | "ALL" = "ALL", signal?: AbortSignal) => get<PaymentPage>(`${paymentsPath(businessId)}?direction=RECEIPT&page=${page}&limit=100${status === "ALL" ? "" : `&status=${status}`}`, signal);
export const cancelPayment = (businessId: string, paymentId: string, version: number, reason: string) => write<{ id: string; status: SaleStatus; version: number }>(`${paymentsPath(businessId)}/${encodeURIComponent(paymentId)}/cancel`, "POST", { version, reason });


export type PurchaseStatus = SaleStatus;
export type PurchaseSummary = SaleSummary;
export type PurchasePage = SalePage;
export type PurchaseItemInput = SaleItemInput;
export type PurchaseInput = SaleInput;
export type PurchaseDetails = SaleDetails;
const purchasesPath = (businessId: string) => `/v2/businesses/${businessId}/purchases`;
export const listPurchases = (businessId: string, status: PurchaseStatus | "ALL", page: number, signal?: AbortSignal) => get<PurchasePage>(`${purchasesPath(businessId)}?page=${page}&limit=20${status === "ALL" ? "" : `&status=${status}`}`, signal);
export const getPurchase = (businessId: string, purchaseId: string, signal?: AbortSignal) => get<PurchaseDetails>(`${purchasesPath(businessId)}/${purchaseId}`, signal);
export const createPurchase = (businessId: string, body: PurchaseInput) => write<PurchaseDetails>(purchasesPath(businessId), "POST", body);
export const updatePurchase = (businessId: string, purchaseId: string, body: PurchaseInput & { version: number }) => write<PurchaseDetails>(`${purchasesPath(businessId)}/${purchaseId}`, "PUT", body);
export const cancelPurchase = (businessId: string, purchaseId: string, body: { version: number; reason: string }) => write<{ id: string; status: PurchaseStatus; version: number }>(`${purchasesPath(businessId)}/${purchaseId}/cancel`, "POST", body);


export type PurchasePostingResult = { id: string; status: "POSTED"; version: number; number: string; journalEntryId: string; entryNumber: string; documentDate: string; total: string; inventoryValue: string; serviceExpense: string; taxTotal: string };
export async function postPurchase(businessId: string, purchaseId: string, version: number, key: string): Promise<PurchasePostingResult> {
  if (!accessToken) await refresh();
  const send = () => raw<PurchasePostingResult>(`${purchasesPath(businessId)}/${purchaseId}/post`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify({ version }), timeoutMs:40000 });
  try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}


export type PurchaseSettlement = SaleSettlement;
export const getPurchaseSettlement = (businessId: string, purchaseId: string, signal?: AbortSignal) => get<PurchaseSettlement>(`${purchasesPath(businessId)}/${purchaseId}/settlement`, signal);
export const listDisbursementPayments = (businessId: string, page: number, status: SaleStatus | "ALL" = "ALL", signal?: AbortSignal) => get<PaymentPage>(`/v2/businesses/${businessId}/payments?page=${page}&limit=100&direction=DISBURSEMENT${status === "ALL" ? "" : `&status=${status}`}`, signal);


export type StockProduct = { id: string; code: string; name: string; unit: ProductUnit };
export type StockBalanceRow = { id: string; quantity: string; inventoryValue: string; lastMovementDate: string | null; version: number; product: StockProduct & { isActive: boolean } };
export type StockMovementRow = { id: string; occurredOn: string; createdAt: string; quantityDelta: string; valueDelta: string; product: StockProduct; source: { type: "SALE" | "PURCHASE" | "SALE_RETURN" | "PURCHASE_RETURN" | "STOCK_ADJUSTMENT"; itemId: string | null } };
export type StockBalancePage = { items: StockBalanceRow[]; page: number; limit: number; total: number; totalPages: number };
export type StockMovementPage = { items: StockMovementRow[]; page: number; limit: number; total: number; totalPages: number };
const warehouseStockPath = (businessId: string, warehouseId: string) => `/v2/businesses/${businessId}/inventory/warehouses/${warehouseId}`;
export const listStockBalances = (businessId: string, warehouseId: string, page: number, productId = "", signal?: AbortSignal) => get<StockBalancePage>(`${warehouseStockPath(businessId, warehouseId)}/balances?page=${page}&limit=20${productId ? `&productId=${encodeURIComponent(productId)}` : ""}`, signal);
export const listStockMovements = (businessId: string, warehouseId: string, page: number, productId = "", signal?: AbortSignal) => get<StockMovementPage>(`${warehouseStockPath(businessId, warehouseId)}/movements?page=${page}&limit=20${productId ? `&productId=${encodeURIComponent(productId)}` : ""}`, signal);


export type SaleReturnInput = { originalId: string; periodId: string; documentDate: string; reason: string; items: { originalItemId: string; quantity: string }[] };
export type SaleReturnSummary = Omit<SaleSummary, "party"> & { originalId: string; partyId: string; periodId: string; reason: string; journalEntryId: string | null };
export type SaleReturnDetails = Omit<SaleDetails, "notes" | "items"> & { originalId: string; reason: string; items: (SaleDetails["items"][number] & { originalItemId: string })[] };
export type SaleReturnPage = { items: SaleReturnSummary[]; page: number; limit: number; total: number; totalPages: number };
const saleReturnsPath = (businessId: string) => `/v2/businesses/${businessId}/sale-returns`;
export const listSaleReturns = (businessId: string, status: SaleStatus | "ALL", page: number, signal?: AbortSignal) => get<SaleReturnPage>(`${saleReturnsPath(businessId)}?page=${page}&limit=20${status === "ALL" ? "" : `&status=${status}`}`, signal);
export const getSaleReturn = (businessId: string, returnId: string, signal?: AbortSignal) => get<SaleReturnDetails>(`${saleReturnsPath(businessId)}/${returnId}`, signal);
export const createSaleReturn = (businessId: string, body: SaleReturnInput) => write<SaleReturnDetails>(saleReturnsPath(businessId), "POST", body);
export const updateSaleReturn = (businessId: string, returnId: string, body: SaleReturnInput & { version: number }) => write<SaleReturnDetails>(`${saleReturnsPath(businessId)}/${returnId}`, "PATCH", body);
export const cancelSaleReturn = (businessId: string, returnId: string, body: { version: number; reason: string }) => write<{ id: string; status: SaleStatus; version: number }>(`${saleReturnsPath(businessId)}/${returnId}/cancel`, "POST", body);


export type SaleReturnPostingResult = { id: string; originalId: string; status: "POSTED"; version: number; number: string; journalEntryId: string; entryNumber: string; documentDate: string; total: string; goodsRevenueReversed: string; serviceRevenueReversed: string; taxTotal: string; inventoryCost: string };
export async function postSaleReturn(businessId: string, returnId: string, version: number, key: string): Promise<SaleReturnPostingResult> {
  if (!accessToken) await refresh();
  const send = () => raw<SaleReturnPostingResult>(`${saleReturnsPath(businessId)}/${returnId}/post`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify({ version }), timeoutMs:40000 });
  try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}


export type PurchaseReturnInput = SaleReturnInput;
export type PurchaseReturnSummary = SaleReturnSummary;
export type PurchaseReturnDetails = SaleReturnDetails;
export type PurchaseReturnPage = { items: PurchaseReturnSummary[]; page: number; limit: number; total: number; totalPages: number };
const purchaseReturnsPath = (businessId: string) => `/v2/businesses/${businessId}/purchase-returns`;
export const listPurchaseReturns = (businessId: string, status: SaleStatus | "ALL", page: number, signal?: AbortSignal) => get<PurchaseReturnPage>(`${purchaseReturnsPath(businessId)}?page=${page}&limit=20${status === "ALL" ? "" : `&status=${status}`}`, signal);
export const getPurchaseReturn = (businessId: string, returnId: string, signal?: AbortSignal) => get<PurchaseReturnDetails>(`${purchaseReturnsPath(businessId)}/${returnId}`, signal);
export const createPurchaseReturn = (businessId: string, body: PurchaseReturnInput) => write<PurchaseReturnDetails>(purchaseReturnsPath(businessId), "POST", body);
export const updatePurchaseReturn = (businessId: string, returnId: string, body: PurchaseReturnInput & { version: number }) => write<PurchaseReturnDetails>(`${purchaseReturnsPath(businessId)}/${returnId}`, "PATCH", body);
export const cancelPurchaseReturn = (businessId: string, returnId: string, body: { version: number; reason: string }) => write<{ id: string; status: SaleStatus; version: number }>(`${purchaseReturnsPath(businessId)}/${returnId}/cancel`, "POST", body);


export type PurchaseReturnPostingResult = { id: string; originalId: string; status: "POSTED"; version: number; number: string; journalEntryId: string; entryNumber: string; documentDate: string; total: string; inventoryValueReversed: string; serviceExpenseReversed: string; taxTotal: string; inventoryCost: string };
export async function postPurchaseReturn(businessId: string, returnId: string, version: number, key: string): Promise<PurchaseReturnPostingResult> {
  if (!accessToken) await refresh();
  const send = () => raw<PurchaseReturnPostingResult>(`${purchaseReturnsPath(businessId)}/${returnId}/post`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify({ version }), timeoutMs:40000 });
  try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}

export type CashBalanceRow = { account: Pick<Account, "id" | "code" | "name" | "type" | "normalSide" | "isActive" | "isPosting">; totalDebit: string; totalCredit: string; balance: string; balanceSide: "ZERO" | "DEBIT" | "CREDIT"; balanceAmount: string };
export type CashBalancePage = { currency: string; periodId: string | null; asOfDate: string | null; totalDebit: string; totalCredit: string; totalBalance: string; items: CashBalanceRow[]; page: number; limit: number; total: number; totalPages: number };
export const listCashBalances = (businessId: string, page: number, periodId = "", signal?: AbortSignal) => get<CashBalancePage>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/cash-balances?page=${page}&limit=20${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}`, signal);

export type CashExpenseInput = { periodId: string; expenseAccountId: string; cashBankAccountId: string; documentDate: string; amount: string; description: string };
export type CashTransferInput = { periodId: string; sourceAccountId: string; destinationAccountId: string; documentDate: string; amount: string; description: string };
export type CashOperationResult = { id: string; journalEntryId: string; entryNumber: string; status: "POSTED"; version: number; documentDate: string; periodId: string; currency: string; amount: string; description: string };
async function postCashOperation(businessId: string, path: "expenses" | "cash-transfers", body: CashExpenseInput | CashTransferInput, key: string): Promise<CashOperationResult> { if (!accessToken) await refresh(); const send = () => raw<CashOperationResult>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/${path}`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify(body), timeoutMs:40000 }); try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); } }
export const postCashExpense = (businessId: string, body: CashExpenseInput, key: string) => postCashOperation(businessId, "expenses", body, key);
export const postCashTransfer = (businessId: string, body: CashTransferInput, key: string) => postCashOperation(businessId, "cash-transfers", body, key);

export type LedgerAccount = Pick<Account, "id" | "code" | "name" | "type" | "normalSide" | "isPosting" | "isActive">;
export type AccountLedgerRow = { id: string; lineNumber: number; debit: string; credit: string; description: string | null; party: { id: string; name: string } | null; entry: { id: string; entryNumber: string | null; documentDate: string; description: string; periodId: string } };
export type AccountLedgerPage = { account: LedgerAccount; currency: string; periodId: string | null; totalDebit: string; totalCredit: string; balance: string; balanceSide: "ZERO" | "DEBIT" | "CREDIT"; balanceAmount: string; items: AccountLedgerRow[]; page: number; limit: number; total: number; totalPages: number };
export type ManualJournalInput = { periodId: string; documentDate: string; description: string; lines: {accountId:string;debit:string;credit:string}[] };
export type ManualJournalResult = {id:string;entryNumber:string;documentDate:string;periodId:string;totalDebit:string;totalCredit:string};
export async function postManualJournal(businessId:string, body:ManualJournalInput, key:string) {
  if (!accessToken) await refresh();
  const send = () => raw<ManualJournalResult>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/journals/manual`, {
    method:"POST", headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key}, body:JSON.stringify(body), timeoutMs:40000,
  });
  try { return await send(); }
  catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); }
}

export type JournalKind = "NORMAL" | "YEAR_END_RESULT" | "YEAR_END_CLOSE" | "YEAR_START_OPENING";
export type JournalDetails = { kind: JournalKind; id: string; entryNumber: string | null; documentDate: string; status: "POSTED"; description: string; version: number; periodId: string; reversalOfId: string | null; cashOperationKind: "EXPENSE" | "TRANSFER" | null; reversalEntry: { id: string; entryNumber: string | null } | null; postedAt: string | null; createdAt: string; currency: string; totalDebit: string; totalCredit: string; isBalanced: boolean; lines: { id: string; lineNumber: number; debit: string; credit: string; description: string | null; account: Pick<Account, "id" | "code" | "name" | "type" | "normalSide">; party: { id: string; name: string } | null }[] };
export const listAccountLedger = (businessId: string, accountId: string, page: number, periodId = "", signal?: AbortSignal) => get<AccountLedgerPage>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/accounts/${encodeURIComponent(accountId)}/ledger?page=${page}&limit=20${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}`, signal);
export type JournalListRow = { manual?: boolean; kind: JournalKind; id: string; entryNumber: string | null; documentDate: string; status: "POSTED"; description: string; periodId: string; postedAt: string | null; createdAt: string; currency: string; totalDebit: string; totalCredit: string; lineCount: number };
export type JournalListPage = { items: JournalListRow[]; page: number; limit: number; total: number; totalPages: number };
export const listJournals = (businessId: string, page: number, periodId = "", signal?: AbortSignal) => get<JournalListPage>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/journals?page=${page}&limit=20${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}`, signal);
export const getJournal = (businessId: string, entryId: string, signal?: AbortSignal) => get<JournalDetails>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/journals/${encodeURIComponent(entryId)}`, signal);

export type CashReversalInput = { periodId: string; documentDate: string; reason: string };
export type CashReversalResult = { id: string; journalEntryId: string; reversalOfId: string; entryNumber: string; status: "POSTED"; version: number; documentDate: string; periodId: string; currency: string; amount: string; reason: string };
export async function reverseCashOperation(businessId: string, entryId: string, body: CashReversalInput, key: string): Promise<CashReversalResult> { if (!accessToken) await refresh(); const send = () => raw<CashReversalResult>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/cash-operations/${encodeURIComponent(entryId)}/reverse`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key }, body: JSON.stringify(body), timeoutMs:40000 }); try { return await send(); } catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 401) throw cause; await refresh(); return send(); } }

export type OpeningKind = "CASH_BANK" | "RECEIVABLE" | "PAYABLE";
export type OpeningInput = { kind: OpeningKind; accountId: string; partyId?: string; periodId: string; documentDate: string; amount: string; description: string };
export type OpeningBalance = OpeningInput & { id: string; status: SaleStatus; version: number; currency: string; journalEntryId: string | null; entryNumber: string | null; settledAmount: string; remainingAmount: string; reversed: boolean; party: {id:string;name:string} | null; account: {id:string;name:string} };
const openingPath = (b:string) => `/v2/businesses/${encodeURIComponent(b)}/accounting/opening-balances`;
export const listOpeningBalances = (b:string,signal?:AbortSignal) => get<OpeningBalance[]>(openingPath(b),signal);
export async function openingCommand(b:string,path:string,body:unknown,key?:string,method="POST"):Promise<OpeningBalance> {
 if(!accessToken) await refresh();
 const send=()=>raw<OpeningBalance>(openingPath(b)+path,{method,headers:{Authorization:`Bearer ${accessToken}`,...(key?{"Idempotency-Key":key}:{})},body:JSON.stringify(body),timeoutMs:40000});
 try{return await send();}catch(cause){if(!(cause instanceof ApiError)||cause.status!==401) throw cause;await refresh();return send();}
}

export async function createOpeningPayment(b:string,body:PaymentInput,key:string):Promise<PaymentDetails>{
 if(!accessToken)await refresh();const send=()=>raw<PaymentDetails>(paymentsPath(b),{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key},body:JSON.stringify(body),timeoutMs:40000});
 try{return await send();}catch(cause){if(!(cause instanceof ApiError)||cause.status!==401)throw cause;await refresh();return send();}
}

export type CashBankAccountInput = { code: string; name: string; type: "ASSET"; normalSide: "DEBIT"; isPosting: true; isCashBank: true };
export async function createCashBankAccount(businessId: string, body: CashBankAccountInput): Promise<Account> {
 const path=`/v2/businesses/${encodeURIComponent(businessId)}/accounting/accounts`;
 const find=async()=>{const rows=await get<Account[]>(`${path}?status=ALL&code=${encodeURIComponent(body.code)}`);const account=rows.find(row=>row.code===body.code);if(account && (account.name!==body.name || !account.isCashBank || !account.isPosting || account.type!=="ASSET" || account.normalSide!=="DEBIT" || !account.isActive || account.parentId)) throw new ApiError(409,"CONFLICT");return account;};
 const existing=await find();if(existing)return existing;
 try{return await write<Account>(path,"POST",body);}catch(cause){if(cause instanceof ApiError&&cause.status===409){const account=await find();if(account)return account;}throw cause;}
}

export type BaseAccountInput = {code:string;name:string;type:Account["type"];normalSide:Account["normalSide"];isPosting:boolean;isCashBank:boolean;parentId?:string};
export const listBaseAccounts=(b:string,signal?:AbortSignal)=>get<Account[]>(`/v2/businesses/${encodeURIComponent(b)}/accounting/accounts?status=ALL`,signal);
export async function createBaseAccount(b:string,body:BaseAccountInput):Promise<Account>{
 const path=`/v2/businesses/${encodeURIComponent(b)}/accounting/accounts`;
 const find=async()=>{const rows=await get<Account[]>(`${path}?status=ALL&code=${encodeURIComponent(body.code)}`);const row=rows.find(a=>a.code===body.code);if(row&&(row.name!==body.name||row.type!==body.type||row.normalSide!==body.normalSide||row.isPosting!==body.isPosting||row.isCashBank!==body.isCashBank||row.parentId!==(body.parentId??null)))throw new ApiError(409,"CONFLICT");return row;};
 const existing=await find();if(existing)return existing;try{return await write<Account>(path,"POST",body);}catch(c){if(c instanceof ApiError&&c.status===409){const row=await find();if(row)return row;}throw c;}
}
export const updateBaseAccount=(b:string,id:string,body:{name:string;isActive:boolean})=>write<Account>(`/v2/businesses/${encodeURIComponent(b)}/accounting/accounts/${encodeURIComponent(id)}`,"PATCH",body);
export type PostingKey="RECEIVABLE"|"PAYABLE"|"SALES_REVENUE"|"SERVICE_REVENUE"|"INVENTORY"|"COST_OF_GOODS"|"SERVICE_EXPENSE"|"TAX_PAYABLE"|"TAX_RECOVERABLE"|"ROUNDING"|"INVENTORY_ADJUSTMENT"|"OPENING_EQUITY";
export type PostingMapping={id:string;key:PostingKey;account:Pick<Account,"id"|"code"|"name"|"type"|"normalSide"|"isActive"|"isPosting">};
export const listPostingMappings=(b:string,signal?:AbortSignal)=>get<PostingMapping[]>(`/v2/businesses/${encodeURIComponent(b)}/accounting/posting-accounts`,signal);
export const setPostingMapping=(b:string,key:PostingKey,accountId:string)=>write(`/v2/businesses/${encodeURIComponent(b)}/accounting/posting-accounts`,"PUT",{key,accountId});
export const createBaseUnit=(b:string,body:{code:string;name:string})=>write<ProductUnit>(`${catalogPath(b)}/units`,"POST",body);
export const createBaseCategory=(b:string,body:{name:string;parentId?:string})=>write<ProductCategory>(`${catalogPath(b)}/categories`,"POST",body);
export const updateBaseUnit=(b:string,id:string,body:{name:string;code:string})=>write<ProductUnit>(`${catalogPath(b)}/units/${encodeURIComponent(id)}`,"PATCH",body);
export const updateBaseCategory=(b:string,id:string,body:{name:string;parentId:string|null})=>write<ProductCategory>(`${catalogPath(b)}/categories/${encodeURIComponent(id)}`,"PATCH",body);
export const listBaseWarehouses=(b:string,signal?:AbortSignal)=>get<Warehouse[]>(`/v2/businesses/${encodeURIComponent(b)}/inventory/warehouses?status=ALL`,signal);
export const createBaseWarehouse=(b:string,body:{code:string;name:string})=>write<Warehouse>(`/v2/businesses/${encodeURIComponent(b)}/inventory/warehouses`,"POST",body);
export const updateBaseWarehouse=(b:string,id:string,body:{name?:string;isActive?:boolean;isDefault?:boolean})=>write<Warehouse>(`/v2/businesses/${encodeURIComponent(b)}/inventory/warehouses/${encodeURIComponent(id)}`,"PATCH",body);
export const createBasePeriod=(b:string,body:{name:string;startDate:string;endDate:string})=>write<FiscalPeriod>(`/v2/businesses/${encodeURIComponent(b)}/accounting/periods`,"POST",body);
export const closeBasePeriod=(b:string,id:string)=>write<FiscalPeriod>(`/v2/businesses/${encodeURIComponent(b)}/accounting/periods/${encodeURIComponent(id)}/close`,"POST",{});

export const setupDefaultPostingAccounts=(b:string)=>write<{created:PostingKey[];preserved:PostingKey[]}>(`/v2/businesses/${encodeURIComponent(b)}/accounting/posting-accounts/setup-defaults`,"POST",{});

export type StoreSetupStatus={canManage:boolean;basicsReady:boolean;completed:boolean;hasPeriod:boolean};
export const getStoreSetup=(b:string,signal?:AbortSignal)=>get<StoreSetupStatus>(`/v2/businesses/${encodeURIComponent(b)}/accounting/onboarding`,signal);
export const prepareStore=(b:string,cashName:string,warehouseName:string)=>write<StoreSetupStatus>(`/v2/businesses/${encodeURIComponent(b)}/accounting/onboarding/basics`,"POST",{cashName,warehouseName});
export const finishStoreSetup=(b:string)=>write<StoreSetupStatus>(`/v2/businesses/${encodeURIComponent(b)}/accounting/onboarding/complete`,"POST",{});

/** Safe period lock operations (Rev7.3). Closing a period does NOT perform a year-end close. */
export type FiscalPeriodLockPreview = { periodId: string; draftCount: number; canLock: boolean; blockers: string[]; endDate: string; warning: string };
export const getFiscalPeriodLockPreview = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<FiscalPeriodLockPreview>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/lock-preview`, signal);
export const lockFiscalPeriodSafely = (businessId: string, periodId: string, name: string, reason: string) =>
  write<FiscalPeriod>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/close`, "POST", { action: "LOCK_PERIOD", confirmName: name, reason });
export const reopenFiscalPeriod = (businessId: string, periodId: string, name: string, reason: string) =>
  write<FiscalPeriod>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/reopen`, "POST", { action: "REOPEN_PERIOD", confirmName: name, reason });

// Rev8.1 - read-only accounting reports. Money always remains a decimal string from the API.
export type FinancialReportAccount = { id: string; code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"; normalSide: string; isActive: boolean };
export type FinancialReportPage<Row> = { currency: string; periodId: string | null; items: Row[]; page: number; limit: number; total: number; totalPages: number };
export type TrialBalanceRow = { account: FinancialReportAccount; totalDebit: string; totalCredit: string; debitBalance: string; creditBalance: string };
export type TrialBalanceReport = FinancialReportPage<TrialBalanceRow> & { totalDebit: string; totalCredit: string; totalDebitBalance: string; totalCreditBalance: string; isBalanced: boolean };
export type ProfitLossRow = { account: FinancialReportAccount; totalDebit: string; totalCredit: string; amount: string };
export type ProfitLossReport = FinancialReportPage<ProfitLossRow> & { totalRevenue: string; totalExpense: string; netProfit: string; result: "PROFIT" | "LOSS" | "BREAK_EVEN" };
export type BalanceSheetRow = { account: FinancialReportAccount; totalDebit: string; totalCredit: string; amount: string };
export type BalanceSheetReport = FinancialReportPage<BalanceSheetRow> & { asOfDate: string | null; totalAssets: string; totalLiabilities: string; recordedEquity: string; retainedEarnings: string; totalEquity: string; totalLiabilitiesAndEquity: string; difference: string; isBalanced: boolean };
const financialReportUrl = (businessId: string, kind: "trial-balance" | "profit-loss" | "balance-sheet", periodId: string, page: number) =>
  `/v2/businesses/${encodeURIComponent(businessId)}/accounting/${kind}?page=${page}&limit=20${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}`;
export const getTrialBalance = (businessId: string, periodId: string, page: number, signal?: AbortSignal) =>
  get<TrialBalanceReport>(financialReportUrl(businessId, "trial-balance", periodId, page), signal);
export const getProfitLoss = (businessId: string, periodId: string, page: number, signal?: AbortSignal) =>
  get<ProfitLossReport>(financialReportUrl(businessId, "profit-loss", periodId, page), signal);
export const getBalanceSheet = (businessId: string, periodId: string, page: number, signal?: AbortSignal) =>
  get<BalanceSheetReport>(financialReportUrl(businessId, "balance-sheet", periodId, page), signal);

// Rev8.3a — a read-only readiness report, NOT a command to close the year.
export type YearEndReadinessReport = {
  mode: "READ_ONLY_PRECHECK"; canFinalize: false; currency: string; checkedAt: string;
  period: FiscalPeriod; nextPeriod: FiscalPeriod | null;
  drafts: { sale: number; purchase: number; saleReturn: number; purchaseReturn: number; payment: number; stockAdjustment: number; journal: number; opening: number; total: number };
  journal: { totalDebit: string; totalCredit: string; balanced: boolean; totalRevenue: string; totalExpense: string; netProfit: string };
  blockers: { code: string; message: string }[]; warnings: { code: string; message: string }[];
};
export const getYearEndReadiness = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<YearEndReadinessReport>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/preflight`, signal);


// Rev8.3b — hypothetical closing entries and *virtual* opening balances. No database writes.
export type YearEndProjectionLine = {
  accountId: string | null; accountCode: string | null; accountName: string;
  side: "DEBIT" | "CREDIT"; amount: string;
  category: "TEMPORARY_CLOSE" | "VIRTUAL_RESULT_TRANSFER";
};
export type YearEndCarryRow = {
  accountId: string | null; code: string | null; name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY"; side: "DEBIT" | "CREDIT";
  amount: string; virtual: boolean;
};
export type YearEndProjectionReport = {
  mode: "SIMULATION_ONLY"; canFinalize: false; checkedAt: string; currency: string;
  period: FiscalPeriod;
  proposal: {
    totalRevenue: string; totalExpense: string; netProfit: string;
    closingLines: YearEndProjectionLine[]; totalDebit: string; totalCredit: string;
    isBalanced: boolean; destinationAccountSelected: false;
  };
  openingView: {
    type: "VIRTUAL_CONTINUOUS_LEDGER"; asOfDate: string;
    items: YearEndCarryRow[]; totalDebit: string; totalCredit: string;
    isBalanced: boolean; historicalUnclosedResult: string; currencyScale: number;
  };
  warnings: { code: string; message: string }[];
};
export const getYearEndProjection = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<YearEndProjectionReport>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/projection`, signal);


// Rev8.3c — persists review snapshots only. No posting, approval or period closure.
export type YearEndPreparation = {
  id: string; periodId: string; status: "BLOCKED" | "REVIEW_REQUIRED";
  createdAt: string; snapshotHash: string; reason: string;
  blockers: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  facts: { mode: "PREPARATION_ONLY"; canFinalize: false; date: string;
    nextPeriodId: string | null; journalCount: number; revenue: string; expense: string; profit: string;
    isJournalBalanced: boolean; closingDebit: string; closingCredit: string; openingDebit: string; openingCredit: string };
  mode: "PREPARATION_ONLY"; canFinalize: false;
};
const preparationsPath = (businessId: string, periodId: string) =>
  `/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/preparations`;
export const listYearEndPreparations = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<{ mode: "PREPARATION_ONLY"; canFinalize: false; items: YearEndPreparation[] }>(preparationsPath(businessId, periodId), signal);
export const createYearEndPreparation = (businessId: string, periodId: string, confirmName: string, reason: string, requestKey: string) =>
  write<YearEndPreparation>(preparationsPath(businessId, periodId), "POST", { confirmName, reason, requestKey });

// Rev8.3e — final posting is always disabled. This is read-only diagnostic data.
export type YearEndExecutionGate = {
  mode: "SAFETY_GATES_ONLY"; canFinalize: false; isExecutionApiAvailable: false;
  periodId: string; checkedAt: string;
  preparation: { id: string; status: string; createdAt: string; snapshotHash: string; currentApproval: false } | null;
  reservedOperationCount: number;
  constraints: { system_journals_blocked: boolean; operations_blocked: boolean };
  checks: {
    preflightBlockers: { code: string; message: string }[];
    preflightWarnings: { code: string; message: string }[];
    temporaryAccountsClosed: false;
    destinationEquityAccountValidated: false;
    stockAndSubledgersReconciled: false;
    journalReportingAdapted: false;
    finalPostingCommandImplemented: false;
  };
  reasons: string[];
};
export const getYearEndExecutionGate = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<YearEndExecutionGate>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/execution-gate`, signal);

// Rev8.3f: read-only accounting validation of the year-end projection.
// Selecting a destination is advisory for this request only. No setting is saved.
export type YearEndAccountingValidation = {
  mode: "READ_ONLY_ACCOUNTING_VALIDATION"; canFinalize: false; checkedAt: string; currency: string;
  periodId: string; destinationAccountId: string | null; accountingChecksPassed: boolean;
  destination: { eligible: boolean; selected: { id: string; code: string; name: string } | null;
    candidates: { id: string; code: string; name: string }[] };
  reconciliation: { periodDebit: string; periodCredit: string; periodBalanced: boolean;
    revenue: string; expense: string; netProfit: string;
    proposedClosingDebit: string; proposedClosingCredit: string; closingBalanced: boolean;
    cumulativeDebit: string; cumulativeCredit: string;
    virtualOpeningDebit: string; virtualOpeningCredit: string; virtualOpeningBalanced: boolean;
    earlierUnclosedNet: string };
  closingLines: { accountId: string | null; code: string | null; name: string;
    side: "DEBIT" | "CREDIT"; amount: string; virtual: true }[];
  blockers: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  reportPolicy: { currentLedger: "CONTINUOUS"; systemJournalExclusionImplemented: false;
    realOpeningEntryAllowed: false; status: "NOT_READY" };
};
export const getYearEndAccountingValidation = (businessId: string, periodId: string,
  destinationAccountId?: string, signal?: AbortSignal) => {
  const query = destinationAccountId ? `?destinationAccountId=${encodeURIComponent(destinationAccountId)}` : "";
  return get<YearEndAccountingValidation>(
    `/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/accounting-validation${query}`,
    signal,
  );
};

// Rev8.3g: read-only reconciliation (never permits final posting).
export type YearEndReconciliation = {
  mode: "READ_ONLY_RECONCILIATION";
  canFinalize: false;
  checkedAt: string;
  period: { id: string; name: string; endDate: string };
  currency: string;
  metrics: { periodRevenue: string; periodExpense: string; periodProfit: string };
  checks: Array<{
    code: string; title: string; status: "PASS" | "FAIL" | "NOT_CHECKED";
    message: string; amounts?: Record<string, string>; examples?: string[];
    partyBalances?: Array<{ partyId: string; partyName: string; operationalReceivable: string; ledgerReceivable: string; receivableDifference: string; operationalPayable: string; ledgerPayable: string; payableDifference: string }>;
    truncated?: boolean;
  }>;
  summary: { passed: number; failed: number; notChecked: number; fullyReconciled: false };
  note: string;
};
export const getYearEndReconciliation = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<YearEndReconciliation>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/reconciliation`, signal);

// Rev8.3j: immutable independently declared bank/cash checks, without journal postings.
export type CashBankRecAccount = { id: string; code: string; name: string };
export type CashBankRecItem = { description: string; amount: string; reference: string };
export type CashBankRecRecord = {
  id: string; accountId: string; asOfDate: string; createdAt: string;
  bookBalance: string; reportedBalance: string; adjustmentTotal: string; difference: string;
  evidenceReference: string; notes: string; items: CashBankRecItem[];
  status: "MATCHED" | "DIFFERENCE"; declaredReviewed: boolean; freshness: "CURRENT" | "STALE" | "NOT_CHECKED";
  canFinalize: false; verifiedExternalDocument: false;
};
export type CashBankRecAccounts = {
  period: { name: string; startDate: string; endDate: string }; today: string; currency: string;
  accounts: CashBankRecAccount[]; canFinalize: false;
};
export type CashBankRecInspection = {
  account: CashBankRecAccount; asOfDate: string; currency: string; bookBalance: string;
  journalLineCount: number; records: CashBankRecRecord[]; canFinalize: false;
  externalVerification: "DECLARED_BY_USER_ONLY";
};
export type CashBankRecInput = {
  accountId: string; asOfDate: string; reportedBalance: string; items: CashBankRecItem[];
  evidenceReference: string; notes: string; confirmIndependentSource: boolean; requestKey: string;
};
const recPath = (businessId: string, periodId: string) =>
  `/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/cash-bank`;
export const listCashBankRecAccounts = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<CashBankRecAccounts>(`${recPath(businessId, periodId)}/accounts`, signal);
export const inspectCashBankRec = (businessId: string, periodId: string, accountId: string, asOfDate: string, signal?: AbortSignal) =>
  get<CashBankRecInspection>(`${recPath(businessId, periodId)}/inspect?accountId=${encodeURIComponent(accountId)}&asOfDate=${encodeURIComponent(asOfDate)}`, signal);
export const recordCashBankRec = (businessId: string, periodId: string, input: CashBankRecInput) =>
  write<CashBankRecRecord>(`${recPath(businessId, periodId)}/records`, "POST", input);


// Rev8.3k: end-of-period coverage of every cash/bank account (read-only).
export type CashBankYearEndCoverageStatus =
  "MATCHED_DECLARED" | "MISSING" | "STALE" | "DIFFERENCE" | "UNCONFIRMED" |
  "FUTURE_DATE" | "INVALID_ACCOUNT" | "INACTIVE_WITH_POSTINGS" | "EXCLUDED_INACTIVE_EMPTY";
export type CashBankYearEndCoverage = {
  mode: "READ_ONLY_CASH_BANK_YEAR_END_COVERAGE"; asOfDate: string; today: string; currencyScale: number;
  accounts: Array<{
    account: CashBankRecAccount & { isActive: boolean }; status: CashBankYearEndCoverageStatus;
    bookBalance: string; journalLineCount: number;
    record: null | { id: string; createdAt: string; evidenceReference: string;
      difference: string; declaredReviewed: boolean; status: string };
  }>;
  summary: { totalCount: number; requiredCount: number; matchedCount: number; missingCount: number;
    staleCount: number; differenceCount: number; notDueCount: number; exceptionCount: number;
    excludedCount: number; allDeclaredMatched: boolean; independentlyVerified: false; canFinalize: false };
  note: string; canFinalize: false;
};
export const getCashBankYearEndCoverage = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<CashBankYearEndCoverage>(`${recPath(businessId, periodId)}/coverage`, signal);


// Rev8.3l: final consolidated read-only assessment. The status never authorizes posting.
export type YearEndFinalReview = {
  mode: "READ_ONLY_FINAL_YEAR_END_REVIEW";
  period: { id: string; name: string; startDate: string; endDate: string; status: string };
  nextPeriod: { id: string; name: string; startDate: string; endDate: string; status: string } | null;
  destination: { selected: { id: string; code: string; name: string } | null; eligible: boolean; savedForExecution: false };
  checkedAt: string;
  status: "BLOCKED" | "NEEDS_REVIEW" | "READY_FOR_REVIEW";
  summary: { blockers: number; needsReview: number; internalPassed: number; internalFailed: number;
    internalPending: number; journalBalanced: boolean; accountsRequired: number; accountsCovered: number;
    reportValuesConsistent: boolean; reservedYearEndOperations: number };
  blockers: { code: string; title: string; message: string; source: string; severity: "BLOCKER" }[];
  reviews: { code: string; title: string; message: string; source: string; severity: "REVIEW" }[];
  protections: { systemJournalsBlocked: boolean; operationsBlocked: boolean };
  canFinalize: false; isExecutionApiAvailable: false; note: string;
};
export const getYearEndFinalReview = (businessId: string, periodId: string,
  destinationAccountId?: string, signal?: AbortSignal) => {
  const suffix = destinationAccountId ? `?destinationAccountId=${encodeURIComponent(destinationAccountId)}` : "";
  return get<YearEndFinalReview>(
    `/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/final-review${suffix}`, signal,
  );
};

// Rev8.3m: advisory persisted destination (NOT an authorization to close the year).
export type YearEndEquityDestination = {
  mode: "ADVISORY_ONLY"; canFinalize: false; configured: boolean; eligible: boolean;
  version: number; updatedAt: string | null;
  account: { id: string; code: string; name: string } | null; warning: string | null;
};
const equityDestinationPath = (b: string, p: string) =>
  `/v2/businesses/${encodeURIComponent(b)}/accounting/periods/${encodeURIComponent(p)}/year-end/equity-destination`;
export const getYearEndEquityDestination = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<YearEndEquityDestination>(equityDestinationPath(businessId, periodId), signal);
export const saveYearEndEquityDestination = (businessId: string, periodId: string,
  accountId: string, expectedVersion: number, reason: string) =>
  write<{ saved: true; canFinalize: false }>(equityDestinationPath(businessId, periodId), "PUT",
    { accountId, expectedVersion, reason });

// Rev8.4a: exact closing-entry plan. Explicitly READ ONLY.
export type YearEndClosingPlan = {
  mode: "READ_ONLY_REV84_EXECUTION_PLAN"; canFinalize: boolean; periodName?: string;
  currency: string; currencyScale: number; checkedAt: string; sourcePeriodId: string;
  destinationConfigured: boolean; snapshotHash: string;
  plan: { netProfit: string; totalRevenue: string; totalExpense: string;
    totalDebit: string; totalCredit: string; balanced: boolean; journalRequired: boolean;
    openingPolicy: "CONTINUOUS_LEDGER_NO_REPOST";
    lines: Array<{ accountId: string; code: string; name: string; debit: string; credit: string;
      reason: "CLOSE_TEMPORARY" | "TRANSFER_RESULT" }> };
  blockers: Array<{ code: string; message: string }>;
  protections: { executeEndpointEnabled: boolean; databaseGuardsIntact: boolean };
  note: string;
};
export const getYearEndClosingPlan = (businessId: string, periodId: string, signal?: AbortSignal) =>
  get<YearEndClosingPlan>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/closing-plan`, signal);

export async function postYearEnd(businessId: string, periodId: string, body: {
  snapshotHash: string; confirmName: string; reason: string; evidenceReviewed: true;
}, key: string) {
  if (!accessToken) await refresh();
  const send = () => raw<{ operationId: string; journalId: string | null; periodId: string }>(
    `/v2/businesses/${encodeURIComponent(businessId)}/accounting/periods/${encodeURIComponent(periodId)}/year-end/finalize`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Idempotency-Key": key },
      body: JSON.stringify(body), timeoutMs: 100000 },
  );
  try { return await send(); } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
    await refresh();
    return send();
  }
}

// Rev9.0d-installed
export type EffectiveBusinessPermissions = { businessId: string; permissions: string[] };
export const getEffectiveBusinessPermissions = (businessId: string, signal?: AbortSignal) => get<EffectiveBusinessPermissions>(`/v2/businesses/${encodeURIComponent(businessId)}/access/effective-permissions`, signal);

// Rev9.0g: authenticated, read-only report endpoints; existing token/refresh behavior is reused.
export type ReportResource = "reports/sales/export" | "reports/purchases/export" | "reports/sales/by-party/export" | "reports/sales/by-product/export" | "reports/purchases/by-party/export" | "reports/purchases/by-product/export" | "reports/inventory-value/export" | "payments/report" | "reports/sales/by-party" | "reports/sales/by-product" | "reports/purchases/by-party" | "reports/purchases/by-product" | "reports/sales" | "reports/purchases" | "reports/sales-settlements" | "reports/purchases-settlements" | "reports/inventory-value" | "accounting/party-balances" | "accounting/cash-balances";
export const readBusinessReport = <T>(businessId: string, resource: ReportResource, query: URLSearchParams, signal?: AbortSignal) =>
  get<T>(`/v2/businesses/${encodeURIComponent(businessId)}/${resource}?${query.toString()}`, signal);

export type DetailedLedgerRow = AccountLedgerRow & { account: LedgerAccount; runningBalance: string };
export type DetailedLedgerPage = Omit<AccountLedgerPage, "account" | "items"> & { account?: LedgerAccount; party?: Pick<Party, "id" | "name" | "customerEnabled" | "isActive" | "isCashCustomer">; debtReminderEnabled?: boolean; recentDebtReminders?: (Pick<DebtReminderResult, "state"> & { commandId: string; createdAt: string })[]; fromDate: string | null; toDate: string | null; openingBalance: string; closingBalance: string; pageOpeningBalance: string; items: DetailedLedgerRow[] };
export const listLedgerChart = (businessId: string, signal?: AbortSignal) => get<Account[]>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/accounts/ledger-chart`, signal);
export const readDetailedLedger = (businessId: string, kind: "account" | "party", id: string, query: URLSearchParams, signal?: AbortSignal) => get<DetailedLedgerPage>(`/v2/businesses/${encodeURIComponent(businessId)}/${kind === "party" ? "parties" : "accounting/accounts"}/${encodeURIComponent(id)}/ledger?${query}`, signal);

export type TradeBreakdownRow = { key: string; subjectId: string; name: string; code: string | null; isActive: boolean; unitName: string | null; grossAmount: string; returnAmount: string; netAmount: string; grossQuantity: string | null; returnQuantity: string | null; netQuantity: string | null };
export type TradeBreakdownPage = { kind: "sales" | "purchases"; dimension: "party" | "product"; currency: string; fromDate: string | null; toDate: string | null; totalGross: string; totalReturns: string; netAmount: string; items: TradeBreakdownRow[]; page: number; limit: number; total: number; totalPages: number };

export type PaymentsReportPage = { currency:string;fromDate:string|null;toDate:string|null;totalReceipts:string;totalDisbursements:string;netAmount:string;accounts:{id:string;name:string;isActive:boolean}[];items:{id:string;number:string|null;direction:"RECEIPT"|"DISBURSEMENT";documentDate:string;amount:string;externalReference:string|null;journalEntryId:string|null;party:{id:string;name:string;isActive:boolean};cashBankAccount:{id:string;name:string;isActive:boolean}}[];page:number;limit:number;total:number;totalPages:number };

export type TrialBalanceExport = TrialBalanceReport & { exportedAt:string;businessName:string;scopeLabel:string };
export type PartyLedgerExport = DetailedLedgerPage & { exportedAt:string;businessName:string };
export const exportTrialBalance=(businessId:string,periodId:string,signal?:AbortSignal)=>get<TrialBalanceExport>(`/v2/businesses/${encodeURIComponent(businessId)}/accounting/trial-balance/export${periodId?`?periodId=${encodeURIComponent(periodId)}`:""}`,signal);
export const exportPartyLedger=(businessId:string,partyId:string,query:URLSearchParams,signal?:AbortSignal)=>get<PartyLedgerExport>(`/v2/businesses/${encodeURIComponent(businessId)}/parties/${encodeURIComponent(partyId)}/ledger/export?${query}`,signal);

export type SaleSuggestion = { customer:string|null; currency:"IRR"; sourceCurrency:"IRR"|"TOMAN"|null;defaultCurrencyUsed?:boolean; items:{product:string|null;quantity:string|null;unitPrice:string|null;discountAmount?:string;amountRial?:string|null;priceBasis?:"UNIT"|"TOTAL"|"AMBIGUOUS"|"MISSING"}[];unsupported:string[] };
export async function previewSaleMessage(businessId:string,text:string,signal:AbortSignal):Promise<SaleSuggestion>{
  if(!accessToken)await refresh();
  const requestSignal=signal;
  const send=()=>raw<SaleSuggestion>(`/v2/businesses/${encodeURIComponent(businessId)}/sale-assistant/preview`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify({text}),signal:requestSignal,timeoutMs:40000});
  try{return await send();}catch(error){if(!(error instanceof ApiError)||error.status!==401||requestSignal.aborted)throw error;await refresh();return send();}
}

export async function createAssistantSaleDraft(businessId:string,body:SaleInput,key:string):Promise<SaleDetails>{
  if(!accessToken)await refresh();
  const send=()=>raw<SaleDetails>(`${salesPath(businessId)}/assistant-draft`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key},body:JSON.stringify(body),timeoutMs:40000});
  try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}

export type QuickSaleInput={sale:SaleInput;receivedAmount:string;cashBankAccountId?:string};
export type QuickSaleResult={saleId:string;number:string;total:string;receivedAmount:string;remainingAmount:string;paymentId:string|null};
export async function checkoutQuickSale(businessId:string,body:QuickSaleInput,key:string):Promise<QuickSaleResult>{
  if(!accessToken)await refresh();const send=()=>raw<QuickSaleResult>(`/v2/businesses/${encodeURIComponent(businessId)}/quick-sales`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key},body:JSON.stringify(body),timeoutMs:70000});
  try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}

export type PurchaseSuggestion = Omit<SaleSuggestion,"customer"> & {supplier:string|null};
export async function previewPurchaseMessage(businessId:string,text:string,signal:AbortSignal):Promise<PurchaseSuggestion>{
  if(!accessToken)await refresh();
  const requestSignal=signal;
  const send=()=>raw<PurchaseSuggestion>(`/v2/businesses/${encodeURIComponent(businessId)}/purchase-assistant/preview`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify({text}),signal:requestSignal,timeoutMs:40000});
  try{return await send();}catch(error){if(!(error instanceof ApiError)||error.status!==401||requestSignal.aborted)throw error;await refresh();return send();}
}

export async function createAssistantPurchaseDraft(businessId:string,body:PurchaseInput,key:string):Promise<PurchaseDetails>{
  if(!accessToken)await refresh();
  const send=()=>raw<PurchaseDetails>(`${purchasesPath(businessId)}/assistant-draft`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key},body:JSON.stringify(body),timeoutMs:40000});
  try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}


export type AssistantMessageCurrency="IRR"|"TOMAN";
export const getAssistantSettings=(b:string,signal?:AbortSignal)=>get<{currency:AssistantMessageCurrency}>(`/v2/businesses/${encodeURIComponent(b)}/assistant-settings`,signal);
export const updateAssistantSettings=(b:string,currency:AssistantMessageCurrency)=>write<{currency:AssistantMessageCurrency}>(`/v2/businesses/${encodeURIComponent(b)}/assistant-settings`,"PATCH",{currency});
export type AssistantPriceReference={productId:string;prices:string[];source:"same-party"|"history"|"catalog"|"none"};
export async function getAssistantPriceContext(b:string,kind:"sale"|"purchase",productIds:string[],partyId:string,signal:AbortSignal):Promise<{items:AssistantPriceReference[]}>{
  if(!productIds.length)return {items:[]};
  if(!accessToken)await refresh();
  const send=()=>raw<{items:AssistantPriceReference[]}>(`/v2/businesses/${encodeURIComponent(b)}/${kind}-assistant/price-context`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify({productIds,...(partyId?{partyId}:{})}),signal,timeoutMs:15000});
  try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}

export type PartyReportIntent = 'RECEIVABLES'|'PAYABLES'|'BOTH'|'CLARIFY'|'OTHER';
/** Classifies language only; never returns balances or performs a financial write. */
export async function classifyPartyReport(businessId:string,text:string,signal:AbortSignal):Promise<{intent:PartyReportIntent;partyQuery?:string}>{
 if(!accessToken)await refresh();
 const send=()=>raw<{intent:PartyReportIntent;partyQuery?:string}>(`/v2/businesses/${encodeURIComponent(businessId)}/assistant-reports/party-intent`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify({text}),signal,timeoutMs:35000});
 try{return await send();}catch(error){if(!(error instanceof ApiError)||error.status!==401)throw error;await refresh();return send();}
}

export type PublicOptions = {registrationEnabled:boolean;trialDays:number;assistantDailyLimit:number};
export const getPublicOptions = (signal?:AbortSignal) => raw<PublicOptions>("/v2/auth/public-options",{signal});
type SmsPurpose = "register" | "reset";
export const requestAuthSms = (phone: string, purpose: SmsPurpose) =>
  raw<{challengeId:string}>("/v2/auth/sms-code/request",{method:"POST", body:JSON.stringify({phone,purpose})});
export const verifyAuthSms = (phone: string, purpose: SmsPurpose, challengeId: string, code: string) =>
  raw<{proof:string}>("/v2/auth/sms-code/verify",{method:"POST", body:JSON.stringify({phone,purpose,challengeId,code})});
export const resetPasswordBySms = (phone: string, proof: string, password: string) =>
  raw<{changed:boolean}>("/v2/auth/password-reset/sms",{method:"POST", body:JSON.stringify({phone,proof,password})});
export const registerTrial = (body:{displayName:string;phone:string;phoneProof:string;password:string;storeName:string;referralCode?:string}) => raw<{registered:boolean;trialEndsAt:string}>("/v2/auth/register-trial",{method:"POST",body:JSON.stringify(body),timeoutMs:70000});

export const getMyProfile = (signal?:AbortSignal) => get<User>("/v2/me",signal);
export const updateMyProfile = (displayName:string) => write<User>("/v2/me","PATCH",{displayName});
export const changePassword = (currentPassword:string,newPassword:string) => write<{changed:boolean;otherSessionsRevoked:number}>("/v2/me/password","POST",{currentPassword,newPassword});

export type StoreChallenge={entryId:string|null;rewardKind?:string;cashAmountToman?:number;cashState?:string;amountToman?:number;maskedCard?:string;paymentReference?:string;paidAt?:string;canRequestCash?:boolean;id:string;title:string;startsAt:string;endsAt:string;targetInvoices:number;maxWinners:number;rewardMonths:number;state:string;publishedAt:string|null;progress:number;eligible:boolean;entryStatus:string|null;rewardExpiresAt:string|null;remaining:number};
export const getStoreChallenges=(id:string,signal?:AbortSignal)=>get<StoreChallenge[]>(`/v2/businesses/${encodeURIComponent(id)}/challenges`,signal);

export const requestCashReward=(businessId:string,id:string,cardNumber:string,accountHolder:string)=>write(`/v2/businesses/${encodeURIComponent(businessId)}/challenges/cash/${encodeURIComponent(id)}/request`,"POST",{cardNumber,accountHolder});

export type ReferralSummary={code:string|null;registrations:number};
export const getMyReferral=(signal?:AbortSignal)=>get<ReferralSummary>('/v2/me/referral',signal);
export const createMyReferral=()=>write<{code:string}>('/v2/me/referral','POST',{});

export type ReferralRewardTerms={mode:'ALL'|'ANY';rules:{kind:string;value?:number;plan?:string}[];withinDays:number;maxRewards:number;perUserLimit:number;rewardKind:'CASH'|'SUBSCRIPTION';amount:number};
export type ReferralRewardData={active:{id:string;title:string;terms:ReferralRewardTerms}|null;rewards:{id:string;title:string;terms:ReferralRewardTerms;status:string;deadlineAt:string;cashState:string|null;rewardExpiresAt:string|null;maskedCard:string|null;paymentReference:string|null;paidAt:string|null;eligible:boolean;invoices:number;purchases:number}[]};
export const getMyReferralRewards=(signal?:AbortSignal)=>get<ReferralRewardData>('/v2/me/referral-rewards',signal);
export const requestReferralCash=(id:string,cardNumber:string,accountHolder:string)=>write(`/v2/me/referral-rewards/${id}/request`,'POST',{cardNumber,accountHolder});

export type ShopPrice={plan:'MONTHLY'|'YEARLY';amountToman:number;aiDailyLimit:number;version:number};
export type ShopQuote={plan:'MONTHLY'|'YEARLY';priceVersion:number;aiDailyLimit:number;couponCode:string|null;percent:number;baseAmountToman:number;discountAmountToman:number;totalAmountToman:number;expiresAt:string};
export type ShopPaymentDestination={cardNumber:string;accountHolder:string;bankName:string;version:number};
export type ShopReceipt={id:string;mimeType:string;createdAt:string};
export type ShopOrder={receipts?:ShopReceipt[];paymentDestination:ShopPaymentDestination|null;id:string;plan:'MONTHLY'|'YEARLY';aiDailyLimit:number;percent:number;baseAmountToman:number;discountAmountToman:number;totalAmountToman:number;expiresAt:string;createdAt:string;state:string;paymentReference:string|null;subscriptionExpiresAt:string|null};
export const shopCatalog=(bid:string,signal?:AbortSignal)=>get<{prices:ShopPrice[];orders:ShopOrder[];supportPhone:string;bitPayAvailable?:boolean}>(`/v2/me/subscription-shop/${bid}`,signal);
export const shopQuote=(bid:string,plan:string,couponCode:string)=>write<ShopQuote>(`/v2/me/subscription-shop/${bid}/quote`,'POST',{plan,...(couponCode?{couponCode}:{})});
export const shopOrder=(bid:string,data:{plan:string;couponCode?:string;commandId:string;expectedPriceVersion:number})=>write<ShopOrder>(`/v2/me/subscription-shop/${bid}/orders`,'POST',data);
export const shopStartBitPay=(bid:string,id:string)=>write<{paymentUrl:string}>(`/v2/me/subscription-shop/${bid}/orders/${id}/bitpay`,'POST',{});
export const shopCancel=(bid:string,id:string)=>write(`/v2/me/subscription-shop/${bid}/orders/${id}/cancel`,'POST',{});

export async function shopUploadReceipt(bid:string,orderId:string,commandId:string,file:File){
 if(!accessToken)await refresh();
 const send=()=>raw<{id:string;submitted:boolean}>(`/v2/me/subscription-shop/${bid}/orders/${orderId}/receipts?commandId=${commandId}`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':file.type},body:file,timeoutMs:40000});
 try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}

// Photo uploads are private JSON commands. Large body allowance is scoped on the API.
export async function photoCommand<T>(businessId:string,path:string,body?:unknown):Promise<T> {
 if(!accessToken)await refresh();
 const send=()=>raw<T>(`/v2/businesses/${encodeURIComponent(businessId)}/photo-purchases/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${accessToken}`},...(body===undefined?{}:{body:JSON.stringify(body)}),timeoutMs:180000});
 try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}

export const createIssue=(b:string,input:IssueInput)=>write<IssueReport>(`/v2/me/issues/businesses/${encodeURIComponent(b)}`,"POST",input);
export const listIssues=(b:string,page:number,key?:string,signal?:AbortSignal)=>get<{items:IssueReport[];page:number}>(`/v2/me/issues/businesses/${encodeURIComponent(b)}?page=${page}${key?'&key='+encodeURIComponent(key):''}`,signal);
export const issueProgress=(signal?:AbortSignal)=>get<IssueProgress>('/v2/me/issues/progress',signal);
export const claimIssueReward=()=>write<IssueClaim>('/v2/me/issues/claim','POST',{});

export type ProductOpeningInput = { product: CreateProductInput; opening: {periodId:string;warehouseId:string;documentDate:string;quantity:string;inventoryValue:string} };
export async function createProductWithOpening(b:string,body:ProductOpeningInput,key:string):Promise<{id:string}> {
  if(!accessToken)await refresh();
  const send=()=>raw<{id:string}>(`${catalogPath(b)}/products-with-opening`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key},body:JSON.stringify(body),timeoutMs:40000});
  try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}
export const updateFiscalPeriod = (b:string,id:string,body:{name:string;startDate:string;endDate:string;expected:{name:string;startDate:string;endDate:string};reason:string}) => write<FiscalPeriod>(`/v2/businesses/${encodeURIComponent(b)}/accounting/periods/${encodeURIComponent(id)}`,"PATCH",body);

export type ChequeState="IN_HAND"|"ISSUED"|"ENDORSED"|"CLEARED"|"BOUNCED"|"CANCELLED";
export type ChequeRow={id:string;kind:"RECEIVABLE"|"PAYABLE";state:ChequeState;serial:string;bankName:string;sayadId:string|null;amount:string;currency:string;partyId:string;partyName?:string;holderName?:string|null;holderPartyId:string|null;issuerAccountId:string|null;issueDate:string;dueDate:string;lastEventDate:string;version:number};
export type ChequeEventRow={id:string;kind:string;fromState:string|null;toState:string;version:number;documentDate:string;reason:string;details:{payments?:{paymentId:string;journalEntryId:string}[];paymentId?:string;journalEntryId?:string;journalEntryIds?:string[];accountId?:string}};
export type ChequeDetails=ChequeRow&{events:ChequeEventRow[]};
export type ChequeCreateInput={kind:"RECEIVABLE"|"PAYABLE";serial:string;bankName:string;sayadId?:string;amount:string;partyId:string;periodId:string;issueDate:string;dueDate:string;issuerAccountId?:string;allocations:PaymentInput["allocations"]};
export type ChequeActionName="ENDORSE"|"RETURN_ENDORSE"|"CLEAR"|"BOUNCE"|"CANCEL";
export type ChequeActionInput={action:ChequeActionName;version:number;periodId:string;documentDate:string;reason:string;accountId?:string;partyId?:string;allocations?:PaymentInput["allocations"]};
const chequesPath=(b:string)=>`/v2/businesses/${encodeURIComponent(b)}/cheques`;
export const listCheques=(b:string,page:number,state:string,signal?:AbortSignal)=>get<{items:ChequeRow[];page:number;total:number;totalPages:number}>(`${chequesPath(b)}?page=${page}${state?`&state=${encodeURIComponent(state)}`:""}`,signal);
export const getCheque=(b:string,id:string,signal?:AbortSignal)=>get<ChequeDetails>(`${chequesPath(b)}/${encodeURIComponent(id)}`,signal);
export const recoverChequeRequest=(b:string,key:string)=>get<ChequeRow>(`${chequesPath(b)}/requests/${encodeURIComponent(key)}`);
export async function chequeCommand(b:string,id:string|null,body:ChequeCreateInput|ChequeActionInput,key:string):Promise<ChequeRow>{
 if(!accessToken)await refresh();const send=()=>raw<ChequeRow>(`${chequesPath(b)}${id?`/${encodeURIComponent(id)}/actions`:""}`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Idempotency-Key":key},body:JSON.stringify(body),timeoutMs:40000});
 try{return await send();}catch(e){if(!(e instanceof ApiError)||e.status!==401)throw e;await refresh();return send();}
}

export type StoreMoneyUnit = {businessId:string;unit:"IRR"|"TOMAN";version:number;baseCurrency:string;canEdit:boolean};
export const getStoreMoneyUnit=(businessId:string,signal?:AbortSignal)=>get<StoreMoneyUnit>(`/v2/businesses/${businessId}/money-unit`,signal);
export const updateStoreMoneyUnit=(businessId:string,unit:"IRR"|"TOMAN",expectedVersion:number)=>write<StoreMoneyUnit>(`/v2/businesses/${businessId}/money-unit`,"PATCH",{unit,expectedVersion});

export const saveProductRecipe=(businessId:string,id:string,body:{version:number;revenueKind:"GOODS"|"SERVICE";materials:RecipeMaterial[]})=>write<ProductRecipe>(`${catalogPath(businessId)}/products/${encodeURIComponent(id)}/recipe`,"POST",body);

export type DebtReminderPreview = { mobile: string; store: string; customer: string; amount: string; token: string };
export type DebtReminderResult = { state: "PENDING" | "ACCEPTED" | "REJECTED" | "UNKNOWN"; providerId: string | null };
const debtReminderPath = (businessId: string, partyId: string) =>
  `/v2/businesses/${encodeURIComponent(businessId)}/parties/${encodeURIComponent(partyId)}/debt-reminder`;
export const previewDebtReminder = (businessId: string, partyId: string, card: string) =>
  write<DebtReminderPreview>(debtReminderPath(businessId, partyId) + "/preview", "POST", { card });
export const sendDebtReminder = (businessId: string, partyId: string, card: string, token: string, commandId: string) =>
  write<DebtReminderResult>(debtReminderPath(businessId, partyId), "POST", { card, token, commandId });
