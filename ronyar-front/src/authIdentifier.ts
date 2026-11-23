/** Format normalization only; ownership requires separate SMS verification. */
export function normalizeMobile(value:string):string {
 const digits=value.trim().replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[\s()-]/g,"");
 if(/^09\d{9}$/.test(digits))return "+98"+digits.slice(1);
 if(/^989\d{9}$/.test(digits))return "+"+digits;
 return digits;
}
export function loginIdentifier(value:string):{email:string}|{phone:string} {
 return value.includes("@")?{email:value.trim().toLowerCase()}:{phone:normalizeMobile(value)};
}
export function validMobile(value:string):boolean{return /^\+989\d{9}$/.test(normalizeMobile(value));}
