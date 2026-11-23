/** Pure language layer. No lookup, identity inference, financial arithmetic or writes. */
const numberWords:Record<string,number>={یک:1,یه:1,دو:2,سه:3,چهار:4,پنج:5,شش:6,هفت:7,هشت:8,نه:9,ده:10,یازده:11,دوازده:12,سیزده:13,چهارده:14,پانزده:15,شانزده:16,هفده:17,هجده:18,نوزده:19,بیست:20,سی:30,چهل:40,پنجاه:50,شصت:60,هفتاد:70,هشتاد:80,نود:90,صد:100,دویست:200,سیصد:300,چهارصد:400,پانصد:500,ششصد:600,هفتصد:700,هشتصد:800,نهصد:900};
function wordsNumber(s:string):string|null{
 const parts=s.split(' و ');let total=0,last=1000;
 for(const part of parts){if(part==='نیم'){if(parts.length>2)return null;return String(total+0.5);}const n=numberWords[part];if(!n||n>=last)return null;total+=n;last=n;}
 return total>0?String(total):null;
}
export function languageText(text:string):string{
 let t=text.normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g,'.').replace(/[\u200c\s]+/g,' ').trim().replace(/[؟?!]+$/,'').trim();
 t=t.replace(/^(?:سلام[،,]? )?(?:لطفا|لطفاً|میشه|می شه|میتونی|می تونی|ممکنه) /,'').replace(/^سلام[،,]? /,'');
 t=t.replace(/(?:^| )(چقد|چقده|چقدره)(?= |$)/g,(_,v)=>' '+(v==='چقد'?'چقدر':'چقدره')).trim();
 // Only numeric positions: never rewrite number words in a person's/product's name.
 const words=Object.keys(numberWords).concat('نیم').join('|');
 const re=new RegExp(`(^| )((?:${words})(?: و (?:${words})){0,3})(?= (?:هزار|میلیون|میلیارد|تومان|تومن|ریال|تا|عدد)(?: |$))`,'g');
 t=t.replace(re,(all,space,raw)=>{const n=wordsNumber(raw);return n?space+n:all;});
 return t.replace(/ +/g,' ').trim();
}
/** Report-only aliases; does not turn an assertion/transaction into a report. */
export function reportLanguage(text:string):string{
 let t=languageText(text).replace(/هفته پیش/g,'هفته قبل').replace(/ماه پیش/g,'ماه قبل').replace(/هفته جاری/g,'این هفته').replace(/ماه جاری/g,'این ماه');
 if(/چقدر|چقدره|گزارش|نمودار/.test(t))t=t.replace(/فروخت(?:م|یم)/g,'فروش').replace(/خرید(?:م|یم)/g,'خرید').replace(/(?:^| )چقدره(?= |$)/g,' چقدر').replace(/داشتم|داشتیم/g,'');
 return t.replace(/ +/g,' ').trim();
}
export function transactionLanguage(text:string):string{
 return languageText(text).replace(/فروخته ام|فروخته ایم|به فروش رساندم/g,'فروختم').replace(/خریده ام|خریده ایم|خریداری کردم|خریداری کردیم/g,'خریدم').replace(/دریافت نمودم|دریافت کردیم/g,'دریافت کردم').replace(/پرداخت نمودم|پرداخت کردیم|واریز کردم/g,'پرداخت کردم');
}
