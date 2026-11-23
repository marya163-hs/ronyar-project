import type { Business } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useMemo, useState } from "react";
import type { SaleStatus } from "./api";
import { formatDecimal } from "./api";
import { jalaliText } from "./jalaliDate";

/** A consistent, accessible list shell for purchases, sales, and both returns.
 * Search and sorting are limited to the current server page; summary totals say so explicitly.
 */
type DocumentRow = {
  id: string;
  number: string | null;
  documentDate: string;
  total: string;
  status: SaleStatus;
  party?: { id: string; name: string };
  reason?: string;
};
type Page = { items: DocumentRow[]; total: number; totalPages: number };
type ListKind = "sales" | "purchases" | "saleReturns" | "purchaseReturns";
type Props = {
  business?: Business;
  kind: ListKind;
  storeName: string;
  currency: string;
  result: Page | null;
  status: SaleStatus | "ALL";
  currentPage: number;
  loading: boolean;
  busy: boolean;
  onStatusChange: (status: SaleStatus | "ALL") => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  canCreate: boolean;
  canEdit: boolean;
  onCreate: () => void;
  onDetails: (id: string) => void;
  onEdit: (id: string) => void;
  onCancelDraft: (id: string) => void;
};

const config: Record<ListKind, { heading: string; subtitle: string; action: string; column: string; singular: string }> = {
  sales: { heading: "فاکتورهای فروش", subtitle: "ثبت و پیگیری فروش‌های فروشگاه", action: "فاکتور فروش جدید", column: "مشتری", singular: "فاکتور فروش" },
  purchases: { heading: "فاکتورهای خرید", subtitle: "ثبت و پیگیری خریدهای فروشگاه", action: "فاکتور خرید جدید", column: "تأمین‌کننده", singular: "فاکتور خرید" },
  saleReturns: { heading: "برگشت از فروش", subtitle: "مدیریت کالاهای برگشتی مشتریان", action: "برگشت از فروش جدید", column: "دلیل برگشت", singular: "برگشت از فروش" },
  purchaseReturns: { heading: "برگشت از خرید", subtitle: "مدیریت کالاهای برگشتی به تأمین‌کنندگان", action: "برگشت از خرید جدید", column: "دلیل برگشت", singular: "برگشت از خرید" },
};
const statuses: { value: SaleStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "همه" },
  { value: "DRAFT", label: "پیش‌نویس" },
  { value: "POSTED", label: "ثبت قطعی" },
  { value: "CANCELLED", label: "لغوشده" },
];
const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";
function normalized(value: string): string {
  return value.replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String(arDigits.indexOf(digit)))
    .replace(/[٬,\s]/g, "").toLocaleLowerCase("fa-IR").trim();
}
function decimalParts(value: string): [bigint, number] {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return [0n, 0];
  const fraction = match[3] ?? "";
  return [BigInt(`${match[1]}${match[2]}${fraction}`), fraction.length];
}
function sumMoney(values: string[]): string {
  const parsed = values.map(decimalParts);
  const scale = parsed.reduce((acc, part) => Math.max(acc, part[1]), 0);
  const sum = parsed.reduce((acc, [amount, digits]) => acc + amount * 10n ** BigInt(scale - digits), 0n);
  if (!scale) return String(sum);
  const negative = sum < 0n ? "-" : "";
  const absolute = (sum < 0n ? -sum : sum).toString().padStart(scale + 1, "0");
  const frac = absolute.slice(-scale).replace(/0+$/, "");
  return negative + absolute.slice(0, -scale) + (frac ? "." + frac : "");
}
function compareMoney(a: string, b: string): number {
  const [aValue, aScale] = decimalParts(a);
  const [bValue, bScale] = decimalParts(b);
  const lhs = aValue * 10n ** BigInt(bScale);
  const rhs = bValue * 10n ** BigInt(aScale);
  return lhs === rhs ? 0 : lhs > rhs ? 1 : -1;
}
const statusLabel = (status: SaleStatus) => statuses.find(item => item.value === status)?.label ?? status;
const counterpart = (item: DocumentRow) => item.party?.name || item.reason || "—";

export default function DocumentListView({ business, kind, storeName, currency, result, status, currentPage, loading, busy, onStatusChange, onPageChange, onRefresh, canCreate, canEdit, onCreate, onDetails, onEdit, onCancelDraft }: Props) {
  const details = config[kind];
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("newest");
  const displayRows = useMemo(() => {
    const needle = normalized(query);
    const rows = (result?.items ?? []).filter(item => {
      if (!needle) return true;
      return [item.number ?? "", item.documentDate, jalaliText(item.documentDate), counterpart(item), item.total, formatStoreMoney(business, item.total)]
        .some(value => normalized(value).includes(needle));
    });
    return rows.slice().sort((a, b) => {
      switch (order) {
        case "oldest": return a.documentDate.localeCompare(b.documentDate);
        case "amountHigh": return compareMoney(b.total, a.total);
        case "amountLow": return compareMoney(a.total, b.total);
        default: return b.documentDate.localeCompare(a.documentDate);
      }
    });
  }, [result, query, order]);
  const pageRows = result?.items ?? [];
  const currencyText = business ? storeMoneyUnit(business) : storeMoneyUnit(business);
  const hasPages = Boolean(result && result.totalPages > 1);
  const actions = (item: DocumentRow) => <div className="doc-row-actions">
    <button type="button" className="doc-details-button" disabled={busy} onClick={() => onDetails(item.id)}>مشاهده</button>
    {canEdit && item.status === "DRAFT" && <>
      <button type="button" className="doc-edit-button" disabled={busy} onClick={() => onEdit(item.id)}>ویرایش</button>
      <details className="doc-action-menu"><summary aria-label="عملیات بیشتر">•••</summary>
        <div className="doc-action-menu-popover"><button type="button" disabled={busy} onClick={() => onCancelDraft(item.id)}>لغو پیش‌نویس</button></div>
      </details>
    </>}
  </div>;

  return <section className="document-list" aria-label={details.heading}>
    <header className="doc-page-head">
      <div className="doc-page-titles"><p className="doc-breadcrumb">{storeName} <span aria-hidden="true">/</span> مدیریت اسناد</p><h1>{details.heading}</h1><p>{details.subtitle}</p></div>
      {canCreate && <button type="button" className="primary doc-new-button" disabled={busy} onClick={onCreate}><span aria-hidden="true">＋</span>{details.action}</button>}
    </header>

    <div className="doc-overview" aria-label="آمار فهرست">
      <article className="doc-kpi"><span>تعداد کل در فیلتر انتخابی</span><strong>{result ? formatDecimal(String(result.total)) : "—"}</strong><small>در همه صفحات این وضعیت</small></article>
      <article className="doc-kpi"><span>جمع مبلغ همین صفحه</span><strong><bdi>{result ? formatStoreMoney(business, sumMoney(pageRows.map(item => item.total))) : "—"}</bdi></strong><small>{currencyText} · فقط اسناد این صفحه</small></article>
      <article className="doc-kpi"><span>پیش‌نویس‌های همین صفحه</span><strong>{result ? formatDecimal(String(pageRows.filter(item => item.status === "DRAFT").length)) : "—"}</strong><small>اسناد قابل ویرایش در این صفحه</small></article>
    </div>

    <div className="doc-panel">
      <div className="doc-panel-top">
        <div className="doc-status-tabs" role="group" aria-label="فیلتر وضعیت">
          {statuses.map(item => <button type="button" key={item.value} disabled={loading} aria-pressed={status === item.value} className={status === item.value ? "selected" : ""} onClick={() => { setQuery(""); onStatusChange(item.value); }}>{item.label}</button>)}
        </div>
        <button type="button" className="doc-refresh" disabled={loading} onClick={onRefresh} aria-label="بارگذاری دوباره">↻ <span>به‌روزرسانی</span></button>
      </div>
      <div className="doc-filters">
        <label className="doc-search"><span>جستجو در همین صفحه</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`شماره، ${details.column}، مبلغ…`} aria-label="جستجو در همین صفحه" /></label>
        <label className="doc-order"><span>مرتب‌سازی همین صفحه</span><select value={order} onChange={event => setOrder(event.target.value)}><option value="newest">جدیدترین تاریخ</option><option value="oldest">قدیمی‌ترین تاریخ</option><option value="amountHigh">بیشترین مبلغ</option><option value="amountLow">کمترین مبلغ</option></select></label>
      </div>
      <div className="doc-list-meta"><span>{result ? `${formatDecimal(String(displayRows.length))} مورد در این صفحه نمایش داده می‌شود` : "در حال دریافت اطلاعات"}</span><span>همه مبلغ‌ها به {currencyText} · تاریخ‌ها شمسی</span></div>
      {result && pageRows.length > 0 && displayRows.length > 0 ? <>
        <div className="doc-table-scroll"><table className="doc-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>{details.column}</th><th>مبلغ ({currencyText})</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{displayRows.map(item => <tr key={item.id}>
          <td><span className="doc-number">{item.number ? <bdi>{formatDecimal(item.number)}</bdi> : <span className="doc-no-number">در انتظار ثبت</span>}</span></td>
          <td><bdi>{jalaliText(item.documentDate)}</bdi></td><td className="doc-party-cell" title={counterpart(item)}>{counterpart(item)}</td>
          <td className="doc-money"><bdi>{formatStoreMoney(business, item.total)}</bdi></td>
          <td><span className={`doc-status doc-status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></td>
          <td>{actions(item)}</td></tr>)}</tbody></table></div>
        <div className="doc-mobile-items">{displayRows.map(item => <article className="doc-mobile-card" key={item.id}>
          <div className="doc-mobile-top"><strong>{item.number ? `${details.singular} ${formatDecimal(item.number)}` : "پیش‌نویس بدون شماره"}</strong><span className={`doc-status doc-status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></div>
          <p className="doc-mobile-party">{counterpart(item)}</p>
          <div className="doc-mobile-data"><span>{jalaliText(item.documentDate)}</span><strong><bdi>{formatStoreMoney(business, item.total)}</bdi> <small>{currencyText}</small></strong></div>
          {actions(item)}</article>)}</div>
      </> : result && <div className="doc-empty"><div className="doc-empty-icon" aria-hidden="true">▤</div><h2>{query ? "موردی در این صفحه پیدا نشد" : `هنوز ${details.singular} در این وضعیت ندارید`}</h2><p>{query ? "عبارت دیگری را امتحان کنید یا جستجوی همین صفحه را پاک کنید." : "برای شروع، یک سند جدید ثبت کنید یا وضعیت دیگری را بررسی کنید."}</p>{query ? <button type="button" className="secondary" onClick={() => setQuery("")}>پاک‌کردن جستجو</button> : null}</div>}
      {loading && <div className="doc-loading" role="status">در حال بارگذاری اسناد…</div>}
      {hasPages && <nav className="doc-pagination" aria-label="صفحه‌بندی اسناد"><button type="button" className="secondary" disabled={loading || currentPage <= 1} onClick={() => {setQuery(""); onPageChange(currentPage - 1);}}>صفحه قبل</button><span>صفحه <bdi>{formatDecimal(String(currentPage))}</bdi> از <bdi>{formatDecimal(String(result!.totalPages))}</bdi></span><button type="button" className="secondary" disabled={loading || currentPage >= result!.totalPages} onClick={() => {setQuery(""); onPageChange(currentPage + 1);}}>صفحه بعد</button></nav>}
    </div>
  </section>;
}

// Rev9.0d-installed
