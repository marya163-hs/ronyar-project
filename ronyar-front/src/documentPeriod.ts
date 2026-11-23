import type { FiscalPeriod } from "./api";
export function periodForDate(periods: FiscalPeriod[], date: string): FiscalPeriod | null {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) return null; const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const matches = periods.filter(item => item.status === "OPEN" && date >= item.startDate && date <= item.endDate);
  return matches.length === 1 ? matches[0] : null;
}
