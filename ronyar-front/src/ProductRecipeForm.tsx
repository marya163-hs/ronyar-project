import {useEffect,useRef,useState} from 'react';
import FormDrawer from './FormDrawer';
import {ApiError,errorText,getProduct,listProducts,listActiveWarehouses,saveProductRecipe} from './api';
import type {Business,Product,RecipeMaterial,Warehouse} from './api';
import './ProductRecipeForm.css';
type Props={business:Business;product:Product;onClose:()=>void;onSaved:()=>void;onSessionExpired:()=>void};
const empty=():RecipeMaterial=>({productId:'',warehouseId:'',quantity:'',consumptionUnit:'',conversionFactor:'1'});
const normalize=(v:string)=>v.trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g,'.');
export default function ProductRecipeForm({business,product,onClose,onSaved,onSessionExpired}:Props){
 const [rows,setRows]=useState<RecipeMaterial[]>([empty()]),[version,setVersion]=useState(0),[materials,setMaterials]=useState<Product[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]);
 const [revenueKind,setRevenueKind]=useState<"GOODS"|"SERVICE">("GOODS");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[uncertain,setUncertain]=useState(false);const sending=useRef(false);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
  async function load(){const [current,ws]=await Promise.all([getProduct(business.id,product.id,controller.signal),listActiveWarehouses(business.id,controller.signal)]);const all:Product[]=[];
   for(let page=1;;page++){const result=await listProducts(business.id,'ACTIVE',page,controller.signal);all.push(...result.items);if(page>=result.totalPages)break;if(page>=250)throw Error('تعداد کالاها زیاد است؛ دریافت مواد کامل نشد.');}
   if(controller.signal.aborted)return;setMaterials(all.filter(p=>p.kind==='GOODS'));setWarehouses(ws);setRevenueKind(current.recipe?.revenueKind??"GOODS");setVersion(current.recipeVersion??0);setRows(current.recipe?.materials??[empty()]);setUncertain(false);
  }
  load().catch(e=>{if(!controller.signal.aborted){setError(errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[business.id,product.id,retry]);
 const change=(i:number,value:Partial<RecipeMaterial>)=>setRows(old=>old.map((r,j)=>j===i?{...r,...value}:r));
 async function submit(e:React.FormEvent){e.preventDefault();if(sending.current||loading||uncertain)return;setError('');
  const body=rows.map(r=>({productId:r.productId,warehouseId:r.warehouseId,quantity:normalize(r.quantity),consumptionUnit:r.consumptionUnit.trim(),conversionFactor:normalize(r.conversionFactor)}));
  if(body.some(r=>!r.productId||!r.warehouseId||!r.consumptionUnit||!/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(r.quantity)||!/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(r.conversionFactor)||!Number(r.quantity)||!Number(r.conversionFactor))){setError('ماده، انبار، واحد و مقدار مثبت را در همهٔ ردیف‌ها مشخص کنید.');return;}
  if(new Set(body.map(r=>r.productId)).size!==body.length){setError('هر ماده را فقط یک‌بار وارد کنید.');return;}
  sending.current=true;setBusy(true);
  try{await saveProductRecipe(business.id,product.id,{version,revenueKind,materials:body});onSaved();}
  catch(e){if(!(e instanceof ApiError)||e.status>=500||e.status===408||e.status===409)setUncertain(true);setError(errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}
  finally{sending.current=false;setBusy(false);}
 }
 return <FormDrawer title={`دستور مصرف ${product.name}`} busy={busy} onClose={onClose}><form className="recipe-form" onSubmit={submit}>
  <p>مواد لازم برای <strong>یک {product.unit.name}</strong> از این محصول را مشخص کنید. مصرف فقط با ثبت قطعی فروش انجام می‌شود.</p>
  <p>مثال: برای ۱۲۰ گرم مرغ که موجودی آن کیلویی است، مقدار «۱۲۰»، واحد مصرف «گرم» و ضریب تبدیل «۰٫۰۰۱» وارد کنید. برای واحد یکسان، ضریب «۱» است.</p>
  <label>نوع فروش<select disabled={busy||loading||uncertain} value={revenueKind} onChange={e=>setRevenueKind(e.target.value as "GOODS"|"SERVICE")}><option value="GOODS">محصول آماده؛ مانند ساندویچ</option><option value="SERVICE">خدمت همراه مصرف مواد</option></select></label>
  {loading?<p role="status">در حال دریافت مواد…</p>:rows.map((row,i)=><fieldset key={i} disabled={busy||uncertain}><legend>مادهٔ {i+1}</legend>
   <label>مادهٔ اولیه<select required value={row.productId} onChange={e=>{const p=materials.find(p=>p.id===e.target.value);change(i,{productId:e.target.value,consumptionUnit:p?.unit.name??'',conversionFactor:'1',warehouseId:row.warehouseId||(warehouses.find(w=>w.isDefault)??warehouses[0])?.id||''});}}><option value="">انتخاب ماده</option>{materials.map(p=><option value={p.id} key={p.id}>{p.name} — موجودی به {p.unit.name}</option>)}</select></label>
   <label>انبار مصرف<select required value={row.warehouseId} onChange={e=>change(i,{warehouseId:e.target.value})}><option value="">انتخاب انبار</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
   <label>مقدار مصرف<input required inputMode="decimal" value={row.quantity} onChange={e=>change(i,{quantity:e.target.value})}/></label>
   <label>واحد مصرف<input required maxLength={30} value={row.consumptionUnit} onChange={e=>change(i,{consumptionUnit:e.target.value})}/></label>
   <label>هر واحد مصرف، چند واحد موجودی است؟<input required inputMode="decimal" value={row.conversionFactor} onChange={e=>change(i,{conversionFactor:e.target.value})}/></label>
   <button type="button" disabled={rows.length===1} onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))}>حذف ماده</button>
  </fieldset>)}
  <button type="button" disabled={loading||busy||uncertain||rows.length>=30} onClick={()=>setRows(r=>[...r,empty()])}>+ افزودن ماده</button>
  <p>برگشت فروش فقط مبلغ را برمی‌گرداند؛ مواد مصرف‌شده و هزینهٔ آن‌ها باقی می‌مانند. دستور جدید، فروش‌های قبلی را تغییر نمی‌دهد. پیش‌نویس‌های قبلی باید دوباره ذخیره شوند.</p>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {uncertain&&<p>نتیجهٔ ذخیره مشخص نیست یا نسخه تغییر کرده است؛ پیش از ارسال مجدد، دستور ذخیره‌شده را دریافت و بررسی کنید.</p>}
  <div className="recipe-actions"><button type="button" disabled={busy||loading} onClick={()=>setRetry(v=>v+1)}>دریافت دوباره دستور ذخیره‌شده</button><button className="primary" disabled={busy||loading||uncertain}>{busy?'در حال ذخیره…':'ذخیره دستور مصرف'}</button></div>
 </form></FormDrawer>;
}
