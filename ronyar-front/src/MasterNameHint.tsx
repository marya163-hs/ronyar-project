import { useEffect, useState } from 'react';
import { ApiError } from './api';
import { loadMasterNameOptions, similarMasterNames } from './masterNameOptions';
import type { MasterNameOption } from './masterNameOptions';
import './MasterNameHint.css';
export default function MasterNameHint({businessId,kind,name,excludeId,onSessionExpired}:{businessId:string;kind:'PRODUCT'|'PARTY';name:string;excludeId?:string;onSessionExpired:()=>void}){
 const scope=businessId+':'+kind;
 const [snapshot,setSnapshot]=useState<{scope:string;rows:MasterNameOption[];error:boolean}|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();setSnapshot(null);loadMasterNameOptions(businessId,kind,c.signal).then(rows=>{if(!c.signal.aborted)setSnapshot({scope,rows,error:false});}).catch(e=>{if(!c.signal.aborted){setSnapshot({scope,rows:[],error:true});if(e instanceof ApiError&&e.status===401)onSessionExpired();}});return()=>c.abort();},[businessId,kind,retry]);
 if(name.trim().length<2)return null;
 if(snapshot?.scope!==scope)return <small className="master-name-status" role="status">بررسی نام‌های مشابه…</small>;
 if(snapshot.error)return <aside className="master-name-hint" role="status">بررسی موارد مشابه کامل نشد؛ نبود هشدار به معنی نبود مورد تکراری نیست. قبل از ثبت، فهرست را بررسی کنید. <button type="button" className="text-button" onClick={()=>setRetry(v=>v+1)}>بررسی دوباره</button></aside>;
 const matches=similarMasterNames(snapshot.rows,name,excludeId);if(!matches.length)return null;
 return <aside className="master-name-hint" role="status"><strong>نام مشابه از قبل وجود دارد</strong><ul>{matches.slice(0,5).map(r=><li key={r.id}><b>{r.name}</b>{r.code&&<> · کد <bdi>{r.code}</bdi></>}{kind==='PARTY'&&<> · {[r.customerEnabled?'مشتری':'',r.supplierEnabled?'تأمین‌کننده':''].filter(Boolean).join(' و ')}</>} · {r.isActive?'فعال':'غیرفعال'}</li>)}</ul>{matches.length>5&&<small>موارد مشابه بیشتری در فهرست وجود دارد.</small>}<p>اگر همان مورد است، فرم را ببندید و مورد موجود را انتخاب یا ویرایش کنید. نام یکسان می‌تواند متعلق به موارد متفاوت باشد؛ ثبت پس از بررسی شما مجاز است.</p></aside>;
}
