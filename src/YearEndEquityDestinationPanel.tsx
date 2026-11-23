import { useEffect, useState } from "react";
import { BasePanel } from "./BaseUi";
import { ApiError, errorText, getYearEndEquityDestination, saveYearEndEquityDestination } from "./api";
import type { YearEndEquityDestination } from "./api";

type Props = {
  businessId: string; periodId: string; selectedAccountId: string;
  candidates: Array<{ id: string; code: string; name: string }>;
  onSaved: (accountId: string) => void; onSessionExpired: () => void;
};

export default function YearEndEquityDestinationPanel(props: Props) {
  const { businessId, periodId, selectedAccountId, candidates, onSaved, onSessionExpired } = props;
  const [config, setConfig] = useState<YearEndEquityDestination | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setConfig(null); setReason(""); setError(""); setNotice("");
    getYearEndEquityDestination(businessId, periodId, c.signal).then(item => {
      if (!c.signal.aborted) setConfig(item);
    }).catch(e => {
      if (c.signal.aborted) return;
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
    });
    return () => c.abort();
  }, [businessId, periodId, onSessionExpired]);

  async function save() {
    if (!selectedAccountId || !candidates.some(c => c.id === selectedAccountId) || !config ||
      reason.trim().length < 10 || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await saveYearEndEquityDestination(businessId, periodId, selectedAccountId, config.version, reason.trim());
      const fresh = await getYearEndEquityDestination(businessId, periodId);
      setConfig(fresh);
      setReason("");
      onSaved(selectedAccountId);
      setNotice("انتخاب پیشنهادی حساب مقصد ذخیره و در سابقه حسابرسی ثبت شد. این اقدام مجوز اختتام نیست.");
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
    } finally { setBusy(false); }
  }

  return <div style={{ marginTop: 16 }} dir="rtl">
    <BasePanel title="ثبت حساب پیشنهادی سود و زیان انباشته — Rev8.3m"
      note="تنظیم کارشناسی برای همین دوره؛ به هیچ سند، مانده یا قفل اختتام دست نمی‌زند.">
      <p>حساب مقصد را از فهرست بالا انتخاب کن. برای ثبت تنظیم، دلیل انتخاب را هم وارد کن. فقط حساب حقوق مالکانه مستقل و ثبت‌پذیر مجاز است؛ حساب سرمایه افتتاحیه مجاز نیست.</p>
      {config && <p><strong>حساب ذخیره‌شده:</strong> {config.account ? `${config.account.name} (${config.account.code})` : "تعیین نشده"}
        {config.configured && !config.eligible && <strong style={{ marginInlineStart: 8 }}>— نیازمند اصلاح</strong>}
      </p>}
      {config?.warning && <p className="notice error">{config.warning}</p>}
      <label style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 620 }}>
        علت ثبت / تغییر (حداقل ۱۰ کاراکتر)
        <textarea rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="مثلاً تخصیص حساب مستقل سود و زیان انباشته به دوره مالی" />
      </label>
      <button type="button" onClick={save} disabled={!config || busy || !selectedAccountId ||
        !candidates.some(c => c.id === selectedAccountId) || reason.trim().length < 10}>
        {busy ? "در حال ذخیره…" : "ثبت انتخاب پیشنهادی (بدون اختتام)"}
      </button>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <p className="base-soft">انتخاب این حساب، سازگاری گزارش‌های اختتامیه یا تطبیق بانک و صندوق را تأیید نمی‌کند. محدودیت‌های دیتابیس همچنان برقرارند.</p>
    </BasePanel>
  </div>;
}
