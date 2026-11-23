import DesktopInstall from "./DesktopInstall";
import RaniWelcome from "./RaniWelcome";
import {readCouponCode,clearCouponCode} from './couponContext';
import {readReferralCode,normalizeReferralCode,clearReferralCode,validReferralCode} from './referralLink';
import { normalizeMobile, validMobile } from "./authIdentifier";
import { useEffect, useState } from "react";
import Brand from "./Brand";
import { ApiError, errorText, getPublicOptions, login, registerTrial, requestAuthSms, verifyAuthSms, resetPasswordBySms } from "./api";
import type { PublicOptions, User } from "./api";
import "./public-entry.css";
type Page = "home" | "login" | "register" | "demo";
const pages: Page[] = ["home","login","register","demo"];
const initialPage = ():Page => { const value=location.hash.slice(1) as Page;return pages.includes(value)?value:"home"; };
const lessons = [
 {title:"۱. یک فروش ساده",prompt:"دو بسته چای، هر بسته صد هزار تومان به سارا فروختم",answer:"پیش‌نویس فروش برای سارا",amount:"۲۰۰٬۰۰۰ تومان",detail:"۲ بسته چای × ۱۰۰٬۰۰۰ تومان",next:"آمادهٔ بررسی شما؛ ثبت قطعی با تأیید شما انجام می‌شود."},
 {title:"۲. دریافت از مشتری",prompt:"صد هزار تومان از سارا گرفتم و گذاشتم توی صندوق",answer:"پیشنهاد دریافت از سارا",amount:"۱۰۰٬۰۰۰ تومان",detail:"واریز به صندوق · تخصیص به فاکتور فروش",next:"قبل از ثبت، شخص، مبلغ و فاکتور را بررسی می‌کنید."},
 {title:"۳. یک گزارش روشن",prompt:"سارا چقدر بهم بدهکاره؟",answer:"ماندهٔ نمونهٔ سارا",amount:"۱۰۰٬۰۰۰ تومان",detail:"فروش ۲۰۰٬۰۰۰ − دریافت ۱۰۰٬۰۰۰ تومان",next:"در حساب واقعی، گزارش از ثبت‌های قطعی فروشگاه شما محاسبه می‌شود."}
];
const enamadSealHtml = "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=8744730&Code=qB106TkaCO2D1j63A3f0x59iJ5YU30c0'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=8744730&Code=qB106TkaCO2D1j63A3f0x59iJ5YU30c0' alt='' style='cursor:pointer' code='qB106TkaCO2D1j63A3f0x59iJ5YU30c0'></a>";

export default function PublicEntry({onLogin,sessionError}:{onLogin:(user:User)=>void;sessionError:string}) {
 const [page,setPage]=useState<Page>(initialPage),[options,setOptions]=useState<PublicOptions|null>(null),[optionError,setOptionError]=useState(false),[revision,setRevision]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),[displayName,setDisplayName]=useState(""),[storeName,setStoreName]=useState("");
 const [referral,setReferral]=useState(readReferralCode);
 const [coupon,setCoupon]=useState(readCouponCode);
 const [recover,setRecover]=useState(false);
 const [challenge,setChallenge]=useState("");
 const [code,setCode]=useState("");
 const [proof,setProof]=useState("");
 const [confirm,setConfirm]=useState("");
 const smsFlow=page==="register"||recover;
 function clearVerification(){setChallenge("");setCode("");setProof("");setConfirm("");}
 function beginRecovery(){setIdentifier(value=>validMobile(value)?value:"");setRecover(true);setPassword("");setError("");setNotice("");clearVerification();}
 function endRecovery(){setRecover(false);setPassword("");setError("");setNotice("");clearVerification();}
 const [lesson,setLesson]=useState(0),[revealed,setRevealed]=useState(false);
 function navigate(value:Page){location.hash=value==="home"?"":value;setPage(value);setRecover(false);clearVerification();setError("");setNotice("");setPassword("");window.scrollTo(0,0);}
 useEffect(()=>{const change=()=>{setPage(initialPage());setRecover(false);clearVerification();setError("");setPassword("");};window.addEventListener("hashchange",change);return()=>window.removeEventListener("hashchange",change);},[]);
 useEffect(()=>{const controller=new AbortController();setOptionError(false);getPublicOptions(controller.signal).then(setOptions).catch(()=>{if(!controller.signal.aborted)setOptionError(true);});return()=>controller.abort();},[revision]);
 async function getCode() {
  if(busy)return;
  setError("");setNotice("");
  if(!validMobile(identifier)){setError("شماره موبایل معتبر وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.");return;}
  setBusy(true);
  try {
   const result=await requestAuthSms(normalizeMobile(identifier),page==="register"?"register":"reset");
   setChallenge(result.challengeId);setCode("");setNotice("کد تأیید به شمارهٔ واردشده ارسال شد.");
  } catch(cause){setError(errorText(cause));}
  finally{setBusy(false);}
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;setError("");setNotice("");
  if(smsFlow&&!proof){
   if(!challenge){await getCode();return;}
   setBusy(true);
   try {
    const result=await verifyAuthSms(normalizeMobile(identifier),page==="register"?"register":"reset",challenge,code);
    setProof(result.proof);setCode("");setNotice("شمارهٔ موبایل تأیید شد.");
   } catch(cause){setError(errorText(cause));}
   finally{setBusy(false);}
   return;
  }
  if(recover&&password!==confirm){setError("تکرار رمز عبور با رمز جدید یکسان نیست.");return;}
  if(page==="register"&&referral&&!validReferralCode(normalizeReferralCode(referral))){setError("کد دعوت معتبر نیست؛ آن را اصلاح یا حذف کنید.");return;}
  setBusy(true);let registered=false;
  try {
   if(recover){
    await resetPasswordBySms(normalizeMobile(identifier),proof,password);
    endRecovery();setNotice("رمز عبور تغییر کرد. با رمز جدید وارد شوید.");return;
   }
   if(page==="register"){
    await registerTrial({displayName,phone:normalizeMobile(identifier),phoneProof:proof,password,storeName,...(referral.trim()?{referralCode:normalizeReferralCode(referral)}:{})});
    registered=true;clearReferralCode();setReferral("");clearVerification();
   }
   const user=await login(identifier,password);setPassword("");location.hash="";onLogin(user);
  }
  catch(cause){if(registered){setPage("login");location.hash="login";setPassword("");setNotice("حساب و فروشگاه ساخته شد. اکنون وارد حساب شوید.");}
   setError(cause instanceof ApiError && cause.status===401?"شماره موبایل، ایمیل یا رمز عبور درست نیست.":cause instanceof ApiError && cause.code==="REFERRAL_INVALID"?"کد دعوت معتبر یا فعال نیست؛ آن را اصلاح یا حذف کنید.":cause instanceof ApiError && cause.code==="REGISTRATION_CONFLICT"?"ثبت‌نام با این مشخصات انجام نشد. اگر حساب دارید، وارد شوید.":cause instanceof ApiError && cause.code==="REGISTRATION_CLOSED"?"ثبت‌نام آزمایشی فعلاً باز نیست؛ می‌توانید با نمونهٔ کار آشنا شوید.":cause instanceof ApiError && (cause.code==="AUTH_RATE_LIMIT" || cause.code==="AUTH_BUSY")?errorText(cause):errorText(cause));}
  finally{setBusy(false);}
 }
 const trialDays=options?.trialDays;
 const item=lessons[lesson];
 return <div className="public-entry" dir="rtl"><header className="public-header"><button className="public-brand-button" onClick={()=>navigate("home")} aria-label="صفحه اول رانیار"><Brand/></button><nav aria-label="منوی اصلی"><button className="public-login" onClick={()=>navigate(page==="login"?"register":"login")}>{page==="login"?"ساخت فروشگاه":"ورود به حساب"}<span aria-hidden="true"> ↗</span></button></nav></header>
 {page==="home"?<main className="public-home"><section className="public-hero" aria-labelledby="entry-title"><div className="public-hero-copy"><span className="public-eyebrow"><i aria-hidden="true"/> حسابداری، با یک همراه</span><h1 id="entry-title">حساب‌وکتابت،<br/><em>روشن و روبه‌راه.</em></h1><p>از اولین فروش تا گزارش آخر روز؛<br/>رانیار کنار شماست تا با خیال راحت‌تر به کسب‌وکارتان برسید.</p><div className="public-actions"><button className="primary" onClick={()=>navigate("login")}>ورود به حساب <span aria-hidden="true">←</span></button><button className="secondary" onClick={()=>navigate("register")}>ساخت فروشگاه</button></div><div className="public-android-download"><a className="public-android-link" href="/downloads/ranyar-pilot.apk" download="ranyar-pilot.apk"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>دانلود نسخه اندروید</a><span className="public-android-meta">فایل APK · حدود ۴٫۵ مگابایت</span><details className="public-android-help"><summary>راهنمای نصب روی گوشی</summary><p>پس از دانلود، فایل را باز کنید و مراحل نصب را دنبال کنید. اگر مرورگر پیام «File might be harmful» نشان داد، نام فایل و نشانی سایت را بررسی کنید؛ برای فایل رانیار از همین سایت، «Download anyway» ادامهٔ دانلود است.</p><p>اگر گوشی درخواست کرد، اجازهٔ نصب از این منبع را فقط برای مرورگری که با آن دانلود کرده‌اید فعال کنید. در مرورگر داخل اینستاگرام، در صورت مشکل، لینک را در مرورگر اصلی گوشی باز کنید.</p></details></div><DesktopInstall/><button className="public-example-link" onClick={()=>navigate("demo")}>رانی چطور کمک می‌کند؟ <span aria-hidden="true">←</span></button></div><RaniWelcome/><div className="public-capabilities" aria-label="امکانات اصلی"><span>خرید و فروش</span><i aria-hidden="true"/><span>صندوق و بانک</span><i aria-hidden="true"/><span>موجودی و گزارش</span></div></section><section className="public-principle"><span className="public-section-number" aria-hidden="true">۰۱ /</span><div><h2>شما تصمیم می‌گیرید. رانی همراهی می‌کند.</h2><p>دستیار، پیش‌نویس را آماده می‌کند؛ شما جزئیات را بررسی و ثبت نهایی را تأیید می‌کنید.</p></div><button className="public-example-link" onClick={()=>navigate("demo")}>یک نمونه ببینید <span aria-hidden="true">←</span></button></section></main>:
 page==="demo"?<main className="public-demo"><button className="public-back" onClick={()=>navigate("home")}>→ بازگشت</button><div className="public-section-heading"><span className="public-eyebrow">یک نمونهٔ کوتاه</span><h1>شما می‌گویید، رانی کمک می‌کند.</h1><p>این فقط یک نمونهٔ آموزشی است؛ هیچ اطلاعاتی ثبت نمی‌شود.</p></div><div className="public-demo-tabs" role="group" aria-label="انتخاب نمونه">{lessons.map((l,i)=><button key={l.title} aria-pressed={lesson===i} onClick={()=>{setLesson(i);setRevealed(false);}}>{l.title.slice(3)}</button>)}</div><section className="public-demo-stage"><div className="public-chat-label">شما</div><div className="public-chat-user">{item.prompt}</div>{!revealed?<button className="secondary public-demo-reveal" onClick={()=>setRevealed(true)}>دیدن پاسخ نمونه <span aria-hidden="true">←</span></button>:<div className="public-invoice" role="status"><span>{item.answer}</span><strong>{item.amount}</strong><p>{item.detail}</p><p className="public-invoice-note">{item.next}</p></div>}</section><p className="public-demo-disclaimer">این نمونه به حساب واقعی یا سرویس هوش مصنوعی متصل نیست.</p><div className="public-demo-bottom"><button className="primary" onClick={()=>navigate("register")}>ساخت فروشگاه</button><button className="public-example-link" onClick={()=>navigate("login")}>حساب دارم؛ ورود ←</button></div></main>:
 <main className={"public-auth public-auth--"+page}><section className="public-auth-story"><RaniWelcome compact/><div><span className="public-eyebrow">رانی، همراه حساب شما</span><h1>{page==="login"?"خوش برگشتید.":"شروع یک حساب روشن."}</h1><p>{page==="login"?"ادامهٔ کارهای فروشگاه، از همین‌جا.":"فروشگاه خودتان را بسازید و قدم‌به‌قدم شروع کنید."}</p></div></section><section className="public-auth-panel" aria-labelledby="auth-title"><span className="public-panel-kicker">{page==="login"?"حساب شما":"شروع با رانیار"}</span><h2 id="auth-title">{recover?"بازیابی رمز عبور":page==="login"?"ورود به رانیار":"ساخت حساب و فروشگاه"}</h2><p className="public-auth-intro">{recover?"شمارهٔ موبایل تأییدشدهٔ حساب را وارد کنید.":page==="login"?"با شماره موبایل یا ایمیل ثبت‌شده وارد شوید.":"ابتدا شمارهٔ موبایل خود را تأیید کنید."}</p>{coupon&&<details className="public-code-notice"><summary>کد تخفیف همراه شماست</summary><p>کد <b dir="ltr" style={{overflowWrap:"anywhere"}}>{coupon}</b> برای بررسی هنگام خرید اشتراک نگه داشته می‌شود.</p><button type="button" className="text-button" onClick={()=>{clearCouponCode();setCoupon('');}}>حذف کد</button></details>}{page==="register"&&<p className="public-trial-note">{trialDays?`${new Intl.NumberFormat("fa-IR").format(trialDays)} روز استفادهٔ آزمایشی · بدون پرداخت خودکار`:"در حال دریافت شرایط ثبت‌نام…"}</p>}
 {page==="register"&&optionError?<div className="notice" role="alert">دریافت وضعیت ثبت‌نام انجام نشد.<button className="text-button" onClick={()=>setRevision(x=>x+1)}>تلاش دوباره</button></div>:page==="register"&&options&&!options.registrationEnabled?<div className="notice">ثبت‌نام آزمایشی فعلاً باز نیست. می‌توانید نمونهٔ کار دستیار را ببینید.<button className="primary" onClick={()=>navigate("demo")}>دیدن نمونه</button></div>:<form onSubmit={submit}>
 <label htmlFor="public-identifier">{smsFlow?"شماره موبایل":"شماره موبایل یا ایمیل"}<input id="public-identifier" type={smsFlow?"tel":"text"} dir="ltr" autoComplete="username" placeholder={smsFlow?"09121234567":undefined} required maxLength={254} value={identifier} onChange={e=>setIdentifier(e.target.value)} disabled={busy||Boolean(challenge)}/></label>
 {smsFlow&&challenge&&!proof&&<label htmlFor="public-sms-code">کد ۶ رقمی پیامک<input id="public-sms-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/[۰-۹٠-٩]/g,digit=>String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit)%10)).replace(/[^0-9]/g,""))}/></label>}
 {smsFlow&&challenge&&<button type="button" className="text-button" disabled={busy} onClick={()=>{clearVerification();setPassword("");setNotice("");setError("");}}>تغییر شماره یا دریافت کد جدید</button>}
 {page==="register"&&proof&&<><label htmlFor="public-name">نام و نام خانوادگی<input id="public-name" autoComplete="name" required minLength={2} maxLength={100} value={displayName} onChange={e=>setDisplayName(e.target.value)} disabled={busy}/></label><label htmlFor="public-store">نام فروشگاه<input id="public-store" autoComplete="organization" required minLength={2} maxLength={100} value={storeName} onChange={e=>setStoreName(e.target.value)} disabled={busy}/></label></>}
 {(!smsFlow||proof)&&<label htmlFor="public-password">{recover?"رمز عبور جدید":"رمز عبور"}<input id="public-password" type="password" dir="ltr" autoComplete={smsFlow?"new-password":"current-password"} required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>}
 {recover&&proof&&<label htmlFor="public-password-confirm">تکرار رمز عبور جدید<input id="public-password-confirm" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label>}
 {smsFlow&&proof&&<small>رمز عبور حداقل ۱۲ کاراکتر باشد.</small>}
 {page==="login"&&!recover&&<button type="button" className="text-button" disabled={busy} onClick={beginRecovery}>رمز عبور را فراموش کرده‌ام</button>}
 {recover&&<button type="button" className="text-button" disabled={busy} onClick={endRecovery}>بازگشت به ورود</button>}
 {page==="register"&&proof&&<details open={Boolean(referral)}><summary>کد دعوت (اختیاری)</summary><label htmlFor="public-referral">کد معرف<input id="public-referral" dir="ltr" autoComplete="off" maxLength={10} value={referral} onChange={e=>setReferral(normalizeReferralCode(e.target.value))} disabled={busy}/></label>{referral&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setReferral('');clearReferralCode();}}>حذف کد دعوت</button>}<small style={{display:"block"}}>کد معرف فقط هنگام ثبت‌نام ثبت می‌شود و بعداً تغییر نمی‌کند.</small></details>}
 {notice&&<p className="notice" role="status">{notice}</p>}{(error||sessionError)&&<p className="notice error" role="alert">{error||sessionError}</p>}<button className="primary" disabled={busy||(page==="register"&&!options?.registrationEnabled)}>{busy?"در حال انجام…":smsFlow&&!proof?(challenge?"تأیید کد پیامک":"دریافت کد پیامکی"):recover?"ذخیرهٔ رمز جدید":page==="login"?"ورود به حساب":"ساخت فروشگاه و شروع آزمایشی"}</button></form>}
 <div className="public-auth-switch"><span>{page==="login"?"تازه با رانیار آشنا شده‌اید؟":"از قبل حساب دارید؟"}</span><button className="text-button" disabled={busy} onClick={()=>navigate(page==="login"?"register":"login")}>{page==="login"?"ساخت فروشگاه":"ورود به حساب"}</button></div></section></main>}
 <footer className="public-footer"><span>رانیار · همراه حساب شما</span><span className="public-footer-dot" aria-hidden="true"/><button onClick={()=>navigate(page==="demo"?"home":"demo")}>{page==="demo"?"صفحهٔ اول":"آشنایی با رانی"}</button><span className="public-footer-address" lang="en" dir="ltr">ronyar.ir</span><span dangerouslySetInnerHTML={{__html:enamadSealHtml}}/></footer></div>;
}
