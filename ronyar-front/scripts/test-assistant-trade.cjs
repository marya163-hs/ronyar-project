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
const {planTrade,tradeRange}=require('../src/assistantTradePlan.ts');
const today='2026-10-23';let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const context={kind:'sales',range:tradeRange('این ماه',today),chart:false};
check('Persian current month to Tehran today',()=>assert.deepEqual(context.range,{fromDate:'2026-10-23',toDate:today,label:'این ماه شمسی تا امروز'}));
check('Persian previous full month',()=>assert.deepEqual(tradeRange('ماه قبل',today),{fromDate:'2026-09-23',toDate:'2026-10-22',label:'ماه قبل (کامل شمسی)'}));
check('Saturday week start',()=>assert.equal(tradeRange('این هفته',today).fromDate,'2026-10-17'));
check('previous full week',()=>assert.equal(tradeRange('هفته قبل',today).toDate,'2026-10-16'));
check('year boundary previous month',()=>assert.equal(tradeRange('ماه قبل','2026-03-21').fromDate,'2026-02-20'));
check('sale report intent',()=>assert.equal(planTrade('گزارش فروش امروز',today,null).plan.kind,'sales'));
check('purchase chart',()=>assert.equal(planTrade('نمودار خرید این هفته',today,null).plan.chart,true));
check('followup period keeps kind',()=>assert.equal(planTrade('حالا ماه قبل',today,context).plan.kind,'sales'));
check('followup chart keeps range',()=>assert.deepEqual(planTrade('نمودارش کن',today,context).plan.range,context.range));
check('explicit two-period comparison',()=>assert.ok(planTrade('فروش این ماه را با ماه قبل مقایسه کن',today,null).plan.compare));
check('context comparison',()=>assert.deepEqual(planTrade('با ماه قبل مقایسه کن',today,context).plan.range,context.range));
check('Persian date digits',()=>assert.equal(planTrade('فروش از ۱۴۰۵/۰۷/۰۱ تا ۱۴۰۵/۰۷/۳۰',today,null).plan.range.fromDate,'2026-09-23'));
check('Gregorian range',()=>assert.equal(planTrade('خرید از 2026-10-01 تا 2026-10-23',today,null).plan.range.toDate,today));
for(const input of ['فروش از ۱۴۰۵/۰۷/۳۱ تا ۱۴۰۵/۰۸/۰۱','فروش از 2026-02-30 تا 2026-03-01','فروش از 2026-10-23 تا 2026-10-01','فروش از 2020-01-01 تا 2026-01-01','فروش امروز فقط نقدی','فروش امروز سینا','فروش امروز دیروز','فروش این ماه با ماه قبل','فروش و خرید امروز','فروش'])check('clarifies '+input,()=>assert.ok(planTrade(input,today,null).clarification));
check('no context no guess',()=>assert.equal(planTrade('حالا ماه قبل',today,null),null));
for(const input of ['۲ تا پفک از سینا خریدم','ثبت فروش','فاکتور خرید بساز','موجودی پفک','حالا سود این ماه'])check('preserves existing route '+input,()=>assert.equal(planTrade(input,today,context),null));
const {chartGeometry}=require('../src/DashboardSnapshotChart.tsx');
check('precise signed geometry',()=>assert.deepEqual(chartGeometry(['999999999999999999999999.1','-999999999999999999999999.1','0']),[100,-100,0]));
check('all zero',()=>assert.deepEqual(chartGeometry(['0','0.00']),[0,0]));
const api=require('../src/api.ts');
let response,record;api.readBusinessReport=async(...args)=>{record=args;return response;};
const {fetchTradeSnapshot}=require('../src/AssistantTradeReport.tsx');
const signal=new AbortController().signal;
const fixture=()=>({currency:'IRR',totalSales:'999999999999999999999.01',totalReturns:'0',netSales:'999999999999999999999.01',saleCount:1,total:1,totalPages:1,items:[{documentDate:today,netAmount:'999999999999999999999.01'}]});
(async()=>{
 response=fixture();const result=await fetchTradeSnapshot('store-a','sales',tradeRange('امروز',today),signal);
 check('exact huge amount preserved',()=>assert.equal(result.net,response.netSales));
 check('business and export scoped',()=>{assert.equal(record[0],'store-a');assert.equal(record[1],'reports/sales/export');assert.equal(record[2].get('fromDate'),today);assert.equal(record[3],signal);});
 for(const [name,mutate] of [
 ['incomplete',x=>x.total=2],['multiple pages',x=>x.totalPages=2],['invalid decimal',x=>x.netSales='NaN'],['wrong day',x=>x.items[0].documentDate='2025-01-01'],['duplicate days',x=>{x.items.push(x.items[0]);x.total=2;}]
 ]){response=fixture();mutate(response);await assert.rejects(fetchTradeSnapshot('store-a','sales',tradeRange('امروز',today),signal));checks++;console.log('PASS rejects '+name);}
 response={currency:'IRR',totalPurchases:'10',totalReturns:'2',netPurchases:'8',purchaseCount:1,total:0,totalPages:0,items:[]};
 const purchase=await fetchTradeSnapshot('store-b','purchases',tradeRange('دیروز',today),signal);check('purchase contract and route',()=>{assert.equal(purchase.net,'8');assert.equal(record[1],'reports/purchases/export');});
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const View=require('../src/AssistantTradeReport.tsx').default;
 const html=renderToStaticMarkup(React.createElement(View,{answer:{plan:{...context,chart:true},current:result,receivedAt:'QA'}}));
 check('accessible rendered report and signed chart',()=>{assert.ok(html.includes('پاسخ گزارش فروش'));assert.ok(html.includes('<svg'));assert.ok(html.includes('فقط اسناد قطعی'));});
 console.log(`PASS ${checks} checks`);
})().catch(e=>{console.error(e);process.exitCode=1;});
