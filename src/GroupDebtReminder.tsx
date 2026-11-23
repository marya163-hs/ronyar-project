import { useEffect, useRef, useState } from "react";
import { ApiError, formatDecimal, listPartyBalances, previewDebtReminder, sendDebtReminder } from "./api";
import type { Business, DebtReminderPreview, PartyBalanceRow } from "./api";
import { formatStoreMoney } from "./storeMoney";
import FormDrawer from "./FormDrawer";

type Preview = DebtReminderPreview & { partyId: string; commandId: string };
type Outcome = { name: string; message: string; accepted?: boolean };

export default function GroupDebtReminder({ business, onSessionExpired }: {
  business: Business;
  onSessionExpired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PartyBalanceRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [card, setCard] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [skipped, setSkipped] = useState<Outcome[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const running = useRef(false);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);

  async function run(work: (signal: AbortSignal) => Promise<void>) {
    const signal = lifetime.current?.signal;
    if (running.current || !signal || signal.aborted) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await work(signal);
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      else setError("عملیات کامل نشد. وضعیت هر گیرنده را بررسی کنید.");
    } finally {
      running.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  function load() {
    setOpen(true);
    setRows([]);
    setSelected(new Set());
    setCard("");
    setPreviews([]);
    setSkipped([]);
    setOutcomes([]);
    void run(async signal => {
      const candidates = new Map<string, PartyBalanceRow>();
      let page = 1;
      let totalPages = 1;
      while (!signal.aborted && page <= totalPages) {
        const report = await listPartyBalances(business.id, "CUSTOMER", page, signal);
        if (page === 1) totalPages = report.totalPages;
        for (const row of report.items) {
          if (row.balanceSide === "DEBIT" && row.party.customerEnabled && row.party.isActive && !row.party.isCashCustomer) {
            candidates.set(row.party.id, row);
          }
        }
        page++;
      }
      if (!signal.aborted) setRows([...candidates.values()]);
    });
  }

  function preview() {
    void run(async signal => {
      setSkipped([]);
      const ready: Preview[] = [];
      const unavailable: Outcome[] = [];
      for (const row of rows.filter(item => selected.has(item.party.id))) {
        if (signal.aborted) return;
        try {
          const result = await previewDebtReminder(business.id, row.party.id, card);
          ready.push({ ...result, partyId: row.party.id, commandId: crypto.randomUUID() });
        } catch (cause) {
          if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) throw cause;
          const detail = cause instanceof ApiError ? cause.serverMessage : undefined;
          unavailable.push({ name: row.party.name, message: detail && /[\u0600-\u06ff]/.test(detail) ? detail : "پیش‌نمایش در دسترس نبود." });
        }
      }
      if (!signal.aborted) {
        setPreviews(ready);
        setSkipped(unavailable);
      }
    });
  }

  function send() {
    void run(async signal => {
      for (const item of previews) {
        if (signal.aborted) return;
        let outcome: Outcome;
        try {
          const result = await sendDebtReminder(business.id, item.partyId, card, item.token, item.commandId);
          outcome = { name: item.customer, accepted: result.state === "ACCEPTED",
            message: result.state === "ACCEPTED" ? "پذیرفته‌شده توسط پیام‌رسان" : result.state === "REJECTED" ? "ردشده توسط پیام‌رسان" : "نتیجه نامشخص؛ سابقهٔ پیامک را بررسی کنید." };
        } catch (cause) {
          if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) throw cause;
          outcome = { name: item.customer, message: cause instanceof ApiError && cause.status === 409
            ? "اطلاعات تغییر کرده است؛ پیش‌نمایش تازه لازم است." : "نتیجه دریافت نشد؛ سابقهٔ پیامک را بررسی کنید." };
        }
        if (!signal.aborted) setOutcomes(previous => [...previous, outcome]);
      }
    });
  }

  if (!open) return <button type="button" className="secondary" onClick={load}>یادآوری گروهی بدهی با پیامک</button>;

  return <FormDrawer title="یادآوری گروهی بدهی" busy={busy} onClose={() => setOpen(false)}>
    {error && <p className="notice error" role="alert">{error}</p>}
    {busy && <p role="status">در حال انجام…</p>}
    {!previews.length && <>
      <label>شماره کارت فروشگاه
        <input dir="ltr" inputMode="numeric" autoComplete="off" value={card} disabled={busy}
          onChange={event => setCard(event.target.value.replace(/[۰-۹٠-٩]/g, digit =>
            String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit) % 10)).replace(/[\s-]/g, ""))} />
      </label>
      {rows.length > 0 && <>
        <label className="reports-check"><input type="checkbox" disabled={busy} checked={selected.size === rows.length}
          onChange={event => setSelected(new Set(event.target.checked ? rows.map(row => row.party.id) : []))} />انتخاب همهٔ بدهکاران</label>
        {rows.map(row => <label key={row.party.id} className="reports-check">
          <input type="checkbox" disabled={busy} checked={selected.has(row.party.id)} onChange={event => {
            const checked = event.target.checked;
            setSelected(previous => {
              const next = new Set(previous);
              if (checked) next.add(row.party.id);
              else next.delete(row.party.id);
              return next;
            });
          }} />{row.party.name} · <bdi>{formatStoreMoney(business, row.balanceAmount)}</bdi>
        </label>)}
        <button type="button" className="primary" disabled={busy || !selected.size || !/^[0-9]{16}$/.test(card)} onClick={preview}>
          پیش‌نمایش {formatDecimal(String(selected.size))} پیامک
        </button>
      </>}
      {!busy && !error && !rows.length && <p>مشتری بدهکار فعالی پیدا نشد.</p>}
    </>}
    {!!skipped.length && <details open><summary>{formatDecimal(String(skipped.length))} گیرنده آمادهٔ ارسال نیست</summary>
      <ul>{skipped.map((item, index) => <li key={index}>{item.name} · {item.message}</li>)}</ul>
    </details>}
    {!!previews.length && !outcomes.length && <>
      <p>فروشگاه {previews[0].store} · کارت مقصد <bdi>{card}</bdi></p>
      <ul>{previews.map(item => <li key={item.partyId}>{item.customer} · <bdi>{item.mobile}</bdi> · {formatDecimal(item.amount)} تومان</li>)}</ul>
      <button type="button" className="primary" disabled={busy || Boolean(error)} onClick={send}>
        تأیید و ارسال {formatDecimal(String(previews.length))} پیامک
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setPreviews([]); setSkipped([]); setError(""); }}>بازگشت به انتخاب گیرندگان</button>
    </>}
    {!!outcomes.length && <section aria-label="نتیجه ارسال">
      <p role="status">{formatDecimal(String(outcomes.length))} از {formatDecimal(String(previews.length))} بررسی شد · {formatDecimal(String(outcomes.filter(item => item.accepted).length))} پذیرفته شد</p>
      <ul>{outcomes.map((item, index) => <li key={index}>{item.name} · {item.message}</li>)}</ul>
    </section>}
  </FormDrawer>;
}
