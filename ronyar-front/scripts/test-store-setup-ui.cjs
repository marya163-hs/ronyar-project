const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');let count=0;const memory=new Map(),sessionStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const unit={id:'u',name:'عدد',code:'PCS'},wh={id:'w',name:'اصلی',isDefault:true,isActive:true,code:'WH'},supplier={id:'s1',name:'محمد احمدی',supplierEnabled:true,customerEnabled:false,isCashCustomer:false,isActive:true,externalCode:null};
const product={id:'p1',name:'پفک',kind:'GOODS',isActive:true,unit,code:'100001',salePrice:'0',barcode:null,category:null},savedProduct={...product,id:'p-new',name:'جدید',code:'100003'},business={id:'b',currencyScale:0,baseCurrency:'IRR'};
class ApiError extends Error{constructor(status){super('API');this.status=status;}}
function test(name,fn){fn();count++;console.log('PASS',name);}
function compile(file,requireFn){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:r=>r==='./storeMoney'?compile('storeMoney.ts'):requireFn?.(r),sessionStorage,AbortController,crypto:crypto.webcrypto,Date,console});return mod.exports;}
const helpers=compile('purchaseQuickCreateUtils.ts'),amounts=compile('saleAmounts.ts'),period=compile('documentPeriod.ts');
function harness(file,api,extra={}){const states=[],refs=[],effects=[],cleanup=[],stubs={};let si,ri,ei,queue=[],tree,props;
 const react={useState:v=>{const i=si++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useRef:v=>{const i=ri++;return refs[i]??(refs[i]={current:v});},useEffect:(f,deps)=>{const i=ei++;if(!effects[i]||deps.some((v,k)=>v!==effects[i][k])){effects[i]=deps;queue.push(()=>{cleanup[i]?.();cleanup[i]=f();});}}};
 const jsx={jsx:(type,props,key)=>({type,props:props||{},key}),jsxs:(type,props,key)=>({type,props:props||{},key}),Fragment:'Fragment'};
 const component=compile(file,r=>r==='react'?react:r==='react/jsx-runtime'?jsx:r==='./api'?{ApiError,errorText:()=> 'خطا',formatDecimal:x=>x,tehranToday:()=> '2026-10-29',...api}:r==='./purchaseQuickCreateUtils'?helpers:r==='./saleAmounts'?amounts:r==='./documentPeriod'?period:r==='./cashOperationOptions'?compile('cashOperationOptions.ts',x=>x==='./api'?{}:amounts):r in extra?extra[r]:r.endsWith('.css')?{}:({default:(stubs[r]??(stubs[r]=function Stub(){}))})).default;
 return {render(p=props){props=p;si=ri=ei=0;tree=component(p);const q=queue;queue=[];q.forEach(f=>f());return tree;},get tree(){return tree;},type:r=>stubs[r],unmount(){cleanup.forEach(f=>f?.());}};
}
function nodes(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
function text(n){if(n==null||n===false)return '';if(typeof n==='string'||typeof n==='number')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
const find=(h,type,p=()=>true)=>nodes(h.tree).find(n=>n.type===type&&p(n)),button=(h,t)=>find(h,'button',n=>text(n).includes(t)),form=h=>find(h,'form');
function field(h,t,type='input'){return nodes(find(h,'label',n=>text(n).includes(t))).find(n=>n.type===type);}
const tick=()=>new Promise(r=>setImmediate(r)),event={preventDefault(){}};

async function make(mode='pass'){
 let calls=[],saved=0,expired=0,release;memory.clear();
 const api={listUnits:async()=>[unit],listCategories:async()=>[],listActiveWarehouses:async()=>[wh],listFiscalPeriods:async()=>[{id:'period',name:'year',startDate:'2026-01-01',endDate:'2026-12-31',status:'OPEN'}],createProduct:async()=>{calls.push('normal');return{id:'new'}},updateProduct:async()=>{},createProductWithOpening:async(b,body,key)=>{calls.push({b,body,key});if(mode==='unknown')throw new ApiError(408);if(mode==='permission')throw new ApiError(403);if(mode==='deferred')await new Promise(r=>release=r);return{id:'new'}}};
 const h=harness('ProductForm.tsx',api);const props={business,product:null,onSaved:()=>saved++,onCancel:()=>{},onSessionExpired:()=>expired++};h.render(props);await tick();h.render();
 field(h,'نام').props.onChange({target:{value:'موجودی قبلی'}});h.render();
 return{h,calls,saved:()=>saved,props,api,release:()=>release?.()};
}
async function fill(x){const h=x.h;const toggle=nodes(h.tree).find(n=>n.type==='input'&&n.props.type==='checkbox');toggle.props.onChange({target:{checked:true}});h.render();await tick();h.render();
 const money=h.type('./MoneyInput');const quantities=nodes(h.tree).filter(n=>n.type===money);quantities[1].props.onChange('10');quantities[2].props.onChange('1000');h.render();}
async function check(name,fn){await fn();count++;console.log('PASS',name)}
(async()=>{
 await check('normal product create retains existing endpoint',async()=>{const x=await make();await form(x.h).props.onSubmit(event);assert.equal(x.calls[0],'normal')});
 await check('opening uses atomic endpoint with total cost and business scope',async()=>{const x=await make();await fill(x);await form(x.h).props.onSubmit(event);assert.equal(x.calls.length,1);assert.equal(x.calls[0].b,business.id);assert.equal(x.calls[0].body.opening.quantity,'10');assert.equal(x.calls[0].body.opening.inventoryValue,'1000');assert.equal(x.calls[0].body.opening.warehouseId,wh.id);assert.equal(x.saved(),1)});
 await check('uncertain request freezes fields and replays exact body and key',async()=>{const x=await make('unknown');await fill(x);await form(x.h).props.onSubmit(event);x.h.render();assert(nodes(x.h.tree).some(n=>n.type==='fieldset'&&n.props.disabled));await button(x.h,'پیگیری همان درخواست').props.onClick();assert.equal(x.calls.length,2);assert.equal(x.calls[0].key,x.calls[1].key);assert.deepEqual(x.calls[0].body,x.calls[1].body);assert.equal(x.saved(),0)});
 await check('remount recovers same pending request',async()=>{const x=await make('unknown');await fill(x);await form(x.h).props.onSubmit(event);const old=x.calls[0];x.h.unmount();const h=harness('ProductForm.tsx',x.api);h.render(x.props);await tick();h.render();await button(h,'پیگیری همان درخواست').props.onClick();assert.equal(x.calls[1].key,old.key);assert.equal(JSON.stringify(x.calls[1].body),JSON.stringify(old.body))});
 await check('double click sends only once',async()=>{const x=await make('deferred');await fill(x);const handler=form(x.h).props.onSubmit,p=handler(event);await handler(event);assert.equal(x.calls.length,1);x.release();await p});
 await check('posting permission error does not claim saved',async()=>{const x=await make('permission');await fill(x);await form(x.h).props.onSubmit(event);x.h.render();assert.equal(x.saved(),0);assert(text(x.h.tree).includes('مجوز'));assert.equal(memory.size,0)});
 await check('service hides opening inventory',async()=>{const x=await make();field(x.h,'نوع','select').props.onChange({target:{value:'SERVICE'}});x.h.render();assert(!text(x.h.tree).includes('این کالا از قبل'))});
 await check('invalid negative quantity never sends',async()=>{const x=await make();await fill(x);nodes(x.h.tree).filter(n=>n.type===x.h.type('./MoneyInput'))[1].props.onChange('-10');x.h.render();await form(x.h).props.onSubmit(event);assert.equal(x.calls.length,0)});
 await check('blocked storage prevents opening post',async()=>{const x=await make();await fill(x);const old=sessionStorage.setItem;sessionStorage.setItem=()=>{throw Error('storage unavailable')};try{await form(x.h).props.onSubmit(event);assert.equal(x.calls.length,0)}finally{sessionStorage.setItem=old}});
 await check('period edit seeds dates, excludes itself from overlap and sends expected state',async()=>{
  const row={id:'period',name:'سال مالی',startDate:'2026-01-01',endDate:'2026-12-31',status:'OPEN'},sent=[];const MasterEditor=function Editor(){};
  const h=harness('FiscalPeriodDefinitions.tsx',{updateFiscalPeriod:async(...args)=>sent.push(args)},{'./MasterDataShared':{useMasterList:()=>({data:[row]}),MasterEditor,MasterStatus:()=>null,MasterPendingReview:()=>null,localValidation:m=>{const e=new Error(m);e.name='LocalValidationError';throw e}},'./BaseUi':{},'./jalaliDate':{jalaliText:x=>x}});
  h.render({business,onSessionExpired:()=>{}});button(h,'ویرایش دوره').props.onClick();h.render();
  field(h,'نام').props.onChange({target:{value:'دوره اصلاح شده'}});field(h,'دلیل ویرایش','textarea').props.onChange({target:{value:'اصلاح نام دوره مالی'}});h.render();
  await find(h,MasterEditor).props.onSave();assert.equal(sent.length,1);assert.equal(sent[0][1],row.id);assert.equal(sent[0][2].expected.name,row.name);assert.equal(sent[0][2].endDate,row.endDate);
 });
 console.log('PASS',count,'actual product form checks with mocked hooks/storage/network; no live writes');
})().catch(e=>{console.error(e);process.exitCode=1});
