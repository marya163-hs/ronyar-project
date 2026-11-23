import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import "./PaymentsReport.css";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorText, formatDecimal, readBusinessReport, tehranToday } from "./api";
import type { Business, PaymentsReportPage } from "./api";
import { BaseEmpty, BaseHeader, BasePanel, BasePagination, BaseStats } from "./BaseUi";
import JalaliDateField from "./JalaliDateField";
import { jalaliText } from "./jalaliDate";
import { PaymentReview } from "./PaymentsCenter";
type Filters={fromDate?:string;toDate?:string;direction?:"RECEIPT"|"DISBURSEMENT";cashBankAccountId?:string;search?:string};
export default function PaymentsReport({business,onSessionExpired}:{business:Business;onSessionExpired:()=>void}) {
  const expired=useRef(onSessionExpired);expired.current=onSessionExpired;
  const [allDates,setAllDates]=useState(true),[from,setFrom]=useState(tehranToday),[to,setTo]=useState(tehranToday);
  const [direction,setDirection]=useState<"ALL"|"RECEIPT"|"DISBURSEMENT">("ALL"),[accountId,setAccountId]=useState(""),[search,setSearch]=useState("");
  const [filters,setFilters]=useState<Filters>({}),[page,setPage]=useState(1),[retry,setRetry]=useState(0),[validation,setValidation]=useState("");
  const [reviewId,setReviewId]=useState<string|null>(null);
  const [snapshot,setSnapshot]=useState<{key:string;data?:PaymentsReportPage;error?:string}|null>(null);
  const [options,setOptions]=useState<{businessId:string;accounts:PaymentsReportPage["accounts"]}|null>(null);
  const key=JSON.stringify([business.id,page,filters,retry]);
  const current=snapshot?.key===key?snapshot:null,data=current?.data,loading=!current;
  const accounts=options?.businessId===business.id?options.accounts:[];
  useEffect(()=>{
    const c=new AbortController(),q=new URLSearchParams({page:String(page),limit:"20",...filters});
    readBusinessReport<PaymentsReportPage>(business.id,"payments/report",q,c.signal).then(result=>{
      if(c.signal.aborted)return;
      setOptions({businessId:business.id,accounts:result.accounts});
      if(page>Math.max(1,result.totalPages)){setPage(Math.max(1,result.totalPages));return;}
      setSnapshot({key,data:result});
    }).catch(cause=>{if(!c.signal.aborted){setSnapshot({key,error:errorText(cause)});if(cause instanceof ApiError&&cause.status===401)expired.current();}});
    return()=>c.abort();
  },[key]);
  function apply(e:FormEvent){e.preventDefault();setValidation("");if(!allDates&&(!from||!to||from>to)){setValidation("بازه تاریخ معتبر وارد کنید؛ پایان نباید قبل از شروع باشد.");return;}setPage(1);setFilters({...(!allDates?{fromDate:from,toDate:to}:{}),...(direction!=="ALL"?{direction}:{}),...(accountId?{cashBankAccountId:accountId}:{}),...(search.trim()?{search:search.trim()}: {})});setRetry(n=>n+1);}
  const currency=storeMoneyUnit(business);
  const kind=(v:"RECEIPT"|"DISBURSEMENT")=>v==="RECEIPT"?"دریافت":"پرداخت";
  return <section className="operational-report"><BaseHeader title="گزارش دریافت‌ها و پرداخت‌ها" description="ریز عملیات قطعی دریافت و پرداخت به اشخاص با جمع مبالغ در بازه انتخابی" />
    <BasePanel title="محدوده گزارش" note="فیلترها پس از زدن «نمایش گزارش» اعمال می‌شوند."><form className="reports-filter" onSubmit={apply}>
      <label className="reports-check"><input type="checkbox" checked={allDates} onChange={e=>setAllDates(e.target.checked)} />همه تاریخ‌ها</label>
      {!allDates&&<><JalaliDateField id="payment-report-from" label="از تاریخ (شمسی)" value={from} onChange={setFrom} /><JalaliDateField id="payment-report-to" label="تا تاریخ (شمسی)" value={to} onChange={setTo} minISO={from} /></>}
      <label>نوع عملیات<select value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="ALL">دریافت و پرداخت</option><option value="RECEIPT">دریافت</option><option value="DISBURSEMENT">پرداخت</option></select></label>
      <label>صندوق یا بانک<select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">همه حساب‌ها</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.isActive?"":" (غیرفعال)"}</option>)}</select></label>
      <label>جستجوی نام شخص<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} /></label>
      <button type="submit" className="primary" disabled={loading}>نمایش گزارش</button>
    </form>{validation&&<p className="notice error" role="alert">{validation}</p>}
    <p className="reports-context">{filters.fromDate?`${jalaliText(filters.fromDate)} تا ${jalaliText(filters.toDate??"")}`:"همه تاریخ‌ها"} · {filters.direction?kind(filters.direction):"دریافت و پرداخت"}{filters.search?` · شخص: ${filters.search}`:""} · ارقام به {currency}</p>
    <p className="reports-context">فقط دریافت و پرداخت قطعی به اشخاص، شامل تسویه فاکتورها، برگشت وجه و تسویه مانده اولیه. دریافت و پرداخت چکی هم شامل است؛ ثبت‌های برگشت‌خوردهٔ چک، پیش‌نویس و لغوشده در جمع‌ها نیستند. انتقال بین حساب‌ها، هزینه مستقل و اسناد برگشت عملیات نقدی در این گزارش نیستند؛ برای تمام گردش‌ها و مانده واقعی از «گردش حساب» استفاده کنید.</p>
    <p className="reports-context">خالص این گزارش برابر دریافت منهای پرداخت در محدوده انتخابی است و مانده صندوق یا بانک نیست. فهرست حساب‌ها، حساب‌های دارای دریافت یا پرداخت قطعی را نشان می‌دهد؛ حساب اسناد چکی هم ممکن است در آن باشد. وصول چک، انتقال بین حساب اسناد و بانک است و در «گردش حساب» دیده می‌شود.</p></BasePanel>
    {loading&&<p role="status">در حال دریافت گزارش…</p>}{current?.error&&<div className="notice error" role="alert">{current.error}<button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>تلاش دوباره</button></div>}
    {data&&<><BaseStats items={[{label:"جمع دریافت",value:formatStoreMoney(business, data.totalReceipts),hint:"کل گزارش؛ مستقل از صفحه‌بندی"},{label:"جمع پرداخت",value:formatStoreMoney(business, data.totalDisbursements),hint:"کل گزارش؛ مستقل از صفحه‌بندی"},{label:"خالص دریافت منهای پرداخت",value:formatStoreMoney(business, data.netAmount),hint:"خالص عملیات انتخابی؛ بدون مانده قبلی"}]} />
    <BasePanel title="ریز دریافت‌ها و پرداخت‌ها" note={`${formatDecimal(String(data.total))} ردیف در کل گزارش؛ مرتب‌شده از جدید به قدیم`}>
      {data.items.length?<><div className="reports-table-scroll"><table className="base-table reports-table payments-report-table"><thead><tr>{["شماره","تاریخ شمسی","نوع","طرف‌حساب","حساب","دریافت","پرداخت","جزئیات"].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{data.items.map(r=><tr key={r.id}><td>{r.number?formatDecimal(r.number):"—"}</td><td>{jalaliText(r.documentDate)}</td><td>{kind(r.direction)}</td><td>{r.party.name}</td><td>{r.cashBankAccount.name}</td><td>{formatStoreMoney(business, r.direction==="RECEIPT"?r.amount:"0")}</td><td>{formatStoreMoney(business, r.direction==="DISBURSEMENT"?r.amount:"0")}</td><td><button type="button" className="text-button" onClick={()=>setReviewId(r.id)}>مشاهده جزئیات</button></td></tr>)}</tbody></table></div>
      <div className="reports-mobile-rows">{data.items.map(r=><article className="reports-mobile-row" key={r.id}><strong>{kind(r.direction)} {r.number?formatDecimal(r.number):""} · {r.party.name}</strong><div><span>تاریخ شمسی</span><bdi>{jalaliText(r.documentDate)}</bdi></div><div><span>حساب</span><strong>{r.cashBankAccount.name}</strong></div><div><span>مبلغ</span><strong>{formatStoreMoney(business, r.amount)} {currency}</strong></div><button type="button" className="secondary" onClick={()=>setReviewId(r.id)}>مشاهده جزئیات</button></article>)}</div></>:<BaseEmpty title="دریافت یا پرداختی در این محدوده وجود ندارد" description="بازه تاریخ و فیلترهای انتخابی را بررسی کنید." />}
      <BasePagination page={page} totalPages={data.totalPages} loading={loading} onChange={setPage} /></BasePanel></>}
    {reviewId&&<PaymentReview key={`${business.id}:${reviewId}`} business={business} paymentId={reviewId} onClose={()=>setReviewId(null)} onChanged={()=>setRetry(n=>n+1)} onSessionExpired={onSessionExpired} />}
  </section>;
}
