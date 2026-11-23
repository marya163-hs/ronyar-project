import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { periodForDate } from "./documentPeriod";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import { jalaliText } from "./jalaliDate";
import { ApiError, createSaleReturn, updateSaleReturn, errorText, formatDecimal, tehranToday } from "./api";
import type { Business, SaleReturnDetails } from "./api";
import { loadSaleReturnOptions, loadSaleReturnSource } from "./saleReturnOptions";
import { calculateReturnLine, remainingReturnQuantity, returnUnits } from "./saleReturnAmounts";
import { decimalString, normalizeDigits } from "./saleAmounts";

type Props = {
  business: Business;
  document: SaleReturnDetails | null;
  onSaved: (document: SaleReturnDetails) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
};
const reasonSuggestions = ["خرابی یا ایراد کالا", "مغایرت با سفارش", "انصراف مشتری", "سایر موارد"];

export default function SaleReturnForm({ business, document, onSaved, onCancel, onSessionExpired }: Props) {
  const [originalId, setOriginalId] = useState(document?.originalId ?? "");
  const [date, setDate] = useState(document?.documentDate ?? tehranToday());
  const [reason, setReason] = useState(document?.reason ?? "");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(document?.items.map(item => [item.originalItemId, item.quantity]) ?? []));
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadSaleReturnOptions>> | null>(null);
  const [source, setSource] = useState<Awaited<ReturnType<typeof loadSaleReturnSource>> | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const alive = useRef(true);
  const sending = useRef(false);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true); setError("");
    loadSaleReturnOptions(business.id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setOptions(value); })
      .catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [business.id, retry]);
  useEffect(() => {
    setSource(null);
    if (!originalId) { setSourceLoading(false); return; }
    const controller = new AbortController();
    setSourceLoading(true); setError("");
    loadSaleReturnSource(business.id, originalId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSource(value); })
      .catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [business.id, originalId, retry]);

  // Ignore stale network data immediately after switching the source invoice.
  const activeSource = source?.original.id === originalId ? source : null;
  const filteredSales = useMemo(() => {
    const term = normalizeDigits(search).trim().toLocaleLowerCase("fa-IR");
    return options?.sales.filter(item => !term || item.id === originalId ||
      normalizeDigits(`${item.number ?? ""} ${item.party.name}`).toLocaleLowerCase("fa-IR").includes(term)) ?? [];
  }, [options?.sales, originalId, search]);
  const selectedInvoice = options?.sales.find(item => item.id === originalId);
  const rows = activeSource?.original.items.map(item => {
    const previous = activeSource.returns.flatMap(value => value.items).filter(value => value.originalItemId === item.id);
    try {
      const remaining = remainingReturnQuantity(item, previous);
      const selected = Object.prototype.hasOwnProperty.call(quantities, item.id);
      const preview = selected ? calculateReturnLine(quantities[item.id], item, previous, business.currencyScale) : null;
      return { item, remaining, preview, error: "", selected };
    } catch (cause) {
      return { item, remaining: "", preview: null, error: cause instanceof Error ? cause.message : "مقدار معتبر نیست.", selected: Object.prototype.hasOwnProperty.call(quantities, item.id) };
    }
  }) ?? [];
  const chosen = rows.filter(row => row.selected);
  const totals = rows.reduce((acc, row) => {
    if (row.preview) {
      acc.gross += row.preview.gross;
      acc.discount += row.preview.discount;
      acc.tax += row.preview.tax;
      acc.total += row.preview.total;
    }
    return acc;
  }, { gross: 0n, discount: 0n, tax: 0n, total: 0n });
  const money = (amount: bigint) => formatStoreMoney(business, decimalString(amount, business.currencyScale));
  const currency = storeMoneyUnit(business);
  const period = periodForDate(options?.periods ?? [], date);
  const periodId = period?.id ?? "";
  const loading = optionsLoading || sourceLoading;
  const isAllowedDate = (iso: string) => (options?.periods ?? []).some(item => iso >= item.startDate && iso <= item.endDate);

  function changeInvoice(id: string) { setOriginalId(id); setQuantities({}); setError(""); }
  function toggleItem(id: string, remaining: string, checked: boolean) {
    setQuantities(current => {
      const next = { ...current };
      if (!checked) delete next[id];
      else {
        // Start with a single unit, when possible. Never silently select all remaining units.
        try { next[id] = returnUnits(remaining, 6) >= returnUnits("1", 6) ? "1" : remaining; }
        catch { next[id] = ""; }
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || blocked || loading || !options || !activeSource) return;
    setError("");
    try {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
          !period || date < activeSource.original.documentDate) {
        throw new Error("تاریخ برگشت باید شمسیِ معتبر، در یک دوره مالی باز و برابر یا بعد از تاریخ فروش باشد.");
      }
      if (!reason.trim()) throw new Error("دلیل برگشت را وارد کنید.");
      if (!chosen.length || chosen.length > 100) throw new Error("حداقل یک قلم و حداکثر ۱۰۰ قلم برای برگشت انتخاب کنید.");
      for (const row of chosen) if (row.error || !row.preview) throw new Error(row.error || "مقدار برگشت معتبر نیست.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "اطلاعات معتبر نیست."); return; }

    sending.current = true; setBusy(true);
    const body = {
      originalId, periodId, documentDate: date, reason: reason.trim(),
      items: chosen.map(row => ({ originalItemId: row.item.id, quantity: normalizeDigits(quantities[row.item.id]) })),
    };
    try {
      const result = document
        ? await updateSaleReturn(business.id, document.id, { ...body, version: document.version })
        : await createSaleReturn(business.id, body);
      if (alive.current) onSaved(result);
    } catch (cause) {
      if (alive.current) {
        const unknown = !(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408);
        if (unknown || (cause instanceof ApiError && cause.status === 409)) setBlocked(true);
        setError(unknown
          ? "نتیجه ذخیره مشخص نیست؛ فرم را ببندید و فهرست را بررسی کنید. ارسال دوباره متوقف شد."
          : cause.status === 409
            ? "مقدار باقی‌مانده، نسخه سند یا دوره مالی تغییر کرده است؛ فرم را ببندید و دوباره بررسی کنید."
            : cause.status === 403 ? "اجازه ساخت یا ویرایش برگشت فروش را ندارید." : errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      }
    } finally { sending.current = false; if (alive.current) setBusy(false); }
  }

  return <FormDrawer title={document ? "ویرایش پیش‌نویس برگشت از فروش" : "ثبت برگشت از فروش"} busy={busy} onClose={onCancel}>
    <section className="product-form-panel sale-form-panel sale-return-form" dir="rtl">
      <div className="return-intro"><span className="return-draft-mark">پیش‌نویس</span><p>فاکتور اصلی را پیدا کنید، کالاهای برگشتی را مشخص کنید و پیش‌نویس را ذخیره کنید. موجودی و حساب‌ها فقط بعد از ثبت قطعی تغییر می‌کنند.</p></div>
      {optionsLoading && <div className="return-info" role="status">در حال دریافت فاکتورهای فروش و دوره‌های مالی…</div>}
      {error && <div className="notice error" role="alert">{error}{!busy && !blocked && <button className="text-button" type="button" onClick={() => setRetry(value => value + 1)}>بررسی دوباره</button>}</div>}
      <form onSubmit={submit} noValidate>
        <fieldset className="product-form-fields return-form-sections" disabled={busy || blocked || optionsLoading || !options}>
          <p className="notice">برای محصول دارای دستور مصرف، برگشت فروش مواد مصرف‌شده را به انبار برنمی‌گرداند و هزینهٔ آن‌ها باقی می‌ماند.</p>
          <section className="return-step" aria-labelledby="return-step-source">
            <div className="return-step-header"><span className="return-step-number">۱</span><div><h3 id="return-step-source">فاکتور فروش اصلی</h3><p>شماره فاکتور یا نام مشتری را جستجو کنید.</p></div></div>
            {!document && <label className="return-search">جستجوی سریع فاکتور<input type="search" placeholder="مثلاً شماره ۱۰۲۴ یا نام مشتری" value={search} onChange={event => setSearch(event.target.value)} /></label>}
            <label>فاکتور ثبت‌شده <span className="return-required">*</span>
              <select value={originalId} disabled={Boolean(document)} required onChange={event => changeInvoice(event.target.value)}>
                <option value="">انتخاب فاکتور فروش</option>
                {filteredSales.map(item => <option key={item.id} value={item.id}>شماره {item.number ? formatDecimal(item.number) : "—"} · {item.party.name} · {jalaliText(item.documentDate)}</option>)}
              </select>
            </label>
            {selectedInvoice && <div className="return-source-summary" aria-label="مشخصات فاکتور اصلی">
              <div><small>مشتری</small><strong>{selectedInvoice.party.name}</strong></div>
              <div><small>تاریخ فروش</small><strong>{jalaliText(selectedInvoice.documentDate)}</strong></div>
              <div><small>مبلغ فاکتور</small><strong><bdi>{formatStoreMoney(business, selectedInvoice.total)}</bdi> {currency}</strong></div>
            </div>}
            {sourceLoading && <p className="return-info" role="status">در حال بررسی اقلام و برگشت‌های قبلی این فاکتور…</p>}
            {!optionsLoading && options?.sales.length === 0 && <p className="return-empty">فاکتور فروش قطعی برای برگشت پیدا نشد.</p>}
            {!optionsLoading && search && filteredSales.length === 0 && <p className="return-empty">فاکتوری مطابق جستجو پیدا نشد.</p>}
          </section>

          <section className="return-step" aria-labelledby="return-step-items">
            <div className="return-step-header"><span className="return-step-number">۲</span><div><h3 id="return-step-items">کالاهای مرجوعی</h3><p>فقط کالاهای برگشتی را علامت بزنید و مقدار را مشخص کنید.</p></div></div>
            {!source && !sourceLoading && <div className="return-empty">پس از انتخاب فاکتور، کالاهای آن در این قسمت نمایش داده می‌شوند.</div>}
            {activeSource && rows.length === 0 && <div className="return-empty">این فاکتور قلمی برای برگشت ندارد.</div>}
            {rows.map((row, index) => {
              let remainingIsZero = false;
              try { remainingIsZero = returnUnits(row.remaining, 6) === 0n; } catch { /* show server/data error under the row */ }
              return <article className={`return-item ${row.selected ? "is-selected" : ""}`} key={row.item.id}>
                <div className="return-item-top">
                  <label className="return-item-choice"><input type="checkbox" checked={row.selected} disabled={!row.selected && remainingIsZero}
                    onChange={event => toggleItem(row.item.id, row.remaining, event.target.checked)} />
                    <span><strong>{row.item.productName}</strong><small>قلم {formatDecimal(String(index + 1))} · {row.item.unitName}</small></span>
                  </label>
                  {remainingIsZero && <span className="return-fully-returned">کاملاً برگشت‌شده</span>}
                </div>
                <div className="return-item-metrics"><span>فروخته‌شده: <bdi>{formatDecimal(row.item.quantity)}</bdi></span><span>قابل برگشت: <bdi>{row.remaining ? formatDecimal(row.remaining) : "—"}</bdi></span><span>قیمت واحد: <bdi>{formatStoreMoney(business, row.item.unitPrice)}</bdi> {currency}</span></div>
                {row.selected && <div className="return-item-inputs">
                  <label>تعداد برگشتی <span className="return-required">*</span><input dir="ltr" inputMode="decimal" maxLength={25} required
                    aria-invalid={Boolean(row.error)} value={quantities[row.item.id] ?? ""}
                    onChange={event => setQuantities(current => ({ ...current, [row.item.id]: event.target.value }))} /></label>
                  <button type="button" className="secondary return-max-button" onClick={() => setQuantities(current => ({ ...current, [row.item.id]: row.remaining }))} disabled={!row.remaining}>کل مقدار مجاز</button>
                </div>}
                {row.selected && row.error && <p className="line-error" role="alert">{row.error}</p>}
                {row.preview && <div className="return-item-total"><span>مبلغ این قلم (پس از تخفیف و مالیات)</span><strong><bdi>{formatStoreMoney(business, row.preview.totalText)}</bdi> {currency}</strong></div>}
              </article>;
            })}
            {activeSource && <p className="return-selection-count" aria-live="polite">{formatDecimal(String(chosen.length))} قلم برای برگشت انتخاب شده است.</p>}
          </section>

          <section className="return-step" aria-labelledby="return-step-meta">
            <div className="return-step-header"><span className="return-step-number">۳</span><div><h3 id="return-step-meta">تاریخ و دلیل برگشت</h3><p>تاریخ را به شمسی وارد کنید؛ دلیل را برای پیگیری بعدی بنویسید.</p></div></div>
            <JalaliDateField id="sale-return-date" label="تاریخ برگشت (شمسی) *" value={date} onChange={setDate}
              disabled={busy || blocked || optionsLoading} minISO={activeSource?.original.documentDate} isDateAllowed={isAllowedDate} />
            <div className={period ? "return-period-info" : "return-period-info is-warning"}>
              {period ? `دوره مالی: ${period.name}` : "برای این تاریخ، دوره مالی باز وجود ندارد."}
            </div>
            <div className="return-reason">
              <label htmlFor="sale-return-reason">دلیل برگشت <span className="return-required">*</span></label>
              <div className="return-reason-chips">{reasonSuggestions.map(item => <button type="button" key={item} className={reason === item ? "is-active" : ""} onClick={() => setReason(item)}>{item}</button>)}</div>
              <textarea id="sale-return-reason" value={reason} required maxLength={500} rows={3} placeholder="مثلاً بسته‌بندی آسیب‌دیده بود…" onChange={event => setReason(event.target.value)} />
              <small className="muted">می‌توانید دلیل را خودتان بنویسید یا از گزینه‌های پیشنهادی استفاده کنید.</small>
            </div>
          </section>

          <section className="return-step return-review" aria-labelledby="return-step-review">
            <div className="return-step-header"><span className="return-step-number">۴</span><div><h3 id="return-step-review">بررسی مبلغ برگشت</h3><p>مبالغ از فاکتور اصلی و مقادیر انتخاب‌شده محاسبه می‌شوند.</p></div></div>
            <dl className="return-totals"><div><dt>جمع اقلام</dt><dd><bdi>{money(totals.gross)}</bdi> {currency}</dd></div><div><dt>سهم تخفیف</dt><dd>− <bdi>{money(totals.discount)}</bdi> {currency}</dd></div><div><dt>سهم مالیات</dt><dd>+ <bdi>{money(totals.tax)}</bdi> {currency}</dd></div><div className="return-grand-total"><dt>جمع مبلغ برگشت</dt><dd><bdi>{money(totals.total)}</bdi> {currency}</dd></div></dl>
            <p className="return-accounting-note">ذخیره این فرم فقط پیش‌نویس ایجاد می‌کند. ثبت قطعی و استرداد وجه مراحل جداگانه هستند.</p>
          </section>
        </fieldset>
        <div className="form-actions return-form-actions"><button className="primary" type="submit" disabled={busy || blocked || loading || !activeSource || !period || !chosen.length || chosen.some(row => row.error || !row.preview) || !reason.trim()}>
          {busy ? "در حال ذخیره…" : "ذخیره پیش‌نویس برگشت"}
        </button><button className="secondary" type="button" disabled={busy} onClick={onCancel}>انصراف</button></div>
      </form>
    </section>
  </FormDrawer>;
}
