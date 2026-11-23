import type { Business } from './api';
type MoneyStore = Pick<Business,'baseCurrency'|'moneyUnit'> | null | undefined;
/** Decimal point shifts only. No Number conversion or rounding of financial values. */
export function shiftMoney(value:string,places:number):string {
  if(!/^-?\d+(?:\.\d*)?$/.test(value))return value;
  const negative=value.startsWith('-'),raw=negative?value.slice(1):value,[whole,fraction='']=raw.split('.');
  const digits=whole+fraction,point=whole.length+places;
  const w=(point<=0?'0':point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)).replace(/^0+(?=\d)/,'');
  const f=(point<=0?'0'.repeat(-point)+digits:point>=digits.length?'':digits.slice(point)).replace(/0+$/,'');
  return (negative&&(w!=='0'||f)?'-':'')+w+(f?'.'+f:'');
}
export const usesToman=(b:MoneyStore)=>b?.baseCurrency==='IRR'&&b.moneyUnit==='TOMAN';
export const storeMoneyUnit=(b:MoneyStore)=>b?.baseCurrency==='IRR'?(usesToman(b)?'تومان':'ریال'):(b?.baseCurrency??'ریال');
export const storeMoneyValue=(b:MoneyStore,v:string)=>usesToman(b)?shiftMoney(v,-1):v;
export const canonicalMoneyInput=(b:MoneyStore,v:string)=>usesToman(b)&&/^\d+(?:\.\d*)?$/.test(v)?shiftMoney(v,1):v;
export function formatStoreMoney(b:MoneyStore,value:string):string {
 const v=storeMoneyValue(b,value),negative=v.startsWith('-'),clean=negative?v.slice(1):v,[whole,fraction]=clean.split('.');
 return ((negative?'−':'')+whole.replace(/\B(?=(\d{3})+(?!\d))/g,'٬')+(fraction?'٫'+fraction:'')).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
