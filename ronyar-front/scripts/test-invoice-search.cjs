const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');let count=0;
const unit={id:'u',name:'عدد',code:'PCS'},wh={id:'w',name:'اصلی',isDefault:true,isActive:true,code:'WH'},supplier={id:'s1',name:'محمد احمدی',supplierEnabled:true,customerEnabled:false,isCashCustomer:false,isActive:true,externalCode:null};
const product={id:'p1',name:'پفک',kind:'GOODS',isActive:true,unit,code:'100001',salePrice:'0',barcode:null,category:null},savedProduct={...product,id:'p-new',name:'جدید',code:'100003'},business={id:'b',currencyScale:0,baseCurrency:'IRR'};
class ApiError extends Error{constructor(status){super('API');this.status=status;}}
function test(name,fn){fn();count++;console.log('PASS',name);}
function compile(file,requireFn){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:r=>r==='./storeMoney'?compile('storeMoney.ts'):requireFn?.(r),AbortController,crypto:crypto.webcrypto,Date,console});return mod.exports;}
const helpers=compile('purchaseQuickCreateUtils.ts'),amounts=compile('saleAmounts.ts'),period=compile('documentPeriod.ts');
function harness(file,api,extra={}){const states=[],refs=[],effects=[],cleanup=[],stubs={};let si,ri,ei,queue=[],tree,props;
 const react={useState:v=>{const i=si++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useRef:v=>{const i=ri++;return refs[i]??(refs[i]={current:v});},useEffect:(f,deps)=>{const i=ei++;if(!effects[i]||deps.some((v,k)=>v!==effects[i][k])){effects[i]=deps;queue.push(()=>{cleanup[i]?.();cleanup[i]=f();});}}};
 const jsx={jsx:(type,props,key)=>({type,props:props||{},key}),jsxs:(type,props,key)=>({type,props:props||{},key}),Fragment:'Fragment'};
 const component=compile(file,r=>r==='react'?react:r==='react/jsx-runtime'?jsx:r==='./api'?{ApiError,errorText:()=> 'خطا',formatDecimal:x=>x,tehranToday:()=> '2026-10-29',...api}:r==='./purchaseQuickCreateUtils'?helpers:r==='./saleAmounts'?amounts:r==='./documentPeriod'?period:r==='./invoiceSearch'?compile('invoiceSearch.ts'):r in extra?extra[r]:r.endsWith('.css')?{}:({default:(stubs[r]??(stubs[r]=function Stub(){}))})).default;
 return {render(p=props){props=p;si=ri=ei=0;tree=component(p);const q=queue;queue=[];q.forEach(f=>f());return tree;},get tree(){return tree;},type:r=>stubs[r],unmount(){cleanup.forEach(f=>f?.());}};
}
function nodes(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
function text(n){if(n==null||n===false)return '';if(typeof n==='string'||typeof n==='number')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
const find=(h,type,p=()=>true)=>nodes(h.tree).find(n=>n.type===type&&p(n)),button=(h,t)=>find(h,'button',n=>text(n).includes(t)),form=h=>find(h,'form');
function field(h,t,type='input'){return nodes(find(h,'label',n=>text(n).includes(t))).find(n=>n.type===type);}
const tick=()=>new Promise(r=>setImmediate(r)),event={preventDefault(){}};

const search=compile('invoiceSearch.ts');
(async()=>{
 test('Persian/Arabic letters and digits normalize together',()=>assert.equal(search.invoiceSearchText('كالا ي ۱۲٣'),search.invoiceSearchText('کالا ی 123')));
 const list=[{id:'2',name:'پفک نمکی',code:'200'},{id:'1',name:'پفک',code:'100',barcode:'987654'},{id:'3',name:'کیک شیرین',code:'300'}];
 test('exact name ranks before partial name',()=>assert.equal(search.searchInvoiceOptions(list,'پفک','').items[0].id,'1'));
 test('barcode and localized code are searchable',()=>{assert.equal(search.searchInvoiceOptions(list,'۹۸۷۶۵۴','').items[0].id,'1');assert.equal(search.searchInvoiceOptions(list,'۳۰۰','').items[0].id,'3');});
 test('multiword query and Arabic kaf match',()=>assert.equal(search.searchInvoiceOptions(list,'شيرين كيك','').items[0].id,'3'));
 test('same-name people remain distinct IDs',()=>assert.equal(search.searchInvoiceOptions([{id:'a',name:'محمد'},{id:'b',name:'محمد'}],'محمد','').items.length,2));
 test('missing query never silently clears selected ID',()=>{const result=search.searchInvoiceOptions(list,'unknown','1');assert.equal(result.matchCount,0);assert.equal(result.keptSelected,true);assert.equal(result.items[0].id,'1');});
 test('source options are never mutated',()=>{const original=JSON.stringify(list);search.searchInvoiceOptions(list,'','');assert.equal(JSON.stringify(list),original);});
 for(const kind of ['Purchase','Sale']){
  let calls=[],loads=0;
  const p2={...product,id:'p2',name:'کیک',code:'100002',barcode:'777'},p3={...product,id:'p3',name:'شیرینی',code:'100003'};
  const parties=[supplier,{...supplier,id:'s2',name:'علی رضایی'}],options={products:[product,p2,p3],suppliers:parties,customers:parties,warehouses:[wh],periods:[{id:'period',name:'دوره',startDate:'2026-01-01',endDate:'2026-12-31',status:'OPEN'}]};
  const draft={id:'draft',version:3,documentDate:'2026-10-29',partyId:'s1',notes:'یادداشت حفظ شود',items:[{productId:'p1',warehouseId:'w',quantity:'10',unitPrice:'100000',discountAmount:'1000',taxRate:'0.1'},{productId:'p2',warehouseId:'w',quantity:'2',unitPrice:'200000',discountAmount:'0',taxRate:'0'}]};
  const h=harness(kind+'Form.tsx',{['update'+kind]:async(b,id,body)=>{calls.push({b,id,body});return draft;}},{['./'+kind.toLowerCase()+'Options']:{['load'+kind+'Options']:async()=>{loads++;return options;}},'./saleAssistantMatch':{}});
  h.render({business,[kind.toLowerCase()]:draft,onSaved:()=>{},onCancel:()=>{},onSessionExpired:()=>{}});await tick();h.render();
  field(h,'جست‌وجوی '+(kind==='Purchase'?'تأمین‌کننده':'مشتری')).props.onChange({target:{value:'رضايي'}});h.render();
  test(kind+' name search retains selected party without auto selection',()=>{const select=nodes(h.tree).find(n=>n.type==='select'&&n.props.value==='s1');assert.ok(select);assert.equal(nodes(select).filter(n=>n.type==='option').length,3);assert.equal(calls.length,0);});
  const rowSearch=()=>nodes(h.tree).filter(n=>n.type==='input'&&n.props['aria-label']?.startsWith('جست‌وجوی کالا برای قلم'));
  rowSearch()[0].props.onChange({target:{value:'۷۷۷'}});h.render();
  test(kind+' row search is independent and never changes quantity/price',()=>{assert.equal(rowSearch()[0].props.value,'۷۷۷');assert.equal(rowSearch()[1].props.value,'');assert.equal(nodes(h.tree).find(n=>n.type==='select'&&n.props.value==='p1').props.value,'p1');assert.equal(calls.length,0);});
  rowSearch()[0].props.onChange({target:{value:'missing'}});h.render();
  test(kind+' no-match message and selected option remain visible',()=>{assert.ok(text(h.tree).includes('کالایی با این مشخصات پیدا نشد'));assert.ok(text(h.tree).includes('انتخاب فعلی'));});
  button(h,'افزودن قلم جدید').props.onClick();h.render();
  test(kind+' adding next row preserves existing searches and row values',()=>{assert.equal(rowSearch().length,3);assert.equal(rowSearch()[0].props.value,'missing');assert.equal(rowSearch()[2].props.value,'');});
  nodes(h.tree).filter(n=>n.type==='button'&&text(n)==='حذف قلم')[2].props.onClick();h.render();await form(h).props.onSubmit(event);
  test(kind+' searching and adding/removing a row preserve exact draft payload',()=>{assert.equal(calls.length,1);assert.equal(calls[0].b,'b');assert.equal(calls[0].body.partyId,'s1');assert.equal(calls[0].body.notes,draft.notes);assert.equal(JSON.stringify(calls[0].body.items),JSON.stringify(draft.items));assert.equal(loads,1);});
 }
 console.log('PASS',count,'invoice search and actual purchase/sale TSX checks; mocked hooks/options/network; no live writes');
})().catch(e=>{console.error(e);process.exitCode=1;});
