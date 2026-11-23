import PaymentsReport from "./PaymentsReport";
import TradeReports from "./TradeReports";
import { useEffect, useState } from "react";
import type { Business } from "./api";
import AccountingBooks from "./AccountingBooks";
import AccountingReports from "./AccountingReports";
import OperationalReport from "./OperationalReport";
import { BaseEmpty, BaseHeader } from "./BaseUi";
import { useStoreCan } from "./StorePermissions";
import { reportAllowed, reportCatalog } from "./reportCatalog";
import type { ReportId } from "./reportCatalog";
import "./ReportsCenter.css";
export default function ReportsCenter({ business, onSessionExpired,initialReport,onConsumed }: { business: Business; onSessionExpired: () => void;initialReport?:{id:ReportId;key:string}|null;onConsumed?:()=>void }) {
  const can = useStoreCan();
  const [selected, setSelected] = useState<ReportId | null>(initialReport?.id??null);
  useEffect(()=>{if(initialReport){setSelected(initialReport.id);onConsumed?.();}},[initialReport?.key]);
  const active = selected && reportAllowed(selected, can) ? reportCatalog.find(item => item.id === selected) : null;
  const visible = reportCatalog.filter(item => reportAllowed(item.id, can));
  if (active) return <section className="reports-center"><div className="reports-back"><button type="button" className="secondary" onClick={() => setSelected(null)}>→ همه گزارش‌ها</button><span>{business.name} / {active.group} / {active.title}</span></div>
    {active.id === "paymentsReport" ? <PaymentsReport key={business.id} business={business} onSessionExpired={onSessionExpired} /> : active.id === "books" ? <AccountingBooks key={business.id} business={business} onSessionExpired={onSessionExpired} /> : active.id === "financial" ? <AccountingReports business={business} onSessionExpired={onSessionExpired} /> : <><BaseHeader title={active.title} description={active.description} />{active.id === "sales" || active.id === "purchases" ? <TradeReports key={`${business.id}:${active.id}`} business={business} kind={active.id} onSessionExpired={onSessionExpired} /> : <OperationalReport key={`${business.id}:${active.id}`} business={business} kind={active.id} onSessionExpired={onSessionExpired} />}</>}
  </section>;
  return <section className="reports-center"><BaseHeader title="مرکز گزارش‌ها" description="گزارش موردنیاز را انتخاب کنید؛ مبالغ از ثبت‌های قطعی و گزارش‌های فروشگاه دریافت می‌شوند." />
    {visible.length ? <div className="reports-cards">{["گزارش اشخاص", "دفاتر حسابداری", "صندوق و بانک", "فروش و خرید", "گزارش موجودی", "گزارش‌های مالی"].filter(group => visible.some(item => item.group === group)).map(group => <section className="base-panel" key={group}><h3>{group}</h3><div className="reports-category-links">{visible.filter(item => item.group === group).map(item => <button type="button" className="reports-card" key={item.id} onClick={() => setSelected(item.id)}><strong>{item.title}</strong><span>{item.description}</span><small>مشاهده گزارش ←</small></button>)}</div></section>)}</div> : <BaseEmpty title="گزارش مجازی برای این نقش وجود ندارد" description="برای بررسی دسترسی با مدیر فروشگاه تماس بگیرید." />}
  </section>;
}
