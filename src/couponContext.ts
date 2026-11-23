const key = "ranyar.coupon.v1",
  ttl = 7 * 86400000;
export const normalizeCouponCode = (v: string) => v.trim().toUpperCase();
export const validCouponCode = (v: string) =>
  /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(v);
export function readCouponCode() {
  try {
    const incoming = new URL(location.href).searchParams.get("coupon");
    if (incoming !== null) {
      const code = normalizeCouponCode(incoming);
      if (validCouponCode(code)) {
        try {
          sessionStorage.setItem(key, JSON.stringify({ code, at: Date.now() }));
        } catch {}
        return code;
      }
      sessionStorage.removeItem(key);
      return "";
    }
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      saved &&
      typeof saved.code === "string" &&
      validCouponCode(saved.code) &&
      Number.isFinite(saved.at) &&
      saved.at <= Date.now() &&
      Date.now() - saved.at < ttl
    )
      return saved.code;
    sessionStorage.removeItem(key);
  } catch {}
  return "";
}
export function clearCouponCode() {
  try {
    sessionStorage.removeItem(key);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.delete("coupon");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}
