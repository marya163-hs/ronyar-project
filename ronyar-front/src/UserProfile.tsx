import ReferralPanel from './ReferralPanel';
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import { ApiError, changePassword, errorText, getMyProfile, renameBusiness, updateMyProfile } from "./api";
import type { Business, User } from "./api";
import "./user-profile.css";
export type ProfileSection = "account" | "store" | "subscription" | "notifications" | "rewards";
const profileSections: { id: ProfileSection; label: string }[] = [
 {id:"account",label:"حساب و امنیت"}, {id:"store",label:"فروشگاه"}, {id:"subscription",label:"اشتراک"},
 {id:"notifications",label:"اعلان‌ها"}, {id:"rewards",label:"دعوت و چالش‌ها"},
];
type Props={section:ProfileSection;onSectionChange:(section:ProfileSection)=>void;notifications:import("react").ReactNode;challenges?:import("react").ReactNode;business?:Pick<Business,"id"|"name">;onBusinessSaved:(business:Pick<Business,"id"|"name">)=>void;subscriptionInfo?:import("react").ReactNode;user:User;onSaved:(user:User)=>void;onClose:()=>void;onSessionExpired:()=>void};
export default function UserProfile({section,onSectionChange,notifications,challenges,business,onBusinessSaved,subscriptionInfo,user,onSaved,onClose,onSessionExpired}:Props){
 const [profile,setProfile]=useState(user),[name,setName]=useState(user.displayName),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(""),[revision,setRevision]=useState(0);
 const [busy,setBusy]=useState<"name"|"password"|"business"|null>(null),[nameError,setNameError]=useState(""),[passwordError,setPasswordError]=useState(""),[nameMessage,setNameMessage]=useState(""),[passwordMessage,setPasswordMessage]=useState("");
 const [currentPassword,setCurrentPassword]=useState(""),[newPassword,setNewPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[uncertain,setUncertain]=useState(false);
 const [businessName,setBusinessName]=useState(business?.name??"");
 const [businessError,setBusinessError]=useState(""),[businessMessage,setBusinessMessage]=useState("");
 useEffect(()=>{setBusinessName(business?.name??"");},[business?.id,business?.name]);
 async function saveBusiness(event:FormEvent) {
  event.preventDefault();
  const value=businessName.trim();
  if (!business || busy || value.length<2 || value===business.name) return;
  setBusy("business");setBusinessError("");setBusinessMessage("");
  try {
   const updated=await renameBusiness(business.id,value);
   onBusinessSaved(updated);
   if(alive.current)setBusinessMessage("نام فروشگاه ذخیره شد.");
  } catch(cause) {
   if(alive.current){
    setBusinessError(errorText(cause));
    if(cause instanceof ApiError&&cause.status===401)onSessionExpired();
   }
  } finally {
   if(alive.current)setBusy(null);
  }
 }
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setLoadError("");getMyProfile(abort.signal).then(value=>{if(!abort.signal.aborted){setProfile(value);setName(value.displayName);}}).catch(cause=>{if(!abort.signal.aborted){setLoadError(errorText(cause));if(cause instanceof ApiError&&cause.status===401)onSessionExpired();}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[revision]);
 async function saveName(event:FormEvent){event.preventDefault();if(busy)return;setBusy("name");setNameError("");setNameMessage("");try{const value=await updateMyProfile(name.trim());if(alive.current){setProfile(value);setName(value.displayName);onSaved(value);setNameMessage("نام شما ذخیره شد.");}}catch(cause){if(alive.current){setNameError(errorText(cause));if(cause instanceof ApiError&&cause.status===401)onSessionExpired();}}finally{if(alive.current)setBusy(null);}}
 async function savePassword(event:FormEvent){event.preventDefault();if(busy||uncertain)return;setPasswordError("");setPasswordMessage("");if(newPassword!==confirmation){setPasswordError("تکرار رمز جدید با رمز جدید یکسان نیست.");return;}if(newPassword===currentPassword){setPasswordError("رمز جدید را متفاوت از رمز فعلی انتخاب کنید.");return;}
 setBusy("password");try{await changePassword(currentPassword,newPassword);if(alive.current){setCurrentPassword("");setNewPassword("");setConfirmation("");setPasswordMessage("رمز عبور تغییر کرد. نشست‌های دیگر بسته شدند؛ ورود شما در این دستگاه برقرار است.");}}
 catch(cause){if(alive.current){const unknown=!(cause instanceof ApiError)||(cause.status>=500 || cause.status === 408);if(unknown){setUncertain(true);setCurrentPassword("");setNewPassword("");setConfirmation("");}
 setPasswordError(unknown?"نتیجهٔ تغییر رمز مشخص نشد. پیش از تلاش دوباره، از حساب خارج شوید و ورود با رمز جدید را بررسی کنید؛ اگر پذیرفته نشد، رمز قبلی را امتحان کنید.":cause instanceof ApiError&&cause.code==="CURRENT_PASSWORD_INVALID"?"رمز فعلی درست نیست.":cause instanceof ApiError&&cause.code==="PASSWORD_UNCHANGED"?"رمز جدید باید با رمز فعلی متفاوت باشد.":cause instanceof ApiError&&cause.code==="PASSWORD_CHANGED"?"رمز در درخواست دیگری تغییر کرده است؛ جزئیات پروفایل را ببندید و دوباره بررسی کنید.":errorText(cause));if(cause instanceof ApiError&&cause.status===401)onSessionExpired();}}
 finally{if(alive.current)setBusy(null);}
 }
 return <FormDrawer title="پروفایل من" busy={Boolean(busy)} onClose={onClose}><div className="user-profile-panel">
 <div className="user-profile-heading"><span className="user-profile-avatar" aria-hidden="true">{profile.displayName.slice(0,1)||"ر"}</span><div><h3>{profile.displayName}</h3><p>حساب کاربری رانیار</p></div></div>
 <nav className="profile-sections" aria-label="بخش‌های پروفایل">
 {profileSections.filter(item=>item.id!=="store"||business).filter(item=>item.id!=="subscription"||subscriptionInfo).map(item=>
 <button type="button" key={item.id} aria-current={section===item.id?"page":undefined} disabled={Boolean(busy)} onClick={()=>onSectionChange(item.id)}>{item.label}</button>)}
 </nav>
 {section==="notifications"&&notifications}
 {section==="subscription"&&subscriptionInfo}
 {section==="rewards"&&<><ReferralPanel key={user.id}/>{challenges}</>}
 {section==="account"&&(loading?<p role="status">در حال دریافت اطلاعات حساب…</p>:loadError?<div className="notice error" role="alert">{loadError}<button className="text-button" onClick={()=>setRevision(x=>x+1)}>تلاش دوباره</button></div>:<>
 <section className="user-profile-section"><h3>اطلاعات من</h3><form onSubmit={saveName}><label htmlFor="profile-name">نام و نام خانوادگی<input id="profile-name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>{setName(e.target.value);setNameMessage("");}} disabled={Boolean(busy)}/></label><dl className="user-profile-contacts"><div><dt>شماره موبایل</dt><dd><bdi>{profile.phone||"ثبت نشده"}</bdi>{profile.phone&&<small>{profile.phoneVerifiedAt?"تأییدشده":"تأیید نشده"}</small>}</dd></div><div><dt>ایمیل</dt><dd><bdi>{profile.email||"ثبت نشده"}</bdi>{profile.email&&<small>{profile.emailVerifiedAt?"تأییدشده":"تأیید نشده"}</small>}</dd></div></dl>
 {nameError&&<p className="notice error" role="alert">{nameError}</p>}{nameMessage&&<p className="notice success" role="status">{nameMessage}</p>}<button className="primary" disabled={Boolean(busy)||name.trim()===profile.displayName||name.trim().length<2}>{busy==="name"?"در حال ذخیره…":"ذخیره نام"}</button></form></section>
 <details className="user-profile-section"><summary>تغییر رمز عبور</summary><form onSubmit={savePassword}><label htmlFor="profile-current-password">رمز فعلی<input id="profile-current-password" type="password" dir="ltr" autoComplete="current-password" required minLength={12} maxLength={128} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} disabled={Boolean(busy)||uncertain}/></label><label htmlFor="profile-new-password">رمز جدید<input id="profile-new-password" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)} disabled={Boolean(busy)||uncertain}/></label><label htmlFor="profile-confirm-password">تکرار رمز جدید<input id="profile-confirm-password" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={Boolean(busy)||uncertain}/></label><small className="muted">حداقل ۱۲ کاراکتر؛ پس از تغییر، از دستگاه‌های دیگر خارج می‌شوید.</small>
 {passwordError&&<p className="notice error" role="alert">{passwordError}</p>}{passwordMessage&&<p className="notice success" role="status">{passwordMessage}</p>}<button className="primary" disabled={Boolean(busy)||uncertain}>{busy==="password"?"در حال تغییر رمز…":"تغییر رمز"}</button></form></details>
 </>)}
 {section==="store"&&business&&<section className="user-profile-section">
  <h3>اطلاعات فروشگاه</h3>
  <form onSubmit={saveBusiness}>
   <label htmlFor="profile-business-name">نام فروشگاه
    <input id="profile-business-name" required minLength={2} maxLength={120} value={businessName} disabled={Boolean(busy)}
     onChange={e=>{setBusinessName(e.target.value);setBusinessError("");setBusinessMessage("");}}/>
   </label>
   {businessError&&<p className="notice error" role="alert">{businessError}</p>}
   {businessMessage&&<p className="notice success" role="status">{businessMessage}</p>}
   <button className="primary" disabled={Boolean(busy)||businessName.trim().length<2||businessName.trim()===business.name}>
    {busy==="business"?"در حال ذخیره…":"ذخیره نام فروشگاه"}
   </button>
  </form>
 </section>}
<button type="button" className="secondary" onClick={onClose} disabled={Boolean(busy)}>بستن پروفایل</button></div></FormDrawer>;
}
