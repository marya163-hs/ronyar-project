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
const {contextualPaymentMessage:plan,paymentInvoiceCandidates,paymentAmountRial}=require('../src/assistantPaymentPlan.ts');
const context={businessId:'a',partyId:'sina-1',partyName:'سینا گزیری'};
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
for(const text of ['۱۰۰ هزار تومان بهش پرداخت کردم از صندوق','بهش ۱۰۰ هزار تومان پرداخت کردم از حساب صندوق','۱۰۰ هزار تومان به او دادم از صندوق','۱۰۰ هزار تومان به همین شخص پرداخت کردم از صندوق'])check(text,()=>{const p=plan(text,context,'a').proposal;assert.equal(p.partyId,'sina-1');assert.equal(p.partyQuery,'سینا گزیری');assert.equal(p.direction,'DISBURSEMENT');assert.equal(p.accountQuery,'صندوق');assert.equal(paymentAmountRial(p.amountText,p.currency),'1000000');});
for(const text of ['۱۰۰ هزار تومان ازش گرفتم به صندوق','ازش ۱۰۰ هزار تومان دریافت کردم به حساب صندوق','۱۰۰ هزار تومان از او گرفتم به صندوق'])check(text,()=>{const p=plan(text,context,'a').proposal;assert.equal(p.direction,'RECEIPT');assert.equal(p.accountQuery,'صندوق');});
for(const ctx of [null,{...context,businessId:'b'},{...context,partyId:''}])check('invalid context',()=>assert.ok(plan('۱۰۰ تومان بهش دادم',ctx,'a').issue));
for(const text of ['دیروز ۱۰۰ تومان بهش دادم','۱۰۰ تومان بهش ندادم','۱۰۰ تومان بهش دادم و ۲۰۰ تومان ازش گرفتم','۱۰۰ تومان بهش دادم از صندوق و حذف کن','۱۰۰ تومان بهش دادم بابت فاکتور ۲','۱۰۰ تومان بهش دادم از صندوق دیروز'])check('unsupported '+text,()=>assert.ok(plan(text,context,'a').issue));
for(const text of ['ریز حسابش','فروش امروز','به سینا ۱۰۰ تومان دادم'])check('new request '+text,()=>assert.equal(plan(text,context,'a'),null));
check('missing currency retained',()=>assert.equal(plan('۱۰۰ بهش دادم',context,'a').proposal.currency,null));
check('decimal separator',()=>assert.equal(paymentAmountRial(plan('۱٫۵ هزار تومان بهش دادم',context,'a').proposal.amountText,'TOMAN'),'15000'));
check('same-name persons isolated by ID',()=>{const rows=[{number:'1',party:{id:'sina-1',name:'سینا گزیری'}},{number:'2',party:{id:'sina-2',name:'سینا گزیری'}}];assert.deepEqual(paymentInvoiceCandidates(rows,plan('۱۰۰ تومان بهش دادم',context,'a').proposal),[rows[0]]);});
check('missing selected ID never broadens list',()=>assert.deepEqual(paymentInvoiceCandidates([{number:'1',party:{id:'other',name:'سینا گزیری'}}],plan('۱۰۰ تومان بهش دادم',context,'a').proposal),[]));
console.log('PASS '+count+' contextual payment checks');
