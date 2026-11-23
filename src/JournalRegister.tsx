import ManualJournalForm from "./ManualJournalForm";
import { useStoreCan } from "./StorePermissions";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { journalDescription } from "./journalDescription";
import { useEffect, useMemo, useState } from "react";
import JournalDetailsPanel from "./JournalDetailsPanel";
import { journalKindLabel } from "./journalKinds";
import { BaseBadge, BaseEmpty, BaseHeader, BasePagination, BasePanel, BaseStats, filterText } from "./BaseUi";
import { jalaliText } from "./jalaliDate";
import { ApiError, errorText, formatDecimal, listFiscalPeriods, listJournals } from "./api";
import type { Business, FiscalPeriod, JournalListPage, JournalListRow } from "./api";

type Props = { business: Business; onSessionExpired: () => void };


export default function JournalRegister({ business, onSessionExpired }: Props) {
 const can = useStoreCan();
 const [manualOpen,setManualOpen] = useState(false);
 const value = (s: string) => formatStoreMoney(business, s);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<JournalListPage | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listFiscalPeriods(business.id, controller.signal).then(data => {
      if (!controller.signal.aborted) setPeriods(data);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      }
    });
    return () => controller.abort();
  }, [business.id, onSessionExpired]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    listJournals(business.id, page, periodId, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.totalPages > 0 && page > data.totalPages) setPage(data.totalPages);
      else setResult(data);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, page, periodId, revision, onSessionExpired]);

  const rows = useMemo(() => {
    const q = filterText(search);
    if (!q) return result?.items ?? [];
    return (result?.items ?? []).filter(row => filterText(`${row.entryNumber ?? ""} ${journalDescription(row.description)} ${jalaliText(row.documentDate)}`).includes(q));
  }, [result, search]);
  const showEntry = (row: JournalListRow) => setEntryId(row.id);
  const totalLabel = periodId ? "اسناد قطعی در دوره" : "تمام اسناد قطعی";
  const curr = storeMoneyUnit(business);

  return <div className="base-page journal-register base-has-mobile-cards">
    <BaseHeader title="اسناد حسابداری" description="مرور مستقل ثبت‌های قطعی، حساب‌های بدهکار و بستانکار و تراز هر سند" action={can("journals.manual.post")&&can("accounts.read")&&can("periods.read") ? ()=>setManualOpen(true) : undefined} actionLabel="ثبت سند دستی" secondary={<button type="button" className="secondary base-refresh" disabled={loading} onClick={() => setRevision(n => n + 1)}>↻ به‌روزرسانی</button>} />
    <BaseStats items={[
      { label: totalLabel, value: result?.total ?? "—", hint: "تعداد کل طبق گزارش سرور" },
      { label: "سندهای صفحه جاری", value: result ? result.items.length : "—", hint: `حداکثر ${20} سند در هر صفحه` },
      { label: "سندهای تراز صفحه", value: result ? result.items.filter(row => row.totalDebit === row.totalCredit).length : "—", hint: "تراز هر سند؛ نه جمع کل دوره" },
    ]}/>
    <BasePanel title="فهرست اسناد" note="اسناد به ترتیب تاریخ ثبت سند (جدیدترین ابتدا) نمایش داده می‌شوند.">
      <div className="base-filters journal-filters">
        <label>جستجو در همین صفحه<input aria-label="جستجو در اسناد صفحه جاری" placeholder="شماره، شرح یا تاریخ شمسی" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>دوره مالی<select value={periodId} onChange={event => { setPeriodId(event.target.value); setPage(1); setSearch(""); }}><option value="">همه دوره‌ها</option>{periods.map(period => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label>
      </div>
      <div className="base-meta"><span>جستجو فقط در رکوردهای همین صفحه انجام می‌شود؛ فیلتر دوره روی تمام اسناد اعمال می‌شود.</span><span>مبالغ به {curr}</span></div>
      {loading && <p className="base-loading" role="status">در حال دریافت اسناد حسابداری…</p>}
      {error && <div className="notice error" role="alert">{error} <button type="button" className="text-button" onClick={() => setRevision(n => n + 1)}>تلاش دوباره</button></div>}
      {!loading && !error && result && (rows.length ? <>
        <div className="base-table-scroll"><table className="base-table journal-table"><thead><tr><th scope="col">شماره سند</th><th scope="col">تاریخ شمسی</th><th scope="col">شرح سند</th><th scope="col">نوع سند</th><th scope="col">بدهکار</th><th scope="col">بستانکار</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong><bdi>{row.entryNumber ? formatDecimal(row.entryNumber) : "—"}</bdi></strong></td><td><bdi>{jalaliText(row.documentDate)}</bdi></td><td>{journalDescription(row.description)}<small className="base-subcode">{formatDecimal(String(row.lineCount))} ردیف</small></td><td>{row.manual ? "سند دستی" : journalKindLabel(row.kind)}</td><td className="base-money"><bdi>{value(row.totalDebit)}</bdi></td><td className="base-money"><bdi>{value(row.totalCredit)}</bdi></td><td><BaseBadge active={row.totalDebit === row.totalCredit} label={row.totalDebit === row.totalCredit ? "تراز" : "نیازمند بررسی"}/></td><td><button type="button" className="secondary base-row-edit" onClick={() => showEntry(row)}>مشاهده سند</button></td></tr>)}</tbody></table></div>
        <div className="base-mobile-list">{rows.map(row => <article className="base-mobile-card" key={row.id}><div className="base-mobile-card-top"><strong>سند {row.entryNumber ? formatDecimal(row.entryNumber) : "—"}</strong><BaseBadge active={row.totalDebit === row.totalCredit} label={row.totalDebit === row.totalCredit ? "تراز" : "نیازمند بررسی"}/></div><small>{jalaliText(row.documentDate)} · {formatDecimal(String(row.lineCount))} ردیف · {row.manual ? "سند دستی" : journalKindLabel(row.kind)}</small><p className="journal-mobile-desc">{journalDescription(row.description)}</p><div className="journal-mobile-amounts"><span>بدهکار <bdi>{value(row.totalDebit)}</bdi></span><span>بستانکار <bdi>{value(row.totalCredit)}</bdi></span></div><button type="button" className="secondary" onClick={() => showEntry(row)}>مشاهده جزئیات سند</button></article>)}</div>
      </> : <BaseEmpty title={search ? "نتیجه‌ای در این صفحه پیدا نشد" : "سند قطعی در این محدوده وجود ندارد"} description={search ? "جستجو را پاک کنید یا صفحه دیگری را باز کنید." : "با ثبت قطعی خرید، فروش یا دریافت و پرداخت، سند حسابداری اینجا نمایش داده می‌شود."} />)}
      {result && <BasePagination page={page} totalPages={result.totalPages} loading={loading} onChange={next => { setPage(next); setSearch(""); }} caption={`تعداد کل: ${formatDecimal(String(result.total))}`}/>}
    </BasePanel>
    {manualOpen && <ManualJournalForm business={business} periods={periods} onSessionExpired={onSessionExpired}
      onClose={()=>setManualOpen(false)} onSaved={id=>{setManualOpen(false);setEntryId(id);setRevision(n=>n+1);}}/>}
    {entryId && <JournalDetailsPanel business={business} entryId={entryId} onClose={() => setEntryId(null)} onSessionExpired={onSessionExpired} onChanged={() => setRevision(n => n + 1)} />}
  </div>;
}
