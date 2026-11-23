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
const {resolveTotalPrice,resolveAssistantPrice}=require('../src/assistantPrice.ts');
const {calculateSaleLine}=require('../src/saleAmounts.ts');
const {resolveAssistantDraft,assistantDraftBody}=require('../src/assistantDraft.ts');
const {resolvePurchaseAssistantDraft,purchaseAssistantDraftBody}=require('../src/purchaseAssistantDraft.ts');
const {assistantFormSeed}=require('../src/saleAssistantMatch.ts');
let count=0;function check(name,f){f();count++;console.log('PASS '+name);}
function line(a,q,scale=0){const r=resolveTotalPrice(a,q,scale);assert.ok(r);return {r,value:calculateSaleLine({productId:'p',quantity:q,unitPrice:r.unitPrice,discountAmount:r.discountAmount,taxRate:'0'},scale)};}
check('3 chips preserves 5000000 with 1 rial discount',()=>{const {r,value}=line('5000000','3');assert.equal(r.unitPrice,'1666667');assert.equal(r.discountAmount,'1');assert.equal(value.total,5000000n);});
check('exact division adds no discount',()=>{const {r,value}=line('2000000','2');assert.equal(r.unitPrice,'1000000');assert.equal(r.discountAmount,'0');assert.equal(value.total,2000000n);});
check('fractional quantity uses representable price',()=>{const {r,value}=line('100','0.3');assert.equal(r.unitPrice,'340');assert.equal(r.discountAmount,'2');assert.equal(value.total,100n);});
check('currency scale respected',()=>{const {r,value}=line('10.00','3',2);assert.equal(r.unitPrice,'3.34');assert.equal(r.discountAmount,'0.02');assert.equal(value.total,1000n);});
check('small positive total',()=>{assert.equal(line('1','3').value.total,1n);});
check('Persian digits',()=>assert.equal(line('۵۰۰۰۰۰۰','۳').value.total,5000000n));
for(const [a,q,s] of [['0','3',0],['-1','3',0],['NaN','3',0],['100','0',0],['100','-3',0],['100','0.0000001',0],['0.1','3',0],['100','3',7],['100','3',-1],['1000000000000000000','3',0]])check('invalid values '+[a,q,s],()=>assert.equal(resolveTotalPrice(a,q,s),null));
check('explicit total resolves without empty price',()=>{const r=resolveAssistantPrice({quantity:'3',unitPrice:null,amountRial:'5000000',priceBasis:'TOTAL'});assert.equal(r.unitPrice,'1666667');assert.equal(r.discountAmount,'1');assert.equal(r.needsChoice,false);});
check('ambiguous price remains a question',()=>assert.equal(resolveAssistantPrice({quantity:'3',unitPrice:null,amountRial:'5000000',priceBasis:'AMBIGUOUS'}).needsChoice,true));
check('unit price remains unchanged',()=>assert.equal(resolveAssistantPrice({quantity:'3',unitPrice:null,amountRial:'5000000',priceBasis:'UNIT'}).unitPrice,'5000000'));
const products=[{id:'chips',name:'چیپس',kind:'GOODS'},{id:'gum',name:'آدامس',kind:'GOODS'}],party={id:'sina',name:'سینا',isCashCustomer:false};
const common={products,warehouses:[{id:'w',isDefault:true}],periods:[{id:'period',status:'OPEN',startDate:'2020-01-01',endDate:'2030-12-31'}]};
const suggestion={customer:'سینا',currency:'IRR',sourceCurrency:'TOMAN',unsupported:[],items:[{product:'چیپس',quantity:'3',unitPrice:null,amountRial:'5000000',priceBasis:'TOTAL'},{product:'آدامس',quantity:'2',unitPrice:null,amountRial:'2000000',priceBasis:'TOTAL'}]};
for(const purchase of [false,true])check((purchase?'purchase':'sale')+' draft retains exact target and discount',()=>{
 const options={...common,customers:[party],suppliers:[party]},input=purchase?{...suggestion,supplier:'سینا'}:suggestion;
 const draft=purchase?resolvePurchaseAssistantDraft(input,options):resolveAssistantDraft(input,options);
 const body=purchase?purchaseAssistantDraftBody(draft,options,0):assistantDraftBody(draft,options,0);assert.ok(body);assert.equal(body.items[0].discountAmount,'1');assert.equal(body.items.reduce((n,r)=>n+calculateSaleLine(r,0).total,0n),7000000n);assert.ok(body.notes.includes('تخفیف تعدیل'));
});
check('full sale editor retains rounding discount',()=>{const seed=assistantFormSeed({...suggestion,items:[{product:'چیپس',quantity:'3',unitPrice:'1666667',discountAmount:'1'}]},[party],products);assert.equal(seed.items[0].discountAmount,'1');assert.equal(calculateSaleLine(seed.items[0],0).total,5000000n);});
// Exact arithmetic invariants over multiple amounts, fractional quantities and currency scales.
for(const scale of [0,2,6])for(const q of ['3','7','0.3','0.125','1.25','1.234567'])check('exact net invariant scale='+scale+' quantity='+q,()=>{const a=scale===0?'1234567':scale===2?'12345.67':'1.234567';const {r,value}=line(a,q,scale);assert.equal(value.total,1234567n);assert.ok(value.discount>=0n);assert.ok(value.discount<value.gross);const [w,f='']=r.unitPrice.split('.');const price=BigInt(w+f.padEnd(scale,'0'));const [qw,qf='']=q.split('.');const quantity=BigInt(qw+qf.padEnd(6,'0'));const gcd=(a,b)=>b?gcd(b,a%b):a;const step=1000000n/gcd(quantity,1000000n);if(price>=step)assert.ok(quantity*(price-step)/1000000n<value.total,'smallest eligible unit price');});
console.log('PASS '+count+' rounding checks (no live writes)');
