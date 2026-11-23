import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import MoneyInput from "./MoneyInput";
import { ApiError, errorText, listBaseAccounts, postManualJournal, tehranToday } from "./api";
import type { Account, Business, FiscalPeriod, ManualJournalInput } from "./api";
import { periodForDate } from "./documentPeriod";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";

type Row = {id:string;accountId:string;side:"debit"|"credit";amount:string};
type Pending = {key:string;body:ManualJournalInput};
const messages: Record<string,string> = {
  MANUAL_JOURNAL_SIDE:"در هر ردیف یک مبلغ مثبت برای بدهکار یا بستانکار وارد کنید.",
  MANUAL_JOURNAL_UNBALANCED:"جمع بدهکار و بستانکار باید برابر باشد.",
  MANUAL_JOURNAL_PRECISION:"تعداد رقم‌های اعشار با واحد پول فروشگاه سازگار نیست.",
  MANUAL_JOURNAL_ACCOUNT:"حساب‌های فعال و قابل ثبت را انتخاب کنید.",
  MANUAL_JOURNAL_CONTROL_ACCOUNT:"برای حساب کنترلی اشخاص، موجودی یا چک، از فرم مربوط به همان عملیات استفاده کنید.",
};
function makeRow(side:Row["side"]):Row {
  return {id:crypto.randomUUID(),accountId:"",side,amount:""};
}
function minor(value:string, scale:number) {
  if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(value)) return null;
  const [whole,fraction=""] = value.split(".");
  if (fraction.length > scale) return null;
  return BigInt(whole+fraction.padEnd(scale,"0"));
}
function decimal(value:bigint, scale:number) {
  if (!scale) return value.toString();
  const digits=value.toString().padStart(scale+1,"0");
  return digits.slice(0,-scale)+"."+digits.slice(-scale);
}

export default function ManualJournalForm({business,periods,onClose,onSaved,onSessionExpired}: {
  business:Business;periods:FiscalPeriod[];onClose:()=>void;onSaved:(id:string)=>void;onSessionExpired:()=>void;
}) {
  const [accounts,setAccounts]=useState<Account[]|null>(null);
  const [error,setError]=useState("");
  const [date,setDate]=useState(tehranToday);
  const [description,setDescription]=useState("");
  const [rows,setRows]=useState(()=>[makeRow("debit"),makeRow("credit")]);
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const sending=useRef(false);
  const storageKey=`ranyar-manual-journal:${business.id}`;
  const [pending,setPending]=useState<Pending|null>(()=>{
    try { return JSON.parse(sessionStorage.getItem(storageKey)??"null") as Pending|null; }
    catch { return null; }
  });

  useEffect(()=>{
    const abort=new AbortController();
    listBaseAccounts(business.id,abort.signal).then(items=>{
      if (abort.signal.aborted) return;
      const parentIds=new Set(items.map(account=>account.parentId));
      setAccounts(items.filter(account=>account.isPosting && account.isActive && !parentIds.has(account.id) &&
        !/^SYS-(CHEQUES-|RECEIVABLE$|PAYABLE$|INVENTORY$)/.test(account.code)));
    }).catch(cause=>{
      if (abort.signal.aborted) return;
      setError(errorText(cause));
      if (cause instanceof ApiError && cause.status===401) onSessionExpired();
    });
    return ()=>abort.abort();
  },[business.id,revision]);

  const period=periodForDate(periods,date);
  const amounts=rows.map(row=>minor(row.amount,business.currencyScale));
  const debit=rows.reduce((sum,row,index)=>sum+(row.side==="debit"?amounts[index]??0n:0n),0n);
  const credit=rows.reduce((sum,row,index)=>sum+(row.side==="credit"?amounts[index]??0n:0n),0n);
  const invalidAmount=rows.some((row,index)=>row.amount!=="" && (amounts[index]??0n)<=0n);
  const ready=Boolean(period && description.trim() && rows.every((row,i)=>accounts?.some(account=>account.id===row.accountId) && (amounts[i]??0n)>0n) && debit===credit);
  function updateRow(id:string, change:Partial<Row>) {
    setRows(items=>items.map(row=>row.id===id?{...row,...change}:row));
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || (!pending && !ready)) return;
    const request=pending??{key:crypto.randomUUID(),body:{periodId:period!.id,documentDate:date,description:description.trim(),
      lines:rows.map(row=>({accountId:row.accountId,debit:row.side==="debit"?row.amount:"0",credit:row.side==="credit"?row.amount:"0"}))}};
    try { sessionStorage.setItem(storageKey,JSON.stringify(request)); }
    catch { setError("ذخیرهٔ درخواست در مرورگر ممکن نیست."); return; }
    setPending(request);
    sending.current=true;setBusy(true);setError("");
    try {
      const result=await postManualJournal(business.id,request.body,request.key);
      try { sessionStorage.removeItem(storageKey); } catch { /* Retrying the saved request returns the same entry. */ }
      onSaved(result.id);
    } catch (cause) {
      if (cause instanceof ApiError && [400,409].includes(cause.status)) {
        try { sessionStorage.removeItem(storageKey);setPending(null); } catch { /* Retain the original request. */ }
        setError(messages[cause.code]??errorText(cause));
      } else {
        setError(cause instanceof ApiError && cause.status<500 && cause.status!==408 ? errorText(cause)
          : "نتیجهٔ ثبت مشخص نیست. تلاش دوباره همان درخواست را پیگیری می‌کند.");
      }
      if (cause instanceof ApiError && cause.status===401) onSessionExpired();
    } finally { sending.current=false;setBusy(false); }
  }

  const unit=storeMoneyUnit(business);
  const amountText=(value:bigint)=>formatStoreMoney(business,decimal(value,business.currencyScale));
  return <FormDrawer title="ثبت سند دستی" busy={busy} onClose={onClose}>
    <section className="product-form-panel">
      <form className="cash-operation-form" onSubmit={submit}>
        {error&&<p className="notice error" role="alert">{error}</p>}
        {pending ? <p className="notice" role="status">درخواست ثبت سند «{pending.body.description}» آمادهٔ پیگیری است.</p> : <>
          <JalaliDateField id="manual-journal-date" label="تاریخ سند" value={date} onChange={setDate}/>
          <p className="muted">{period?`دورهٔ مالی ${period.name}`:"برای این تاریخ دورهٔ مالی باز وجود ندارد."}</p>
          <label>شرح سند<textarea value={description} maxLength={1000} required onChange={event=>setDescription(event.target.value)}/></label>
          {!accounts&&(error?<button type="button" className="secondary" onClick={()=>{setError("");setRevision(n=>n+1);}}>دریافت دوبارهٔ حساب‌ها</button>:<p role="status">در حال دریافت حساب‌ها…</p>)}
          {accounts?.length===0&&<p>حساب فعال و قابل ثبت پیدا نشد.</p>}
          {accounts&&rows.map((row,index)=><fieldset key={row.id} className="product-form-grid">
            <legend>ردیف {index+1}</legend>
            <label>حساب<select value={row.accountId} required onChange={event=>updateRow(row.id,{accountId:event.target.value})}>
              <option value="">انتخاب حساب</option>
              {accounts.map(account=><option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
            </select></label>
            <label>نوع گردش<select value={row.side} onChange={event=>updateRow(row.id,{side:event.target.value as Row["side"]})}>
              <option value="debit">بدهکار</option><option value="credit">بستانکار</option>
            </select></label>
            <label>مبلغ ({unit})<MoneyInput business={business} value={row.amount} required onChange={amount=>updateRow(row.id,{amount})}/></label>
            {rows.length>2&&<button type="button" className="text-button" onClick={()=>setRows(items=>items.filter(item=>item.id!==row.id))}>حذف ردیف {index+1}</button>}
          </fieldset>)}
          {accounts&&<button type="button" className="secondary" disabled={rows.length>=50} onClick={()=>setRows(items=>[...items,makeRow("debit")])}>افزودن ردیف</button>}
          {invalidAmount&&<p className="notice error" role="alert">مبلغ هر ردیف باید مثبت و با دقت واحد پول فروشگاه سازگار باشد.</p>}
          <div className="notice" role="status">بدهکار <bdi>{amountText(debit)}</bdi> · بستانکار <bdi>{amountText(credit)}</bdi> {unit}
          {debit!==credit&&<> · اختلاف <bdi>{amountText(debit>credit?debit-credit:credit-debit)}</bdi></>}</div>
        </>}
        <button type="submit" className="primary" disabled={busy||(!pending&&!ready)}>{busy?"در حال ثبت…":pending?"پیگیری همان ثبت":"ثبت قطعی سند"}</button>
      </form>
    </section>
  </FormDrawer>;
}
