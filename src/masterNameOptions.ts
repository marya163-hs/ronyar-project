import { listProducts, listParties } from './api';
import { invoiceSearchText } from './invoiceSearch';
export type MasterNameOption={id:string;name:string;isActive:boolean;code?:string;customerEnabled?:boolean;supplierEnabled?:boolean};
export async function loadMasterNameOptions(businessId:string,kind:'PRODUCT'|'PARTY',signal:AbortSignal):Promise<MasterNameOption[]> {
 const items:MasterNameOption[]=[],ids=new Set<string>();let expected:number|undefined;
 for(let page=1;page<=500;page++){
  signal.throwIfAborted();const r=kind==='PRODUCT'?await listProducts(businessId,'ALL',page,signal):await listParties(businessId,'ALL','ALL',page,signal);signal.throwIfAborted();
  if(!Number.isInteger(r.total)||r.total<0||!Number.isInteger(r.totalPages)||r.totalPages<0||!Array.isArray(r.items)||(expected!==undefined&&expected!==r.total))throw Error('INCOMPLETE_NAME_OPTIONS');
  expected=r.total;
  for(const row of r.items){if(!row.id||typeof row.name!=='string'||ids.has(row.id))throw Error('INCOMPLETE_NAME_OPTIONS');ids.add(row.id);items.push(row);}
  if(page>=r.totalPages){if(items.length!==expected)throw Error('INCOMPLETE_NAME_OPTIONS');return items;}
 }
 throw Error('INCOMPLETE_NAME_OPTIONS');
}
export function similarMasterNames(rows:readonly MasterNameOption[],name:string,excludeId?:string){
 const q=invoiceSearchText(name);if(q.length<2)return [];
 return rows.filter(r=>r.id!==excludeId&&invoiceSearchText(r.name).includes(q)).sort((a,b)=>Number(invoiceSearchText(b.name)===q)-Number(invoiceSearchText(a.name)===q)||a.name.localeCompare(b.name,'fa'));
}
