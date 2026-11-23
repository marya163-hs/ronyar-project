/** Presentation-only Persian calendar helpers. API and database dates remain ISO Gregorian. */
import { normalizeDigits } from "./saleAmounts";

export type JalaliParts = { year: number; month: number; day: number };
const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric",
});
const pad = (n: number) => String(n).padStart(2, "0");
const faDigits = (value: string) => value.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

export const jalaliMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

function validISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isoToJalali(iso: string): JalaliParts | null {
  if (!validISO(iso)) return null;
  const parts = formatter.formatToParts(new Date(`${iso}T12:00:00Z`));
  const part = (type: "year" | "month" | "day") => Number(normalizeDigits(parts.find(item => item.type === type)?.value ?? ""));
  const year = part("year"), month = part("month"), day = part("day");
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) ? { year, month, day } : null;
}

/** Locate Nowruz via Intl, then walk forward. Avoids timezone/DST changes on document dates. */
export function jalaliToISO(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger) || year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let newYear: number | null = null;
  for (let offset = 0; offset < 12; offset++) {
    const t = Date.UTC(year + 621, 2, 16 + offset);
    const iso = new Date(t).toISOString().slice(0, 10);
    const parts = isoToJalali(iso);
    if (parts?.year === year && parts.month === 1 && parts.day === 1) { newYear = t; break; }
  }
  if (newYear === null) return null;
  const offset = (month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day - 1;
  const result = new Date(newYear + offset * 86400000).toISOString().slice(0, 10);
  const actual = isoToJalali(result);
  return actual?.year === year && actual.month === month && actual.day === day ? result : null;
}

export function jalaliText(iso: string): string {
  const parts = isoToJalali(iso);
  return parts ? faDigits(`${parts.year}/${pad(parts.month)}/${pad(parts.day)}`) : "—";
}

export function parseJalaliText(value: string): string | null {
  const normalized = normalizeDigits(value).replace(/[-.]/g, "/").trim();
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  return match ? jalaliToISO(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

export function persianInteger(value: number): string { return faDigits(String(value)); }
