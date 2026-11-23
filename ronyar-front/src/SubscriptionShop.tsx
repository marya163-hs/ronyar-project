import { useEffect, useState } from "react";
import {
  ApiError,
  shopCatalog,
  shopQuote,
  shopOrder,
  shopCancel,
  shopStartBitPay,
  type ShopPrice,
  type ShopQuote,
  type ShopOrder,
} from "./api";
import {
  readCouponCode,
  clearCouponCode,
  normalizeCouponCode,
} from "./couponContext";
import "./subscription-shop.css";
import PaymentReceiptUpload from "./PaymentReceiptUpload";
import PaymentDestinationCard from "./PaymentDestinationCard";
const number = (v: number) => new Intl.NumberFormat("fa-IR").format(v),
  date = (v: string) =>
    new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
const labels = { MONTHLY: "ماهانه", YEARLY: "سالانه" };
const messages: Record<string, string> = {
  SHOP_BITPAY_PENDING: "درخواست پرداخت آنلاین ایجاد شده است. وضعیت پرداخت را بررسی کنید.",
  SHOP_RECEIPT_CONTACT: "پس از ارسال فیش، لغو درخواست از طریق پشتیبانی انجام می‌شود.",
  SHOP_CARD_UNAVAILABLE: "کارت مقصد پرداخت هنوز فعال نشده؛ با پشتیبانی تماس بگیرید.",
  SHOP_COUPON_INVALID: "این کد برای خرید انتخاب‌شده معتبر نیست.",
  SHOP_COUPON_CAPACITY: "ظرفیت یا سهم استفاده شما از این کد تکمیل شده است.",
  SHOP_PRICE_UNAVAILABLE: "این اشتراک فعلاً برای خرید فعال نیست.",
  SHOP_PRICE_VERSION: "قیمت تغییر کرده؛ مبلغ را دوباره بررسی کنید.",
  SHOP_OPEN_ORDER:
    "یک درخواست خرید باز دارید؛ ابتدا وضعیت آن را بررسی یا لغو کنید.",
  SHOP_FREE_STORE: "فروشگاه شما هم‌اکنون اشتراک دائماً رایگان دارد.",
  SHOP_ORDER_FINAL: "این درخواست نهایی شده؛ فهرست را به‌روز کنید.",
};
export default function SubscriptionShop({
  businessId,
  onConfirmed,
  initiallyOpen = false,
}: {
  businessId: string;
  onConfirmed: () => void;
  initiallyOpen?: boolean;
}) {
  const [prices, setPrices] = useState<ShopPrice[]>([]),
    [bitPayAvailable, setBitPayAvailable] = useState(false),
    [supportPhone,setSupportPhone]=useState(""),
    [orders, setOrders] = useState<ShopOrder[]>([]),
    [plan, setPlan] = useState<"MONTHLY" | "YEARLY">("MONTHLY"),
    [coupon, setCoupon] = useState(readCouponCode),
    [quote, setQuote] = useState<ShopQuote | null>(null),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [command, setCommand] = useState(() => crypto.randomUUID()),
    [owner, setOwner] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    shopCatalog(businessId, abort.signal)
      .then((v) => {
        if (!abort.signal.aborted) {
          setPrices(v.prices);
          setBitPayAvailable(v.bitPayAvailable === true);
          setSupportPhone(v.supportPhone??"");
          setPlan((p) =>
            v.prices.some((x) => x.plan === p)
              ? p
              : (v.prices[0]?.plan ?? "MONTHLY"),
          );
          setOrders(v.orders);
          setOwner(true);
          setUncertain(false);
          setCommand(crypto.randomUUID());
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          if (e instanceof ApiError && (e.status === 403 || e.status === 404))
            setOwner(false);
          else setError("دریافت خریدهای اشتراک ناموفق بود.");
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [businessId, revision]);
  function fail(e: unknown) {
    setError(
      e instanceof ApiError && e.code && messages[e.code]
        ? messages[e.code]
        : "نتیجه درخواست تأیید نشد؛ ابتدا فهرست را به‌روز کنید.",
    );
  }
  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      setQuote(await shopQuote(businessId, plan, normalizeCouponCode(coupon)));
      setCommand(crypto.randomUUID());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (busy || !quote || uncertain) return;
    setBusy(true);
    setError("");
    try {
      await shopOrder(businessId, {
        plan: quote.plan,
        ...(quote.couponCode ? { couponCode: quote.couponCode } : {}),
        expectedPriceVersion: quote.priceVersion,
        commandId: command,
      });
      setQuote(null);
      clearCouponCode();
      setCoupon("");
      setNotice("درخواست خرید ثبت شد.");
      setRevision((v) => v + 1);
    } catch (e) {
      if (!(e instanceof ApiError) || (e.status >= 500 || e.status === 408)) setUncertain(true);
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function pay(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { paymentUrl } = await shopStartBitPay(businessId, id);
      const url = new URL(paymentUrl);
      if (url.origin !== "https://bitpay.ir" || !/^\/payment\/gateway-[1-9][0-9]*-get$/.test(url.pathname)) {
        throw new Error("Invalid payment URL");
      }
      window.location.assign(url.href);
    } catch {
      setError("اتصال به درگاه ممکن نشد. وضعیت درخواست را بررسی و دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await shopCancel(businessId, id);
      setRevision((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="subscription-shop user-profile-section" open={initiallyOpen || undefined}>
      <summary>خرید اشتراک و کد تخفیف</summary>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p>در حال دریافت…</p>
      ) : !owner ? (
        <p>خرید اشتراک از حساب مالک فروشگاه انجام می‌شود.</p>
      ) : (
        <>
          {orders.some(
            (o) => o.state === "PENDING" && new Date(o.expiresAt) > new Date(),
          ) ? (
            <p>درخواست خرید باز شما:</p>
          ) : prices.length ? (
            <form onSubmit={(e) => void calculate(e)}>
              <label>
                اشتراک
                <select
                  value={plan}
                  onChange={(e) => {
                    setPlan(e.target.value as typeof plan);
                    setQuote(null);
                  }}
                  disabled={busy}
                >
                  {(["MONTHLY", "YEARLY"] as const).map((p) => {
                    const price = prices.find((x) => x.plan === p);
                    return (
                      <option key={p} value={p} disabled={!price}>
                        {labels[p]}
                        {price
                          ? " · " + number(price.amountToman) + " تومان"
                          : " · غیرفعال"}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                کد تخفیف (اختیاری)
                <input
                  dir="ltr"
                  value={coupon}
                  maxLength={32}
                  onChange={(e) => {
                    setCoupon(e.target.value);
                    setQuote(null);
                  }}
                  disabled={busy}
                />
              </label>
              {coupon && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    clearCouponCode();
                    setCoupon("");
                    setQuote(null);
                  }}
                  disabled={busy}
                >
                  حذف کد تخفیف
                </button>
              )}
              <button disabled={busy || uncertain}>بررسی مبلغ</button>
            </form>
          ) : (
            <p>قیمت خرید اشتراک هنوز منتشر نشده است.</p>
          )}
          {quote && (
            <div className="shop-quote">
              <p>قیمت اصلی: {number(quote.baseAmountToman)} تومان</p>
              <p>
                تخفیف {number(quote.percent)}٪:{" "}
                {number(quote.discountAmountToman)} تومان
              </p>
              <strong>
                مبلغ نهایی: {number(quote.totalAmountToman)} تومان
              </strong>
              <p>سهمیه روزانه دستیار: {number(quote.aiDailyLimit)}</p>
              <small>
                مبلغ هنگام ثبت درخواست دوباره بررسی می‌شود. پس از ثبت، درخواست
                حداکثر ۲۴ ساعت و تا پایان اعتبار کد برای بررسی معتبر است.
              </small>
              <button
                disabled={busy || uncertain}
                onClick={() => void create()}
              >
                ثبت درخواست{" "}
                {quote.totalAmountToman === 0 ? "اشتراک رایگان" : "خرید اشتراک"}
              </button>
            </div>
          )}
          {supportPhone&&<p>پشتیبانی رانیار: <a href={"tel:"+supportPhone}><bdi>{supportPhone}</bdi> · تماس با پشتیبانی</a></p>}
          {orders.map((o) => (
            <article key={o.id}>
              <b>اشتراک {labels[o.plan]}</b>
              <p>
                {number(o.totalAmountToman)} تومان ·{" "}
                {o.state === "CONFIRMED"
                  ? "فعال‌شده"
                  : o.state === "CANCELLED"
                    ? "لغوشده"
                    : new Date(o.expiresAt) <= new Date()
                      ? "مهلت پایان یافته"
                      : "در انتظار بررسی"}
              </p>
              {o.percent > 0 && (
                <small>
                  تخفیف {number(o.percent)}٪، معادل{" "}
                  {number(o.discountAmountToman)} تومان اعمال شده است.
                </small>
              )}
              <small>
                شناسه درخواست: <bdi>{o.id}</bdi>
              </small>
              {o.state === "PENDING" && new Date(o.expiresAt) > new Date() && (
                <>
                  <p>مهلت بررسی به وقت تهران: {date(o.expiresAt)}</p>
                  {bitPayAvailable && o.plan === "YEARLY" && o.totalAmountToman >= 500 && !o.paymentDestination ? (
                    <button disabled={busy} onClick={() => void pay(o.id)}>پرداخت آنلاین با بیت‌پی</button>
                  ) : o.totalAmountToman > 0 ? <>
                    {o.paymentDestination ? <PaymentDestinationCard key={o.id} destination={o.paymentDestination}/> : <p>برای دریافت اطلاعات پرداخت این درخواست با پشتیبانی تماس بگیرید.</p>}
                    {o.paymentDestination && <PaymentReceiptUpload businessId={businessId} orderId={o.id} receipts={o.receipts??[]} onUploaded={()=>setRevision(v=>v+1)}/>}
                    <small>پیش از پایان مهلت با پشتیبانی هماهنگ کنید. پس از واریز، درخواست را لغو نکنید.</small>
                  </> : <p>این درخواست رایگان است؛ نیازی به واریز نیست و پس از تأیید مدیر فعال می‌شود.</p>}
                  <button disabled={busy || (o.receipts?.length??0)>0} onClick={() => void cancel(o.id)}>
                    لغو درخواست خرید
                  </button>
                </>
              )}
              {o.state === "CONFIRMED" && o.subscriptionExpiresAt && (
                <p>اعتبار اشتراک تا {date(o.subscriptionExpiresAt)}</p>
              )}
            </article>
          ))}
          {orders.length >= 20 && (
            <small>نمایش ۲۰ درخواست اخیر این حساب برای فروشگاه.</small>
          )}
        </>
      )}
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => {
          setError("");
          setQuote(null);
          setRevision((v) => v + 1);
          onConfirmed();
        }}
      >
        به‌روزرسانی خریدها و اعتبار
      </button>
    </details>
  );
}
