import { useEffect, useRef, useState } from "react";
import { ApiError, errorText, listLedgerChart } from "./api";
import type { Account, Business } from "./api";
import { BasePanel, BaseEmpty, filterText } from "./BaseUi";
import DetailedLedger from "./DetailedLedger";
export default function AccountingBooks({ business, onSessionExpired }: { business: Business; onSessionExpired: () => void }) {
  const expired = useRef(onSessionExpired); expired.current = onSessionExpired;
  const [snapshot, setSnapshot] = useState<{ key: string; accounts?: Account[]; error?: string } | null>(null), [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<"general" | "subsidiary">("general"), [search, setSearch] = useState(""), [selected, setSelected] = useState<string | null>(null);
  const key = JSON.stringify([business.id, retry]), current = snapshot?.key === key ? snapshot : null;
  useEffect(() => { const c = new AbortController(); listLedgerChart(business.id, c.signal).then(accounts => { if (!c.signal.aborted) setSnapshot({ key, accounts }); }).catch(cause => { if (!c.signal.aborted) { setSnapshot({ key, error: errorText(cause) }); if (cause instanceof ApiError && cause.status === 401) expired.current(); } }); return () => c.abort(); }, [key]);
  if (selected) return <DetailedLedger key={`${business.id}:${selected}`} business={business} kind="account" subjectId={selected} descendants onClose={() => setSelected(null)} onSessionExpired={onSessionExpired} />;
  const accounts = current?.accounts ?? [];
  const roots = accounts.filter(a => !a.parentId), subs = accounts.filter(a => a.parentId);
  const rows = (mode === "general" ? roots : subs).filter(a => filterText(`${a.code} ${a.name}`).includes(filterText(search)));
  function ancestry(a: Account) { const names: string[] = []; const seen = new Set([a.id]); let id = a.parentId; while (id && !seen.has(id)) { seen.add(id); const p = accounts.find(x => x.id === id); if (!p) break; names.unshift(p.name); id = p.parentId; } return names.join(" / "); }
  return <><div className="reports-filter"><button type="button" className={mode === "general" ? "primary" : "secondary"} aria-pressed={mode === "general"} onClick={() => setMode("general")}>دفتر کل</button><button type="button" className={mode === "subsidiary" ? "primary" : "secondary"} aria-pressed={mode === "subsidiary"} onClick={() => setMode("subsidiary")}>دفتر معین</button><label>جستجوی حساب<input value={search} onChange={e => setSearch(e.target.value)} placeholder="کد یا نام حساب" /></label></div>
    <p className="reports-context">دفتر کل حساب‌های ریشه کدینگ و دفتر معین زیرحساب‌های واقعی آن‌ها را نمایش می‌دهد. گردش هر حساب شامل تمام زیرحساب‌هاست. حساب‌های بدون زیرحساب، دفتر معین جداگانه ندارند.</p>
    {!current && <p role="status">در حال دریافت کدینگ حساب‌ها…</p>}{current?.error && <div className="notice error" role="alert">{current.error}<button type="button" className="text-button" onClick={() => setRetry(n => n+1)}>تلاش دوباره</button></div>}
    {current?.accounts && <BasePanel title={mode === "general" ? "حساب‌های کل" : "حساب‌های معین"}>{rows.length ? <div className="reports-cards">{rows.map(a => <button className="reports-card" type="button" key={a.id} onClick={() => setSelected(a.id)}><strong>{a.name}</strong><span>{ancestry(a) || "حساب ریشه"}{a.isActive ? "" : " · غیرفعال"}</span><small>مانده ابتدا، گردش و مانده پایان ←</small></button>)}</div> : <BaseEmpty title={mode === "subsidiary" && !subs.length ? "زیرحسابی در کدینگ این فروشگاه تعریف نشده است" : "حسابی پیدا نشد"} description={mode === "subsidiary" && !subs.length ? "حساب‌های مستقل موجود در دفتر کل قابل مشاهده‌اند. ایجاد زیرحساب از بخش اطلاعات پایه انجام می‌شود." : "عبارت جستجو را بررسی کنید."} />}</BasePanel>}
  </>;
}
