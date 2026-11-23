import type { Business } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import { BasePanel } from "./BaseUi";
import JalaliDateField from "./JalaliDateField";
import MoneyInput from "./MoneyInput";
import { ApiError, errorText, formatDecimal, inspectCashBankRec, listCashBankRecAccounts, recordCashBankRec } from "./api";
import type { CashBankRecAccounts, CashBankRecInspection, CashBankRecInput, CashBankRecItem } from "./api";
import { jalaliText } from "./jalaliDate";
import "./YearEndCashBankReconciliationPanel.css";

type Props = { business?: Business; businessId: string; periodId: string; refreshToken: number; onSessionExpired: () => void; onEvidenceRecorded?: () => void };
type Signed = { magnitude: string; sign: "+" | "-" };
const initialItem = (): CashBankRecItem => ({ description: "", amount: "", reference: "" });
const compact = (s: Signed) => s.sign === "-" && s.magnitude && s.magnitude !== "0" ? `-${s.magnitude}` : s.magnitude;
const localTime = (iso: string) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export default function YearEndCashBankReconciliationPanel({ business, businessId, periodId, refreshToken, onSessionExpired, onEvidenceRecorded }: Props) {
  const [meta, setMeta] = useState<CashBankRecAccounts | null>(null);
  const [accountId, setAccountId] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [inspection, setInspection] = useState<CashBankRecInspection | null>(null);
  const [reported, setReported] = useState<Signed>({ magnitude: "", sign: "+" });
  const [items, setItems] = useState<CashBankRecItem[]>([]);
  const [evidenceReference, setEvidenceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const pending = useRef<{ identity: string; key: string } | null>(null);

  function clearDraft() {
    setReported({ magnitude: "", sign: "+" });
    setItems([]);
    setEvidenceReference("");
    setNotes("");
    setConfirmed(false);
    setNotice("");
    pending.current = null;
  }

  useEffect(() => {
    if (!periodId) { setMeta(null); return; }
    const abort = new AbortController();
    setError(""); setNotice(""); setMeta(null); setInspection(null); setAccountId(""); setAsOfDate("");
    setReported({ magnitude: "", sign: "+" }); setItems([]); setEvidenceReference(""); setNotes(""); setConfirmed(false); pending.current = null;
    listCashBankRecAccounts(businessId, periodId, abort.signal).then(data => {
      if (abort.signal.aborted) return;
      setMeta(data);
      setAccountId(data.accounts[0]?.id ?? "");
      // Reconciliation must be performed for an ACTUAL date, never for a future period-end.
      const date = data.today < data.period.endDate ? data.today : data.period.endDate;
      setAsOfDate(date >= data.period.startDate ? date : "");
    }).catch(e => {
      if (abort.signal.aborted) return;
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
    });
    return () => abort.abort();
  }, [businessId, periodId, refreshToken, onSessionExpired]);

  useEffect(() => {
    const abort = new AbortController();
    setInspection(null); setError("");
    if (!meta || !accountId || !asOfDate) return () => abort.abort();
    setLoading(true);
    inspectCashBankRec(businessId, periodId, accountId, asOfDate, abort.signal).then(data => {
      if (!abort.signal.aborted) setInspection(data);
    }).catch(e => {
      if (abort.signal.aborted) return;
      setError(errorText(e)); if (e instanceof ApiError && e.status === 401) onSessionExpired();
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [meta, businessId, periodId, accountId, asOfDate, refresh, onSessionExpired]);

  function changeItem(i: number, prop: keyof CashBankRecItem, value: string) {
    setItems(current => current.map((row, index) => i === index ? { ...row, [prop]: value } : row));
  }
  function changeItemSign(i: number, negative: boolean) {
    setItems(current => current.map((row, index) => i === index ? { ...row, amount: negative ? `-${row.amount.replace(/^-/, "")}` : row.amount.replace(/^-/, "") } : row));
  }
  async function submit() {
    if (!inspection || !periodId || !accountId || saving || !reported.magnitude || evidenceReference.trim().length < 4 || notes.trim().length < 10) return;
    const normalized: CashBankRecItem[] = items.map(item => ({ description: item.description.trim(), amount: item.amount, reference: item.reference.trim() }));
    if (normalized.some(item => !item.amount || item.amount === "0" || item.amount === "-0" || item.description.length < 5 || item.reference.length < 3)) {
      setError("برای هر قلم باز، مبلغ غیرصفر، شرح و شماره مدرک لازم است."); return;
    }
    const identity = JSON.stringify([businessId, periodId, accountId, asOfDate, reported, normalized, evidenceReference.trim(), notes.trim(), confirmed]);
    if (pending.current?.identity !== identity) pending.current = { identity, key: crypto.randomUUID() };
    const input: CashBankRecInput = { accountId, asOfDate, reportedBalance: compact(reported), items: normalized,
      evidenceReference: evidenceReference.trim(), notes: notes.trim(), confirmIndependentSource: confirmed, requestKey: pending.current.key };
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await recordCashBankRec(businessId, periodId, input);
      setNotice(saved.status === "MATCHED"
        ? "نتیجه منطبق براساس ارقام اعلام‌شده ثبت شد؛ اصالت مدرک بیرونی هنوز توسط سامانه تأیید نشده و اختتام همچنان غیرفعال است."
        : "مغایرت با مبلغ مشخص در سوابق ثبت شد؛ هیچ سند اصلاحی ساخته نشد.");
      pending.current = null; setRefresh(n => n + 1); onEvidenceRecorded?.();
    } catch (e) {
      setError(errorText(e)); if (e instanceof ApiError && e.status === 401) onSessionExpired();
    } finally { setSaving(false); }
  }

  const selectedAccount = meta?.accounts.find(a => a.id === accountId);
  const readyToSubmit = Boolean(inspection && reported.magnitude && evidenceReference.trim().length >= 4 && notes.trim().length >= 10 && accountId && asOfDate);

  return <div className="ye-cb-reconciliation" dir="rtl">
    <BasePanel title="مغایرت‌گیری بانک و شمارش صندوق"
      note="ثبت نتیجه شمارش صندوق یا تطبیق صورتحساب بانک، بدون تغییر اسناد حسابداری">
      <div className="ye-cb-content">
        <div className="ye-cb-advisory">
          <strong>ثبت بررسی، نه اصلاح مانده</strong>
          <p>مانده دفتر کل با مبلغ منبع مستقل مقایسه می‌شود. اطلاعات این بخش به بانک متصل نیست و ثبت آن سند حسابداری یا مجوز اختتام ایجاد نمی‌کند.</p>
        </div>
        {error && <p className="notice error" role="alert">{error}</p>}

        {meta && <section className="ye-cb-section" aria-label="انتخاب حساب و تاریخ">
          <div className="ye-cb-section-heading"><span className="ye-cb-step">۱</span><div><h4>حساب و تاریخ بررسی</h4><p>مانده هر حساب در تاریخ انتخابی به‌طور مستقل خوانده می‌شود.</p></div></div>
          <div className="ye-cb-grid ye-cb-top-grid">
            <label className="ye-cb-field" htmlFor="ye-cb-account"><span>حساب صندوق یا بانک</span>
              <select id="ye-cb-account" value={accountId} onChange={e => { setAccountId(e.target.value); setInspection(null); clearDraft(); }}>
                {meta.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {account.code}</option>)}
              </select>
              {selectedAccount && <small className="ye-cb-code">کد حساب: <bdi dir="ltr">{selectedAccount.code}</bdi></small>}
            </label>
            <div className="ye-cb-date"><JalaliDateField id="rec-cash-bank-date" label="تاریخ بررسی (شمسی)" value={asOfDate}
              onChange={d => { if (d !== asOfDate) { setAsOfDate(d); setInspection(null); clearDraft(); } }}
              minISO={meta.period.startDate} maxISO={meta.today < meta.period.endDate ? meta.today : meta.period.endDate} /></div>
            <button type="button" className="secondary ye-cb-refresh" disabled={loading || !asOfDate || !accountId} onClick={() => setRefresh(v => v + 1)}>بررسی مجدد</button>
          </div>
          {!meta.accounts.length && <p className="ye-cb-help">حساب صندوق یا بانک فعالِ ثبت‌پذیر یافت نشد.</p>}
          {!asOfDate && <p className="ye-cb-help">این دوره هنوز آغاز نشده است یا تاریخ بررسی مجاز انتخاب نشده است.</p>}
        </section>}

        {loading && <p className="ye-cb-loading" role="status">در حال خواندن مانده و سابقه بررسی…</p>}
        {inspection && <>
          <div className="ye-cb-balance">
            <div><span>مانده دفتر کل در {jalaliText(inspection.asOfDate)}</span>
              <strong><bdi>{formatStoreMoney(business, inspection.bookBalance)}</bdi> <small>{storeMoneyUnit(business)}</small></strong>
              <span>حساب: {inspection.account.name}</span></div>
            <div className="ye-cb-balance-count">بر اساس <bdi>{formatDecimal(String(inspection.journalLineCount))}</bdi> ردیف قطعی</div>
          </div>

          <section className="ye-cb-section" aria-label="مانده اعلام‌شده">
            <div className="ye-cb-section-heading"><span className="ye-cb-step">۲</span><div><h4>مانده واقعی اعلام‌شده</h4><p>مبلغ صورتحساب بانک یا شمارش دستی صندوق را وارد کن.</p></div></div>
            <div className="ye-cb-grid ye-cb-amount-grid">
              <label className="ye-cb-field"><span>مبلغ اعلام‌شده ({storeMoneyUnit(business)})</span>
                <MoneyInput business={business} value={reported.magnitude} onChange={value => { setReported(p => ({ ...p, magnitude: value })); setNotice(""); }} aria-label={`مبلغ اعلام‌شده به ${storeMoneyUnit(business)}`} />
                <small>مبلغ هنگام تایپ سه‌رقمی جدا می‌شود.</small>
              </label>
              <label className="ye-cb-field"><span>ماهیت مانده</span>
                <select value={reported.sign} onChange={e => setReported(p => ({ ...p, sign: e.target.value as "+" | "-" }))}>
                  <option value="+">مثبت</option><option value="-">منفی / اضافه‌برداشت</option>
                </select>
              </label>
            </div>
          </section>

          <section className="ye-cb-section" aria-label="اقلام باز تطبیق">
            <div className="ye-cb-section-heading ye-cb-with-action"><span className="ye-cb-step">۳</span><div><h4>اقلام باز تطبیق</h4><p>در صورت وجود، اقلام افزایشی یا کاهشی با مدرک را ثبت کن. این اقلام سند حسابداری نیستند.</p></div>
              <button type="button" className="secondary ye-cb-add" disabled={items.length >= 20} onClick={() => setItems(current => [...current, initialItem()])}>+ افزودن قلم</button>
            </div>
            {!items.length && <p className="ye-cb-empty-items">اگر قلم باز نداری، نیازی به افزودن ردیف نیست.</p>}
            {items.map((item, i) => <div className="ye-cb-item" key={i}>
              <div className="ye-cb-item-header"><strong>قلم باز {formatDecimal(String(i + 1))}</strong><button type="button" className="ye-cb-remove" onClick={() => setItems(current => current.filter((_, index) => index !== i))}>حذف قلم</button></div>
              <div className="ye-cb-grid ye-cb-item-grid">
                <label className="ye-cb-field"><span>شرح قلم باز</span><input value={item.description} maxLength={150} onChange={e => changeItem(i, "description", e.target.value)} /></label>
                <label className="ye-cb-field"><span>مبلغ ({storeMoneyUnit(business)})</span><MoneyInput business={business} value={item.amount.replace(/^-/, "")} onChange={value => changeItem(i, "amount", item.amount.startsWith("-") ? `-${value}` : value)} /></label>
                <label className="ye-cb-field"><span>جهت اصلاح مبلغ اعلام‌شده</span><select value={item.amount.startsWith("-") ? "-" : "+"} onChange={e => changeItemSign(i, e.target.value === "-")}><option value="+">افزایش</option><option value="-">کاهش</option></select></label>
                <label className="ye-cb-field"><span>مرجع قلم</span><input value={item.reference} maxLength={150} onChange={e => changeItem(i, "reference", e.target.value)} /></label>
              </div>
            </div>)}
          </section>

          <section className="ye-cb-section" aria-label="مستندات و تأیید بررسی">
            <div className="ye-cb-section-heading"><span className="ye-cb-step">۴</span><div><h4>مستندات و ثبت نتیجه</h4><p>مرجع بررسی و علت تطبیق یا اختلاف را ثبت کن.</p></div></div>
            <div className="ye-cb-grid ye-cb-evidence-grid">
              <label className="ye-cb-field"><span>شماره یا مرجع مدرک</span><input value={evidenceReference} onChange={e => setEvidenceReference(e.target.value)} maxLength={150} placeholder="مثلاً TEST-CASH-001" /><small>حداقل ۴ کاراکتر</small></label>
              <label className="ye-cb-field"><span>توضیح بررسی</span><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="منبع و نحوه تطبیق، یا علت اختلاف را شرح بده…" /><small>حداقل ۱۰ کاراکتر ({formatDecimal(String(notes.trim().length))} وارد شده)</small></label>
            </div>
            <label className="ye-cb-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>منبع مستقل (صورت‌حساب بانک یا شمارش صندوق) را شخصاً بررسی کرده‌ام.</span></label>
            <div className="ye-cb-submit-row">
              <div><strong>ثبت سابقه بررسی</strong><small>هیچ سند اصلاحی یا اختتامیه‌ای صادر نمی‌شود.</small></div>
              <button type="button" className="primary ye-cb-submit" disabled={saving || !readyToSubmit} onClick={submit}>{saving ? "در حال ثبت…" : "ثبت نتیجه بررسی"}</button>
            </div>
            {!readyToSubmit && <p className="ye-cb-validation-hint">برای فعال‌شدن دکمه، مبلغ اعلام‌شده، شماره مرجع (حداقل ۴ کاراکتر) و توضیح (حداقل ۱۰ کاراکتر) را وارد کن.</p>}
            {notice && <p className="notice success" role="status">{notice}</p>}
          </section>

          <section className="ye-cb-section ye-cb-history" aria-label="سوابق تطبیق">
            <div className="ye-cb-section-heading"><span className="ye-cb-step">۵</span><div><h4>سوابق همین حساب و تاریخ</h4><p>سوابق تغییرناپذیرند؛ تغییر گردش‌های مؤثر باعث نیاز به تطبیق مجدد می‌شود.</p></div></div>
            {inspection.records.length ? <div className="base-table-scroll"><table className="base-table"><thead><tr><th>زمان</th><th>مانده دفتر</th><th>مانده اعلام‌شده</th><th>جمع اقلام باز</th><th>اختلاف</th><th>وضعیت</th><th>مرجع</th></tr></thead>
              <tbody>{inspection.records.map(record => <tr key={record.id}><td>{localTime(record.createdAt)}</td><td>{formatStoreMoney(business, record.bookBalance)}</td><td>{formatStoreMoney(business, record.reportedBalance)}</td><td>{formatStoreMoney(business, record.adjustmentTotal)}</td><td><strong>{formatStoreMoney(business, record.difference)}</strong></td><td>{record.freshness === "STALE" ? "نیازمند تطبیق مجدد" : record.status === "MATCHED" ? "منطبق با ارقام اعلام‌شده" : "دارای اختلاف"}</td><td><bdi dir="ltr">{record.evidenceReference}</bdi></td></tr>)}</tbody></table></div>
              : <p className="ye-cb-empty-history">برای این حساب و تاریخ هنوز نتیجه‌ای ثبت نشده است.</p>}
            {inspection.records.some(r => r.freshness === "STALE") && <p className="notice error">از زمان ثبت برخی بررسی‌ها، گردش مؤثر دفتر کل تغییر کرده است؛ سابقه قدیمی معتبر نیست.</p>}
          </section>
          <p className="ye-cb-footer-note">این سوابق تأیید اصالت مدارک یا مجوز بستن دوره و صدور سند پایان سال نیستند.</p>
        </>}
      </div>
    </BasePanel>
  </div>;
}
