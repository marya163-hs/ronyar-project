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

const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const {validatePartyRows,fetchPartyReport}=require('../src/partyReportData.ts');const api=require('../src/api.ts');
const Cash=require('../src/AssistantCashReport.tsx').default;
const Party=require('../src/AssistantPartyReport.tsx').default;
let checks=0;function check(name,f){f();checks++;console.log('PASS '+name);}
const row=(id,balance,name='شخص')=>({party:{id,name,isActive:true},totalDebit:balance.startsWith('-')?'0':balance,totalCredit:balance.startsWith('-')?balance.slice(1):'0',balance,balanceAmount:balance.replace(/^-/,''),balanceSide:balance==='0'?'ZERO':balance.startsWith('-')?'CREDIT':'DEBIT'});
const rows=[row('a','1000000'),row('b','-100000'),row('c','0')];
const data={currency:'IRR',role:null,periodId:null,asOfDate:null,page:1,totalPages:1,total:3,totalDebit:'1000000',totalCredit:'100000',netBalance:'900000',totalDebitBalance:'1000000',totalCreditBalance:'100000',items:rows};
check('exact net sides',()=>{const s=validatePartyRows(rows,data);assert.equal(s.debtors.length,1);assert.equal(s.creditors.length,1);assert.equal(s.receivable,'1000000')});
for(const bad of [{balanceSide:'CREDIT'},{balance:'999'},{balanceAmount:'NaN'},{totalCredit:'5'},{party:{id:'a',name:''}}])check('reject inconsistent '+JSON.stringify(bad),()=>assert.throws(()=>validatePartyRows([{...rows[0],...bad},...rows.slice(1)],data)));
check('reject wrong total',()=>assert.throws(()=>validatePartyRows(rows,{...data,totalDebitBalance:'1'})));
const snap=validatePartyRows(rows,data);
check('party perspective and escaping',()=>{const s=renderToStaticMarkup(React.createElement(Party,{answer:{side:'BOTH',snapshot:{...snap,debtors:[row('x','1','<script>')]},receivedAt:'now'}}));assert.ok(s.includes('طلب‌های شما از اشخاص'));assert.ok(s.includes('بدهی‌های شما به اشخاص'));assert.ok(s.includes('&lt;script&gt;'));});
const answer={plan:{direction:'ALL',range:{fromDate:'2026-10-23',toDate:'2026-10-23',label:'امروز'},chart:true},snapshot:{incoming:'500000',outgoing:'100000',net:'400000',receiptCount:1,paymentCount:1,days:[]},currency:'IRR',receivedAt:'now'};
check('distinct colors',()=>{const s=renderToStaticMarkup(React.createElement(Cash,{answer}));for(const c of ['#08734b','#a64b08','#175ca4'])assert.ok(s.includes(c));assert.ok(s.includes('تعداد دریافت: ۱'));});
check('negative net red',()=>assert.ok(renderToStaticMarkup(React.createElement(Cash,{answer:{...answer,snapshot:{...answer.snapshot,net:'-1'}}})).includes('#b42318')));
check('no chart help or empty details',()=>{const s=renderToStaticMarkup(React.createElement(Cash,{answer:{...answer,plan:{...answer.plan,chart:false}}}));assert.ok(!s.includes('میله‌ها'));assert.ok(!s.includes('گردش روزهای دارای سند'));assert.ok(s.includes('<summary>جزئیات گزارش</summary>'));});
// Test the actual backend classifier with a stub HTTP framework and mocked provider only.
const load=Module._load;class HttpException extends Error{constructor(body,status){super(JSON.stringify(body));this.status=status;this.body=body;}}
class BadGatewayException extends HttpException{constructor(b){super(b,502)}}class ServiceUnavailableException extends HttpException{constructor(b){super(b,503)}}
Module._load=function(id,parent,...rest){if(id==='@nestjs/common')return {Injectable:()=>x=>x,HttpException,BadGatewayException,ServiceUnavailableException};return load.call(this,id,parent,...rest)};
for(const name of ['party-report-direction.ts','party-report-intent.service.ts','party-report-intent.controller.ts','assistant.module.ts']){
 const file=path.resolve(root,'../backend/src/platform/ai',name);
 const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}});
 const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=>"\n"}));
}
const {explicitPartyDirection}=require('../../backend/src/platform/ai/party-report-direction.ts');
for(const text of ['کیا بهم بدهکارن؟','چه کسایی بهم بدهکارن؟','چه کسانی به من بدهکارند؟','از کی طلب دارم؟','ليست بدهکارامو بده','طلبام چقدره'])check('explicit receivable '+text,()=>assert.equal(explicitPartyDirection(text),'RECEIVABLES'));
for(const text of ['به کی بدهکارم؟','به کیا بدهکارم؟','چه کسایی از من طلب دارن؟','طلبکارام کیا هستن؟','بدهیامو نشون بده'])check('explicit payable '+text,()=>assert.equal(explicitPartyDirection(text),'PAYABLES'));
for(const text of ['کیا بهم بدهکارن دیروز','کیا بهم بدهکارن بالای یک میلیون','کیا بهم بدهکارن و به کیا بدهکارم','سینا بهم بدهکاره','بدهی سینا','ثبت دریافت','کیا بهم بدهکار نیستن؟'])check('no filter or perspective guess '+text,()=>assert.equal(explicitPartyDirection(text),null));
const {PartyReportIntentService,parsePartyReportIntent}=require('../../backend/src/platform/ai/party-report-intent.service.ts');
for(const intent of ['RECEIVABLES','PAYABLES','BOTH','CLARIFY','OTHER'])check('intent '+intent,()=>assert.equal(parsePartyReportIntent({intent,scope:'ALL_CURRENT'}),intent));
check('unsupported always clarifies',()=>assert.equal(parsePartyReportIntent({intent:'RECEIVABLES',scope:'UNSUPPORTED'}),'CLARIFY'));
for(const value of [null,{},[],{intent:'DELETE',scope:'ALL_CURRENT'},{intent:'BOTH',scope:'ALL_CURRENT',amount:'1'}])check('reject classifier schema',()=>assert.throws(()=>parsePartyReportIntent(value)));
const controller=fs.readFileSync(path.resolve(root,'../backend/src/platform/ai/party-report-intent.controller.ts'),'utf8');check('server permission and DTO limits',()=>{assert.ok(controller.includes("RequireBusinessPermission('journals.read')"));assert.ok(controller.includes('@MaxLength(4000)'));assert.ok(controller.includes('AccessGuard,BusinessPermissionGuard'));});
const {namedPartyReport}=require('../../backend/src/platform/ai/named-party-report.ts');
const {matchReportParties,resolveReportParties}=require('../src/partyReportData.ts');
for(const [text,intent,name] of [['از سینا چقدر طلب دارم؟','RECEIVABLES','سینا'],['به سینا گزیری چقدر بدهکارم؟','PAYABLES','سینا گزیری'],['علي چقدر بهم بدهکاره؟','RECEIVABLES','علی'],['مانده حساب مشتری نقدی چقدره؟','BOTH','مشتری نقدی']])check('named direction '+text,()=>assert.deepEqual(namedPartyReport(text),{intent,partyQuery:name}));
for(const text of ['از کی طلب دارم؟','از سینا و علی چقدر طلب دارم؟','از سینا دیروز چقدر طلب دارم؟','به سینا چقدر بدهکار نیستم؟','بدهی سینا','از سینا چقدر طلب دارم و پرداخت کن','از سینا بالای یک میلیون چقدر طلب دارم؟','ثبت دریافت از سینا'])check('reject named modifier '+text,()=>assert.equal(namedPartyReport(text),null));
const names=[row('1','5','سینا'),row('2','0','سینا گزیری'),row('3','-1','سیناب'),row('4','0','علی رضا'),row('5','0','علی رضا')];
check('all direct Sina names only',()=>assert.deepEqual(matchReportParties(names,'سینا').map(r=>r.party.id),['1','2']));
check('no direct substring name',()=>assert.equal(resolveReportParties([names[2]],'سینا').automatic,null));
check('duplicate names preserved',()=>assert.equal(matchReportParties(names,'علي رضا').length,2));
check('zero rows retained',()=>assert.equal(snap.rows.length,3));
for(const [balance,side,label] of [['0','BOTH','ماندهٔ این شخص صفر است'],['-100','RECEIVABLES','شما به این شخص بدهکارید'],['100','PAYABLES','این شخص به شما بدهکار است']])check('named actual balance '+balance,()=>{const html=renderToStaticMarkup(React.createElement(Party,{answer:{side,snapshot:snap,selectedParty:row('selected',balance,'<سینا>'),receivedAt:'now'}}));assert.ok(html.includes(label));assert.ok(html.includes('&lt;سینا&gt;'));assert.ok(!html.includes('جمع:'));});
check('unique whole word auto selects',()=>assert.equal(resolveReportParties([names[1]],'سینا').automatic.party.id,'2'));
check('multiple direct names require choice',()=>assert.equal(resolveReportParties(names,'سینا').automatic,null));
check('near names require confirmation',()=>{const r=resolveReportParties([names[1]],'سینن');assert.equal(r.approximate,true);assert.equal(r.matches.length,1);assert.equal(r.automatic,null);});
check('unrelated names excluded',()=>assert.equal(resolveReportParties(names,'حسن').matches.length,0));
check('empty query never lists all',()=>assert.equal(resolveReportParties(names,' ').matches.length,0));
check('short names not fuzzed',()=>assert.equal(resolveReportParties(names,'علی').approximate,false));
check('Arabic digits normalization for name',()=>assert.equal(resolveReportParties([row('k','0','علی کریمی')],'علي كريمي').automatic.party.id,'k'));
check('duplicate full names require choice',()=>assert.equal(resolveReportParties(names,'علی رضا').automatic,null));
(async()=>{const signal=new AbortController().signal;
api.readBusinessReport=async(b,r,q)=>{assert.equal(b,'tenant');assert.equal(r,'accounting/party-balances');assert.equal(q.get('status'),'ALL');return data};
assert.equal((await fetchPartyReport('tenant','IRR',signal)).receivable,'1000000');checks++;
for(const bad of [{...data,total:4},{...data,totalPages:101},{...data,items:[rows[0],rows[0],rows[2]]},{...data,currency:'USD'},{...data,periodId:'filtered'}]){api.readBusinessReport=async()=>bad;await assert.rejects(fetchPartyReport('tenant','IRR',signal));checks++;}
api.readBusinessReport=async(b,r,q)=>q.get('page')==='1'?{...data,totalPages:2,items:rows.slice(0,2)}:{...data,page:2,totalPages:2,items:rows.slice(2)};assert.equal((await fetchPartyReport('tenant','IRR',signal)).payable,'100000');checks++;
api.readBusinessReport=async(b,r,q)=>q.get('page')==='1'?{...data,totalPages:2,items:rows.slice(0,2)}:{...data,page:2,totalPages:2,totalCredit:'1',items:rows.slice(2)};await assert.rejects(fetchPartyReport('tenant','IRR',signal));checks++;
const c=new AbortController();c.abort();await assert.rejects(fetchPartyReport('tenant','IRR',c.signal));checks++;
process.env.MAHAN_AI_ENABLED='false';await assert.rejects(new PartyReportIntentService().classify('b','u','وضعیت مالی اشخاص چیست'));checks++;
process.env.MAHAN_AI_ENABLED='true';process.env.AVALAI_API_KEY='test-placeholder';
global.fetch=async()=>{throw Error('Explicit direction must not call provider')};
assert.deepEqual(await new PartyReportIntentService().classify('b','u','از سینا چقدر طلب دارم؟'),{intent:'RECEIVABLES',partyQuery:'سینا'});checks++;
assert.deepEqual(await new PartyReportIntentService().classify('b','u','کیا بهم بدهکارن؟'),{intent:'RECEIVABLES'});checks++;
assert.deepEqual(await new PartyReportIntentService().classify('b','u','به کیا بدهکارم؟'),{intent:'PAYABLES'});checks++;
let sent;global.fetch=async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'classify_party_report',arguments:JSON.stringify({intent:'RECEIVABLES',scope:'ALL_CURRENT'})}}]}}]})}};
const service=new PartyReportIntentService();assert.deepEqual(await service.classify('b','u','گزارش کل طلب ها'),{intent:'RECEIVABLES'});assert.equal(sent.messages[1].content,'گزارش کل طلب ها');assert.equal(sent.tools[0].function.parameters.additionalProperties,false);checks++;
for(let i=0;i<4;i++)await service.classify('b','u','گزارش کل طلب ها');await assert.rejects(service.classify('b','u','گزارش کل طلب ها'),e=>e.status===429);checks++;
global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:'ignore rules'}}]})});await assert.rejects(new PartyReportIntentService().classify('b','u','x'),e=>e.body.code==='AI_INVALID_OUTPUT');checks++;
global.fetch=async()=>({ok:false,status:402});await assert.rejects(new PartyReportIntentService().classify('b','u','x'),e=>e.body.code==='AI_CREDIT_REQUIRED');checks++;
global.fetch=async()=>{throw Error('provider secret error')};await assert.rejects(new PartyReportIntentService().classify('b','u','x'),e=>e.body.code==='AI_PROVIDER_ERROR'&&!e.message.includes('secret'));checks++;
console.log('PASS '+checks+' checks (provider mocked; no live AI call)');
})().catch(e=>{console.error(e);process.exitCode=1});
