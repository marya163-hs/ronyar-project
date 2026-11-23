import DebtReminder from "./DebtReminder";
import { useStoreCan } from "./StorePermissions";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import ReportExportActions from "./ReportExportActions";
import { partyLedgerOutput } from "./accountingReportOutput";
import { exportPartyLedger } from "./api";
import AccountCodeDetails from "./AccountCodeDetails";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorText, formatDecimal, readDetailedLedger, tehranToday } from "./api";
import type { Business, DetailedLedgerPage } from "./api";
import { BasePanel, BaseStats, BasePagination, BaseEmpty } from "./BaseUi";
import JalaliDateField from "./JalaliDateField";
import { jalaliText } from "./jalaliDate";
import { journalDescription } from "./journalDescription";
import JournalDetailsPanel from "./JournalDetailsPanel";
export default function DetailedLedger({ business, kind, subjectId, descendants = false, onClose, onSessionExpired }: { business: Business; kind: "account" | "party"; subjectId: string; descendants?: boolean; onClose: () => void; onSessionExpired: () => void }) {
  const can = useStoreCan();
  const expired = useRef(onSessionExpired); expired.current = onSessionExpired;
  const [all, setAll] = useState(true), [from, setFrom] = useState(tehranToday), [to, setTo] = useState(tehranToday);
  const [range, setRange] = useState<{ fromDate?: string; toDate?: string }>({}), [validation, setValidation] = useState("");
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0), [entryId, setEntryId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ key: string; data?: DetailedLedgerPage; error?: string } | null>(null);
  const key = JSON.stringify([business.id, kind, subjectId, descendants, range, page, retry]);
  const current = snapshot?.key === key ? snapshot : null, result = current?.data, loading = !current;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), limit: "20", ...range, ...(kind === "account" ? { includeDescendants: String(descendants) } : {}) });
    readDetailedLedger(business.id, kind, subjectId, query, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (page > Math.max(1, data.totalPages)) { setPage(Math.max(1, data.totalPages)); return; }
      setSnapshot({ key, data });
    }).catch(cause => { if (!controller.signal.aborted) { setSnapshot({ key, error: errorText(cause) }); if (cause instanceof ApiError && cause.status === 401) expired.current(); } });
    return () => controller.abort();
  }, [key]);
  function apply(e: FormEvent) { e.preventDefault(); setValidation(""); if (!all && (!from || !to || from > to)) { setValidation("بازه تاریخ معتبر وارد کنید؛ پایان نباید قبل از شروع باشد."); return; } setPage(1); setRange(all ? {} : { fromDate: from, toDate: to }); setRetry(n => n+1); }
  const signed = (v: string) => `${formatStoreMoney(business, v.startsWith("-") ? v.slice(1) : v)} ${/^[-]?0(?:\.0+)?$/.test(v) ? "" : v.startsWith("-") ? "بستانکار" : "بدهکار"}`;
  return <section className="operational-report"><div className="section-toolbar"><h2>{kind === "party" ? "صورت‌حساب شخص" : "گردش حساب"}{result ? `: ${result.party?.name ?? result.account?.name ?? ""}` : ""}</h2><button type="button" className="secondary" onClick={onClose}>بازگشت</button></div>
    {result && kind === "party" && <ReportExportActions business={business} key={JSON.stringify([business.id,subjectId,range])} onSessionExpired={onSessionExpired} load={async signal=>partyLedgerOutput(await exportPartyLedger(business.id,subjectId,new URLSearchParams(range),signal))} />}
    {kind === "party" && result?.debtReminderEnabled && result.party?.customerEnabled && result.party.isActive && !result.party.isCashCustomer
      && business.baseCurrency === "IRR" && can("parties.manage") &&
      <DebtReminder key={`${business.id}:${subjectId}`} businessId={business.id} partyId={subjectId} onSessionExpired={onSessionExpired} />}
    {!!result?.recentDebtReminders?.length && <details>
      <summary>سابقهٔ یادآوری پیامکی</summary>
      <ul>{result.recentDebtReminders.map(item => <li key={item.commandId}>
        {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(item.createdAt))}
        {" · "}{item.state === "ACCEPTED" ? "پذیرفته‌شده توسط پیام‌رسان" : item.state === "REJECTED" ? "ردشده" : "نتیجه نامشخص"}
      </li>)}</ul>
    </details>}
    {result?.account && <AccountCodeDetails code={result.account.code} />}
    <BasePanel title="بازه گردش"><form className="reports-filter" onSubmit={apply}><label className="reports-check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />همه تاریخ‌ها</label>{!all && <><JalaliDateField id="ledger-from" label="از تاریخ (شمسی)" value={from} onChange={setFrom} /><JalaliDateField id="ledger-to" label="تا تاریخ (شمسی)" value={to} onChange={setTo} minISO={from} /></>}<button type="submit" className="primary" disabled={loading}>نمایش گزارش</button></form>{validation && <p className="notice error" role="alert">{validation}</p>}
    <p className="reports-context">مانده ابتدای بازه از تمام ثبت‌های قطعی پیش از تاریخ شروع محاسبه می‌شود. مانده پایان برابر مانده ابتدا به‌علاوه خالص گردش است؛ مبالغ مانده‌های اولیه ثبت‌شده نیز در محاسبه منظور می‌شوند.</p>{kind === "account" && descendants && <p className="reports-context">شامل حساب انتخابی و تمام زیرحساب‌های آن، از جمله حساب‌های غیرفعال دارای سابقه.</p>}</BasePanel>
    {loading && <p role="status">در حال دریافت گردش…</p>}{current?.error && <div className="notice error" role="alert">{current.error}<button type="button" className="text-button" onClick={() => setRetry(n => n+1)}>تلاش دوباره</button></div>}
    {result && <><p className="reports-context">{result.fromDate ? `${jalaliText(result.fromDate)} تا ${jalaliText(result.toDate ?? "")}` : "همه تاریخ‌ها"} · ارقام به {storeMoneyUnit(business)} · جمع‌ها برای کل گزارش هستند.</p>
      <BaseStats items={[{ label: "مانده ابتدای بازه", value: signed(result.openingBalance) }, { label: "گردش بدهکار", value: formatStoreMoney(business, result.totalDebit) }, { label: "گردش بستانکار", value: formatStoreMoney(business, result.totalCredit) }, { label: "مانده پایان بازه", value: signed(result.closingBalance) }]} />
      <BasePanel title="ریز گردش" note="مانده هر ردیف از ابتدای بازه محاسبه می‌شود و با تغییر صفحه از صفر شروع نمی‌شود.">
        {result.items.length ? <><div className="reports-table-scroll"><table className="base-table reports-table"><thead><tr>{["تاریخ شمسی", "سند", "حساب", "شرح", "طرف‌حساب", "بدهکار", "بستانکار", "مانده", "جزئیات"].map(x => <th key={x} scope="col">{x}</th>)}</tr></thead><tbody>{result.items.map(row => <tr key={row.id}><td>{jalaliText(row.entry.documentDate)}</td><td>{row.entry.entryNumber ? formatDecimal(row.entry.entryNumber) : "—"}</td><td>{row.account.name}</td><td>{journalDescription(row.description || row.entry.description)}</td><td>{row.party?.name ?? "—"}</td><td>{formatStoreMoney(business, row.debit)}</td><td>{formatStoreMoney(business, row.credit)}</td><td>{signed(row.runningBalance)}</td><td><button type="button" className="text-button" onClick={() => setEntryId(row.entry.id)}>مشاهده سند</button></td></tr>)}</tbody></table></div>
        <div className="reports-mobile-rows">{result.items.map(row => <article className="reports-mobile-row" key={row.id}><strong>{jalaliText(row.entry.documentDate)} · {row.account.name}</strong><p>{journalDescription(row.description || row.entry.description)}</p><div><span>بدهکار</span><bdi>{formatStoreMoney(business, row.debit)}</bdi></div><div><span>بستانکار</span><bdi>{formatStoreMoney(business, row.credit)}</bdi></div><div><span>مانده</span><strong>{signed(row.runningBalance)}</strong></div><button type="button" className="text-button" onClick={() => setEntryId(row.entry.id)}>مشاهده سند {row.entry.entryNumber ? formatDecimal(row.entry.entryNumber) : ""}</button></article>)}</div></> : <BaseEmpty title="گردشی در این بازه وجود ندارد" description="مانده ابتدا و پایان همچنان در بالای گزارش نمایش داده می‌شوند." />}
        <BasePagination page={page} totalPages={result.totalPages} loading={loading} onChange={setPage} /></BasePanel></>}
    {entryId && <JournalDetailsPanel key={`${business.id}:${entryId}`} business={business} entryId={entryId} onClose={() => setEntryId(null)} onSessionExpired={onSessionExpired} onChanged={() => setRetry(n => n+1)} />}
  </section>;
}
