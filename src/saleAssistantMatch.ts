import type { SaleSuggestion, Party, Product } from "./api";
export const assistantName=(s:string)=>s.normalize("NFKC").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/آ/g,"ا").replace(/ي/g,"ی").replace(/ك/g,"ک").replace(/[\u200c\s]+/g," ").trim().toLocaleLowerCase("fa");
export function exactAssistantMatch<T extends {id:string;name:string}>(items:T[],name:string|null):string {
  if(!name)return "";const matches=items.filter(x=>assistantName(x.name)===assistantName(name));return matches.length===1?matches[0].id:"";
}
function unique<T extends {id:string}>(items:T[]):string {const ids=[...new Set(items.map(x=>x.id))];return ids.length===1?ids[0]:"";}
export function assistantCustomerMatch(customers:Party[],name:string|null):string {
  if(!name)return "";
  const n=assistantName(name);
  // A cash customer is a designated catalog role, not a guess from a person's surname.
  if(["نقدی","مشتری نقدی"].includes(n))return unique(customers.filter(p=>p.isCashCustomer));
  const strip=(s:string)=>assistantName(s).replace(/^مشتری\s+/,"");
  const exact=customers.filter(p=>strip(p.name)===strip(name));
  if(exact.length)return unique(exact);
  return assistantPhraseMatch(customers.filter(p=>!p.isCashCustomer),name,strip);
}
export function assistantPhraseMatch<T extends {id:string;name:string}>(items:T[],name:string|null,strip:(s:string)=>string):string {
  if(!name)return "";
  const query=strip(name),exact=items.filter(p=>strip(p.name)===query);
  if(exact.length)return unique(exact);
  // Whole words only: "آزمایشی" may match one item; "شیر" never matches "شیرینی".
  if(query.length<3)return "";
  return unique(items.filter(p=>(" "+strip(p.name)+" ").includes(" "+query+" ")));
}
export function assistantSupplierMatch(suppliers:Party[],name:string|null):string {
  return assistantPhraseMatch(suppliers,name,s=>assistantName(s).replace(/^(?:تأمین کننده|تامین کننده|تأمین‌کننده|تامین‌کننده|فروشنده)\s+/,""));
}
export function assistantProductMatch(products:Product[],name:string|null):string {
  if(!name)return "";
  const query=assistantName(name);
  const code=products.filter(p=>[p.code,p.barcode].some(v=>v&&assistantName(v)===query));
  if(code.length)return unique(code);
  return assistantPhraseMatch(products,name,s=>assistantName(s).replace(/^(?:کالای|کالا)\s+/,""));
}
export function assistantFormSeed(proposal:SaleSuggestion,customers:Party[],products:Product[]){
  return {partyId:assistantCustomerMatch(customers,proposal.customer),items:proposal.items.map(r=>({productId:assistantProductMatch(products,r.product),quantity:r.quantity??"",unitPrice:r.unitPrice??"",discountAmount:r.discountAmount??"0",taxRate:"0"}))};
}

// Candidate display is independent of automatic matching: the user selects the ID.
export function assistantProductCandidates(products:Product[],name:string|null):Product[]{
  const query=assistantName(name??"").replace(/^(?:کالای|کالا)\s+/,"");
  const tokens=query.split(" ").filter(Boolean);
  const matches=!tokens.length?products:products.filter(p=>{
    if([p.code,p.barcode].some(v=>v&&assistantName(v)===query))return true;
    const words=" "+assistantName(p.name)+" ";
    return tokens.every(token=>words.includes(" "+token+" "));
  });
  return [...new Map(matches.map(p=>[p.id,p])).values()];
}
