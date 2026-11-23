import ReferralRewards from './ReferralRewards';
import {useEffect,useState} from 'react';
import {createMyReferral,getMyReferral,errorText,type ReferralSummary} from './api';
import {referralLink} from './referralLink';
export default function ReferralPanel(){
 const [data,setData]=useState<ReferralSummary|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[copied,setCopied]=useState(false);
 useEffect(()=>{const abort=new AbortController();getMyReferral(abort.signal).then(v=>{if(!abort.signal.aborted)setData(v);}).catch(e=>{if(!abort.signal.aborted)setError(errorText(e));});return()=>abort.abort();},[revision]);
 async function create(){if(busy)return;setBusy(true);setError('');try{await createMyReferral();setRevision(v=>v+1);}catch(e){setError('ساخت لینک تأیید نشد؛ به‌روزرسانی را بزنید تا وضعیت بررسی شود.');}finally{setBusy(false);}}
 async function copy(){if(!data?.code)return;try{await navigator.clipboard.writeText(referralLink(data.code));setCopied(true);}catch{setError('لینک را از کادر زیر انتخاب و کپی کنید.');}}
 return <section className="user-profile-section"><h3>دعوت دوستان</h3>{error&&<p role="alert" className="notice error">{error}</p>}{!data?<p>در حال دریافت…</p>:data.code?<><p>کد دعوت شما: <b dir="ltr">{data.code}</b></p><label>لینک دعوت<input readOnly dir="ltr" value={referralLink(data.code)} onFocus={e=>e.target.select()}/></label><button type="button" onClick={()=>void copy()}>{copied?'لینک کپی شد':'کپی لینک دعوت'}</button><p>ثبت‌نام با دعوت شما: <b>{new Intl.NumberFormat('fa-IR').format(data.registrations)}</b></p></>:<button type="button" disabled={busy} onClick={()=>void create()}>ساخت لینک دعوت من</button>}<ReferralRewards/><button type="button" className="text-button" disabled={busy} onClick={()=>{setError('');setRevision(v=>v+1);}}>به‌روزرسانی دعوت‌ها</button></section>;
}
