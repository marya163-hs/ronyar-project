import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { formatQuantity } from "./quantityDisplay";
import StockMovements from "./StockMovements";
import { useEffect, useMemo, useState } from "react";
import { ApiError, errorText, formatDecimal, listStockBalances } from "./api";
import type { Business, StockBalancePage } from "./api";
import { loadInventoryOptions } from "./inventoryOptions";
import { jalaliText } from "./jalaliDate";
import { moneyUnit, nonPositiveDecimal, searchText, sumDecimalStrings } from "./operationsDisplay";

type Props = { business: Business; onSessionExpired: () => void };
export default function Inventory({ business, onSessionExpired }: Props) {
  const [view, setView] = useState<"balances" | "movements">("balances");
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadInventoryOptions>> | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true), [optionsError, setOptionsError] = useState("");
  const [warehouseId, setWarehouseId] = useState(""), [productId, setProductId] = useState(""), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<StockBalancePage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true); setOptionsError(""); setOptions(null);
    loadInventoryOptions(business.id, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setOptions(value);
        setWarehouseId(current => value.warehouses.some(item => item.id === current) ? current : value.warehouses.find(item => item.isDefault)?.id ?? value.warehouses[0]?.id ?? "");
      }
    }).catch(cause => {
      if (!controller.signal.aborted) { setOptionsError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); }
    }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [business.id, retry]);

  useEffect(() => {
    setResult(null); setError("");
    if (!warehouseId || view !== "balances") { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    listStockBalances(business.id, warehouseId, page, productId, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        if (value.totalPages > 0 && page > value.totalPages) setPage(value.totalPages);
        else setResult(value);
      }
    }).catch(cause => {
      if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, warehouseId, productId, page, retry, view]);

  const rows = useMemo(() => {
    const term = searchText(query.trim());
    return (result?.items ?? []).filter(item => !term || [item.product.name, item.product.code]
      .some(value => searchText(value).includes(term)));
  }, [result, query]);
  const countZero = result?.items.filter(row => nonPositiveDecimal(row.quantity)).length ?? 0;
  const pageValue = result ? sumDecimalStrings(result.items.map(row => row.inventoryValue)) : null;
  const warehouseName = options?.warehouses.find(item => item.id === warehouseId)?.name ?? "انبار انتخابی";
  const currency = moneyUnit(business.baseCurrency);
  const hasFilter = Boolean(productId || query);

  return <section className="ops-page" aria-label="موجودی انبار">
    <header className="ops-head"><div><p className="ops-breadcrumb">{business.name} <span>/</span> مالی و موجودی</p><h1>موجودی انبار</h1><p className="ops-subtitle">موجودی کالا، ارزش دفتری و سابقه ورود و خروج را یکجا ببینید.</p></div>
      <button type="button" className="secondary ops-refresh" disabled={loading || optionsLoading} onClick={() => setRetry(value => value + 1)}>↻ <span>به‌روزرسانی</span></button>
    </header>

    {view === "balances" && <div className="ops-kpis" aria-label="خلاصه وضعیت انبار">
      <article className="ops-kpi"><span>ردیف‌های موجودی این انبار</span><strong>{result && view === "balances" ? formatDecimal(String(result.total)) : "—"}</strong><small>کل ردیف‌ها با فیلتر کالای انتخابی، در همه صفحات</small></article>
      <article className="ops-kpi ops-kpi-accent"><span>ارزش دفتری صفحه جاری</span><strong><bdi>{pageValue !== null && view === "balances" ? formatStoreMoney(business, pageValue) : "—"}</bdi></strong><small>{currency} · فقط ردیف‌های دریافت‌شده در این صفحه</small></article>
      <article className="ops-kpi"><span>موجودی صفر یا منفی</span><strong>{result && view === "balances" ? formatDecimal(String(countZero)) : "—"}</strong><small>فقط در صفحه جاری؛ شامل کالاهای بدون گردش نیست</small></article>
    </div>}

    <div className="ops-panel">
      <div className="ops-panel-top"><div className="ops-tabs" role="group" aria-label="نوع گزارش انبار">
        <button type="button" className={view === "balances" ? "selected" : ""} aria-pressed={view === "balances"} onClick={() => { setView("balances"); setPage(1); }}>موجودی فعلی</button>
        <button type="button" className={view === "movements" ? "selected" : ""} aria-pressed={view === "movements"} onClick={() => setView("movements")}>گردش کالا</button>
      </div><span className="ops-panel-hint">{view === "balances" ? `گزارش ${warehouseName}` : `تاریخچه ورود و خروج ${warehouseName}`}</span></div>
      <div className={`ops-filter-bar ${view === "movements" ? "ops-inventory-movement-filters" : ""}`}>
        <label>انبار<select value={warehouseId} disabled={optionsLoading || !!optionsError} onChange={event => { setWarehouseId(event.target.value); setPage(1); setQuery(""); }}><option value="">انتخاب انبار</option>{options?.warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>کالا<select value={productId} disabled={optionsLoading || !warehouseId} onChange={event => { setProductId(event.target.value); setPage(1); setQuery(""); }}><option value="">همه کالاها</option>{options?.products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.code}{item.isActive ? "" : " (غیرفعال)"}</option>)}</select></label>
        {view === "balances" && <label>جستجو در صفحه جاری<input type="search" placeholder="نام یا کد کالا" value={query} disabled={loading || !result} onChange={event => setQuery(event.target.value)} /></label>}
        {hasFilter && <button className="ops-clear" type="button" onClick={() => { setProductId(""); setQuery(""); setPage(1); }}>پاک‌کردن فیلترها</button>}
      </div>
      {optionsLoading && <div className="doc-loading" role="status">در حال دریافت اطلاعات انبار…</div>}
      {optionsError && <div className="notice error" role="alert">{optionsError}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
      {!optionsLoading && options && !options.warehouses.length && <div className="ops-empty"><h2>انبار فعالی پیدا نشد</h2><p>ابتدا در اطلاعات پایه یک انبار فعال تعریف کنید.</p></div>}
      {view === "balances" && <>
        {loading && <div className="doc-loading" role="status">در حال دریافت موجودی…</div>}
        {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
        {result && <>
          <div className="ops-list-meta"><span>{formatDecimal(String(rows.length))} ردیف نمایشی از {formatDecimal(String(result.items.length))} ردیف صفحه جاری</span><span>ارزش موجودی با قیمت فروش متفاوت است · {currency}</span></div>
          {rows.length ? <>
            <div className="ops-table-scroller"><table className="ops-table"><thead><tr><th>کالا</th><th>کد کالا</th><th>مقدار موجود</th><th>ارزش دفتری</th><th>آخرین گردش</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}>
              <td><strong>{item.product.name}</strong>{!item.product.isActive && <span className="ops-pill neutral">غیرفعال</span>}</td>
              <td className="ops-muted-cell"><bdi>{item.product.code}</bdi></td>
              <td><span className={nonPositiveDecimal(item.quantity) ? "ops-amount warning" : "ops-amount"}><bdi>{formatQuantity(item.quantity)}</bdi> <small>{item.product.unit.name}</small></span></td>
              <td className="ops-amount"><bdi>{formatStoreMoney(business, item.inventoryValue)}</bdi> <small>{currency}</small></td>
              <td className="ops-muted-cell"><bdi>{item.lastMovementDate ? jalaliText(item.lastMovementDate) : "—"}</bdi></td>
            </tr>)}</tbody></table></div>
            <div className="ops-mobile-cards">{rows.map(item => <article className="ops-mobile-card" key={item.id}>
              <div className="ops-mobile-card-head"><strong>{item.product.name}</strong><span className={nonPositiveDecimal(item.quantity) ? "ops-pill caution" : "ops-pill ok"}>{nonPositiveDecimal(item.quantity) ? "بدون موجودی" : "موجود"}</span></div>
              <small>کد: <bdi>{item.product.code}</bdi></small><div className="ops-mobile-card-data"><span>مقدار <strong><bdi>{formatQuantity(item.quantity)}</bdi> {item.product.unit.name}</strong></span><span>ارزش دفتری <strong><bdi>{formatStoreMoney(business, item.inventoryValue)}</bdi> {currency}</strong></span></div>
              <small>آخرین گردش: <bdi>{item.lastMovementDate ? jalaliText(item.lastMovementDate) : "—"}</bdi></small>
            </article>)}</div>
          </> : <div className="ops-empty"><h2>کالایی پیدا نشد</h2><p>{query ? "جستجو فقط ردیف‌های همین صفحه را بررسی می‌کند." : "ممکن است این کالا هنوز گردش انبار نداشته باشد."}</p></div>}
          <nav className="ops-pagination" aria-label="صفحه‌بندی موجودی"><button className="secondary" disabled={page <= 1 || loading} onClick={() => { setPage(value => value - 1); setQuery(""); }}>صفحه قبل</button><span>{result.totalPages ? `صفحه ${formatDecimal(String(page))} از ${formatDecimal(String(result.totalPages))}` : "بدون نتیجه"}</span><button className="secondary" disabled={page >= result.totalPages || loading} onClick={() => { setPage(value => value + 1); setQuery(""); }}>صفحه بعد</button></nav>
        </>}
      </>}
      {view === "movements" && warehouseId && <StockMovements key={`${business.id}:${warehouseId}:${productId}`} business={business} warehouseId={warehouseId} productId={productId} onSessionExpired={onSessionExpired} />}
    </div>
    <p className="ops-footnote">آمار ارزش و تعداد موجودی صفر فقط بر پایه ردیف‌های صفحه جاری است؛ برای جمع قطعی همه انبارها به گزارش تجمیعی سمت سرور نیاز داریم.</p>
  </section>;
}
