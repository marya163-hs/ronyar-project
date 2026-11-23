import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import YearEndClosingPlanPanel from "./YearEndClosingPlanPanel";
import YearEndEquityDestinationPanel from "./YearEndEquityDestinationPanel";
import YearEndFinalReviewPanel from "./YearEndFinalReviewPanel";
import YearEndCashBankReconciliationPanel from "./YearEndCashBankReconciliationPanel";
import YearEndCashBankCoveragePanel from "./YearEndCashBankCoveragePanel";
import YearEndReconciliationPanel from "./YearEndReconciliationPanel";
import { useEffect, useRef, useState } from "react";
import { BaseBadge, BaseHeader, BasePanel, BaseStats } from "./BaseUi";
import { jalaliText } from "./jalaliDate";
import { ApiError, errorText, formatDecimal, getYearEndProjection, getYearEndReadiness, listFiscalPeriods, listYearEndPreparations, createYearEndPreparation, getYearEndExecutionGate, getYearEndAccountingValidation, getYearEndEquityDestination } from "./api";
import type { Business, FiscalPeriod, YearEndReadinessReport, YearEndProjectionReport, YearEndPreparation, YearEndExecutionGate, YearEndAccountingValidation } from "./api";

type Props = { business: Business; onSessionExpired: () => void };
export default function YearEndReadiness({ business, onSessionExpired }: Props) {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [executionGate, setExecutionGate] = useState<YearEndExecutionGate | null>(null);
  const [gateError, setGateError] = useState("");
  const [validation, setValidation] = useState<YearEndAccountingValidation | null>(null);
  const [validationError, setValidationError] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [report, setReport] = useState<YearEndReadinessReport | null>(null);
  const [projection, setProjection] = useState<YearEndProjectionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparations, setPreparations] = useState<YearEndPreparation[]>([]);
  const [confirmName, setConfirmName] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [savingPreparation, setSavingPreparation] = useState(false);
  const pendingRequest = useRef<{ identity: string; key: string } | null>(null);
  const [preparationNotice, setPreparationNotice] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [cashBankRevision, setCashBankRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    listFiscalPeriods(business.id, c.signal).then(items => {
      if (c.signal.aborted) return;
      setPeriods(items);
      setPeriodId(current => items.some(p => p.id === current) ? current : (items[0]?.id ?? ""));
    }).catch(e => {
      if (c.signal.aborted) return;
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
    });
    return () => c.abort();
  }, [business.id, onSessionExpired]);
  useEffect(() => {
    if (!periodId) return;
    const c = new AbortController();
    setLoading(true); setError(""); setReport(null); setProjection(null);
    setPreparations([]); setConfirmName(""); setReviewReason(""); setPreparationNotice("");
    setExecutionGate(null); setGateError("");
    getYearEndExecutionGate(business.id, periodId, c.signal).then(gate => {
      if (!c.signal.aborted) setExecutionGate(gate);
    }).catch(e => {
      if (!c.signal.aborted) {
        setGateError(errorText(e));
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
      }
    });
    Promise.all([
      getYearEndReadiness(business.id, periodId, c.signal),
      getYearEndProjection(business.id, periodId, c.signal),
      listYearEndPreparations(business.id, periodId, c.signal),
    ]).then(([readiness, draft, history]) => {
      if (!c.signal.aborted) { setReport(readiness); setProjection(draft); setPreparations(history.items); }
    }).catch(e => {
      if (c.signal.aborted) return;
      setError(e instanceof ApiError && e.status === 403 ? "برای بررسی پایان سال، مجوز مدیریت دوره‌های مالی لازم است." : errorText(e));
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
    }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [business.id, periodId, reload, onSessionExpired]);
  useEffect(() => {
    setDestinationId("");
    if (!periodId) return;
    const c = new AbortController();
    getYearEndEquityDestination(business.id, periodId, c.signal).then(config => {
      if (!c.signal.aborted && config.eligible && config.account) setDestinationId(config.account.id);
    }).catch(e => { if (!c.signal.aborted && e instanceof ApiError && e.status === 401) onSessionExpired(); });
    return () => c.abort();
  }, [business.id, periodId, onSessionExpired]);
  useEffect(() => {
    if (!periodId) return;
    const c = new AbortController();
    setValidation(null); setValidationError("");
    getYearEndAccountingValidation(business.id, periodId, destinationId || undefined, c.signal)
      .then(data => { if (!c.signal.aborted) setValidation(data); })
      .catch(e => {
        if (c.signal.aborted) return;
        setValidationError(errorText(e));
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
      });
    return () => c.abort();
  }, [business.id, periodId, destinationId, reload, onSessionExpired]);
  async function savePreparation() {
    if (!report || !periodId || savingPreparation || confirmName.trim() !== report.period.name || reviewReason.trim().length < 10) return;
    setSavingPreparation(true); setError(""); setPreparationNotice("");
    try {
      // Generate once for the single logical submission. Retry uses the same key if write() retries on 401.
      const identity = JSON.stringify([business.id, periodId, confirmName.trim(), reviewReason.trim()]);
      if (pendingRequest.current?.identity !== identity) pendingRequest.current = { identity, key: crypto.randomUUID() };
      const key = pendingRequest.current.key;
      const saved = await createYearEndPreparation(business.id, periodId, confirmName, reviewReason.trim(), key);
      setPreparations(current => [saved, ...current].slice(0, 20));
      setPreparationNotice(saved.status === "BLOCKED"
        ? "نتیجه بررسی با موانع فعلی در سوابق ثبت شد. هیچ سند یا دوره‌ای تغییر نکرد."
        : "نتیجه بررسی ثبت شد و نیازمند کنترل حسابدار است. اختتام قطعی هنوز غیرفعال است.");
      pendingRequest.current = null;
      setReviewReason(""); setConfirmName("");
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
    } finally { setSavingPreparation(false); }
  }
  const currency = storeMoneyUnit(business);
  const money = (v: string) => `${formatStoreMoney(business, v)} ${currency}`;
  return <section className="base-page">
    <BaseHeader title="آمادگی و پیش‌نمایش پایان سال" description="بررسی کنترل‌های اولیه و محاسبه پیشنهادی اسناد اختتام و مانده‌های افتتاحیه، بدون هیچ ثبت مالی." />
    <BasePanel title="انتخاب دوره برای بررسی" note="پیش‌نمایش فقط برای ارزیابی حسابدار است؛ اجرای اختتام فعال نیست.">
      <div className="filters"><label style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>دوره مالی
        <select value={periodId} onChange={e => setPeriodId(e.target.value)} disabled={loading || !periods.length}>
          {periods.map(item => <option key={item.id} value={item.id}>{item.name} — {jalaliText(item.startDate)} تا {jalaliText(item.endDate)}</option>)}
        </select>
      </label><button type="button" className="secondary" disabled={loading || !periodId} onClick={() => setReload(n => n + 1)}>{loading ? "در حال بررسی…" : "بررسی مجدد"}</button></div>
    </BasePanel>
    {periodId && <YearEndClosingPlanPanel key={`${business.id}:${periodId}`} business={business} businessId={business.id} periodId={periodId} refreshToken={reload} onSessionExpired={onSessionExpired} />}
    {periodId && <YearEndFinalReviewPanel businessId={business.id} periodId={periodId}
      destinationAccountId={destinationId} refreshToken={reload + cashBankRevision}
      onSessionExpired={onSessionExpired} />}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!error && loading && <p className="loading-state" role="status">در حال محاسبه اطلاعات دوره…</p>}
    {report && projection && <>
      <div className="notice">پیش‌نمایش اختتام و افتتاحیه صرفاً یک شبیه‌سازی است. حتی اگر تراز برابر باشد، هنوز مجوز اجرای قطعی صادر نشده است.</div>
      <BaseStats items={[
        { label: "پیش‌نویس‌های باقی‌مانده", value: report.drafts.total, hint: "تمام اسناد پیش‌نویس دوره" },
        { label: "جمع بدهکار دوره", value: money(report.journal.totalDebit) },
        { label: "جمع بستانکار دوره", value: money(report.journal.totalCredit) },
        { label: "سود یا زیان دوره", value: money(report.journal.netProfit) },
      ]} />
      <BasePanel title="وضعیت اولیه کنترل‌ها" meta={<BaseBadge active={false} label="اختتام غیرفعال" />}>
        <p>دوره: <strong>{report.period.name}</strong> — {jalaliText(report.period.startDate)} تا {jalaliText(report.period.endDate)}</p>
        <p>دوره بعد: {report.nextPeriod ? `${report.nextPeriod.name} (${jalaliText(report.nextPeriod.startDate)})` : "تعریف نشده"}</p>
        <p>تراز گردش اسناد: <strong>{report.journal.balanced ? "برابر" : "دارای اختلاف"}</strong></p>
        <p>موانع پیش‌بررسی: <strong>{formatDecimal(String(report.blockers.length))}</strong>؛ نتیجه نهایی و تطبیق‌ها در پنل یکپارچه بالا نمایش داده می‌شوند.</p>
      </BasePanel>
      <BasePanel title="موانع قطعی">
        {report.blockers.length ? <ul>{report.blockers.map(item => <li key={item.code}><strong>{item.message}</strong></li>)}</ul> : <p>مانع اولیه در کنترل‌های اجراشده شناسایی نشد؛ این به‌معنای آمادگی نهایی برای اختتام نیست.</p>}
      </BasePanel>
      <BasePanel title="یادداشت‌های پیش‌بررسی">
        <p>وضعیت روزآمد تطبیق انبار، اشخاص، بانک و صندوق در «ارزیابی یکپارچه» و پنل‌های تخصصی پایین دیده می‌شود؛ متن‌های اولیه جانشین آن‌ها نیستند.</p>
        <ul>{report.warnings.filter(item => !["INVENTORY_RECONCILIATION_PENDING", "SUBLEDGER_RECONCILIATION_PENDING"].includes(item.code)).map(item => <li key={item.code}>{item.message}</li>)}</ul>
      </BasePanel>
      <BasePanel title="پیش‌نمایش سند بستن حساب‌های موقت" note="شماره سند و حساب مقصد در این مرحله تعیین نشده است؛ جدول صرفاً محاسبات پیشنهادی است.">
        <div className="base-table-scroll"><table className="base-table"><thead><tr><th>حساب</th><th>بدهکار ({storeMoneyUnit(business)})</th><th>بستانکار ({storeMoneyUnit(business)})</th></tr></thead><tbody>
          {projection.proposal.closingLines.map((line, i) => <tr key={`${line.accountId ?? "virtual"}-${i}`}>
            <td><strong>{line.accountName}</strong>{line.accountCode ? <div className="base-soft">کد: {line.accountCode}</div> : <div className="base-soft">ردیف محاسباتی، بدون حساب مقصد</div>}</td>
            <td>{line.side === "DEBIT" ? formatStoreMoney(business, line.amount) : "—"}</td>
            <td>{line.side === "CREDIT" ? formatStoreMoney(business, line.amount) : "—"}</td>
          </tr>)}
          <tr><td><strong>جمع پیشنهادی</strong></td><td><strong>{formatStoreMoney(business, projection.proposal.totalDebit)}</strong></td><td><strong>{formatStoreMoney(business, projection.proposal.totalCredit)}</strong></td></tr>
        </tbody></table></div>
        {!projection.proposal.closingLines.length && <p>در این دوره مانده‌ای برای بستن حساب‌های درآمد و هزینه پیدا نشد.</p>}
        <p>نتیجه عملکرد دوره: <strong>{money(projection.proposal.netProfit)}</strong> — وضعیت تراز پیشنهادی: <strong>{projection.proposal.isBalanced ? "برابر" : "دارای اختلاف"}</strong>.</p>
      </BasePanel>
      <BasePanel title="تصویر تحلیلی مانده‌های ابتدای دوره بعد" note="مانده‌ها تا پایان دوره فعلی محاسبه شده‌اند؛ هیچ سند افتتاحیه جدیدی صادر نشده است.">
        <p>تاریخ مبنای محاسبه: <strong>{jalaliText(projection.openingView.asOfDate)}</strong>. ردیف سود و زیان انباشته محاسباتی، حساب واقعی نیست.</p>
        <div className="base-table-scroll"><table className="base-table"><thead><tr><th>حساب</th><th>نوع</th><th>مانده بدهکار</th><th>مانده بستانکار</th></tr></thead><tbody>
          {projection.openingView.items.map((item, i) => <tr key={`${item.accountId ?? "virtual"}-${i}`}>
            <td><strong>{item.name}</strong>{item.code ? <div className="base-soft">{item.code}</div> : <div className="base-soft">محاسباتی</div>}</td>
            <td>{item.type === "ASSET" ? "دارایی" : item.type === "LIABILITY" ? "بدهی" : "حقوق مالکانه"}</td>
            <td>{item.side === "DEBIT" ? formatStoreMoney(business, item.amount) : "—"}</td>
            <td>{item.side === "CREDIT" ? formatStoreMoney(business, item.amount) : "—"}</td>
          </tr>)}
          <tr><td><strong>جمع</strong></td><td>—</td><td><strong>{formatStoreMoney(business, projection.openingView.totalDebit)}</strong></td><td><strong>{formatStoreMoney(business, projection.openingView.totalCredit)}</strong></td></tr>
        </tbody></table></div>
        {!projection.openingView.items.length && <p>مانده‌ای برای نمایش وجود ندارد.</p>}
        <p>وضعیت تراز: <strong>{projection.openingView.isBalanced ? "برابر" : "دارای اختلاف"}</strong>.</p>
      </BasePanel>
      <BasePanel title="کنترل‌های ایمنی اجرای پایان سال (Rev8.3e)" note="صرفاً وضعیت حفاظت‌های سیستم؛ در این نسخه هیچ فرمان اجرای اختتام وجود ندارد.">
        {gateError && <p className="notice error" role="alert">وضعیت کنترل‌های اجرای پایان سال قابل دریافت نبود: {gateError}</p>}
        {!executionGate && !gateError && <p>در حال بررسی حفاظت‌های دیتابیس…</p>}
        {executionGate && <>
          <p><strong>اجرای قطعی: غیرفعال</strong> — حتی با تراز برابر، امکان صدور سند اختتامیه وجود ندارد.</p>
          <p>قید منع اسناد سیستمی: <strong>{executionGate.constraints.system_journals_blocked ? "فعال" : "نیازمند بررسی فوری"}</strong></p>
          <p>قید منع اجرای عملیات سال‌پایان: <strong>{executionGate.constraints.operations_blocked ? "فعال" : "نیازمند بررسی فوری"}</strong></p>
          <p>تعداد عملیات رزروشده این دوره: <strong>{formatDecimal(String(executionGate.reservedOperationCount))}</strong></p>
          <p>آخرین سابقه بررسی: <strong>{executionGate.preparation ? "ثبت‌شده، بدون مجوز اجرای قطعی" : "ثبت نشده"}</strong></p>
          <ul>{executionGate.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        </>}
      </BasePanel>
      <BasePanel title="اعتبارسنجی حسابداری اختتام — Rev8.3m" note="انتخاب حساب برای شبیه‌سازی است؛ با ثبت مجزای تنظیم می‌توان آن را برای این دوره نگهداری کرد، بدون مجوز اختتام.">
        {validationError && <p className="notice error" role="alert">کنترل حسابداری در دسترس نیست: {validationError}</p>}
        {!validation && !validationError && <p role="status">در حال کنترل حساب‌های مقصد و تراز محاسباتی…</p>}
        {validation && <>
          <label style={{ display: "flex", flexDirection: "column", maxWidth: 480, gap: 8 }}>
            حساب مقصد پیشنهادی سود یا زیان انباشته
            <select value={destinationId} onChange={e => setDestinationId(e.target.value)}>
              <option value="">حساب مقصد انتخاب نشده است</option>
              {validation.destination.candidates.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
            </select>
          </label>
          <p className="base-soft">انتخاب این فهرست فقط پیش‌نمایش را تغییر می‌دهد؛ برای ذخیره پیکربندی باید دکمه ثبت در بخش بعدی را بزنید.</p>
          <YearEndEquityDestinationPanel businessId={business.id} periodId={periodId}
            selectedAccountId={destinationId} candidates={validation.destination.candidates}
            onSaved={id => { setDestinationId(id); setReload(n => n + 1); }}
            onSessionExpired={onSessionExpired} />
          <p>وضعیت کنترل محاسبات: <strong>{validation.accountingChecksPassed ? "محاسبات بررسی‌شده بدون مغایرت شناسایی‌شده" : "نیازمند رفع مانع یا تعیین حساب مقصد"}</strong> — اجرای نهایی: <strong>غیرفعال</strong>.</p>
          <div className="base-table-scroll"><table className="base-table"><thead><tr><th>کنترل</th><th>نتیجه</th></tr></thead><tbody>
            <tr><td>سود / زیان دوره</td><td>{money(validation.reconciliation.netProfit)}</td></tr>
            <tr><td>جمع بدهکار / بستانکار پیشنهادی اختتام</td><td>{money(validation.reconciliation.proposedClosingDebit)} / {money(validation.reconciliation.proposedClosingCredit)}</td></tr>
            <tr><td>اختتام پیشنهادی متوازن است؟</td><td>{validation.reconciliation.closingBalanced ? "بله" : "خیر"}</td></tr>
            <tr><td>تصویر مجازی افتتاحیه متوازن است؟</td><td>{validation.reconciliation.virtualOpeningBalanced ? "بله" : "خیر"}</td></tr>
            <tr><td>مانده حساب‌های موقت پیش از این دوره</td><td>{money(validation.reconciliation.earlierUnclosedNet)}</td></tr>
            <tr><td>سازگاری گزارش‌ها با سند سیستمی واقعی</td><td>تکمیل نشده — ثبت نهایی ممنوع</td></tr>
          </tbody></table></div>
          <p><strong>ردیف‌های پیشنهادی (بدون ثبت):</strong></p>
          {validation.closingLines.length ? <div className="base-table-scroll"><table className="base-table"><thead><tr><th>حساب</th><th>بدهکار</th><th>بستانکار</th></tr></thead><tbody>
            {validation.closingLines.map((line, index) => <tr key={`${line.accountId ?? "virtual"}-${index}`}>
              <td>{line.code ? `${line.code} — ` : ""}{line.name}</td>
              <td>{line.side === "DEBIT" ? formatStoreMoney(business, line.amount) : "—"}</td>
              <td>{line.side === "CREDIT" ? formatStoreMoney(business, line.amount) : "—"}</td>
            </tr>)}
          </tbody></table></div> : <p>ردیفی برای بستن حساب‌های موقت وجود ندارد.</p>}
          {validation.blockers.length > 0 && <><p><strong>موانع اعتبارسنجی:</strong></p><ul>{validation.blockers.map(item => <li key={item.code}>{item.message}</li>)}</ul></>}
          <p><strong>کنترل‌های باقیمانده:</strong></p>
          <ul>{validation.warnings.filter(item => item.code !== "SUBLEDGER_RECONCILIATION_REQUIRED").map(item => <li key={item.code}>{item.message}</li>)}</ul>
          <p className="notice">دفتر کل رانیار پیوسته است. اسناد افتتاحیه واقعی و گزارش‌های پس از اختتام هنوز فعال نیستند؛ تراز بودن این شبیه‌سازی به معنی مجوز پایان سال نیست.</p>
        </>}
      </BasePanel>
      <YearEndReconciliationPanel business={business} businessId={business.id} periodId={periodId} refreshToken={reload + cashBankRevision} onSessionExpired={onSessionExpired} />
      <YearEndCashBankCoveragePanel business={business} businessId={business.id} periodId={periodId} refreshToken={reload + cashBankRevision} onSessionExpired={onSessionExpired} />
      <YearEndCashBankReconciliationPanel business={business} businessId={business.id} periodId={periodId} refreshToken={reload} onSessionExpired={onSessionExpired}
        onEvidenceRecorded={() => setCashBankRevision(v => v + 1)} />
      <BasePanel title="ثبت نتیجه بررسی برای سوابق" note="این دکمه فقط گزارش محاسباتی و موانع را در سابقه بررسی ذخیره می‌کند؛ سند حسابداری، اختتام و افتتاحیه صادر نمی‌شود.">
        <p>نام دوره را دقیق وارد کن و علت ثبت بررسی را بنویس. نتیجه حتی در صورت وجود مانع، با وضعیت «مسدود» ذخیره می‌شود.</p>
        <div className="filters">
          <label style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220, flex: 1 }}>تأیید نام دوره
            <input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={report.period.name} maxLength={120} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260, flex: 2 }}>توضیح ثبت بررسی (حداقل ۱۰ حرف)
            <input value={reviewReason} onChange={e => setReviewReason(e.target.value)} maxLength={500} placeholder="برای بررسی وضعیت اختتام توسط حسابدار" />
          </label>
        </div>
        <button type="button" disabled={savingPreparation || loading || confirmName.trim() !== report.period.name || reviewReason.trim().length < 10} onClick={savePreparation}>
          {savingPreparation ? "در حال ثبت نتیجه…" : "ثبت نتیجه بررسی (بدون اختتام)"}
        </button>
        {preparationNotice && <p className="notice" role="status">{preparationNotice}</p>}
        <p><strong>سوابق اخیر بررسی:</strong></p>
        {preparations.length ? <div className="base-table-scroll"><table className="base-table"><thead><tr><th>زمان ثبت</th><th>وضعیت</th><th>موانع</th><th>توضیح</th></tr></thead><tbody>
          {preparations.slice(0, 10).map(record => <tr key={record.id}><td>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(record.createdAt))}</td>
            <td>{record.status === "BLOCKED" ? "دارای مانع" : "نیازمند بررسی حسابدار"}</td><td>{formatDecimal(String(record.blockers.length))}</td><td>{record.reason}</td></tr>)}
        </tbody></table></div> : <p>هنوز سابقه بررسی ثبت نشده است.</p>}
      </BasePanel>
      <BasePanel title="محدودیت‌ها و کنترل‌های باقیمانده">
        <ul>{projection.warnings.map(item => <li key={item.code}>{item.message}</li>)}</ul>
        <p>برای وضعیت به‌روز کنترل‌های اشخاص، انبار و بانک/صندوق، گزارش یکپارچه بالای صفحه ملاک است.</p>
        <p><strong>هیچ دکمه ثبت قطعی، بستن سال یا ایجاد سند افتتاحیه در این نسخه وجود ندارد.</strong></p>
      </BasePanel>
    </>}
  </section>;
}
