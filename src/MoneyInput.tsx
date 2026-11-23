import type { Business } from "./api";
import { canonicalMoneyInput, storeMoneyValue } from "./storeMoney";
import { useLayoutEffect, useRef } from "react";
import { normalizeDigits } from "./saleAmounts";

type Props = {
  business?: Business;
  placeholder?: string;
  selectZeroOnFocus?: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
  maxLength?: number;
};

/** Presentation-only grouping. Financial values remain ungrouped decimal strings. */
export function cleanMoneyInput(text: string, editing = false): string {
  const normalized = normalizeDigits(text).replace(/\s/g, "");
  // Never turn signs, scientific notation, or malformed pasted grouping into another amount.
  if (!editing && /[٬،,]/.test(normalized)) {
    const comma = /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d*)?$/;
    const persian = /^[1-9]\d{0,2}(?:٬\d{3})+(?:\.\d*)?$/;
    if (!comma.test(normalized) && !persian.test(normalized)) return normalized;
  }
  return normalized.replace(/[٬،,]/g, "");
}
export function displayMoneyInput(text: string): string {
  const raw = cleanMoneyInput(text);
  const point = raw.indexOf(".");
  const whole = point < 0 ? raw : raw.slice(0, point);
  const decimal = point < 0 ? "" : raw.slice(point);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + decimal;
}
export default function MoneyInput({ placeholder, selectZeroOnFocus, business, value, onChange, disabled, required, id, maxLength = 25, "aria-label": label }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<number | null>(null);
  const draft = useRef<{canonical:string;raw:string}|null>(null);
  const visible = displayMoneyInput(draft.current?.canonical === value ? draft.current.raw : storeMoneyValue(business,value));
  function change(raw:string){const canonical=canonicalMoneyInput(business,raw);draft.current={canonical,raw};onChange(canonical);}
  useLayoutEffect(() => {
    if (pending.current !== null && input.current === document.activeElement) {
      input.current?.setSelectionRange(pending.current, pending.current);
      pending.current = null;
    }
  }, [visible]);
  return <input ref={input} id={id} type="text" dir="ltr" inputMode="decimal" autoComplete="off"
    aria-invalid={Boolean(value && !/^\d*(?:\.\d*)?$/.test(cleanMoneyInput(value)))} aria-label={label} disabled={disabled} required={required} maxLength={maxLength + 8} value={visible}
    placeholder={placeholder} onFocus={event => { if (selectZeroOnFocus && /^0(?:\.0*)?$/.test(cleanMoneyInput(event.currentTarget.value))) event.currentTarget.select(); }}
    onPaste={event => {
      event.preventDefault();
      const element = event.currentTarget;
      const pasted = cleanMoneyInput(event.clipboardData.getData("text"));
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      const next = cleanMoneyInput(element.value.slice(0, start), true) + pasted + cleanMoneyInput(element.value.slice(end), true);
      pending.current = displayMoneyInput(next).length;
      change(next);
    }}
    onChange={event => {
      const element = event.currentTarget;
      const raw = cleanMoneyInput(element.value, true);
      const before = cleanMoneyInput(element.value.slice(0, element.selectionStart ?? element.value.length), true).length;
      // Move the caret to the equivalent raw-decimal position after grouping.
      const display = displayMoneyInput(raw);
      let significant = 0;
      let caret = display.length;
      if (before <= 0) caret = 0;
      else for (let index = 0; index < display.length; index++) {
        if (/[0-9.]/.test(display[index])) significant++;
        if (significant === before) { caret = index + 1; break; }
      }
      pending.current = caret;
      change(raw);
    }} />;
}
