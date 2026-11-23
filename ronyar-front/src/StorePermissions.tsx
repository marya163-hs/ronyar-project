import { canOpenReports } from "./reportCatalog";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getEffectiveBusinessPermissions, permissionErrorText } from "./api";

type Snapshot = { key: string; codes: string[]; error: string };
const StorePermissionsContext = createContext<ReadonlySet<string>>(new Set());

/** Never reuse grants across a change of user or tenant. A failed request denies everything. */
export function useEffectiveStorePermissions(businessId: string, userId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${userId ?? ""}:${businessId}`;
  useEffect(() => {
    if (!businessId || !userId) return;
    const abort = new AbortController();
    getEffectiveBusinessPermissions(businessId, abort.signal)
      .then(data => { if (!abort.signal.aborted) {
        const valid = data.businessId === businessId;
        const codes = valid ? [...new Set(data.permissions)].sort() : [];
        const error = valid ? "" : "پاسخ مجوزها نامعتبر بود.";
        setSnapshot(current => {
          if (current?.key === key && current.error === error &&
              current.codes.length === codes.length && codes.every((code, i) => current.codes[i] === code)) return current;
          return { key, codes, error };
        });
      } })
      .catch(cause => { if (!abort.signal.aborted) setSnapshot({ key, codes: [], error: permissionErrorText(cause) }); });
    return () => abort.abort();
  }, [key, businessId, userId, revision]);
  useEffect(() => {
    const refresh = () => setRevision(current => current + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("mahan:permissions-changed", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("mahan:permissions-changed", refresh); window.clearInterval(interval); };
  }, []);
  const ready = Boolean(userId && businessId && snapshot?.key === key);
  const codes = useMemo(() => new Set(ready ? snapshot!.codes : []), [ready, snapshot]);
  return { ready, codes, error: ready ? snapshot!.error : "", refresh: () => setRevision(value => value + 1) };
}

export const StorePermissionsProvider = StorePermissionsContext.Provider;
export function useStoreCan(): (code: string) => boolean {
  const set = useContext(StorePermissionsContext);
  return (code: string) => set.has(code);
}

/** The section's read grant and the section's write controls are separate. */
export function canOpenStoreSection(section: string, can: (code: string) => boolean): boolean {
  switch (section) {
    case "dashboard": return can("dashboard.read");
    case "sales": return can("sales.read");
    case "purchases": return can("purchases.read");
    case "saleReturns": return can("sale-returns.read");
    case "purchaseReturns": return can("purchase-returns.read");
    case "inventory": return can("inventory.read");
    case "payments": return can("payments.read");
    case "cashBank": return can("accounts.read") && can("periods.read");
    case "journals": return can("journals.read");
    case "reports": return canOpenReports(can);
    case "yearEnd": return can("periods.manage") && can("journals.read");
    case "openings": return can("accounts.manage") && can("periods.read");
    case "masterData": return ["catalog.manage", "parties.manage", "accounts.manage", "periods.manage", "inventory.manage"].some(can);
    case "products": return can("catalog.read");
    case "parties": return can("parties.read");
    default: return false;
  }
}
