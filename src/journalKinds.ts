import type { JournalKind } from "./api";

// The four values are defined in Prisma and PostgreSQL. No end-of-year posting is enabled yet.
export function journalKindLabel(kind: JournalKind): string {
  switch (kind) {
    case "NORMAL": return "سند عادی";
    case "YEAR_END_RESULT": return "سند تعیین نتیجه عملکرد";
    case "YEAR_END_CLOSE": return "سند اختتامیه";
    case "YEAR_START_OPENING": return "سند افتتاحیه";
  }
}
