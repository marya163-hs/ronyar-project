const key='ranyar.referral.v1',ttl=7*86400000;
export const normalizeReferralCode=(v:string)=>v.trim().toUpperCase();
export const validReferralCode=(v:string)=>/^[A-F0-9]{10}$/.test(v);
export function readReferralCode():string {
 try{
  const incoming=new URL(location.href).searchParams.get('ref');
  if(incoming!==null){const code=normalizeReferralCode(incoming);if(validReferralCode(code)){try{sessionStorage.setItem(key,JSON.stringify({code,at:Date.now()}));}catch{}return code;}sessionStorage.removeItem(key);return '';}
  const saved=JSON.parse(sessionStorage.getItem(key)??'null');
  if(saved&&typeof saved.code==='string'&&validReferralCode(saved.code)&&Number.isFinite(saved.at)&&saved.at<=Date.now()&&Date.now()-saved.at<ttl)return saved.code;
  sessionStorage.removeItem(key);
 }catch{/* Referral storage is optional; registration remains available. */}
 return '';
}
export function clearReferralCode(){try{sessionStorage.removeItem(key);}catch{}const url=new URL(location.href);url.searchParams.delete('ref');history.replaceState(null,'',url.pathname+url.search+url.hash);}
export function referralLink(code:string){const url=new URL('/',location.origin);url.searchParams.set('ref',code);url.hash='register';return url.toString();}
