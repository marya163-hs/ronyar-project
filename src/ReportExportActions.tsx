import type { Business } from "./api";
import { moneyReportOutput } from "./moneyReportOutput";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorText } from "./api";
import { downloadReportCsv, reportHtml } from "./reportOutput";
import type { ReportOutput } from "./reportOutput";
export default function ReportExportActions({business,load,onSessionExpired}:{business?:Business;load:(signal:AbortSignal)=>Promise<ReportOutput>;onSessionExpired:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const flight=useRef<{controller:AbortController;popup:Window|null}|null>(null);
  useEffect(()=>()=>{if(flight.current){flight.current.controller.abort();flight.current.popup?.close();flight.current=null;}},[]);
  async function run(mode:"print"|"csv"){
    if(flight.current)return;
    setError("");let popup:Window|null=null;
    if(mode==="print"){
      popup=window.open("","_blank","width=1100,height=800");
      if(!popup){setError("پنجره چاپ مسدود شده است؛ اجازه بازشدن پنجره برای این سایت را بدهید و دوباره تلاش کنید.");return;}
      popup.opener=null;popup.document.title="آماده‌سازی گزارش";popup.document.body.textContent="در حال دریافت تمام ردیف‌های گزارش…";
    }
    const controller=new AbortController(),job={controller,popup};flight.current=job;setBusy(true);
    try{
      const output=moneyReportOutput(await load(controller.signal),business);
      if(controller.signal.aborted)return;
      if(mode==="csv")downloadReportCsv(output);
      else if(popup&&!popup.closed){popup.document.open();popup.document.write(reportHtml(output));popup.document.close();popup.document.getElementById("report-print")?.addEventListener("click",()=>{popup?.focus();popup?.print();});}
    }catch(cause){
      if(!controller.signal.aborted){popup?.close();setError(cause instanceof ApiError&&cause.code==="REPORT_EXPORT_LIMIT"?"این خروجی بیش از ۱۰٬۰۰۰ ردیف دارد؛ دوره یا بازه کوچک‌تری انتخاب کنید.":cause instanceof Error&&cause.message==="INCOMPLETE_EXPORT"?"خروجی کامل دریافت نشد؛ فایلی تولید نشد. دوباره تلاش کنید.":errorText(cause));if(cause instanceof ApiError&&cause.status===401)onSessionExpired();}
    }finally{if(flight.current===job){flight.current=null;setBusy(false);}}
  }
  return <div className="report-export"><div className="report-export-buttons"><button type="button" className="secondary" disabled={busy} onClick={()=>void run("print")}>چاپ / ذخیره PDF</button><button type="button" className="secondary" disabled={busy} onClick={()=>void run("csv")}>خروجی CSV</button></div><p className="reports-context">تمام ردیف‌های محدوده اعمال‌شده، از آخرین داده‌های قطعی هنگام دریافت خروجی؛ حداکثر ۱۰٬۰۰۰ ردیف. مبالغ CSV برای حفظ دقت به‌صورت متن صادر می‌شوند.</p>{busy&&<p role="status">در حال آماده‌سازی خروجی کامل…</p>}{error&&<p className="notice error" role="alert">{error}</p>}</div>;
}
