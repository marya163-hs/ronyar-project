import type { Business } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import { BasePanel } from "./BaseUi";
import { ApiError, errorText, getYearEndClosingPlan, postYearEnd } from "./api";
import type { YearEndClosingPlan } from "./api";

type Props = { business?: Business; businessId: string; periodId: string; refreshToken: number; onSessionExpired: () => void };

export default function YearEndClosingPlanPanel({ business, businessId, periodId, refreshToken, onSessionExpired }: Props) {
  const [report, setReport] = useState<YearEndClosingPlan | null>(null);
  const [error, setError] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const sending = useRef(false);
  const pending = useRef<{ payload: string; key: string } | null>(null);

  async function finalize() {
    if (!report?.canFinalize || sending.current || completed || !attested ||
        confirmName !== report.periodName || reason.trim().length < 10) return;
    const body = { snapshotHash: report.snapshotHash, confirmName, reason: reason.trim(), evidenceReviewed: true as const };
    const payload = JSON.stringify(body);
    if (pending.current?.payload !== payload) pending.current = { payload, key: crypto.randomUUID() };
    sending.current = true;
    setBusy(true); setError("");
    try {
      await postYearEnd(businessId, periodId, body, pending.current.key);
      setCompleted(true);
    } catch (cause) {
      setError(errorText(cause));
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const c = new AbortController();
    setReport(null); setError("");
    getYearEndClosingPlan(businessId, periodId, c.signal).then(data => {
      if (!c.signal.aborted) setReport(data);
    }).catch(e => {
      if (!c.signal.aborted) {
        setError(errorText(e));
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
      }
    });
    return () => c.abort();
  }, [businessId, periodId, refreshToken, onSessionExpired]);

  const rial = (v: string) => `${formatStoreMoney(business, v)} ${storeMoneyUnit(business)}`;
  return <BasePanel title="پیشنهاد دقیق سند اختتام — Rev8.4a" note="از گردش قطعی اسناد عادی محاسبه می‌شود.">
    {error && <p className="notice error" role="alert">{error}</p>}
    {!report && !error && <p>در حال محاسبه پیشنهاد اختتام…</p>}
    {report && <>
      <p><strong>سود یا زیان خالص: {rial(report.plan.netProfit)}</strong> · حساب مقصد: {report.destinationConfigured ? "ثبت و معتبر" : "هنوز معتبر نشده"}</p>
      <p>در دفتر کل پیوسته، مانده دارایی‌ها، بدهی‌ها و حقوق مالکانه از گردش‌های قبلی ادامه پیدا می‌کند؛ <strong>سند افتتاحیه دوباره صادر نمی‌شود.</strong></p>
      {report.blockers.length > 0 && <div className="notice error" role="alert">
        <strong>اجرای قطعی مسدود است:</strong>
        <ul>{report.blockers.map((b, i) => <li key={`${b.code}-${i}`}>{b.message}</li>)}</ul>
      </div>}
      <div className="base-table-scroll"><table className="base-table"><thead><tr>
        <th>شرح حساب</th><th>نوع ردیف</th><th>بدهکار</th><th>بستانکار</th>
      </tr></thead><tbody>
        {report.plan.lines.map((line, i) => <tr key={`${line.accountId}-${i}`}>
          <td><strong>{line.name}</strong><div className="base-soft">{line.code}</div></td>
          <td>{line.reason === "CLOSE_TEMPORARY" ? "بستن حساب موقت" : "انتقال سود/زیان"}</td>
          <td>{line.debit === "0" || /^0(?:\.0+)?$/.test(line.debit) ? "—" : formatStoreMoney(business, line.debit)}</td>
          <td>{line.credit === "0" || /^0(?:\.0+)?$/.test(line.credit) ? "—" : formatStoreMoney(business, line.credit)}</td>
        </tr>)}
        <tr><td colSpan={2}><strong>جمع پیشنهادی</strong></td>
          <td><strong>{formatStoreMoney(business, report.plan.totalDebit)}</strong></td>
          <td><strong>{formatStoreMoney(business, report.plan.totalCredit)}</strong></td></tr>
      </tbody></table></div>
      {!report.plan.journalRequired && <p>مانده‌ای برای اختتام وجود ندارد؛ سند خنثی صادر نخواهد شد.</p>}
      <p className="base-soft">اثر انگشت محاسبات: <code dir="ltr">{report.snapshotHash.slice(0, 16)}…</code>. این شناسه مجوز اختتام نیست و در زمان اجرای واقعی باید دوباره داخل تراکنش راستی‌آزمایی شود.</p>
      {completed ? <p className="notice success" role="status">اختتام قطعی ثبت شد و دوره بسته شد.</p>
        : report.canFinalize ? <fieldset disabled={busy}>
          <legend>ثبت قطعی اختتام</legend>
          <p>با ثبت، دوره «{report.periodName}» بسته می‌شود.</p>
          <label>نام دقیق دوره <input value={confirmName} maxLength={200} onChange={e => setConfirmName(e.target.value)} /></label>
          <label>توضیح تأیید <textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
          <label><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} /> بازهٔ دوره و مدارک مستقل مغایرت‌گیری را بررسی کرده‌ام.</label>
          <button type="button" className="primary" disabled={!attested || confirmName !== report.periodName || reason.trim().length < 10}
            onClick={() => void finalize()}>{busy ? "در حال ثبت…" : "ثبت قطعی اختتام"}</button>
        </fieldset> : <p>اجرای قطعی برای این دوره در دسترس نیست.</p>}
    </>}
  </BasePanel>;
}
