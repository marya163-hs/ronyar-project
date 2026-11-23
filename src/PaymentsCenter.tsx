import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import ChequeManager from "./ChequeManager";
import JournalDetailsPanel from "./JournalDetailsPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import FormDrawer from "./FormDrawer";
import ReceiptForm from "./ReceiptForm";
import DisbursementForm from "./DisbursementForm";
import ReceiptPostAction from "./ReceiptPostAction";
import DisbursementPostAction from "./DisbursementPostAction";
import { useStoreCan } from "./StorePermissions";
import { jalaliText } from "./jalaliDate";
import { ApiError, cancelPayment, errorText, formatDecimal, getPayment, listPayments, listPurchases, listSales } from "./api";
import type { Business, PaymentDetails, PaymentPage, PaymentSummary, PurchasePage, SalePage, SaleStatus } from "./api";
import "./PaymentsCenter.css";

type Direction = "RECEIPT" | "DISBURSEMENT";
type FilterDirection = Direction | "ALL";
type Props = { userId:string; initialDirection?:Direction|null; onCreateConsumed?:()=>void; business: Business; onSessionExpired: () => void };
const paymentStatuses: { id: SaleStatus | "ALL"; label: string }[] = [
  { id: "ALL", label: "همه وضعیت‌ها" }, { id: "DRAFT", label: "پیش‌نویس" },
  { id: "POSTED", label: "ثبت قطعی" }, { id: "CANCELLED", label: "لغوشده" },
];
const statusText = (value: string) => value==="REVERSED"?"برگشت چک": paymentStatuses.find(item => item.id === value)?.label ?? value;
const paymentTitle = (direction: Direction) => direction === "RECEIPT" ? "دریافت" : "پرداخت";
const moneyCurrency = (business: Business) => storeMoneyUnit(business);
const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";
function searchable(text: string) {
  return text.replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String(arDigits.indexOf(digit)))
    .replace(/[٬,\s]/g, "").toLowerCase().trim();
}

/** Uses the existing POSTED invoices and the existing protected receipt/disbursement form.
 * Search is limited to the current server page; no new accounting command is introduced.
 */
function InvoicePicker({ business, direction, onSelect, onSessionExpired }: {
  business: Business; direction: Direction; onSelect: (id: string) => void; onSessionExpired: () => void;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SalePage | PurchasePage | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const request = direction === "RECEIPT" ? listSales : listPurchases;
    request(business.id, "POSTED", page, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(cause => { if (!controller.signal.aborted) {
        setError(errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, direction, page, retry]);
  const visible = useMemo(() => (result?.items ?? []).filter(item => {
    const key = searchable(query);
    return !key || [item.number ?? "", item.party?.name ?? "", item.total, formatStoreMoney(business, item.total), jalaliText(item.documentDate)]
      .some(value => searchable(value).includes(key));
  }), [result, query]);
  return <section className="pay-invoice-picker">
    <p className="muted">{direction === "RECEIPT" ? "فاکتور فروش ثبت‌قطعی مشتری را انتخاب کنید." : "فاکتور خرید ثبت‌قطعی تأمین‌کننده را انتخاب کنید."} مانده تسویه قبل از ثبت وجه بررسی می‌شود.</p>
    <label>جست‌وجو در همین صفحه
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="شماره فاکتور، نام شخص یا مبلغ" />
    </label>
    {loading && <p role="status">در حال دریافت فاکتورها…</p>}
    {error && <p role="alert" className="notice error">{error}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></p>}
    {!loading && !error && visible.length === 0 && <p className="pay-empty">فاکتور ثبت‌قطعی در این صفحه پیدا نشد.</p>}
    <div className="pay-invoice-results">
      {visible.map(item => <button type="button" key={item.id} className="pay-invoice-row" onClick={() => onSelect(item.id)}>
        <span><strong>{item.party?.name ?? "نام طرف حساب نامشخص"}</strong><small>فاکتور {item.number ? formatDecimal(item.number) : "—"} · {jalaliText(item.documentDate)}</small></span>
        <span className="pay-row-end"><strong><bdi>{formatStoreMoney(business, item.total)}</bdi></strong><small>مبلغ کل فاکتور · {moneyCurrency(business)}</small></span>
      </button>)}
    </div>
    <div className="pay-pagination">
      <button type="button" className="secondary" disabled={loading || page <= 1} onClick={() => { setPage(value => value - 1); setQuery(""); }}>قبلی</button>
      <span>صفحه {formatDecimal(String(page))} از {formatDecimal(String(Math.max(1, result?.totalPages ?? 1)))}</span>
      <button type="button" className="secondary" disabled={loading || !result || page >= result.totalPages} onClick={() => { setPage(value => value + 1); setQuery(""); }}>بعدی</button>
    </div>
    <p className="pay-footnote">فقط فاکتورهای قطعی نمایش داده می‌شوند. جست‌وجو در ۲۰ فاکتور صفحه جاری انجام می‌شود؛ برای فاکتورهای قدیمی از صفحه بعد استفاده کنید.</p>
  </section>;
}

export function PaymentReview({ business, paymentId, onClose, onChanged, onSessionExpired }: Omit<Props,"userId"> & {
  paymentId: string; onClose: () => void; onChanged: () => void;
}) {
  const can = useStoreCan();
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [showJournal, setShowJournal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [retry, setRetry] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const cancelling = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setPayment(null);
    getPayment(business.id, paymentId, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setPayment(data); setUncertain(false); } })
      .catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, paymentId, retry]);
  const allocation = payment?.allocations.length === 1 ? payment.allocations[0] : null;
  const canPostReceipt = can("payments.manage") && payment?.direction === "RECEIPT" && allocation?.targetType === "SALE";
  const canPostDisbursement = can("payments.manage") && payment?.direction === "DISBURSEMENT" && allocation?.targetType === "PURCHASE";
  async function cancelDraft() {
    if (!payment || payment.status !== "DRAFT" || cancelling.current || busy || uncertain || !reason.trim()) return;
    cancelling.current = true; setBusy(true); setError("");
    try {
      await cancelPayment(business.id, payment.id, payment.version, reason.trim());
      onChanged(); onClose();
    } catch (cause) {
      const ambiguous = !(cause instanceof ApiError) || (cause.status >= 500 || cause.status === 408);
      setUncertain(ambiguous);
      setError(ambiguous ? "نتیجه لغو مشخص نیست؛ قبل از اقدام دوباره، وضعیت سند را بررسی کنید." : errorText(cause));
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
    } finally { cancelling.current = false; setBusy(false); }
  }
  if (showJournal && payment?.journalEntryId && can("journals.read")) return <JournalDetailsPanel business={business} entryId={payment.journalEntryId} onClose={() => setShowJournal(false)} onSessionExpired={onSessionExpired} />;
  return <FormDrawer title="جزئیات دریافت و پرداخت" busy={busy} onClose={onClose}>
    <section className="product-form-panel pay-detail">
      {loading && <p role="status">در حال دریافت سند…</p>}
      {error && <div className="notice error" role="alert">{error}<button type="button" className="text-button" disabled={busy} onClick={() => setRetry(value => value + 1)}>بررسی وضعیت سند</button></div>}
      {payment && <>
        <h3>{paymentTitle(payment.direction)} {payment.number ? `شماره ${formatDecimal(payment.number)}` : "پیش‌نویس"}</h3>
        <dl className="invoice-meta">
          <div><dt>وضعیت</dt><dd>{statusText(payment.status)}</dd></div>
          <div><dt>طرف حساب</dt><dd>{payment.party?.name ?? "—"}</dd></div>
          <div><dt>تاریخ شمسی</dt><dd><bdi>{jalaliText(payment.documentDate)}</bdi></dd></div>
          <div><dt>مبلغ</dt><dd><bdi>{formatStoreMoney(business, payment.amount)}</bdi> {moneyCurrency(business)}</dd></div>
          {payment.externalReference && <div className="payment-reference"><dt>شماره پیگیری</dt><dd><bdi dir="ltr" style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>{payment.externalReference}</bdi></dd></div>}
          <div><dt>تعداد تخصیص‌ها</dt><dd>{formatDecimal(String(payment.allocations.length))}</dd></div>
        </dl>
        <h4>اسناد مرتبط</h4>
        {payment.allocations.map((item, index) => <div className="pay-allocation" key={`${item.targetType}:${item.targetId}:${index}`}>
          <span>{({ SALE: "فروش", PURCHASE: "خرید", SALE_RETURN: "برگشت از فروش", PURCHASE_RETURN: "برگشت از خرید", OPENING_RECEIVABLE: "مطالبات اول دوره", OPENING_PAYABLE: "بدهی اول دوره" } as Record<string, string>)[item.targetType] ?? "سند مرتبط"}{item.targetNumber != null && <> · شماره {formatDecimal(item.targetNumber)}</>}</span>
          <strong><bdi>{formatStoreMoney(business, item.amount)}</bdi> {moneyCurrency(business)}</strong>
        </div>)}
        {payment.journalEntryId && can("journals.read") && <button type="button" className="secondary" onClick={() => setShowJournal(true)}>مشاهده سند حسابداری</button>}
        {payment.notes && <p className="pay-notes">یادداشت: {payment.notes}</p>}
        {payment.status === "DRAFT" && can("payments.manage") && <div className="pay-draft-actions">
          {(canPostReceipt || canPostDisbursement) && <div className="pay-post-action">
            {canPostReceipt && <ReceiptPostAction business={business} payment={payment} onBusyChange={setBusy} onSessionExpired={onSessionExpired} onPosted={() => { onChanged(); onClose(); }} />}
            {canPostDisbursement && <DisbursementPostAction business={business} payment={payment} onBusyChange={setBusy} onSessionExpired={onSessionExpired} onPosted={() => { onChanged(); onClose(); }} />}
          </div>}
          {!canPostReceipt && !canPostDisbursement && <p className="muted">ثبت قطعی این پیش‌نویس از مسیر سند مرتبط انجام می‌شود؛ این صفحه فقط امکان بررسی و لغو پیش‌نویس را دارد.</p>}
          <label>علت لغو پیش‌نویس
            <input value={reason} maxLength={1000} disabled={busy || uncertain} onChange={event => setReason(event.target.value)} placeholder="مثلاً ثبت اشتباه" />
          </label>
          <button type="button" className="secondary pay-cancel-button" disabled={busy || uncertain || !reason.trim()} onClick={() => void cancelDraft()}>لغو پیش‌نویس</button>
        </div>}
      </>}
      <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>بستن</button></div>
    </section>
  </FormDrawer>;
}

export default function PaymentsCenter({ userId,initialDirection,onCreateConsumed,business, onSessionExpired }: Props) {
  const can = useStoreCan();
  const [showCheques,setShowCheques]=useState(false);
  const canManage = can("payments.manage");
  const [direction, setDirection] = useState<FilterDirection>("ALL");
  const [status, setStatus] = useState<SaleStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PaymentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [createDirection, setCreateDirection] = useState<Direction | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setResult(null);
    listPayments(business.id, direction, status, page, controller.signal)
      .then(data => { if (!controller.signal.aborted) {
        if (data.totalPages > 0 && page > data.totalPages) setPage(data.totalPages);
        else setResult(data);
      } })
      .catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, direction, status, page, retry]);
  const visible: PaymentSummary[] = useMemo(() => (result?.items ?? []).filter(item => {
    const key = searchable(query);
    return !key || [item.number ?? "", item.party?.name ?? "", item.amount, formatStoreMoney(business, item.amount), jalaliText(item.documentDate), statusText(item.status), paymentTitle(item.direction)]
      .some(value => searchable(value).includes(key));
  }), [result, query]);
  const canCreateReceipt = canManage && can("sales.read") && can("accounts.read") && can("periods.read");
  const canCreateDisbursement = canManage && can("purchases.read") && can("accounts.read") && can("periods.read");
  const summary = (result?.items ?? []).filter(item => item.status === "POSTED");
  useEffect(()=>{if(initialDirection){if(initialDirection==="RECEIPT"?canCreateReceipt:canCreateDisbursement){setCreateDirection(initialDirection);setSourceId(null);}onCreateConsumed?.();}},[initialDirection]);
  const newPayment = (next: Direction) => { setCreateDirection(next); setSourceId(null); setCreatingBusy(false); };
  const closeCreate = () => { if (creatingBusy) return; setCreateDirection(null); setSourceId(null); setRetry(value => value + 1); };
  const afterPaymentPosted = () => { setCreatingBusy(false); setCreateDirection(null); setSourceId(null); setRetry(value => value + 1); };
  return <section className="payments-center" aria-label="دریافت و پرداخت">
    <header className="pay-page-head">
      <div><p className="pay-breadcrumb">{business.name} / عملیات مالی</p><h1>دریافت و پرداخت</h1><p className="muted">ثبت و پیگیری وجه دریافتی مشتریان و پرداختی به تأمین‌کنندگان</p></div>
      {canManage && <div className="pay-primary-actions">
        <button type="button" className="secondary" onClick={()=>setShowCheques(true)}>مدیریت چک‌ها</button>
        {canCreateReceipt && <button type="button" className="primary" onClick={() => newPayment("RECEIPT")}>+ ثبت دریافت</button>}
        {canCreateDisbursement && <button type="button" className="secondary" onClick={() => newPayment("DISBURSEMENT")}>+ ثبت پرداخت</button>}
      </div>}
    </header>
    <div className="pay-info-strip" role="note">دریافت‌ها و پرداخت‌ها ابتدا به‌صورت پیش‌نویس ساخته می‌شوند؛ تنها ثبت قطعی بر مانده‌ها و اسناد مالی اثر می‌گذارد. مبلغ خلاصه فقط مربوط به همین صفحه است.</div>
    <div className="pay-kpis">
      <div><small>اسناد فیلتر انتخابی</small><strong>{formatDecimal(String(result?.total ?? 0))}</strong></div>
      <div><small>ثبت‌قطعی در همین صفحه</small><strong>{formatDecimal(String(summary.length))}</strong></div>
      <div><small>واحد مبالغ</small><strong>{moneyCurrency(business)}</strong></div>
    </div>
    <div className="pay-list-card">
      <div className="pay-tabs" aria-label="نوع عملیات">
        {([ ["ALL", "همه عملیات"], ["RECEIPT", "دریافت‌ها"], ["DISBURSEMENT", "پرداخت‌ها"] ] as [FilterDirection, string][]).map(([id, label]) =>
          <button type="button" key={id} className={direction === id ? "is-active" : ""} aria-pressed={direction === id} onClick={() => { setDirection(id); setPage(1); setQuery(""); }}>{label}</button>)}
      </div>
      <div className="pay-filters"><label>وضعیت
        <select value={status} onChange={event => { setStatus(event.target.value as SaleStatus | "ALL"); setPage(1); }}>
          {paymentStatuses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>جست‌وجو در صفحه
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="نام شخص، شماره، تاریخ یا مبلغ" />
        </label></div>
      {error && <p className="notice error" role="alert">{error}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></p>}
      {loading && <p className="pay-empty" role="status">در حال دریافت عملیات…</p>}
      {!loading && !error && visible.length === 0 && <div className="pay-empty">{query ? "در این صفحه نتیجه‌ای برای جست‌وجو پیدا نشد." : "هنوز دریافت یا پرداختی در این وضعیت ثبت نشده است."}</div>}
      {!loading && !error && visible.length > 0 && <div className="pay-table-wrap"><table className="pay-table"><thead><tr><th>نوع عملیات</th><th>طرف حساب</th><th>شماره</th><th>تاریخ شمسی</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}>
        <td><span className={`pay-direction ${item.direction === "RECEIPT" ? "in" : "out"}`}>{paymentTitle(item.direction)}</span></td>
        <td><strong>{item.party?.name ?? "—"}</strong></td>
        <td>{item.number ? <bdi>{formatDecimal(item.number)}</bdi> : "—"}</td>
        <td><bdi>{jalaliText(item.documentDate)}</bdi></td>
        <td><strong><bdi>{formatStoreMoney(business, item.amount)}</bdi></strong> <small>{moneyCurrency(business)}</small></td>
        <td><span className={`pay-status ${item.status.toLowerCase()}`}>{statusText(item.status)}</span></td>
        <td><button type="button" className="secondary pay-view" onClick={() => setReviewId(item.id)}>جزئیات</button></td>
      </tr>)}</tbody></table></div>}
      <div className="pay-list-footer"><span>جست‌وجو و فهرست بر اساس صفحهٔ سرور است.</span><div className="pay-pagination"><button className="secondary" type="button" disabled={loading || page <= 1} onClick={() => { setPage(p => p - 1); setQuery(""); }}>قبلی</button><span>{formatDecimal(String(page))} / {formatDecimal(String(Math.max(1, result?.totalPages ?? 1)))}</span><button className="secondary" type="button" disabled={loading || !result || page >= result.totalPages} onClick={() => { setPage(p => p + 1); setQuery(""); }}>بعدی</button></div></div>
    </div>
    {canManage && !canCreateReceipt && !canCreateDisbursement && <p className="muted pay-permission-note">برای ایجاد دریافت/پرداخت متصل به فاکتور، مجوز مشاهده فاکتور، حساب‌های صندوق/بانک و دوره مالی هم لازم است.</p>}
    {createDirection && <FormDrawer title={createDirection === "RECEIPT" ? "ثبت دریافت جدید" : "ثبت پرداخت جدید"} busy={creatingBusy} onClose={closeCreate}>
      <div className="pay-create-drawer">
        {!sourceId ? <InvoicePicker key={createDirection} business={business} direction={createDirection} onSelect={setSourceId} onSessionExpired={onSessionExpired} /> : <>
          <p className="pay-footnote">{createDirection === "RECEIPT" ? "دریافت از مشتری بر اساس فاکتور فروش" : "پرداخت به تأمین‌کننده بر اساس فاکتور خرید"}</p>
          {createDirection === "RECEIPT" ? <ReceiptForm key={sourceId} business={business} saleId={sourceId} onChanged={afterPaymentPosted} onBusyChange={setCreatingBusy} onSessionExpired={onSessionExpired} /> : <DisbursementForm key={sourceId} business={business} purchaseId={sourceId} onChanged={afterPaymentPosted} onBusyChange={setCreatingBusy} onSessionExpired={onSessionExpired} />}
        </>}
        <div className="form-actions"><button type="button" className="secondary" disabled={creatingBusy} onClick={closeCreate}>بستن</button></div>
      </div>
    </FormDrawer>}
    {showCheques&&<ChequeManager key={`${userId}:${business.id}`} business={business} userId={userId} onSessionExpired={onSessionExpired} onClose={()=>{setShowCheques(false);setRetry(v=>v+1);}}/>}
    {reviewId && <PaymentReview key={reviewId} business={business} paymentId={reviewId} onClose={() => setReviewId(null)} onChanged={() => setRetry(value => value + 1)} onSessionExpired={onSessionExpired} />}
  </section>;
}
