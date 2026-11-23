import AccountNotifications, {getReadNotices, saveReadNotices, subscriptionNotices, subscriptionExpiredEvent} from "./AccountNotifications";
import type {AccountNotice} from "./AccountNotifications";
import StoreChallenges from "./StoreChallenges";
import type {ProfileSection} from "./UserProfile";
import useBackNavigation from "./useBackNavigation";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import IssueReporter from "./IssueReporter";
import Guidance from "./Guidance";
import StoreSubscriptionInfo from './StoreSubscriptionInfo';
import UserProfile from "./UserProfile";
import PublicEntry from "./PublicEntry";
import DashboardSnapshotChart from "./DashboardSnapshotChart";
import Brand from "./Brand";
import StoreAssistant from "./StoreAssistant";
import { assistantReport } from "./assistantRouting";
import type { AssistantRequest } from "./assistantRouting";
import { reportAllowed } from "./reportCatalog";
import type { ReportId } from "./reportCatalog";
import { jalaliText } from "./jalaliDate";
import JalaliDateField from "./JalaliDateField";
import { StorePermissionsProvider, canOpenStoreSection, useEffectiveStorePermissions } from "./StorePermissions";
import YearEndReadiness from "./YearEndReadiness";
import StoreOnboarding from "./StoreOnboarding";
import MasterData from "./MasterData";
import OpeningBalances from "./OpeningBalances";
import CashBank from "./CashBank";
import PaymentsCenter from "./PaymentsCenter";
import JournalRegister from "./JournalRegister";
import ReportsCenter from "./ReportsCenter";
import PurchaseReturns from "./PurchaseReturns";
import SaleReturns from "./SaleReturns";
import Inventory from "./Inventory";
import Purchases from "./Purchases";
import Sales from "./Sales";
import Parties from "./Parties";
import Products from "./Products";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, errorText, formatDecimal, getDashboard, listBusinesses, logout, restoreSession, tehranToday } from "./api";
import type { Business, Dashboard, User } from "./api";

type Section = "dashboard" | "products" | "parties" | "sales" | "purchases" | "inventory" | "saleReturns" | "purchaseReturns" | "cashBank" | "payments" | "journals" | "reports" | "yearEnd" | "openings" | "masterData";
const navigation: { label: string; items: { id: Section; label: string }[] }[] = [
  { label: "مدیریت فروشگاه", items: [
    { id: "dashboard", label: "داشبورد" },
    { id: "sales", label: "فروش" },
    { id: "purchases", label: "خرید" },
    { id: "saleReturns", label: "برگشت از فروش" },
    { id: "purchaseReturns", label: "برگشت از خرید" },
  ] },
  { label: "مالی و موجودی", items: [
    { id: "payments", label: "دریافت و پرداخت" },
    { id: "inventory", label: "موجودی انبار" },
    { id: "cashBank", label: "صندوق و بانک" },
    { id: "journals", label: "اسناد حسابداری" },
    { id: "reports", label: "مرکز گزارش‌ها" },
    { id: "yearEnd", label: "آمادگی پایان سال" },
    { id: "openings", label: "مانده‌های اولیه" },
  ] },
  { label: "تنظیمات", items: [
    { id: "masterData", label: "اطلاعات پایه" },
  ] },
];
const sectionNames: Record<Section, string> = {
  dashboard: "داشبورد", products: "کالا و خدمات", parties: "اشخاص", sales: "فروش",
  purchases: "خرید", inventory: "موجودی انبار", saleReturns: "برگشت از فروش",
  purchaseReturns: "برگشت از خرید", cashBank: "صندوق و بانک", payments: "دریافت و پرداخت", openings: "مانده‌های اولیه",
  masterData: "اطلاعات پایه", journals: "اسناد حسابداری", reports: "مرکز گزارش‌ها", yearEnd: "آمادگی پایان سال",
};

function NavIcon({ name }: { name: Section }) {
  // One consistent icon language; no additional dependency or font is required.
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Partial<Record<Section, ReactNode>> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    sales: <><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h4"/></>,
    purchases: <><path d="M4 7h16l-2 13H6L4 7ZM9 7V5a3 3 0 0 1 6 0v2"/></>,
    saleReturns: <><path d="M9 7 5 11l4 4M5 11h9a5 5 0 0 1 0 10"/><path d="M14 4h6v6"/></>,
    purchaseReturns: <><path d="m15 7 4 4-4 4M19 11H9a5 5 0 0 0 0 10"/><path d="M4 4h6v6"/></>,
    inventory: <><path d="m3 8 9-5 9 5v9l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v9"/></>,
    payments: <><path d="M4 7h16M4 17h16M7 4 4 7l3 3M17 14l3 3-3 3"/></>,
    cashBank: <><path d="M3 8 12 3l9 5M4 10h16M6 10v9M12 10v9M18 10v9M3 21h18"/></>,
    reports: <><path d="M4 20V11h4v9M10 20V6h4v14M16 20v-9h4v9"/><path d="M3 21h18"/></>,
    journals: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    yearEnd: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4"/><path d="m14 18 2 2 4-4"/></>,
    openings: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/><path d="M16 16h2m-1-1v2"/></>,
    masterData: <><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="9" cy="19" r="2" fill="white"/></>,
  };
  return <svg className="nav-icon" width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export default function App() {
  const [assistantRequest,setAssistantRequest]=useState<(AssistantRequest&{businessId:string;kind:"sale"|"purchase"})|null>(null);
  const [assistantReportRequest,setAssistantReportRequest]=useState<{id:ReportId;key:string}|null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [selectedMetric,setSelectedMetric]=useState<number|null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paymentStatus] = useState(() => new URLSearchParams(window.location.search).get("subscriptionPayment"));
  useEffect(() => {
    if (!paymentStatus) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("subscriptionPayment");
    window.history.replaceState(window.history.state, "", url);
  }, [paymentStatus]);
  const paymentNotice = paymentStatus === "confirmed" ? "پرداخت تأیید و اشتراک فروشگاه تمدید شد."
    : paymentStatus === "pending" ? "تأیید پرداخت هنوز نهایی نشده است. وضعیت خرید اشتراک را بررسی کنید."
    : paymentStatus === "unverified" ? "پرداخت تأیید نشد. وضعیت درخواست خرید را در پروفایل بررسی کنید." : "";
  const [profileOpen,setProfileOpen] = useState(false);
  const [profileSection,setProfileSection] = useState<ProfileSection>("account");
  const [expirySignal,setExpirySignal] = useState<string|null>(null);
  const [now,setNow] = useState(Date.now);
  const [readState,setReadState] = useState<{userId:string;ids:string[]}|null>(null);
  const autoShown = useRef(new Set<string>());
  function openProfile(next:ProfileSection){
    setMobileMenuOpen(false);setProfileSection(next);setProfileOpen(true);
  }
  const [user, setUser] = useState<User | null>(null), [restoring, setRestoring] = useState(true);
  const onSessionExpired = useCallback(() => setUser(null), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]), [businessId, setBusinessId] = useState(""), [businessLoading, setBusinessLoading] = useState(false);
  const [date, setDate] = useState(tehranToday), [dashboard, setDashboard] = useState<Dashboard | null>(null), [loading, setLoading] = useState(false), [reportError, setReportError] = useState(""), [retry, setRetry] = useState(0);
  const grants = useEffectiveStorePermissions(businessId, user?.id ?? null);
  const can = (code: string) => grants.codes.has(code);
  const canSection = (id: Section) => grants.ready && canOpenStoreSection(id, can);
  useEffect(() => {
    let active = true;
    restoreSession().then(value => { if (active) setUser(value); })
      .catch(cause => { if (active && (!(cause instanceof ApiError) || cause.status !== 401)) setError(errorText(cause)); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!user) { setBusinesses([]); setBusinessId(""); setDashboard(null); return; }
    const controller = new AbortController(); setBusinessLoading(true); setError("");
    listBusinesses(controller.signal).then(items => {
      if (!controller.signal.aborted) {
        setBusinesses(items);
        setBusinessId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? "");
      }
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) setUser(null);
      }
    }).finally(() => { if (!controller.signal.aborted) setBusinessLoading(false); });
    return () => controller.abort();
  }, [user, retry]);
  useEffect(() => {
    setDashboard(null); setReportError("");
    if (!user || !businessId || !date || section !== "dashboard" || !grants.ready || !can("dashboard.read")) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    getDashboard(businessId, date, controller.signal).then(value => {
      if (!controller.signal.aborted) setDashboard(value);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setReportError(errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) setUser(null);
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user, businessId, date, retry, section, grants.ready, grants.codes]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);
  function navigate(next: Section) { if (!canSection(next)) return; setSection(next); setMobileMenuOpen(false); }
  useEffect(()=>{setAssistantRequest(null);setAssistantReportRequest(null);},[businessId,user?.id]);
  useEffect(()=>{
    setProfileOpen(false);autoShown.current.clear();setExpirySignal(null);
    setReadState(user ? {userId:user.id,ids:getReadNotices(user.id)} : null);
  },[user?.id]);
  useEffect(()=>{
    if(!user)return;
    const update=()=>setNow(Date.now());
    const timer=window.setInterval(update,30000);
    window.addEventListener("focus",update);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",update);};
  },[user?.id]);
  useEffect(()=>{
    if(!user||!businessId)return;
    const handle=(event:Event)=>{
      if((event as CustomEvent<string>).detail!==businessId)return;
      setExpirySignal(businessId);openProfile("subscription");
    };
    window.addEventListener(subscriptionExpiredEvent,handle);
    return ()=>window.removeEventListener(subscriptionExpiredEvent,handle);
  },[user?.id,businessId]);
  const [directCreate,setDirectCreate]=useState<{businessId:string;kind:"sale"|"purchase"|"RECEIPT"|"DISBURSEMENT"}|null>(null);
  useEffect(()=>setDirectCreate(null),[businessId,user?.id]);
  function openDirectCreate(kind:"sale"|"purchase"|"RECEIPT"|"DISBURSEMENT") {
    const target=kind==="sale"?"sales":kind==="purchase"?"purchases":"payments";
    const needed=kind==="sale"?["sales.read","sales.manage"]:kind==="purchase"?["purchases.read","purchases.manage"]:["payments.read","payments.manage","accounts.read","periods.read",kind==="RECEIPT"?"sales.read":"purchases.read"];
    if(!canSection(target)||!needed.every(can))return;
    setAssistantRequest(null);setDirectCreate({businessId,kind});navigate(target);
  }
  function openAssistantDocument(kind:"sale"|"purchase",text:string){
    const section=kind==="sale"?"sales":"purchases";
    if(!canSection(section)||!can(kind==="sale"?"sales.manage":"purchases.manage"))return false;
    setAssistantRequest({id:crypto.randomUUID(),businessId,kind,text});navigate(section);return true;
  }
  useEffect(()=>setSelectedMetric(null),[businessId,date]);
  function openAssistantReport(id:ReportId){if(!reportAllowed(id,can))return false;setAssistantReportRequest({id,key:crypto.randomUUID()});navigate("reports");return true;}
  function redirectAssistant(kind:"sale"|"purchase"|"report",text:string){if(kind==="report")return openAssistantReport(assistantReport(text));return openAssistantDocument(kind,text);}
  async function signOut() {
    if (busy) return; setBusy(true); setError("");
    try { await logout(); setUser(null);  }
    catch { setUser(null); setError("خروج از سرور تأیید نشد. برای پایان قطعی نشست، دوباره وارد شوید و خروج را بزنید."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!grants.ready || !businessId) return;
    if (canSection(section)) return;
    const alternative = navigation.flatMap(group => group.items).find(item => canSection(item.id));
    if (alternative) setSection(alternative.id);
  }, [businessId, section, grants.ready, grants.codes]);
  const selected = businesses.find(item => item.id === businessId);
  const notices = subscriptionNotices(businesses,now);
  const selectedExpired = notices.find(item=>item.store.id===businessId && item.expired);
  const isExpired = expirySignal===businessId || Boolean(selectedExpired);
  const read = new Set(readState?.userId===user?.id ? readState?.ids : []);
  const unread = notices.filter(item=>!read.has(item.id)).length;
  useEffect(()=>{
    if(!user||!selectedExpired||autoShown.current.has(selectedExpired.id))return;
    autoShown.current.add(selectedExpired.id);openProfile("subscription");
  },[user?.id,selectedExpired?.id]);
  function openNotice(item:AccountNotice){
    if(!user)return;
    const ids=[...read,item.id];
    setReadState({userId:user.id,ids});saveReadNotices(user.id,ids);
    setBusinessId(item.store.id);openProfile("subscription");
  }
  const money = (value: string) => formatStoreMoney(selected, value);

  const backHome:Section=canSection("dashboard")?"dashboard":navigation.flatMap(group=>group.items).find(item=>canSection(item.id))?.id??"dashboard";
  useBackNavigation({enabled:!!user&&!restoring,away:section!==backHome,menuOpen:mobileMenuOpen,closeMenu:()=>setMobileMenuOpen(false),home:()=>{setAssistantRequest(null);setAssistantReportRequest(null);setDirectCreate(null);setSection(backHome);setSelectedMetric(null);}});

  if (restoring) return <main className="center-page"><Brand /><p role="status">در حال بررسی نشست…</p></main>;
  if (!user) return <PublicEntry onLogin={value=>{setError("");setUser(value);}} sessionError={error}/>;

  return <StorePermissionsProvider value={grants.codes}><Guidance scope={`${user.id}:${selected?.id || "none"}`} context={section}><div className="app-shell">
    <header className="topbar">
      <div className="topbar-brand">
        <button className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? "بستن منوی اصلی" : "باز کردن منوی اصلی"} aria-controls="main-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(value => !value)}><span/><span/><span/></button>
        <Brand />
      </div>
      <button type="button" className="profile-notification-button" aria-label={unread ? `اعلان‌ها، ${formatDecimal(String(unread))} خوانده‌نشده` : "اعلان‌ها"} onClick={()=>openProfile("notifications")}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8m-8 12a2 2 0 0 0 4 0"/></svg>
        {unread>0&&<span aria-hidden="true">{formatDecimal(String(unread))}</span>}
      </button>
      <div className="store-context">
        {businesses.length > 1 ? <label>فروشگاه<select value={businessId} onChange={event => { setBusinessId(event.target.value); setMobileMenuOpen(false); }} disabled={businessLoading || busy}>{businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <span title={selected?.name ?? ""}>{selected?.name ?? "فروشگاهی انتخاب نشده"}</span>}
      </div>
    </header>
    <div className="workspace">
      {mobileMenuOpen && <button type="button" className="navigation-backdrop" aria-label="بستن منوی اصلی" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`main-sidebar ${mobileMenuOpen ? "is-open" : ""}`} id="main-navigation" aria-label="منوی اصلی">
        <div className="sidebar-head"><strong>بخش‌های برنامه</strong><button className="sidebar-close" aria-label="بستن منو" type="button" onClick={() => setMobileMenuOpen(false)}>×</button></div>
        {navigation.filter(group => group.items.some(item => canSection(item.id))).map(group => <div className="navigation-group" key={group.label}><p className="navigation-group-title">{group.label}</p><nav aria-label={group.label}>{group.items.filter(item => canSection(item.id)).map(item => <button type="button" key={item.id} className={`navigation-link ${section === item.id ? "is-active" : ""}`} aria-current={section === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><NavIcon name={item.id}/><span>{item.label}</span>{section === item.id && <span aria-hidden="true" className="nav-active-mark"/>}</button>)}</nav></div>)}
        <section className="sidebar-profile" aria-label="حساب کاربری"><span className="profile-avatar" aria-hidden="true">{(user.displayName || user.email || "ر").slice(0,1)}</span><button type="button" className="profile-open-button" aria-label="باز کردن پروفایل من" onClick={()=>openProfile("account")}><strong>{user.displayName || "حساب کاربری"}</strong><span dir="ltr">{user.phone || user.email}</span><small>پروفایل من</small></button><button type="button" className="text-button" onClick={signOut} disabled={busy}>خروج</button></section><div className="sidebar-footer">رانیار <span>نسخه ۲</span></div>
      </aside>
      <main className={`dashboard-page ${section === "dashboard" ? "ranyar-overview" : ""}`} id="main-content">
        {!(["sales", "purchases", "saleReturns", "purchaseReturns", "inventory", "cashBank", "payments", "journals", "reports"] as Section[]).includes(section) && <section className="page-heading">
          <div><span className="eyebrow">{selected?.name ?? "رانیار"} / {section === "dashboard" ? "نمای کلی" : "مدیریت فروشگاه"}</span><h1>{sectionNames[section]}</h1><p className="muted">{section === "dashboard" ? "وضعیت کسب‌وکار و دسترسی سریع به عملیات روزانه" : section === "masterData" ? "تعریف اشخاص، کالاها، حساب‌ها و تنظیمات مالی فروشگاه" : `مدیریت ${sectionNames[section]} در ${selected?.name ?? "فروشگاه"}`}</p></div>
          {section === "dashboard" && <div className="filters"><JalaliDateField id="dashboard-report-date" label="تاریخ گزارش (شمسی)" value={date} onChange={setDate} /><button className="secondary" type="button" onClick={() => setDate(tehranToday())}>امروز</button></div>}
        </section>}
        {isExpired && <div className="notice subscription-expiry-banner" role="status"><span>اعتبار فروشگاه{selectedExpired ? ` در ${selectedExpired.date}` : ""} پایان یافته است.</span><button type="button" className="text-button" onClick={()=>openProfile("subscription")}>مشاهده و تمدید اشتراک</button></div>}
        {!isExpired && selected?.subscription?.expiresAt && <div className="notice" role="status">{`${selected.subscription.plan==='TRIAL'?'دورهٔ آزمایشی':'اعتبار فروشگاه'} · تا ${jalaliText(selected.subscription.expiresAt.slice(0,10))}`}</div>}
        {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
        {paymentNotice && <div className="notice" role="status">{paymentNotice}</div>}
        {businessLoading && <p role="status">در حال دریافت فروشگاه‌ها…</p>}
        {selected && !grants.ready && <p role="status">در حال بررسی مجوزهای فروشگاه…</p>}
        {selected && grants.error && <div className="notice error" role="alert">{grants.error}<button type="button" className="text-button" onClick={grants.refresh}>تلاش دوباره</button></div>}
        {selected && grants.ready && !canSection(section) && !grants.error && <div className="notice" role="status">دسترسی مجاز برای این بخش وجود ندارد.</div>}
        {!businessLoading && !businesses.length && !error && <div className="empty-state"><h2>هنوز فروشگاهی در دسترس نیست</h2><p>برای نمایش داشبورد باید عضو فعال یک فروشگاه باشید.</p></div>}
        {selected && can("business.update") && <StoreOnboarding key={selected.id} business={selected} onSessionExpired={onSessionExpired} onOpenings={() => navigate("openings")} />}
        {section === "dashboard" && loading && <div className="loading-state" role="status">در حال دریافت گزارش…</div>}
        {section === "dashboard" && reportError && <div className="notice error" role="alert">{reportError}<button className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
{section === "dashboard" && <div className="assistant-first-workspace">
        {section === "dashboard" && selected && grants.ready && canSection("dashboard") && <div className="assistant-command-center"><StoreAssistant key={selected.id} business={selected} onDocument={openAssistantDocument} onCreate={openDirectCreate} onReport={openAssistantReport} onSessionExpired={onSessionExpired}/></div>}
{dashboard && <div className="dashboard-financial"><><div className="report-caption"><span>ارقام به {storeMoneyUnit(selected)}</span><span>تاریخ مبنا: <bdi>{jalaliText(dashboard.date)}</bdi></span></div><section className="metric-grid" aria-label="خلاصهٔ حساب فروشگاه"><button type="button" className={`metric ${selectedMetric === 0 ? "is-selected" : ""}`} aria-pressed={selectedMetric === 0} onClick={()=>setSelectedMetric(current=>current === 0 ? null : 0)}> <span>فروش خالص روز</span><strong><bdi>{money(dashboard.dailySales.netAmount)}</bdi></strong><p>{formatDecimal(String(dashboard.dailySales.saleCount))} فروش · {formatDecimal(String(dashboard.dailySales.returnCount))} برگشت</p></button><button type="button" className={`metric ${selectedMetric === 1 ? "is-selected" : ""}`} aria-pressed={selectedMetric === 1} onClick={()=>setSelectedMetric(current=>current === 1 ? null : 1)}> <span>سود خالص تا تاریخ گزارش</span><strong><bdi>{money(dashboard.profitToDate.netProfit)}</bdi></strong><p>{dashboard.profitToDate.result === "PROFIT" ? "سود" : dashboard.profitToDate.result === "LOSS" ? "زیان" : "بدون سود و زیان"}</p></button><button type="button" className={`metric ${selectedMetric === 2 ? "is-selected" : ""}`} aria-pressed={selectedMetric === 2} onClick={()=>setSelectedMetric(current=>current === 2 ? null : 2)}> <span>موجودی نقد و بانک</span><strong><bdi>{money(dashboard.cashBankBalance)}</bdi></strong><p>ماندهٔ تجمعی حساب‌های نقد و بانک</p></button><button type="button" className={`metric ${selectedMetric === 3 ? "is-selected" : ""}`} aria-pressed={selectedMetric === 3} onClick={()=>setSelectedMetric(current=>current === 3 ? null : 3)}> <span>ماندهٔ بدهکار طرف حساب‌ها</span><strong><bdi>{money(dashboard.partyBalances.debtorAmount)}</bdi></strong><p>{formatDecimal(String(dashboard.partyBalances.debtorCount))} طرف حساب</p></button><button type="button" className={`metric ${selectedMetric === 4 ? "is-selected" : ""}`} aria-pressed={selectedMetric === 4} onClick={()=>setSelectedMetric(current=>current === 4 ? null : 4)}> <span>ماندهٔ بستانکار طرف حساب‌ها</span><strong><bdi>{money(dashboard.partyBalances.creditorAmount)}</bdi></strong><p>{formatDecimal(String(dashboard.partyBalances.creditorCount))} طرف حساب</p></button><button type="button" className={`metric ${selectedMetric === 5 ? "is-selected" : ""}`} aria-pressed={selectedMetric === 5} onClick={()=>setSelectedMetric(current=>current === 5 ? null : 5)}> <span>ارزش دفتری موجودی کالا</span><strong><bdi>{money(dashboard.inventory.totalValue)}</bdi></strong><p>تا پایان تاریخ گزارش</p></button></section>{selectedMetric !== null && <section className="metric-context" aria-label="کارت انتخاب‌شده"><div><strong>{["فروش روز انتخابی","سود تا تاریخ گزارش","نقد و بانک","مانده بدهکار اشخاص","مانده بستانکار اشخاص","ارزش موجودی"][selectedMetric]}</strong><p>{["خالص فروش پس از کسر برگشت‌ها؛ پیش‌نویس‌ها محاسبه نمی‌شوند.","درآمد منهای هزینه تا پایان تاریخ انتخابی.","مانده تجمعی حساب‌های نقد و بانک تا تاریخ انتخابی.","جمع مانده بدهکار اشخاص از ثبت‌های قطعی؛ با مانده فاکتورهای تسویه‌نشده متفاوت است.","جمع مانده بستانکار اشخاص از ثبت‌های قطعی؛ با مانده فاکتورهای تسویه‌نشده متفاوت است.","ارزش دفتری کالاها تا پایان تاریخ انتخابی؛ گزارش موجودی، وضعیت فعلی را نمایش می‌دهد."][selectedMetric]}</p></div>{reportAllowed((["sales","financial","cash","parties","parties","inventory"] as ReportId[])[selectedMetric],can) && <button type="button" className="secondary" onClick={()=>openAssistantReport((["sales","financial","cash","parties","parties","inventory"] as ReportId[])[selectedMetric])}>باز کردن گزارش</button>}</section>}<DashboardSnapshotChart business={selected ?? undefined} dashboard={dashboard}/><details className="dashboard-more"><summary>جزئیات حساب و وضعیت کالاها</summary><section className="detail-grid"><article className="detail-card"><h2>فروش روز</h2><dl><div><dt>فروش ثبت‌شده</dt><dd><bdi>{money(dashboard.dailySales.saleAmount)}</bdi></dd></div><div><dt>برگشت فروش</dt><dd><bdi>{money(dashboard.dailySales.returnAmount)}</bdi></dd></div></dl></article><article className="detail-card"><h2>درآمد و هزینه تا تاریخ گزارش</h2><dl><div><dt>درآمد</dt><dd><bdi>{money(dashboard.profitToDate.totalRevenue)}</bdi></dd></div><div><dt>هزینه</dt><dd><bdi>{money(dashboard.profitToDate.totalExpense)}</bdi></dd></div></dl></article><article className="detail-card stock-card"><h2>وضعیت کالاهای فعال</h2><strong>{formatDecimal(String(dashboard.inventory.outOfStockProductCount))}</strong><p>کالا با موجودی صفر یا منفی</p><span className="muted">از {formatDecimal(String(dashboard.inventory.activeGoodsCount))} کالای فعال؛ مجموع موجودی همهٔ انبارها</span></article></section><p className="dashboard-note">فروش برای روز انتخابی است؛ سود و مانده‌ها تا پایان همان تاریخ محاسبه شده‌اند. وضعیت فعال کالاها مربوط به تنظیمات فعلی است.</p></details></></div>}
</div>}
{section === "products" && selected && canSection("products") && <Products key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "parties" && selected && canSection("parties") && <Parties key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "sales" && selected && canSection("sales") && <Sales initialCreate={directCreate?.businessId===selected.id&&directCreate.kind==="sale"} onCreateConsumed={()=>setDirectCreate(null)} assistantRequest={assistantRequest?.businessId===selected.id&&assistantRequest.kind==="sale"?assistantRequest:null} onAssistantConsumed={()=>setAssistantRequest(null)} onAssistantRedirect={redirectAssistant} key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "saleReturns" && selected && canSection("saleReturns") && <SaleReturns key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "purchases" && selected && canSection("purchases") && <Purchases initialCreate={directCreate?.businessId===selected.id&&directCreate.kind==="purchase"} onCreateConsumed={()=>setDirectCreate(null)} assistantRequest={assistantRequest?.businessId===selected.id&&assistantRequest.kind==="purchase"?assistantRequest:null} onAssistantConsumed={()=>setAssistantRequest(null)} onAssistantRedirect={redirectAssistant} key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "purchaseReturns" && selected && canSection("purchaseReturns") && <PurchaseReturns key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "inventory" && selected && canSection("inventory") && <Inventory key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "payments" && selected && canSection("payments") && <PaymentsCenter userId={user!.id} initialDirection={directCreate?.businessId===selected.id&&(directCreate.kind==="RECEIPT"||directCreate.kind==="DISBURSEMENT")?directCreate.kind:null} onCreateConsumed={()=>setDirectCreate(null)} key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "cashBank" && selected && canSection("cashBank") && <CashBank key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "journals" && selected && canSection("journals") && <JournalRegister key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "reports" && selected && canSection("reports") && <ReportsCenter initialReport={assistantReportRequest} onConsumed={()=>setAssistantReportRequest(null)} key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "yearEnd" && selected && canSection("yearEnd") && <YearEndReadiness key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "openings" && selected && canSection("openings") && <OpeningBalances key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
  {section === "masterData" && selected && canSection("masterData") && <MasterData key={selected.id} business={selected} onSessionExpired={onSessionExpired} />}
      </main>
    </div>
    {profileOpen && <UserProfile key={JSON.stringify([user.id,selected?.id])} user={user} section={profileSection} onSectionChange={setProfileSection}
      notifications={<AccountNotifications items={notices} read={read} onOpen={openNotice}/>}
      challenges={selected?<StoreChallenges businessId={selected.id}/>:undefined}
      business={selected && can("business.update") ? selected : undefined}
      onBusinessSaved={updated=>setBusinesses(items=>items.map(item=>item.id===updated.id?{...item,name:updated.name}:item))}
      subscriptionInfo={selected?<StoreSubscriptionInfo businessId={selected.id} expired={isExpired} onUpdated={subscription=>{
        if(subscription.active && (!subscription.expiresAt || Date.parse(subscription.expiresAt)>Date.now()))setExpirySignal(value=>value===selected.id?null:value);
        setBusinesses(items=>items.map(item=>item.id===selected.id?{...item,subscription}:item));
      }}/>:undefined} onSaved={setUser} onClose={()=>setProfileOpen(false)} onSessionExpired={onSessionExpired} />}
    {selected && <IssueReporter key={`${user.id}:${selected.id}`} businessId={selected.id} context={section} onSessionExpired={onSessionExpired} />}
    <footer className="app-footer">رانیار · همراه هوشمند کسب‌وکار تو</footer>
  </div></Guidance></StorePermissionsProvider>;
}

// Rev9.0d-installed
