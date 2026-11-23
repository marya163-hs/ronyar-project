import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useStoreCan } from "./StorePermissions";
import CashBankAccountForm from "./CashBankAccountForm";
import AccountLedger from "./AccountLedger";
import CashOperationForm from "./CashOperationForm";
import { useEffect, useMemo, useState } from "react";
import { ApiError, errorText, formatDecimal, listCashBalances, listFiscalPeriods } from "./api";
import type { Business, CashBalancePage, FiscalPeriod } from "./api";
import { jalaliText } from "./jalaliDate";
import { moneyUnit, searchText } from "./operationsDisplay";

type Props = { business: Business; onSessionExpired: () => void };
type Visibility = "ALL" | "ACTIVE" | "INACTIVE";
export default function CashBank({ business, onSessionExpired }: Props) {
  const can = useStoreCan();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [operation, setOperation] = useState<"EXPENSE" | "TRANSFER" | null>(null), [success, setSuccess] = useState("");
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]), [periodId, setPeriodId] = useState(""), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<CashBalancePage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [visibility, setVisibility] = useState<Visibility>("ALL");
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError(""); setLoading(true);
    Promise.all([listCashBalances(business.id, page, periodId, controller.signal), listFiscalPeriods(business.id, controller.signal)])
      .then(([report, options]) => {
        if (!controller.signal.aborted) {
          setPeriods(options);
          if (report.totalPages > 0 && page > report.totalPages) setPage(report.totalPages);
          else setResult(report);
        }
      }).catch(cause => {
        if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, page, periodId, retry]);
  const rows = useMemo(() => {
    const term = searchText(query.trim());
    return (result?.items ?? []).filter(row => {
      if (visibility === "ACTIVE" && !row.account.isActive) return false;
      if (visibility === "INACTIVE" && row.account.isActive) return false;
      return !term || [row.account.name, row.account.code].some(value => searchText(value).includes(term));
    });
  }, [result, query, visibility]);
  const currency = moneyUnit(result?.currency ?? business.baseCurrency);
  const busy = operation !== null || creatingAccount;
  const dateLabel = result?.asOfDate ? `تا پایان ${jalaliText(result.asOfDate)}` : "تا آخرین ثبت قطعی";

  if (ledgerId) return <AccountLedger key={ledgerId} business={business} accountId={ledgerId} onSessionExpired={onSessionExpired} onClose={() => { setLedgerId(null); setRetry(value => value + 1); }} />;

  return <section className="ops-page" aria-label="صندوق و بانک">
    <header className="ops-head"><div><p className="ops-breadcrumb">{business.name} <span>/</span> مالی و موجودی</p><h1>صندوق و بانک</h1><p className="ops-subtitle">مانده حساب‌ها، ثبت هزینه و انتقال وجه در یک صفحه مرتب.</p></div>
      <div className="ops-head-actions">
        {can("expenses.post") && <button type="button" className="primary ops-action-primary" disabled={busy} onClick={() => { setSuccess(""); setOperation("EXPENSE"); }}>＋ ثبت هزینه</button>}
        {can("cash-transfers.post") && <button type="button" className="secondary" disabled={busy} onClick={() => { setSuccess(""); setOperation("TRANSFER"); }}>انتقال وجه</button>}
        {can("accounts.manage") && <button type="button" className="secondary" disabled={busy} onClick={() => { setSuccess(""); setCreatingAccount(true); }}>افزودن حساب</button>}
      </div></header>

    {success && <div className="notice success ops-success" role="status">{success}</div>}
    <div className="ops-kpis" aria-label="خلاصه صندوق و بانک">
      <article className="ops-kpi ops-kpi-featured"><span>مجموع مانده صندوق و بانک</span><strong><bdi>{result ? formatStoreMoney(business, result.totalBalance) : "—"}</bdi></strong><small>{currency} · کل حساب‌ها، مستقل از صفحه‌بندی</small></article>
      <article className="ops-kpi"><span>جمع افزایش حساب‌ها</span><strong><bdi>{result ? formatStoreMoney(business, result.totalDebit) : "—"}</bdi></strong><small>{currency} · شامل دریافت‌ها و انتقال ورودی</small></article>
      <article className="ops-kpi"><span>جمع کاهش حساب‌ها</span><strong><bdi>{result ? formatStoreMoney(business, result.totalCredit) : "—"}</bdi></strong><small>{currency} · شامل پرداخت‌ها و انتقال خروجی</small></article>
    </div>

    <div className="ops-panel">
      <div className="ops-panel-top"><div><h2>حساب‌های صندوق و بانک</h2><p className="ops-panel-description">جزئیات مانده و دسترسی به گردش هر حساب</p></div><button type="button" className="ops-refresh" disabled={loading || busy} onClick={() => setRetry(value => value + 1)}>↻ به‌روزرسانی</button></div>
      <div className="ops-filter-bar ops-cash-filters"><label>مبنای مانده<select value={periodId} disabled={loading} onChange={event => { setPeriodId(event.target.value); setPage(1); setQuery(""); }}><option value="">همه ثبت‌های قطعی</option>{periods.map(period => <option key={period.id} value={period.id}>تا پایان {period.name}</option>)}</select></label>
        <label>جستجو در همین صفحه<input type="search" placeholder="نام یا کد حساب" value={query} disabled={!result || loading} onChange={event => setQuery(event.target.value)} /></label>
        <div className="ops-status-filter" role="group" aria-label="فیلتر وضعیت حساب‌های صفحه"><span>وضعیت حساب</span><div className="ops-tabs">{([ ["ALL", "همه"], ["ACTIVE", "فعال"], ["INACTIVE", "غیرفعال"] ] as const).map(([value, label]) => <button key={value} type="button" className={visibility === value ? "selected" : ""} aria-pressed={visibility === value} onClick={() => setVisibility(value)}>{label}</button>)}</div></div>
      </div>
      {loading && <div className="doc-loading" role="status">در حال دریافت مانده حساب‌ها…</div>}
      {error && <div className="notice error" role="alert">{error}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
      {result && <>
        <div className="ops-list-meta"><span>{formatDecimal(String(rows.length))} حساب نمایشی از {formatDecimal(String(result.items.length))} حساب صفحه جاری · {formatDecimal(String(result.total))} حساب در کل گزارش</span><span>{dateLabel} · {currency}</span></div>
        {rows.length ? <>
          <div className="ops-table-scroller"><table className="ops-table ops-cash-table"><thead><tr><th>حساب</th><th>کد</th><th>وضعیت</th><th>افزایش</th><th>کاهش</th><th>مانده</th><th>عملیات</th></tr></thead><tbody>{rows.map(row => <tr key={row.account.id}>
            <td><strong>{row.account.name}</strong></td><td className="ops-muted-cell"><bdi>{row.account.code}</bdi></td><td><span className={`ops-pill ${row.account.isActive ? "ok" : "neutral"}`}>{row.account.isActive ? "فعال" : "غیرفعال"}</span></td>
            <td className="ops-muted-cell"><bdi>{formatStoreMoney(business, row.totalDebit)}</bdi></td><td className="ops-muted-cell"><bdi>{formatStoreMoney(business, row.totalCredit)}</bdi></td>
            <td className="ops-amount"><bdi>{formatStoreMoney(business, row.balance)}</bdi> <small>{currency}</small></td><td><button className="ops-detail-btn" type="button" disabled={busy} onClick={() => setLedgerId(row.account.id)}>گردش حساب ←</button></td>
          </tr>)}</tbody></table></div>
          <div className="ops-mobile-cards">{rows.map(row => <article className="ops-mobile-card" key={row.account.id}>
            <div className="ops-mobile-card-head"><strong>{row.account.name}</strong><span className={`ops-pill ${row.account.isActive ? "ok" : "neutral"}`}>{row.account.isActive ? "فعال" : "غیرفعال"}</span></div>
            <small>کد <bdi>{row.account.code}</bdi></small><div className="ops-mobile-card-data"><span>افزایش <strong><bdi>{formatStoreMoney(business, row.totalDebit)}</bdi></strong></span><span>کاهش <strong><bdi>{formatStoreMoney(business, row.totalCredit)}</bdi></strong></span></div>
            <div className="ops-mobile-bottom"><span>مانده حساب <strong><bdi>{formatStoreMoney(business, row.balance)}</bdi> {currency}</strong></span><button className="ops-detail-btn" type="button" disabled={busy} onClick={() => setLedgerId(row.account.id)}>گردش حساب ←</button></div>
          </article>)}</div>
        </> : <div className="ops-empty"><h2>حسابی پیدا نشد</h2><p>{query || visibility !== "ALL" ? "فیلترها فقط حساب‌های همین صفحه را بررسی می‌کنند." : "برای شروع یک صندوق یا حساب بانکی تعریف کنید."}</p>{!query && visibility === "ALL" && can("accounts.manage") && <button type="button" className="secondary" disabled={busy} onClick={() => setCreatingAccount(true)}>افزودن صندوق یا بانک</button>}</div>}
        <nav className="ops-pagination" aria-label="صفحه‌بندی حساب‌ها"><button className="secondary" disabled={page <= 1 || loading} onClick={() => { setPage(value => value - 1); setQuery(""); }}>صفحه قبل</button><span>{result.totalPages ? `صفحه ${formatDecimal(String(page))} از ${formatDecimal(String(result.totalPages))}` : "بدون نتیجه"}</span><button className="secondary" disabled={page >= result.totalPages || loading} onClick={() => { setPage(value => value + 1); setQuery(""); }}>صفحه بعد</button></nav>
      </>}
    </div>
    <p className="ops-footnote">مجموع مانده و گردش‌ها از کل گزارش سرور هستند، نه فقط همین صفحه. «افزایش» و «کاهش» شامل دو طرف انتقال وجه نیز می‌شوند. مانده منفی با علامت منفی نمایش داده می‌شود.</p>
    {creatingAccount && can("accounts.manage") && <CashBankAccountForm business={business} onSessionExpired={onSessionExpired} onClose={() => setCreatingAccount(false)} onCreated={account => { setCreatingAccount(false); setSuccess(`حساب «${account.name}» با مانده صفر ساخته شد؛ برای مبلغ اولیه به «مانده‌های اولیه» بروید.`); setPeriodId(""); setPage(1); setRetry(value => value + 1); }} />}
    {operation && ((operation === "EXPENSE" && can("expenses.post")) || (operation === "TRANSFER" && can("cash-transfers.post"))) && <CashOperationForm key={operation} business={business} kind={operation} onSessionExpired={onSessionExpired} onClose={() => { setOperation(null); setRetry(value => value + 1); }} onSaved={value => { setSuccess(`عملیات به مبلغ ${formatStoreMoney(business, value.amount)} با سند شماره ${formatDecimal(value.entryNumber)} ثبت شد.`); setOperation(null); setPeriodId(""); setPage(1); setRetry(current => current + 1); }} />}
  </section>;
}

// Rev9.0d-installed
