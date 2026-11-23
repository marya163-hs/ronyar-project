import type { Business } from './api';
import type { ReportOutput } from './reportOutput';
import { storeMoneyValue, usesToman } from './storeMoney';
/** Counts, quantities, codes and document numbers are never monetary cells. */
export function moneyReportOutput(output:ReportOutput,business?:Business):ReportOutput {
 if(!usesToman(business))return output;
 const monetary=(label:string)=>label!=='واحد'&&!/(تعداد|شماره|کد|ردیف|مقدار|نرخ|درصد)/.test(label)&&/(قیمت|مبلغ|مانده|بدهکار|بستانکار|فروش|خرید|برگشت|خالص|ارزش|دارایی|بدهی|هزینه|درآمد|سود|زیان|سرمایه|حقوق مالکانه|افزایش|کاهش|گردش|تسویه|دریافت|پرداخت|اعتبار|اختلاف)/.test(label);
 const convert=(cell:ReportOutput['rows'][number][number],label:string)=>cell.numeric&&monetary(label)?{...cell,value:storeMoneyValue(business,cell.value)}:{...cell};
 return {...output,scope:output.scope.map(s=>s.replace(/ریال/g,'تومان')),rows:output.rows.map(row=>row.map((cell,i)=>convert(cell,output.columns[i]??''))),summary:output.summary.map(s=>({...s,cell:convert(s.cell,s.label)}))};
}
