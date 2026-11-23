import PartyBalances from "./PartyBalances";
import { useEffect, useMemo, useState } from "react";
import PartyForm from "./PartyForm";
import { ApiError, errorText, formatDecimal, listParties } from "./api";
import type { Business, Party, PartyPage, PartyRole, ProductStatus } from "./api";
import { BaseHeader, BaseStats, BasePanel, BaseEmpty, BaseBadge, BasePagination, filterText } from "./BaseUi";

type Props = { business: Business; onSessionExpired: () => void };
export default function Parties({ business, onSessionExpired }: Props) {
  const [status, setStatus] = useState<ProductStatus>("ACTIVE"), [role, setRole] = useState<PartyRole>("ALL"), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PartyPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [form, setForm] = useState<{ party: Party | null } | null>(null);
  useEffect(() => { const controller = new AbortController(); setResult(null); setError(""); setLoading(true); listParties(business.id, status, role, page, controller.signal).then(value => { if (!controller.signal.aborted) { if (value.totalPages > 0 && page > value.totalPages) setPage(value.totalPages); else setResult(value); } }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [business.id, status, role, page, retry]);
  const shown = useMemo(() => (result?.items ?? []).filter(item => filterText(`${item.name} ${item.externalCode ?? ""} ${item.isCashCustomer ? "نقدی" : ""}`).includes(filterText(query))), [result, query]);
  const rows = result?.items ?? [];
  return <section className="base-page base-has-mobile-cards">
    <BaseHeader title="اشخاص و طرف‌حساب‌ها" description="مدیریت مشتریان، تأمین‌کنندگان و اطلاعات مورد استفاده در فاکتورها" action={() => setForm({ party: null })} actionLabel="طرف‌حساب جدید" secondary={<button type="button" className="secondary base-refresh" disabled={loading} onClick={() => setRetry(v => v + 1)}>↻ به‌روزرسانی</button>} />
    <BaseStats items={[{ label: "کل طرف‌حساب‌های فیلترشده", value: result?.total ?? "—", hint: "در همه صفحات این فیلتر" }, { label: "مشتریان همین صفحه", value: result ? rows.filter(r => r.customerEnabled).length : "—", hint: "ممکن است تأمین‌کننده هم باشند" }, { label: "تأمین‌کنندگان همین صفحه", value: result ? rows.filter(r => r.supplierEnabled).length : "—", hint: "فقط رکوردهای دریافت‌شده" }]} />
    <BasePanel title="فهرست طرف‌حساب‌ها" note="جستجوی نام و کد روی همین صفحه انجام می‌شود؛ نقش و وضعیت روی کل فهرست اعمال می‌شوند.">
      <div className="base-filters"><label className="base-search">جستجو در این صفحه<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="نام، کد یا مشتری نقدی…" /></label>
        <label>نوع طرف‌حساب<select value={role} onChange={e => { setRole(e.target.value as PartyRole); setPage(1); setQuery(""); }}><option value="ALL">همه نقش‌ها</option><option value="CUSTOMER">مشتریان</option><option value="SUPPLIER">تأمین‌کنندگان</option></select></label>
        <label>وضعیت<select value={status} onChange={e => { setStatus(e.target.value as ProductStatus); setPage(1); setQuery(""); }}><option value="ACTIVE">فعال</option><option value="INACTIVE">غیرفعال</option><option value="ALL">همه</option></select></label>
      </div>
      <div className="base-meta"><span>{result ? `${formatDecimal(String(shown.length))} مورد نمایشی در این صفحه` : "در حال دریافت اطلاعات"}</span><span>برای مشاهده مانده‌ها به بخش پایین صفحه بروید</span></div>
      {loading && <div className="base-loading" role="status">در حال بارگذاری طرف‌حساب‌ها…</div>}{error && <div className="notice error" role="alert">{error}<button type="button" className="text-button" onClick={() => setRetry(v => v + 1)}>تلاش دوباره</button></div>}
      {result && (shown.length ? <><div className="base-table-scroll"><table className="base-table"><thead><tr><th>نام طرف‌حساب</th><th>نوع همکاری</th><th>کد خارجی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{shown.map(item => <tr key={item.id}><td><div className="base-main-cell"><span className="base-row-avatar" aria-hidden="true">{item.name.trim().slice(0, 1)}</span><span><strong>{item.name}</strong>{item.isCashCustomer && <small>مشتری نقدی پیش‌فرض</small>}</span></div></td><td><div className="base-tags">{item.customerEnabled && <span>مشتری</span>}{item.supplierEnabled && <span>تأمین‌کننده</span>}</div></td><td><bdi>{item.externalCode ?? "—"}</bdi></td><td><BaseBadge active={item.isActive} /></td><td><button type="button" className="secondary base-row-edit" disabled={form !== null} onClick={() => setForm({ party: item })}>ویرایش / غیرفعال‌سازی</button></td></tr>)}</tbody></table></div>
        <div className="base-mobile-list">{shown.map(item => <article className="base-mobile-card" key={item.id}><div className="base-mobile-card-top"><strong>{item.name}</strong><BaseBadge active={item.isActive}/></div><div className="base-tags">{item.customerEnabled && <span>مشتری</span>}{item.supplierEnabled && <span>تأمین‌کننده</span>}{item.isCashCustomer && <span>مشتری نقدی</span>}</div><small>کد خارجی: <bdi>{item.externalCode ?? "—"}</bdi></small><button type="button" className="secondary" disabled={form !== null} onClick={() => setForm({party:item})}>ویرایش / غیرفعال‌سازی</button></article>)}</div></> : <BaseEmpty title={rows.length ? "نتیجه‌ای برای این جستجو نیست" : "طرف‌حسابی یافت نشد"} description={rows.length ? "عبارت جستجو را تغییر دهید." : "فیلترها را تغییر دهید یا یک مشتری یا تأمین‌کننده ثبت کنید."} />)}
      {result && <BasePagination page={page} totalPages={result.totalPages} loading={loading} onChange={setPage} />}
    </BasePanel>
    {form && <PartyForm key={form.party?.id ?? "new"} business={business} party={form.party} onSessionExpired={onSessionExpired} onSaved={() => { setForm(null); setResult(null); setRetry(value => value + 1); }} onCancel={() => { setForm(null); setRetry(value => value + 1); }} />}
    <PartyBalances key={`${business.id}:${role}`} business={business} role={role} revision={retry} onSessionExpired={onSessionExpired} />
  </section>;
}
