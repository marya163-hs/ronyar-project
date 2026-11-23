import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import ReportExportActions from "./ReportExportActions";
import { trialBalanceOutput } from "./accountingReportOutput";
import { exportTrialBalance } from "./api";
import AccountCodeDetails from "./AccountCodeDetails";
import { useEffect, useState } from "react";
import { BaseBadge, BaseEmpty, BaseHeader, BasePagination, BasePanel, BaseStats } from "./BaseUi";
import { jalaliText } from "./jalaliDate";
import { ApiError, errorText, formatDecimal, getBalanceSheet, getProfitLoss, getTrialBalance, listFiscalPeriods } from "./api";
import type { BalanceSheetReport, Business, FiscalPeriod, ProfitLossReport, TrialBalanceReport } from "./api";

type Props = { business: Business; onSessionExpired: () => void };
type Mode = "trial" | "profit" | "balance";
type ReportResult = { kind: "trial"; data: TrialBalanceReport } | { kind: "profit"; data: ProfitLossReport } | { kind: "balance"; data: BalanceSheetReport };
const modes: { key: Mode; label: string; help: string }[] = [
  { key: "trial", label: "تراز آزمایشی", help: "گردش بدهکار، بستانکار و مانده حساب‌ها در دوره انتخابی" },
  { key: "profit", label: "سود و زیان", help: "درآمد، هزینه و نتیجه عملکرد در دوره انتخابی" },
  { key: "balance", label: "ترازنامه", help: "مانده تجمعی دارایی‌ها، بدهی‌ها و حقوق مالکانه تا پایان دوره" },
];

const accountType = (type: string) => ({ ASSET: "دارایی", LIABILITY: "بدهی", EQUITY: "حقوق مالکانه", REVENUE: "درآمد", EXPENSE: "هزینه" } as Record<string, string>)[type] ?? type;

export default function AccountingReports({ business, onSessionExpired }: Props) {
 const money = (value: string) => formatStoreMoney(business, value);
  const [mode, setMode] = useState<Mode>("trial");
  const [periodId, setPeriodId] = useState("");
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodError, setPeriodError] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPeriods([]); setPeriodError("");
    listFiscalPeriods(business.id, controller.signal).then(value => {
      if (!controller.signal.aborted) setPeriods(value);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setPeriodError(errorText(cause));
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
    });
    return () => controller.abort();
  }, [business.id, onSessionExpired]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const load = mode === "trial"
      ? getTrialBalance(business.id, periodId, page, controller.signal).then(data => ({ kind: "trial", data } as const))
      : mode === "profit"
        ? getProfitLoss(business.id, periodId, page, controller.signal).then(data => ({ kind: "profit", data } as const))
        : getBalanceSheet(business.id, periodId, page, controller.signal).then(data => ({ kind: "balance", data } as const));
    load.then(data => {
      if (controller.signal.aborted) return;
      if (data.data.totalPages > 0 && page > data.data.totalPages) setPage(data.data.totalPages);
      else setResult(data);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setError(errorText(cause));
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, mode, periodId, page, revision, onSessionExpired]);

  const changeMode = (value: Mode) => { setMode(value); setPage(1); };
  const selectedPeriod = periods.find(item => item.id === periodId);
  const periodName = selectedPeriod?.name ?? "تمام دوره‌ها";
  const info = modes.find(item => item.key === mode)!;
  const data = result?.kind === mode ? result.data : null;
  const stats = !result ? [{ label: "در حال دریافت", value: "—" }] : result.kind === "trial" ? [
    { label: "گردش بدهکار", value: money(result.data.totalDebit) },
    { label: "گردش بستانکار", value: money(result.data.totalCredit) },
    { label: "مانده بدهکار", value: money(result.data.totalDebitBalance) },
    { label: "مانده بستانکار", value: money(result.data.totalCreditBalance) },
  ] : result.kind === "profit" ? [
    { label: "درآمد خالص", value: money(result.data.totalRevenue) },
    { label: "هزینه خالص", value: money(result.data.totalExpense) },
    { label: "سود / زیان خالص", value: money(result.data.netProfit) },
  ] : [
    { label: "دارایی‌ها", value: money(result.data.totalAssets) },
    { label: "بدهی‌ها", value: money(result.data.totalLiabilities) },
    { label: "حقوق مالکانه با نتیجه عملکرد", value: money(result.data.totalEquity) },
    { label: "بدهی‌ها + حقوق مالکانه", value: money(result.data.totalLiabilitiesAndEquity) },
  ];
  return <div className="base-page accounting-reports base-has-mobile-cards">
    <BaseHeader title="گزارش‌های مالی" description="تراز آزمایشی، سود و زیان و ترازنامه با ارقام قطعی دفتر حسابداری" />
    <nav className="finance-report-tabs" aria-label="نوع گزارش">{modes.map(item => <button type="button" key={item.key} className={mode === item.key ? "is-active" : ""} aria-current={mode === item.key ? "page" : undefined} onClick={() => changeMode(item.key)}>{item.label}</button>)}</nav>
    <BasePanel title={info.label} note={info.help}>
      <div className="base-filters finance-report-filter">
        <label>دوره مالی<select value={periodId} onChange={event => { setPeriodId(event.target.value); setPage(1); }}><option value="">تمام دوره‌ها</option>{periods.map(period => <option value={period.id} key={period.id}>{period.name} ({jalaliText(period.startDate)} تا {jalaliText(period.endDate)})</option>)}</select></label>
        <div className="finance-report-context"><span>مبنای گزارش</span><strong>{periodName}</strong></div>
      </div>
      {periodError && <p className="notice error" role="alert">دریافت فهرست دوره‌ها ناموفق بود: {periodError}</p>}
      {mode === "balance" && <p className="finance-report-note">ترازنامه برخلاف دو گزارش دیگر تجمعی است: با انتخاب دوره، تمام اسناد قطعی تا پایان همان دوره محاسبه می‌شوند. {result?.kind === "balance" && result.data.asOfDate ? `تاریخ مبنا: ${jalaliText(result.data.asOfDate)}` : !periodId ? "بدون انتخاب دوره، تمام اسناد قطعی موجود ملاک‌اند." : ""}</p>}
      {mode !== "balance" && <p className="finance-report-note">{periodId ? "گردش‌ها فقط در دوره مالی انتخاب‌شده محاسبه می‌شوند." : "گردش‌ها مربوط به همه دوره‌های مالی هستند."} مبالغ به {storeMoneyUnit(business)} است.</p>}
    </BasePanel>
    {loading && <div className="base-loading" role="status">در حال محاسبه گزارش حسابداری…</div>}
    {error && <div className="notice error" role="alert">{error} <button type="button" className="text-button" onClick={() => setRevision(n => n + 1)}>تلاش دوباره</button></div>}
    {!loading && !error && result && <>
      {mode === "trial" && <ReportExportActions business={business} key={`${business.id}:${periodId}`} onSessionExpired={onSessionExpired} load={async signal=>trialBalanceOutput(await exportTrialBalance(business.id,periodId,signal))} />}
      <BaseStats items={stats} />
      <div className="finance-report-check" role="status">
        {result.kind === "trial" ? <><BaseBadge active={result.data.isBalanced} label={result.data.isBalanced ? "تراز آزمایشی برابر است" : "اختلاف در تراز آزمایشی"} /><span>برابری گردش و مانده‌ها با محاسبه سرور کنترل شده است.</span></> :
          result.kind === "profit" ? <><BaseBadge active={result.data.result !== "LOSS"} label={result.data.result === "PROFIT" ? "سود" : result.data.result === "LOSS" ? "زیان" : "سربه‌سر"}/><span>نتیجه عملکرد دوره، بر اساس حساب‌های درآمد و هزینه.</span></> :
          <><BaseBadge active={result.data.isBalanced} label={result.data.isBalanced ? "ترازنامه برابر است" : "ترازنامه دارای اختلاف است"} /><span>اختلاف دارایی‌ها و (بدهی‌ها + حقوق مالکانه): <bdi>{money(result.data.difference)}</bdi> {storeMoneyUnit(business)}</span></>}
      </div>
      <BasePanel title="ریز حساب‌ها" note={`جمع کل و وضعیت تراز از تمام حساب‌ها محاسبه می‌شود؛ جدول فقط صفحه ${formatDecimal(String(data?.page ?? 1))} را نشان می‌دهد.`}>
        {data && data.items.length > 0 ? <>
          <div className="base-table-scroll"><table className="base-table finance-report-table"><thead><tr><th>نام حساب</th><th>نوع حساب</th>{result.kind === "trial" ? <><th>گردش بدهکار</th><th>گردش بستانکار</th><th>مانده بدهکار</th><th>مانده بستانکار</th></> : <><th>مبلغ خالص ({storeMoneyUnit(business)})</th></>}</tr></thead><tbody>
            {result.kind === "trial" && result.data.items.map(row => <tr key={row.account.id}><td><strong>{row.account.name}</strong><AccountCodeDetails code={row.account.code} /></td><td>{accountType(row.account.type)}</td><td className="base-money"><bdi>{money(row.totalDebit)}</bdi></td><td className="base-money"><bdi>{money(row.totalCredit)}</bdi></td><td className="base-money"><bdi>{money(row.debitBalance)}</bdi></td><td className="base-money"><bdi>{money(row.creditBalance)}</bdi></td></tr>)}
            {result.kind === "profit" && result.data.items.map(row => <tr key={row.account.id}><td><strong>{row.account.name}</strong><AccountCodeDetails code={row.account.code} /></td><td>{accountType(row.account.type)}</td><td className="base-money"><bdi>{money(row.amount)}</bdi></td></tr>)}
            {result.kind === "balance" && result.data.items.map(row => <tr key={row.account.id}><td><strong>{row.account.name}</strong><AccountCodeDetails code={row.account.code} /></td><td>{accountType(row.account.type)}</td><td className="base-money"><bdi>{money(row.amount)}</bdi></td></tr>)}
          </tbody></table></div>
          <div className="base-mobile-list">{data.items.map(row => <article key={row.account.id} className="base-mobile-card"><strong>{row.account.name}</strong><small>{accountType(row.account.type)}</small><AccountCodeDetails code={row.account.code} />{"debitBalance" in row ? <div className="finance-report-mobile-amounts"><span>بدهکار: <bdi>{money(row.debitBalance)}</bdi></span><span>بستانکار: <bdi>{money(row.creditBalance)}</bdi></span><small>گردش: بدهکار {money(row.totalDebit)} / بستانکار {money(row.totalCredit)}</small></div> : <p className="finance-report-mobile-amounts">مبلغ: <bdi>{money(row.amount)}</bdi> {storeMoneyUnit(business)}</p>}</article>)}</div>
        </> : <BaseEmpty title="ردیفی برای نمایش وجود ندارد" description="برای دوره انتخاب‌شده سند حسابداری قطعی با این نوع حساب یافت نشد." />}
        <BasePagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 0} loading={loading} onChange={setPage} caption={`${formatDecimal(String(data?.total ?? 0))} حساب دارای گردش`} />
      </BasePanel>
    </>}
  </div>;
}
