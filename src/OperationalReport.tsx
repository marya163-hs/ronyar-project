import GroupDebtReminder from "./GroupDebtReminder";
import { storeMoneyUnit } from "./storeMoney";
import ReportExportActions from "./ReportExportActions";
import { loadOperationalOutput } from "./operationalReportExport";
import AccountCodeDetails from "./AccountCodeDetails";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorText, formatDecimal, listBaseWarehouses, tehranToday } from "./api";
import type { Business, Warehouse } from "./api";
import { BaseEmpty, BasePagination, BasePanel, BaseStats } from "./BaseUi";
import JalaliDateField from "./JalaliDateField";
import { jalaliText } from "./jalaliDate";
import AccountLedger from "./AccountLedger";
import DetailedLedger from "./DetailedLedger";
import { useStoreCan } from "./StorePermissions";
import { loadOperationalReport } from "./operationalReportApi";
import { operationalReportView } from "./operationalReportView";
import type { OperationalReportKind, OperationalResult, ReportFilters } from "./reportContracts";
type Props = { business: Business; kind: OperationalReportKind; onSessionExpired: () => void };
export default function OperationalReport({ business, kind, onSessionExpired }: Props) {
  const can = useStoreCan();
  const expired = useRef(onSessionExpired); expired.current = onSessionExpired;
  const [allDates, setAllDates] = useState(true), [from, setFrom] = useState(tehranToday), [to, setTo] = useState(tehranToday);
  const [status, setStatus] = useState(""), [role, setRole] = useState<"ALL" | "CUSTOMER" | "SUPPLIER">("ALL"), [warehouseId, setWarehouseId] = useState("");
  const [filters, setFilters] = useState<ReportFilters>({}), [page, setPage] = useState(1), [retry, setRetry] = useState(0), [validation, setValidation] = useState("");
  const [snapshot, setSnapshot] = useState<{ key: string; result?: OperationalResult; error?: string } | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]), [warehouseError, setWarehouseError] = useState("");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const dated = ["sales", "purchases", "receivables", "payables"].includes(kind);
  const settlement = kind === "receivables" || kind === "payables";
  const key = JSON.stringify([business.id, kind, page, filters, retry]);
  const current = snapshot?.key === key ? snapshot : null;
  const result = current?.result, error = current?.error;
  const loading = !current;
  useEffect(() => {
    const controller = new AbortController();
    loadOperationalReport(business.id, kind, page, filters, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (page > Math.max(1, data.data.totalPages)) { setPage(Math.max(1, data.data.totalPages)); return; }
      setSnapshot({ key, result: data });
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setSnapshot({ key, error: errorText(cause) });
      if (cause instanceof ApiError && cause.status === 401) expired.current();
    });
    return () => controller.abort();
  }, [key]);
  useEffect(() => {
    if (kind !== "inventory") return;
    const controller = new AbortController(); setWarehouseError("");
    listBaseWarehouses(business.id, controller.signal).then(data => { if (!controller.signal.aborted) setWarehouses(data); }).catch(cause => {
      if (!controller.signal.aborted) { setWarehouseError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) expired.current(); }
    });
    return () => controller.abort();
  }, [business.id, kind, retry]);
  function apply(event: FormEvent) {
    event.preventDefault(); setValidation("");
    if (dated && !allDates && (!from || !to || from > to)) { setValidation("تاریخ شروع و پایان معتبر وارد کنید؛ پایان نباید قبل از شروع باشد."); return; }
    setRetry(n => n+1); setPage(1); setFilters({ ...(dated && !allDates ? { fromDate: from, toDate: to } : {}), ...(settlement && status ? { settlementStatus: status } : {}), ...(kind === "inventory" && warehouseId ? { warehouseId } : {}), ...(kind === "parties" ? { role } : {}) });
  }
  const view = result ? operationalReportView(result,business) : null;
  const currency = storeMoneyUnit(business);
  if (partyId && can("journals.read")) return <DetailedLedger key={`${business.id}:${partyId}`} business={business} kind="party" subjectId={partyId} onClose={() => setPartyId(null)} onSessionExpired={onSessionExpired} />;
  if (ledgerId && can("journals.read")) return <AccountLedger business={business} accountId={ledgerId} onClose={() => setLedgerId(null)} onSessionExpired={onSessionExpired} />;
  return <div className="operational-report">
    <BasePanel title="محدوده گزارش" note="فیلترها پس از زدن «نمایش گزارش» اعمال می‌شوند.">
      <form className="reports-filter" onSubmit={apply}>
        {dated && <><label className="reports-check"><input type="checkbox" checked={allDates} onChange={e => setAllDates(e.target.checked)} />همه تاریخ‌ها</label>{!allDates && <><JalaliDateField id="report-from" label="از تاریخ (شمسی)" value={from} onChange={setFrom} /><JalaliDateField id="report-to" label="تا تاریخ (شمسی)" value={to} onChange={setTo} minISO={from} /></>}</>}
        {settlement && <label>وضعیت تسویه<select value={status} onChange={e => setStatus(e.target.value)}><option value="">همه وضعیت‌ها</option><option value="UNPAID">تسویه‌نشده</option><option value="PARTIAL">تسویه جزئی</option><option value="PAID">تسویه کامل</option><option value="OVERPAID">دارای اعتبار</option></select></label>}
        {kind === "inventory" && <label>انبار<select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}><option value="">همه انبارها</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}{w.isActive ? "" : " (غیرفعال)"}</option>)}</select></label>}
        {kind === "parties" && <label>گروه اشخاص<select value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="ALL">همه اشخاص</option><option value="CUSTOMER">مشتریان</option><option value="SUPPLIER">تأمین‌کنندگان</option></select></label>}
        {<button type="submit" className="primary" disabled={loading}>نمایش گزارش</button>}
        
      </form>
      {validation && <p className="notice error" role="alert">{validation}</p>}
      {warehouseError && <p className="notice error" role="alert">دریافت فهرست انبارها ناموفق بود: {warehouseError} <button type="button" className="text-button" onClick={() => setRetry(n => n+1)}>تلاش دوباره</button></p>}
      <p className="reports-context">{dated ? filters.fromDate && filters.toDate ? `${settlement ? "بازه تاریخ فاکتورها" : "بازه گزارش"}: ${jalaliText(filters.fromDate)} تا ${jalaliText(filters.toDate)}` : "بازه: همه تاریخ‌ها" : kind === "inventory" ? "مبنا: موجودی فعلی؛ این گزارش موجودی تاریخی نیست." : "مبنا: همه ثبت‌های قطعی تا آخرین ثبت، در تمام دوره‌های مالی."} · ارقام به {currency}</p>
      {settlement && <p className="reports-context">بازه تاریخ مربوط به تاریخ فاکتورهاست؛ تسویه و برگشت‌ها تا آخرین ثبت قطعی محاسبه می‌شوند. مانده‌های اولیه و مبالغ بدون تخصیص به فاکتور، در این گزارش نیستند؛ برای مانده کل اشخاص از «مانده اشخاص» استفاده کنید.</p>}
      {kind === "parties" && <p className="reports-context">شامل اشخاص فعال و غیرفعال و اثر مانده‌های اولیه ثبت‌شده در دفتر؛ بدهکار و بستانکار جداگانه نمایش داده می‌شوند.</p>}
      {kind === "inventory" && <p className="reports-context">تعداد هر کالا با واحد خودش نمایش داده می‌شود؛ تعداد کالاهای دارای واحد متفاوت با هم جمع نمی‌شود.</p>}
    </BasePanel>
    {result?.kind === "parties" && result.data.debtReminderEnabled && business.baseCurrency === "IRR" &&
      can("journals.read") && can("parties.manage") &&
      <GroupDebtReminder key={business.id} business={business} onSessionExpired={onSessionExpired} />}
    {loading && <p role="status">در حال دریافت گزارش…</p>}
    {error && <div className="notice error" role="alert">{error}<button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>تلاش دوباره</button></div>}
    {result && view && <>{(kind === "sales" || kind === "purchases" || kind === "inventory") && <ReportExportActions business={business} key={JSON.stringify([business.id,kind,filters])} load={signal => loadOperationalOutput(business.id,kind,filters,signal)} onSessionExpired={onSessionExpired} />}<BaseStats items={view.stats.map(item => ({ ...item, hint: "کل گزارش؛ مستقل از صفحه‌بندی" }))} />
      <BasePanel title="جزئیات گزارش" note={`${formatDecimal(String(result.data.total))} ردیف در کل گزارش؛ ${formatDecimal(String(result.data.items.length))} ردیف در این صفحه`}>
        {view.rows.length ? <><div className="reports-table-scroll"><table className="base-table reports-table"><thead><tr>{view.columns.map(label => <th key={label} scope="col">{label}</th>)}{(kind === "cash" || kind === "parties") && <th scope="col">صورت‌حساب / گردش</th>}</tr></thead><tbody>{view.rows.map(row => <tr key={row.key}>{row.cells.map((cell, i) => <td key={i}>{cell}{i === 0 && row.accountCode && <AccountCodeDetails code={row.accountCode} />}</td>)}{(kind === "cash" || kind === "parties") && <td><button type="button" className="text-button" onClick={() => kind === "parties" ? setPartyId(row.key) : setLedgerId(row.accountId ?? null)}>{kind === "parties" ? "صورت‌حساب شخص" : "گردش حساب"}</button></td>}</tr>)}</tbody></table></div>
        <div className="reports-mobile-rows">{view.rows.map(row => <article className="reports-mobile-row" key={row.key}>{row.cells.map((cell, i) => <div key={i}><span>{view.columns[i]}</span><strong>{cell}</strong></div>)}{row.accountCode && <AccountCodeDetails code={row.accountCode} />}{(kind === "parties" || row.accountId) && <button type="button" className="secondary" onClick={() => kind === "parties" ? setPartyId(row.key) : setLedgerId(row.accountId!)}>{kind === "parties" ? "صورت‌حساب شخص" : "گردش حساب"}</button>}</article>)}</div></> : <BaseEmpty title="ردیفی در این محدوده وجود ندارد" description="فیلترها و بازه انتخابی را بررسی کنید." />}
        <BasePagination page={page} totalPages={result.data.totalPages} loading={loading} onChange={setPage} />
      </BasePanel></>}
  </div>;
}
