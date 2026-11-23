const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(r,p,...a){if(r.startsWith('.')&&p?.filename.endsWith('.ts')){const f=path.resolve(path.dirname(p.filename),r)+'.ts';if(fs.existsSync(f))return f;}return resolve.call(this,r,p,...a);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {paymentMessage,contextualPaymentMessage,paymentAmountRial}=require('../src/assistantPaymentPlan.ts');
const {namedPartyReport}=require('../../backend/src/platform/ai/named-party-report.ts');
const {explicitPartyDirection}=require('../../backend/src/platform/ai/party-report-direction.ts');
const {extractLocalSuggestion}=require('../../backend/src/platform/ai/assistant-local-extractor.ts');
const {planTrade,tradeRange}=require('../src/assistantTradePlan.ts');
const {planCashReport}=require('../src/cashReportPlan.ts');
const {inventoryQuestionProduct}=require('../src/assistantLocalReports.ts');
const {assistantReport}=require('../src/assistantRouting.ts');
const {assistantIntent}=require('../src/assistantIntent.ts');
const {planPartyFollowup}=require('../src/assistantPartyFollowup.ts');
const today='2026-10-24',context={businessId:'store',partyId:'sina',partyName:'سینا گزیری'};
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'assistant-language-corpus.json'),'utf8'));
let failed=0;const counts={};
for(const row of corpus){const {group,text,expected:e}=row;counts[group]=(counts[group]||0)+1;try{
 switch(group){
 case 'payment':case 'context':{const r=group==='context'?contextualPaymentMessage(text,context,'store'):paymentMessage(text);assert.ok(r?.proposal,'expected payment proposal');const p=r.proposal;for(const key of ['direction','partyQuery','accountQuery','partyId'])if(key in e)assert.equal(p[key],e[key]);assert.equal(paymentAmountRial(p.amountText,p.currency),e.amountRial);assert.equal(planCashReport(text,today),null,'transaction must not become cash report');break;}
 case 'transaction':{assert.equal(assistantIntent(text),e.purchase?'purchase':'sale');const p=extractLocalSuggestion(text,e.purchase,'TOMAN');assert.ok(p,'expected local suggestion');assert.equal(p.customer,e.party);assert.equal(p.items[0].product,e.product);assert.equal(p.items[0].quantity,e.quantity);assert.equal(p.items[0].unitPrice,e.unitPrice);assert.equal(p.unsupported.length,0);break;}
 case 'trade':{const r=planTrade(text,today,null);assert.ok(r?.plan,JSON.stringify(r));assert.equal(r.plan.kind,e.kind);assert.deepEqual(r.plan.range,tradeRange(e.range,today));assert.equal(r.plan.chart,e.chart);break;}
 case 'cash':{const r=planCashReport(text,today);assert.ok(r?.plan,JSON.stringify(r));assert.equal(r.plan.direction,e.direction);assert.deepEqual(r.plan.range,tradeRange(e.range,today));break;}
 case 'party':assert.deepEqual(namedPartyReport(text),e);break;
 case 'direction':assert.equal(explicitPartyDirection(text),e.intent);break;
 case 'inventory':assert.equal(inventoryQuestionProduct(text),e.product);assert.equal(assistantReport(text),'inventory');break;
 case 'followup':{const r=planPartyFollowup(text,context,'store',true);assert.equal(r?.kind,'ledger');assert.equal(r.party.partyId,e.partyId);assert.equal(planPartyFollowup(text,null,'store',true).kind,'clarify');assert.equal(planPartyFollowup(text,context,'other',true).kind,'clarify');break;}
 case 'reject-payment':assert.ok(!paymentMessage(text)?.proposal);break;
 case 'reject-party':assert.equal(namedPartyReport(text),null);break;
 default:throw Error('unhandled corpus group');
 }
 }catch(error){failed++;console.error('FAIL '+group+' '+text+'\n'+error.message);}}
assert.equal(fs.readFileSync(path.join(__dirname,'../src/assistantLanguage.ts'),'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(path.join(__dirname,'../../backend/src/platform/ai/assistant-language.ts'),'utf8').replace(/\r\n/g,'\n'),'web/backend language parity');
console.log(JSON.stringify(counts));console.log(`${corpus.length-failed}/${corpus.length} distinct colloquial sentences PASS (local parsing, no live AI)`);if(failed)process.exitCode=1;
