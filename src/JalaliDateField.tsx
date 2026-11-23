import { useEffect, useRef, useState } from "react";
import { isoToJalali, jalaliMonths, jalaliText, jalaliToISO, parseJalaliText, persianInteger } from "./jalaliDate";

type Props = {
  id: string;
  label: string;
  value: string; // ISO date for API; Persian for the user
  onChange: (iso: string) => void;
  disabled?: boolean;
  minISO?: string;
  maxISO?: string;
  isDateAllowed?: (iso: string) => boolean;
};

export default function JalaliDateField({ id, label, value, onChange, disabled, minISO, maxISO, isDateAllowed }: Props) {
  const [text, setText] = useState(() => value ? jalaliText(value) : "");
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState(() => isoToJalali(value || new Date().toISOString().slice(0, 10)) ?? { year: 1405, month: 1, day: 1 });
  const root = useRef<HTMLDivElement>(null);
  const lastEmittedValue = useRef(value);
  useEffect(() => {
    // Do not overwrite half-typed Jalali dates with the parent's empty/invalid value.
    if (value !== lastEmittedValue.current) {
      setText(value ? jalaliText(value) : "");
      const next = isoToJalali(value);
      if (next) setShown(next);
      lastEmittedValue.current = value;
    }
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function commit(iso: string) {
    setText(jalaliText(iso));
    lastEmittedValue.current = iso;
    onChange(iso);
    setTouched(true);
    const parts = isoToJalali(iso);
    if (parts) setShown(parts);
    setOpen(false);
  }
  function allow(iso: string | null) {
    return Boolean(iso && (!minISO || iso >= minISO) && (!maxISO || iso <= maxISO) && (!isDateAllowed || isDateAllowed(iso)));
  }
  function textChanged(raw: string) {
    setText(raw);
    const iso = parseJalaliText(raw);
    const next = iso && allow(iso) ? iso : "";
    lastEmittedValue.current = next;
    onChange(next);
    if (iso) { const parts = isoToJalali(iso); if (parts) setShown(parts); }
  }
  function stepMonth(amount: number) {
    const idx = shown.year * 12 + shown.month - 1 + amount;
    setShown({ year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 + 1, day: 1 });
  }
  const first = jalaliToISO(shown.year, shown.month, 1);
  const offset = first ? (new Date(`${first}T12:00:00Z`).getUTCDay() + 1) % 7 : 0;
  const days = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, iso: jalaliToISO(shown.year, shown.month, i + 1) })).filter(item => item.iso !== null);
  const invalid = touched && (!value || !allow(value));

  return <div className="jalali-date-field" ref={root}>
    <label htmlFor={id}>{label}</label>
    <div className="jalali-date-control">
      <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="۱۴۰۵/۰۷/۲۲" dir="ltr"
        aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
        value={text} disabled={disabled} onBlur={() => setTouched(true)}
        onChange={event => textChanged(event.target.value)} />
      <button type="button" className="jalali-calendar-toggle" aria-label="انتخاب تاریخ از تقویم شمسی"
        aria-expanded={open} aria-controls={`${id}-calendar`} disabled={disabled} onClick={() => setOpen(current => !current)}>▦</button>
    </div>
    {invalid ? <small id={`${id}-error`} className="line-error">تاریخ شمسی معتبر و مجاز وارد کنید.</small> : <small id={`${id}-hint`} className="muted">ورود دستی: سال/ماه/روز</small>}
    {open && <div id={`${id}-calendar`} className="jalali-calendar" role="group" aria-label="تقویم شمسی">
      <div className="jalali-calendar-header"><button type="button" aria-label="ماه قبل" onClick={() => stepMonth(-1)}>›</button><strong>{jalaliMonths[shown.month - 1]} {persianInteger(shown.year)}</strong><button type="button" aria-label="ماه بعد" onClick={() => stepMonth(1)}>‹</button></div>
      <div className="jalali-calendar-grid">
        {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((day, i) => <span key={i} className="jalali-weekday">{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
        {days.map(({ day, iso }) => <button type="button" key={day} disabled={!allow(iso)}
          className={iso === value ? "is-selected" : ""} aria-label={`${persianInteger(day)} ${jalaliMonths[shown.month - 1]} ${persianInteger(shown.year)}`}
          onClick={() => { if (iso) commit(iso); }}>{persianInteger(day)}</button>)}
      </div>
    </div>}
  </div>;
}
