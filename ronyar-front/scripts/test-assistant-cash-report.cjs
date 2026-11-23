const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const ts=require('typescript');const root=path.resolve(__dirname,'..');
const original=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('.')&&parent?.filename.startsWith(root)){
  const base=path.resolve(path.dirname(parent.filename),request);
  for(const ext of ['.ts','.tsx'])if(fs.existsSync(base+ext))return base+ext;
 }
 return original.call(this,request,parent,...rest);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
require.extensions['.css']=()=>{};

const {planCashReport,summarizeCash,fetchCashReport}=require('../src/cashReportPlan.ts');
const api=require('../src/api.ts');
const today='2026-10-23';let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
for(const message of ['امروز چقدر دریافت کردم؟','پرداخت‌های این ماه را نشان بده','نمودار دریافت و پرداخت این هفته','گزارش دریافت دیروز','گزارش پرداخت از ۱۴۰۵/۰۷/۰۱ تا ۱۴۰۵/۰۷/۳۰'])check(message,()=>assert.ok(planCashReport(message,today).plan));
for(const message of ['ثبت پرداخت','ثبت دریافت','از سینا ۵۰۰ تومان دریافت کردم امروز','نمودار فروش این ماه','۲ تا پفک خریدم'])check('preserve '+message,()=>assert.equal(planCashReport(message,today),null));
for(const message of ['گزارش دریافت امروز سینا','گزارش پرداخت امروز صندوق اصلی','گزارش دریافت امروز دیروز','گزارش دریافت از 2026-02-30 تا 2026-03-01','گزارش دریافت این ماه را با ماه قبل مقایسه کن'])check('clarify '+message,()=>assert.ok(planCashReport(message,today).clarification));
const plan=planCashReport('نمودار دریافت و پرداخت امروز',today).plan;
const row=(id,direction,amount,date=today)=>({id,direction,amount,documentDate:date,currency:'IRR',status:'POSTED'});
const rows=[row('1','RECEIPT','500000'),row('2','DISBURSEMENT','100000'),row('3','RECEIPT','7','2026-10-22')];
check('cash result',()=>{const s=summarizeCash(rows,plan,'IRR');assert.equal(s.net,'400000');assert.equal(s.receiptCount,1);assert.equal(s.paymentCount,1);assert.equal(s.days.length,1)});
check('exact large decimal',()=>assert.equal(summarizeCash([row('a','RECEIPT','999999999999999999.123456'),row('b','DISBURSEMENT','0.123455')],plan,'IRR').net,'999999999999999999.000001'));
check('negative flow',()=>assert.equal(summarizeCash([row('a','DISBURSEMENT','10')],plan,'IRR').net,'-10'));
check('empty',()=>assert.equal(summarizeCash([],plan,'IRR').net,'0'));
check('receipt filter',()=>assert.equal(summarizeCash(rows,{...plan,direction:'RECEIPT'},'IRR').outgoing,'0'));
for(const extra of [{status:'DRAFT'},{currency:'USD'},{amount:'NaN'},{amount:'-1'},{amount:'0'},{documentDate:'2026-02-30'},{direction:'TRANSFER'}])check('reject '+JSON.stringify(extra),()=>assert.throws(()=>summarizeCash([{...rows[0],...extra}],plan,'IRR')));
(async()=>{
const signal=new AbortController().signal;
api.listPayments=async(b,d,s,p)=>{assert.equal(b,'tenant');assert.equal(d,'ALL');assert.equal(s,'POSTED');return {page:p,total:2,totalPages:2,items:[rows[p-1]]}};
assert.equal((await fetchCashReport('tenant',plan,'IRR',signal)).net,'400000');checks++;console.log('PASS pagination and tenant scope');
for(const bad of [{page:2,total:1,totalPages:1,items:[rows[0]]},{page:1,total:2,totalPages:1,items:[rows[0]]},{page:1,total:2,totalPages:1,items:[rows[0],rows[0]]},{page:1,total:1,totalPages:201,items:[rows[0]]}]){api.listPayments=async()=>bad;await assert.rejects(fetchCashReport('tenant',plan,'IRR',signal));checks++;}
const c=new AbortController();c.abort();await assert.rejects(fetchCashReport('tenant',plan,'IRR',c.signal));checks++;
console.log('PASS '+checks+' checks');
})().catch(e=>{console.error(e);process.exitCode=1});
