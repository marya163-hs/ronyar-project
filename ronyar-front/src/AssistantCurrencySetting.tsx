import { useEffect, useRef, useState } from "react";
import { ApiError, errorText, getAssistantSettings, updateAssistantSettings } from "./api";
import type { AssistantMessageCurrency } from "./api";
import { useStoreCan } from "./StorePermissions";
type Props={businessId:string;disabled:boolean;onReady:(ready:boolean)=>void;onSessionExpired:()=>void};
export default function AssistantCurrencySetting({businessId,disabled,onReady,onSessionExpired}:Props){
  const can=useStoreCan(),alive=useRef(true),flight=useRef(false);
  const [currency,setCurrency]=useState<AssistantMessageCurrency>("TOMAN"),[busy,setBusy]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{const c=new AbortController();onReady(false);setBusy(true);setError("");getAssistantSettings(businessId,c.signal).then(r=>{if(!c.signal.aborted){setCurrency(r.currency);onReady(true);}}).catch(e=>{if(!c.signal.aborted){setError(errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[businessId,retry]);
  async function change(value:AssistantMessageCurrency){if(flight.current||disabled)return;flight.current=true;setBusy(true);setError("");onReady(false);try{const r=await updateAssistantSettings(businessId,value);if(alive.current){setCurrency(r.currency);onReady(true);}}catch(e){if(alive.current){setError("نتیجه ذخیره تنظیم مشخص نیست؛ تنظیم را دوباره بخوانید.");if(e instanceof ApiError&&e.status===401)onSessionExpired();}}finally{flight.current=false;if(alive.current)setBusy(false);}}
  return <div><label>واحد مبالغ پیام<select value={currency} disabled={disabled||busy||!can("business.update")} onChange={e=>change(e.target.value as AssistantMessageCurrency)}><option value="TOMAN">تومان</option><option value="IRR">ریال</option></select></label><details><summary>راهنمای واحد مبلغ</summary><small>برای پیام بدون واحد؛ واحد صریح پیام اولویت دارد. این تنظیم برای کل فروشگاه ذخیره می‌شود.</small></details>{busy&&<small>در حال دریافت یا ذخیره تنظیم…</small>}{error&&<p className="notice error">{error}<button type="button" className="text-button" disabled={disabled||busy} onClick={()=>setRetry(v=>v+1)}>بازخوانی تنظیم</button></p>}</div>;
}
