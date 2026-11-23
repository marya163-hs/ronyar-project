import {languageText} from './assistantLanguage';
export type PartyConversation={businessId:string;partyId:string;partyName:string};
export type PartyFollowup={kind:'ledger';party:PartyConversation}|{kind:'clarify';message:string};
/** Pronouns refer only to the last resolved person, never a candidate list. */
export function planPartyFollowup(text:string,context:PartyConversation|null,businessId:string,canRead:boolean):PartyFollowup|null{
 const t=languageText(text).normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').replace(/[؟?!.،]/g,' ').replace(/\s+/g,' ').trim().replace(/^(?:لطفا|لطفاً) /,'');
 const commands=/^(?:ریز حسابشو نشون بده|صورت حسابشو نشون بده|گردش حسابشو نشون بده|ریز حسابش رو بیار|ریز حسابش رو باز کن|صورت حسابش رو باز کن|ریز حسابش رو بفرست|ریز حسابش|ریز حساب او|ریز حساب همین شخص|صورت حسابش|صورت حساب او|صورت حساب همین شخص|گردش حسابش|ریز حسابش رو نشون بده|ریز حسابش را نشان بده|صورت حسابش رو نشون بده|صورت حسابش را نشان بده|گردش حسابش رو نشون بده|گردش حسابش را نشان بده|ریز حساب او را نشان بده|ریز حساب همین شخص را نشان بده)$/;
 if(!commands.test(t)){
  if(/(?:ریز|گردش|صورت) حساب(?:ش| او| همین شخص)/.test(t))return {kind:'clarify',message:'برای باز کردن صورت‌حساب همان شخص بنویسید «ریز حسابش رو نشون بده». بازهٔ تاریخ را داخل صورت‌حساب انتخاب کنید.'};
  return null;
 }
 if(!canRead)return {kind:'clarify',message:'دسترسی صورت‌حساب اشخاص را ندارید.'};
 if(!context||context.businessId!==businessId||!context.partyId||!context.partyName)return {kind:'clarify',message:'ابتدا شخص را مشخص کنید؛ مثلاً بنویسید «مانده حساب سینا چقدره؟» و اگر چند نتیجه بود، شخص را انتخاب کنید.'};
 return {kind:'ledger',party:context};
}
