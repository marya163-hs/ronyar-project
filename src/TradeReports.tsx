import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import ReportExportActions from "./ReportExportActions";
import { loadTradeOutput } from "./operationalReportExport";
import { formatQuantity } from "./quantityDisplay";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorText, formatDecimal, readBusinessReport, tehranToday } from "./api";
import type { Business, TradeBreakdownPage, TradeBreakdownRow } from "./api";
import { BaseEmpty, BasePanel, BasePagination, BaseStats } from "./BaseUi";
import OperationalReport from "./OperationalReport";
import JalaliDateField from "./JalaliDateField";
import { jalaliText } from "./jalaliDate";
type Props = { business: Business; kind: "sales" | "purchases"; onSessionExpired: () => void };
export default function TradeReports(props: Props) {
  const [mode, setMode] = useState<"daily" | "party" | "product">("daily");
  return <div className="operational-report"><nav className="finance-report-tabs" aria-label="گروه‌بندی گزارش">{([{ id: "daily", title: "روزانه" }, { id: "party", title: "به تفکیک شخص" }, { id: "product", title: "به تفکیک کالا" }] as const).map(item => <button type="button" key={item.id} className={mode === item.id ? "is-active" : ""} aria-current={mode === item.id ? "page" : undefined} onClick={() => setMode(item.id)}>{item.title}</button>)}</nav>{mode === "daily" ? <OperationalReport key={`${props.business.id}:${props.kind}`} {...props} /> : <TradeBreakdown key={`${props.business.id}:${props.kind}:${mode}`} {...props} dimension={mode} />}</div>;
}
export function TradeBreakdown({ business, kind, dimension, onSessionExpired }: Props & { dimension: "party" | "product" }) {
  const expired = useRef(onSessionExpired); expired.current = onSessionExpired;
  const [allDates,setAllDates] = useState(true), [from,setFrom] = useState(tehranToday), [to,setTo] = useState(tehranToday), [search,setSearch] = useState("");
  const [filters,setFilters] = useState<{ fromDate?: string; toDate?: string; search?: string }>({}), [validation,setValidation] = useState("");
  const [page,setPage] = useState(1), [retry,setRetry] = useState(0);
  const [snapshot,setSnapshot] = useState<{ key: string; data?: TradeBreakdownPage; error?: string } | null>(null);
  const key = JSON.stringify([business.id,kind,dimension,page,filters,retry]);
  const current = snapshot?.key === key ? snapshot : null, data = current?.data, loading = !current;
  const noun = kind === "sales" ? "فروش" : "خرید";
  useEffect(() => {
    const c = new AbortController(), q = new URLSearchParams({ page: String(page),limit: "20",...filters });
    readBusinessReport<TradeBreakdownPage>(business.id,`reports/${kind}/by-${dimension}`,q,c.signal).then(result => {
      if(c.signal.aborted) return;
      if(page > Math.max(1,result.totalPages)) { setPage(Math.max(1,result.totalPages)); return; }
      setSnapshot({ key,data:result });
    }).catch(cause => { if(!c.signal.aborted) { setSnapshot({ key,error:errorText(cause) }); if(cause instanceof ApiError && cause.status===401) expired.current(); } });
    return () => c.abort();
  },[key]);
  function apply(e: FormEvent) { e.preventDefault(); setValidation(""); if(!allDates && (!from || !to || from>to)) { setValidation("بازه تاریخ معتبر وارد کنید؛ پایان نباید قبل از شروع باشد."); return; } setPage(1);setFilters({ ...(!allDates ? { fromDate:from,toDate:to } : {}),...(search.trim() ? { search:search.trim() } : {}) });setRetry(n=>n+1); }
  const columns = [...(dimension === "product" ? ["کد کالا"] : []),dimension === "party" ? kind === "sales" ? "مشتری" : "تأمین‌کننده" : "کالا",...(dimension === "product" ? ["واحد","تعداد "+noun,"تعداد برگشت","تعداد خالص"] : []),"مبلغ "+noun,"مبلغ برگشت","مبلغ خالص"];
  const cells = (r: TradeBreakdownRow): string[] => [...(dimension === "product" ? [r.code ?? "—"] : []),r.name+(r.isActive ? "" : " (غیرفعال)"),...(dimension === "product" ? [r.unitName ?? "—",formatQuantity(r.grossQuantity ?? "0"),formatQuantity(r.returnQuantity ?? "0"),formatQuantity(r.netQuantity ?? "0")] : []),formatStoreMoney(business, r.grossAmount),formatStoreMoney(business, r.returnAmount),formatStoreMoney(business, r.netAmount)];
  return <><BasePanel title="محدوده گزارش" note="فیلترها پس از زدن «نمایش گزارش» اعمال می‌شوند."><form className="reports-filter" onSubmit={apply}><label className="reports-check"><input type="checkbox" checked={allDates} onChange={e=>setAllDates(e.target.checked)} />همه تاریخ‌ها</label>{!allDates && <><JalaliDateField id="trade-from" label="از تاریخ (شمسی)" value={from} onChange={setFrom} /><JalaliDateField id="trade-to" label="تا تاریخ (شمسی)" value={to} onChange={setTo} minISO={from} /></>}<label>{dimension === "party" ? "جستجوی نام شخص" : "جستجوی نام یا کد کالا"}<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} /></label><button type="submit" className="primary" disabled={loading}>نمایش گزارش</button></form>{validation && <p className="notice error" role="alert">{validation}</p>}
    <p className="reports-context">{filters.fromDate ? `${jalaliText(filters.fromDate)} تا ${jalaliText(filters.toDate ?? "")}` : "همه تاریخ‌ها"}{filters.search ? ` · جستجو: ${filters.search}` : ""} · ارقام به {storeMoneyUnit(business)}</p>
    <p className="reports-context">فقط اسناد قطعی؛ هر برگشت در تاریخ ثبت خودش محاسبه می‌شود. این گزارش عملکرد دوره است و مانده بدهی یا تسویه اشخاص را نشان نمی‌دهد.</p>
    {dimension === "product" && <p className="reports-context">مبالغ از ردیف‌های فاکتور، پس از تخفیف و با مالیات محاسبه می‌شوند؛ گردکردن نهایی فاکتور به کالاها تخصیص داده نمی‌شود. تعداد کالاهای مختلف با هم جمع نمی‌شود؛ واحد، واحد ثبت‌شده در ردیف سند است.</p>}
    </BasePanel>
    {loading && <p role="status">در حال دریافت گزارش…</p>}{current?.error && <div className="notice error" role="alert">{current.error}<button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>تلاش دوباره</button></div>}
    {data && <><ReportExportActions business={business} key={JSON.stringify([business.id,kind,dimension,filters])} load={signal => loadTradeOutput(business.id,kind,dimension,filters,signal)} onSessionExpired={onSessionExpired} /><BaseStats items={[{ label:"مبلغ "+noun,value:formatStoreMoney(business, data.totalGross),hint:"کل گزارش؛ مستقل از صفحه‌بندی" },{ label:"مبلغ برگشت",value:formatStoreMoney(business, data.totalReturns),hint:"کل گزارش؛ مستقل از صفحه‌بندی" },{ label:"خالص "+noun,value:formatStoreMoney(business, data.netAmount),hint:"کل گزارش؛ مستقل از صفحه‌بندی" }]} />
    <BasePanel title={dimension === "party" ? noun+" به تفکیک شخص" : noun+" به تفکیک کالا"} note={`${formatDecimal(String(data.total))} ردیف در کل گزارش؛ مرتب‌شده بر اساس مبلغ خالص`}>{data.items.length ? <><div className="reports-table-scroll"><table className="base-table reports-table"><thead><tr>{columns.map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{data.items.map(row=><tr key={row.key}>{cells(row).map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div><div className="reports-mobile-rows">{data.items.map(row=><article className="reports-mobile-row" key={row.key}>{cells(row).map((cell,i)=><div key={i}><span>{columns[i]}</span><strong>{cell}</strong></div>)}</article>)}</div></> : <BaseEmpty title="ردیفی در این محدوده وجود ندارد" description="بازه تاریخ و عبارت جستجو را بررسی کنید." />}<BasePagination page={page} totalPages={data.totalPages} loading={loading} onChange={setPage} /></BasePanel></>}
  </>;
}
