import { useEffect, useState } from "react";
import JalaliDateField from "./JalaliDateField";
import { jalaliText } from "./jalaliDate";
import { ApiError, updateFiscalPeriod, createBasePeriod, listFiscalPeriods, getFiscalPeriodLockPreview, lockFiscalPeriodSafely, reopenFiscalPeriod } from "./api";
import type { Business, FiscalPeriod, FiscalPeriodLockPreview } from "./api";
import { useMasterList, MasterStatus, MasterEditor, localValidation, MasterPendingReview } from "./MasterDataShared";
import { BaseHeader, BaseStats, BasePanel, BaseEmpty, BaseBadge } from "./BaseUi";

/** ISO date strings in YYYY-MM-DD order can be compared lexicographically. */
function overlaps(start: string, end: string, period: FiscalPeriod): boolean {
  return start <= period.endDate && end >= period.startDate;
}

function overlapMessage(period: FiscalPeriod): string {
  return `بازه انتخاب‌شده با دوره «${period.name}» (${jalaliText(period.startDate)} تا ${jalaliText(period.endDate)}) همپوشانی دارد. تاریخ‌های دیگری انتخاب کنید؛ دوره بسته هم قابل همپوشانی نیست.`;
}

export default function FiscalPeriodDefinitions({
  business, onSessionExpired,
}: {
  business: Business;
  onSessionExpired: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [editing,setEditing]=useState<FiscalPeriod|null>(null);
  const [editReason,setEditReason]=useState("");
  const [form, setForm] = useState(false);
  const [closing, setClosing] = useState<FiscalPeriod | null>(null);
  const [reopening, setReopening] = useState<FiscalPeriod | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<FiscalPeriodLockPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [name, setName] = useState("");
  // A new accounting period must be intentional: defaulting both dates to today
  // silently creates a one-day range, usually overlapping an existing period.
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const list = useMasterList(signal => listFiscalPeriods(business.id, signal), revision, onSessionExpired);
  const key = `mahan:base-period:${business.id}`;
  const rows = list.data ?? [];
  useEffect(() => {
    if (!closing) { setPreview(null); setPreviewError(""); setPreviewLoading(false); return; }
    const controller = new AbortController();
    setPreview(null); setPreviewError(""); setPreviewLoading(true);
    getFiscalPeriodLockPreview(business.id, closing.id, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPreview(result); })
      .catch(error => { if (!controller.signal.aborted) setPreviewError(error instanceof ApiError ? "اطلاعات دوره قابل بررسی نیست. فهرست را تازه‌سازی کنید." : "اتصال برای بررسی دوره برقرار نشد."); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [business.id, closing?.id]);

  function startLock(period: FiscalPeriod) {
    setConfirmation(""); setReason(""); setAcknowledged(false); setClosing(period);
  }
  function startReopen(period: FiscalPeriod) {
    setConfirmation(""); setReason(""); setAcknowledged(false); setReopening(period);
  }

  const conflict = start && end && end >= start
    ? rows.find(period => period.id!==editing?.id && overlaps(start, end, period))
    : undefined;

  async function savePeriod(): Promise<void> {
    if (!name.trim()) localValidation("نام دوره مالی را وارد کنید.");
    if (!start || !end) localValidation("تاریخ شروع و پایان شمسی را مشخص کنید.");
    if (end < start) localValidation("تاریخ پایان نمی‌تواند قبل از شروع باشد.");
    if (conflict) localValidation(overlapMessage(conflict));
    try {
      if(editing){
        if(editReason.trim().length<10)localValidation("دلیل ویرایش را حداقل در ۱۰ نویسه وارد کنید.");
        await updateFiscalPeriod(business.id,editing.id,{name:name.trim(),startDate:start,endDate:end,expected:{name:editing.name,startDate:editing.startDate,endDate:editing.endDate},reason:editReason.trim()});
      }else await createBasePeriod(business.id, { name: name.trim(), startDate: start, endDate: end });
    } catch (cause) {
      if (editing) throw cause;
      if (cause instanceof ApiError && cause.status === 409) {
        // Another operator could have added a period after the list was loaded.
        setRevision(value => value + 1);
        let updatedConflict: FiscalPeriod | undefined;
        try {
          const updatedPeriods = await listFiscalPeriods(business.id);
          updatedConflict = updatedPeriods.find(period => overlaps(start, end, period));
        } catch {
          // Preserve the meaningful period error even if refreshing the list fails.
        }
        localValidation(updatedConflict ? overlapMessage(updatedConflict) :
          "این بازه با دوره دیگری تداخل دارد. فهرست را تازه کنید.");
      }
      throw cause;
    }
  }

  return <section className="base-page">
    <BaseHeader title="دوره‌های مالی" description="مدیریت بازه ثبت سند، قفل دوره و بازگشایی کنترل‌شده؛ اختتام سال مالی مستقل است"
      actionLabel="دوره جدید" action={() => { setEditing(null); setEditReason(""); setName(""); setStart(""); setEnd(""); setForm(true); }}
      secondary={<button type="button" className="secondary base-refresh" onClick={() => setRevision(value => value + 1)}>↻ به‌روزرسانی</button>} />
    <BaseStats items={[
      { label: "همه دوره‌ها", value: list.data ? rows.length : "—" },
      { label: "دوره‌های باز", value: list.data ? rows.filter(row => row.status === "OPEN").length : "—", hint: "امکان ثبت سند در بازه" },
      { label: "دوره‌های بسته", value: list.data ? rows.filter(row => row.status === "CLOSED").length : "—", hint: "ثبت جدید مجاز نیست" },
    ]} />
    <BasePanel title="فهرست دوره‌های مالی" note="بستن دوره فقط ثبت‌های جدید را قفل می‌کند و سند اختتامیه یا افتتاحیه نمی‌سازد. مالک فروشگاه می‌تواند با ثبت دلیل، دوره قفل‌شده را باز کند.">
      <MasterStatus {...list} onRetry={() => setRevision(value => value + 1)} />
      <MasterPendingReview key={revision} storageKey={key} />
      {list.data && (rows.length ? <div className="base-table-scroll"><table className="base-table">
        <thead><tr><th>نام دوره</th><th>تاریخ شروع</th><th>تاریخ پایان</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td><strong>{row.name}</strong></td><td><bdi>{jalaliText(row.startDate)}</bdi></td>
          <td><bdi>{jalaliText(row.endDate)}</bdi></td>
          <td><BaseBadge active={row.status === "OPEN"} label={row.status === "OPEN" ? "باز" : "بسته"} /></td>
          <td>{row.status==="OPEN"&&<button type="button" className="secondary base-row-edit" onClick={()=>{setEditing(row);setName(row.name);setStart(row.startDate);setEnd(row.endDate);setEditReason("");setForm(true);}}>ویرایش دوره</button>}{row.status === "OPEN"
            ? <button type="button" className="secondary base-row-edit base-danger" onClick={() => startLock(row)}>قفل دوره</button>
            : <button type="button" className="secondary base-row-edit" onClick={() => startReopen(row)}>بازگشایی دوره</button>}</td>
        </tr>)}</tbody>
      </table></div> : <BaseEmpty title="دوره مالی تعریف نشده" description="با تعریف یک دوره باز، امکان ثبت اسناد مرتبط فراهم می‌شود." />)}
    </BasePanel>
    {form && <MasterEditor title={editing?"ویرایش دوره مالی":"تعریف دوره مالی"} storageKey={editing?`${key}:edit:${editing.id}`:key} onSessionExpired={onSessionExpired}
      onClose={() => { setForm(false); setRevision(value => value + 1); }} onSave={savePeriod}>
      {editing&&<><p className="notice">ویرایش برای مالک و مدیر فروشگاه مجاز است. تاریخ هیچ سندی نباید خارج از بازه بماند؛ سوابق و دلیل تغییر نگهداری می‌شوند.</p><label>دلیل ویرایش<textarea value={editReason} onChange={e=>setEditReason(e.target.value)} required minLength={10} maxLength={500}/></label></>}
      <label>نام<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} placeholder="مثلاً سال مالی ۱۴۰۶" /></label>
      <JalaliDateField id="period-start" label="تاریخ شروع (شمسی)" value={start}
        onChange={next => { setStart(next); if (next && end && end < next) setEnd(""); }} />
      <JalaliDateField id="period-end" label="تاریخ پایان (شمسی)" value={end} minISO={start} onChange={setEnd} />
      {conflict && <p className="notice error" role="alert">{overlapMessage(conflict)}</p>}
      {rows.length > 0 && <div className="notice">
        <strong>بازه‌های موجود (غیرقابل همپوشانی):</strong>
        <ul>{rows.slice(0, 5).map(period => <li key={period.id}>
          {period.name}: <bdi>{jalaliText(period.startDate)}</bdi> تا <bdi>{jalaliText(period.endDate)}</bdi> ({period.status === "OPEN" ? "باز" : "بسته"})
        </li>)}</ul>
        {rows.length > 5 && <small>برای مشاهده بقیه دوره‌ها، فهرست اصلی را بررسی کنید.</small>}
      </div>}
    </MasterEditor>}
    {closing && <MasterEditor title={`قفل دوره: ${closing.name}`} storageKey={`${key}:lock:${closing.id}`}
      onSessionExpired={onSessionExpired} onClose={() => { setClosing(null); setRevision(value => value + 1); }}
      onSave={async () => {
        if (!preview || !preview.canLock) localValidation("شرایط قفل دوره تأیید نشده است. اطلاعات را بررسی کنید.");
        if (confirmation.trim() !== closing.name) localValidation("نام دوره را دقیقاً وارد کنید.");
        if (reason.trim().length < 10) localValidation("دلیل را حداقل در ۱۰ نویسه وارد کنید.");
        if (!acknowledged) localValidation("چک‌لیست تأیید نشده است.");
        try { await lockFiscalPeriodSafely(business.id, closing.id, confirmation.trim(), reason.trim()); }
        catch (cause) {
          if (cause instanceof ApiError && cause.status === 409) localValidation("وضعیت دوره، تاریخ پایان یا پیش‌نویس‌ها تغییر کرده‌اند. فرم را ببندید و دوباره بررسی کنید.");
          throw cause;
        }
      }}>
      <div className="notice"><strong>این عملیات فقط دوره را قفل می‌کند.</strong> هیچ سند اختتامیه، افتتاحیه یا انتقال مانده‌ای خودکار ایجاد نمی‌شود.</div>
      <p>بازه: <bdi>{jalaliText(closing.startDate)}</bdi> تا <bdi>{jalaliText(closing.endDate)}</bdi></p>
      {previewLoading && <p role="status">در حال بررسی پیش‌نویس‌ها و زمان پایان دوره…</p>}
      {previewError && <p role="alert" className="notice error">{previewError}</p>}
      {preview && <div className={preview.canLock ? "notice" : "notice error"}>
        <strong>{preview.canLock ? "کنترل اولیه قابل قبول است" : "قفل دوره فعلاً مجاز نیست"}</strong>
        <p>اسناد پیش‌نویس: {preview.draftCount.toLocaleString("fa-IR")}</p>
        {preview.blockers.map((blocker, index) => <p key={index}>{blocker}</p>)}
        <small>این یک بررسی اولیه است؛ سرور هنگام ثبت دوباره کنترل می‌کند.</small>
      </div>}
      <label>دلیل قفل دوره<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} required placeholder="مثلاً کنترل اسناد و تأیید گزارش‌های پایان دوره" /></label>
      <label>برای تأیید نام دوره را وارد کنید: <strong>{closing.name}</strong>
        <input value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="off" placeholder="نام دقیق دوره" />
      </label>
      <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} required /> گزارش‌ها و مانده‌ها را بررسی کرده‌ام و می‌دانم این عملیات اختتام سال مالی نیست.</label>
      {!preview?.canLock && <p className="notice error">تا رفع موارد بالا، قفل دوره مجاز نیست.</p>}
    </MasterEditor>}
    {reopening && <MasterEditor title={`بازگشایی دوره: ${reopening.name}`} storageKey={`${key}:reopen:${reopening.id}`}
      onSessionExpired={onSessionExpired} onClose={() => { setReopening(null); setRevision(value => value + 1); }}
      onSave={async () => {
        if (confirmation.trim() !== reopening.name) localValidation("نام دوره را دقیقاً وارد کنید.");
        if (reason.trim().length < 10) localValidation("دلیل بازگشایی باید حداقل ۱۰ نویسه باشد.");
        if (!acknowledged) localValidation("تأیید بازگشایی الزامی است.");
        try { await reopenFiscalPeriod(business.id, reopening.id, confirmation.trim(), reason.trim()); }
        catch (cause) {
          if (cause instanceof ApiError && cause.status === 403) localValidation("بازگشایی دوره فقط توسط مالک فعال فروشگاه مجاز است.");
          if (cause instanceof ApiError && cause.status === 409) localValidation("وضعیت دوره تغییر کرده است؛ فهرست را دوباره بررسی کنید.");
          throw cause;
        }
      }}>
      <div className="notice">بازگشایی، قفل اداری دوره را لغو می‌کند؛ اسناد قطعی پیشین تغییر نخواهند کرد. دلیل بازگشایی در سابقه حسابرسی ثبت می‌شود.</div>
      <p>بازه: <bdi>{jalaliText(reopening.startDate)}</bdi> تا <bdi>{jalaliText(reopening.endDate)}</bdi></p>
      <label>دلیل بازگشایی<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} required placeholder="مثلاً بسته‌شدن سهوی پیش از تکمیل بررسی‌ها" /></label>
      <label>برای تأیید نام دوره را وارد کنید: <strong>{reopening.name}</strong>
        <input value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="off" placeholder="نام دقیق دوره" />
      </label>
      <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} required /> تأیید می‌کنم این دوره دوباره امکان ثبت سند خواهد داشت.</label>
    </MasterEditor>}
  </section>;
}
