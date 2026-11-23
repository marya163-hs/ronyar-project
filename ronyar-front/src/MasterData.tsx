import StoreMoneySettings from "./StoreMoneySettings";
import { GuideHint } from "./Guidance";
import { useStoreCan } from "./StorePermissions";
import { useState } from "react";
import type { Business } from "./api";
import Parties from "./Parties";
import Products from "./Products";
import AccountDefinitions from "./AccountDefinitions";
import PostingAccountDefinitions from "./PostingAccountDefinitions";
import CatalogDefinitions from "./CatalogDefinitions";
import WarehouseDefinitions from "./WarehouseDefinitions";
import FiscalPeriodDefinitions from "./FiscalPeriodDefinitions";

const groups = [
  { title: "مشتریان و کالاها", description: "اطلاعاتی که هنگام ثبت خرید و فروش استفاده می‌کنید", items: [
    { id: "parties", name: "اشخاص و طرف‌حساب‌ها", hint: "مشتریان و تأمین‌کنندگان" },
    { id: "products", name: "کالا و خدمات", hint: "مشخصات و قیمت کالاها" },
    { id: "units", name: "واحدهای کالا", hint: "عدد، کیلوگرم و واحدهای اندازه‌گیری" },
    { id: "categories", name: "دسته‌بندی کالاها", hint: "مرتب‌سازی و گروه‌بندی کالاها" },
  ] },
  { title: "حسابداری و مالی", description: "تعریف حساب‌ها و کنترل ثبت‌های مالی", items: [
    { id: "cash", name: "تعریف صندوق و بانک", hint: "ایجاد و ویرایش حساب‌های نقدی" },
    { id: "accounts", name: "حساب‌های حسابداری", hint: "ساختار و ماهیت حساب‌ها" },
    { id: "posting", name: "حساب‌های ثبت خودکار", hint: "تنظیم حساب‌های دریافتنی و پرداختنی" },
    { id: "periods", name: "دوره‌های مالی", hint: "مدیریت بازه‌ها و بستن دوره" },
  ] },
  { title: "تنظیمات انبار", description: "تنظیم زیرساخت نگهداری و گردش کالا", items: [
    { id: "warehouses", name: "انبارها", hint: "ایجاد انبار و تعیین انبار پیش‌فرض" },
  ] },
] as const;
type Section = typeof groups[number]["items"][number]["id"];
const sections = groups.flatMap(group => [...group.items]);

export default function MasterData({ business, onSessionExpired }: { business: Business; onSessionExpired: () => void }) {
  const [moneyOpen,setMoneyOpen]=useState(false);
  const can = useStoreCan();
  const sectionGrant: Record<Section, string> = { parties: "parties.manage", products: "catalog.manage", units: "catalog.manage", categories: "catalog.manage", cash: "accounts.manage", accounts: "accounts.manage", posting: "accounts.manage", periods: "periods.manage", warehouses: "inventory.manage" };
  const [section, setSection] = useState<Section | null>(null);
  const props = { business, onSessionExpired };
  const current = sections.find(item => item.id === section);

  return <section className="master-data">
    <button type="button" className="secondary" onClick={()=>setMoneyOpen(true)}>واحد مبالغ: ریال / تومان</button>
    {moneyOpen&&<StoreMoneySettings key={business.id} business={business} onClose={()=>setMoneyOpen(false)} onSessionExpired={onSessionExpired}/>}
    {section && <GuideHint topic={`master-${section}`} />}
    {section === null ? <>
      <div className="master-data-intro"><span className="base-eyebrow">مرکز مدیریت اطلاعات</span><h2>اطلاعات پایه فروشگاه</h2><p>مشتریان، کالاها، حساب‌ها و تنظیمات فروشگاه را از همین‌جا مدیریت کنید. برای شروع، یکی از گزینه‌های زیر را انتخاب کنید.</p><div className="master-hero-accent" aria-hidden="true">✦</div></div>
      {groups.filter(group => group.items.some(item => can(sectionGrant[item.id]))).map(group => <section key={group.title} className="master-data-group" aria-label={group.title}>
        <div className="master-group-heading"><h2>{group.title}</h2><p>{group.description}</p></div>
        <div className="master-data-grid">{group.items.filter(item => can(sectionGrant[item.id])).map((item,index) =>
          <button key={item.id} type="button" className="master-data-card" onClick={() => setSection(item.id)}>
            <span className="master-card-symbol" aria-hidden="true">{["◈", "▦", "⊞", "▤"][index]}</span><strong>{item.name}</strong><span>{item.hint}</span><span className="master-card-arrow" aria-hidden="true">←</span>
          </button>
        )}</div>
      </section>)}
    </> : <>
      <div className="master-detail-navigation">
        <div className="master-breadcrumb"><span>اطلاعات پایه</span><span aria-hidden="true">/</span><strong>{current?.name}</strong></div>
        <button type="button" className="secondary" onClick={() => setSection(null)}>→ همه اطلاعات پایه</button>
      </div>
      <div className="master-data-content" key={`${business.id}:${section}`}>
        {!can(sectionGrant[section]) && <div role="alert" className="notice error">اجازه مدیریت این بخش را ندارید.</div>}
        {can(sectionGrant[section]) && <>
        {section === "parties" && <Parties {...props} />}
        {section === "products" && <Products {...props} />}
        {section === "cash" && <AccountDefinitions {...props} cashOnly />}
        {section === "accounts" && <AccountDefinitions {...props} />}
        {section === "posting" && <PostingAccountDefinitions {...props} />}
        {section === "units" && <CatalogDefinitions {...props} />}
        {section === "categories" && <CatalogDefinitions {...props} categories />}
        {section === "warehouses" && <WarehouseDefinitions {...props} />}
        {section === "periods" && <FiscalPeriodDefinitions {...props} />}
        </>}
      </div>
    </>}
  </section>;
}

// Rev9.0d-installed
