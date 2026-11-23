import type { Business } from "./api";

export { subscriptionExpiredEvent } from "./api";

const expiryDate = new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "Asia/Tehran" });

export type AccountNotice = { id: string; store: Business; expired: boolean; date: string };

export function subscriptionNotices(businesses: Business[], now: number): AccountNotice[] {
  return businesses.flatMap(store => {
    const expiry = store.subscription?.expiresAt;
    if (!expiry) return [];
    const end = new Date(expiry).getTime();
    if (!Number.isFinite(end) || end - now > 7 * 86400000) return [];
    const expired = end <= now || store.subscription?.active === false;
    return [{ id: `${store.id}:${expiry}:${expired ? "expired" : "upcoming"}`, store, expired, date: expiryDate.format(end) }];
  }).sort((a, b) => Number(b.expired) - Number(a.expired));
}

export default function AccountNotifications({items, read, onOpen}: {
  items: AccountNotice[];
  read: Set<string>;
  onOpen: (item: AccountNotice) => void;
}) {
  return <section className="user-profile-section">
    <h3>اعلان‌ها</h3>
    {items.length === 0 ? <p className="muted">فعلاً اعلان اشتراکی ندارید.</p> :
      <ul className="account-notices">{items.map(item => <li key={item.id}>
        <strong>{item.expired ? "پایان اعتبار اشتراک" : "نزدیک به پایان اعتبار"}</strong>
        {!read.has(item.id) && <span className="account-notice-new">خوانده‌نشده</span>}
        <p>{item.store.name} · {item.date}</p>
        <button className="text-button" type="button" onClick={() => onOpen(item)}>{item.expired ? "مشاهده و تمدید اشتراک" : "مشاهدهٔ اشتراک"}</button>
      </li>)}</ul>}
  </section>;
}

export function getReadNotices(userId: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(`ranyar-subscription-notices:${userId}`) ?? "[]");
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch { return []; }
}

export function saveReadNotices(userId: string, ids: string[]) {
  try { localStorage.setItem(`ranyar-subscription-notices:${userId}`, JSON.stringify(ids.slice(-100))); }
  catch { /* Reading notices remains available without browser storage. */ }
}
