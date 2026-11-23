import type { ReactNode } from "react";
import { formatDecimal } from "./api";

export function BaseHeader({ title, description, action, actionLabel, secondary }: { title: string; description: string; action?: () => void; actionLabel?: string; secondary?: ReactNode }) {
  return <header className="base-head">
    <div className="base-head-title"><span className="base-eyebrow">مدیریت اطلاعات فروشگاه</span><h2>{title}</h2><p>{description}</p></div>
    <div className="base-head-actions">{secondary}{action && <button type="button" className="primary base-create" onClick={action}><span aria-hidden="true">＋</span>{actionLabel ?? "افزودن جدید"}</button>}</div>
  </header>;
}
export function BaseStats({ items }: { items: { label: string; value: number | string; hint?: string }[] }) {
  return <div className="base-stats">{items.map((item, i) => <article className={`base-stat ${i === 0 ? "base-stat-featured" : ""}`} key={item.label}>
    <span>{item.label}</span><strong><bdi>{typeof item.value === "number" ? formatDecimal(String(item.value)) : item.value}</bdi></strong>{item.hint && <small>{item.hint}</small>}
  </article>)}</div>;
}
export function BasePanel({ title, note, children, meta }: { title?: string; note?: string; children: ReactNode; meta?: ReactNode }) {
  return <section className="base-panel">{(title || note) && <header className="base-panel-heading"><div>{title && <h3>{title}</h3>}{note && <p>{note}</p>}</div>{meta}</header>}{children}</section>;
}
export function BaseEmpty({ title, description }: { title: string; description: string }) {
  return <div className="base-empty"><span aria-hidden="true">◇</span><strong>{title}</strong><p>{description}</p></div>;
}
export function BaseBadge({ active, label }: { active: boolean; label?: string }) {
  return <span className={`base-badge ${active ? "on" : "off"}`}><i aria-hidden="true" />{label ?? (active ? "فعال" : "غیرفعال")}</span>;
}
export function BasePagination({ page, totalPages, loading, onChange, caption }: { page: number; totalPages: number; loading: boolean; onChange: (page: number) => void; caption?: string }) {
  return <div className="base-pagination"><button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>→ قبلی</button><span>{totalPages ? `صفحه ${formatDecimal(String(page))} از ${formatDecimal(String(totalPages))}` : "بدون نتیجه"}{caption && <small>{caption}</small>}</span><button type="button" className="secondary" disabled={page >= totalPages || loading} onClick={() => onChange(page + 1)}>بعدی ←</button></div>;
}
export function filterText(input: string) { return input.toLocaleLowerCase("fa-IR").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "").trim(); }
