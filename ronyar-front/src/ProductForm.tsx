import MasterNameHint from "./MasterNameHint";
import { storeMoneyUnit } from "./storeMoney";
import JalaliDateField from "./JalaliDateField";
import { periodForDate } from "./documentPeriod";
import { cashOperationAmount } from "./cashOperationOptions";
import FormDrawer from "./FormDrawer";
import MoneyInput from "./MoneyInput";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, createProductWithOpening, listActiveWarehouses, listFiscalPeriods, tehranToday, createProduct, updateProduct, listUnits, listCategories, errorText } from "./api";
import type { ProductOpeningInput, FiscalPeriod, Warehouse, Business, Product, ProductUnit, ProductCategory } from "./api";

type Props = { business: Business; product: Product | null; requireOpeningForGoods?: boolean; initialOpeningDate?: string; onSaved: (id?: string, warehouseId?: string) => void; onCancel: () => void; onSessionExpired: () => void };
const normalize = (value: string) => value.replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/٫/g, ".");
export default function ProductForm({ business, product, onSaved, onCancel, onSessionExpired, requireOpeningForGoods = false, initialOpeningDate }: Props) {
  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [kind, setKind] = useState<"GOODS" | "SERVICE">(product?.kind ?? "GOODS");
  const [price, setPrice] = useState(product?.salePrice ?? "0");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [active, setActive] = useState(product?.isActive ?? true);
  const [unitId, setUnitId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [more, setMore] = useState(false);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(!product);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertainCreate,setUncertainCreate]=useState(false);
  const [retry, setRetry] = useState(0);
  const [opening,setOpening]=useState(requireOpeningForGoods),[quantity,setQuantity]=useState(""),[inventoryValue,setInventoryValue]=useState(""),[warehouseId,setWarehouseId]=useState(""),[openingDate,setOpeningDate]=useState(initialOpeningDate ?? tehranToday());
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[periods,setPeriods]=useState<FiscalPeriod[]>([]),[openingLoading,setOpeningLoading]=useState(false),[openingError,setOpeningError]=useState("");
  const pendingKey=`ranyar:product-opening:${business.id}`;
  const [pending,setPending]=useState<{body:ProductOpeningInput;key:string}|null>(()=>{try{return JSON.parse(sessionStorage.getItem(pendingKey)??"null");}catch{return null;}});
  useEffect(()=>{
    if(!opening||product)return;
    const c=new AbortController();setOpeningLoading(true);setOpeningError("");
    Promise.all([listActiveWarehouses(business.id,c.signal),listFiscalPeriods(business.id,c.signal)]).then(([w,p])=>{if(c.signal.aborted)return;setWarehouses(w);setPeriods(p);setWarehouseId(current=>w.some(x=>x.id===current)?current:(w.find(x=>x.isDefault)??w[0])?.id??"");}).catch(e=>{if(!c.signal.aborted){setOpeningError(errorText(e));if(e instanceof ApiError&&e.status===401)onSessionExpired();}}).finally(()=>{if(!c.signal.aborted)setOpeningLoading(false);});
    return()=>c.abort();
  },[business.id,opening,product,retry]);
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (product) return;
    const controller = new AbortController(); setLoading(true); setError("");
    Promise.all([listUnits(business.id, controller.signal), listCategories(business.id, controller.signal)])
      .then(([u,c]) => {
        if (controller.signal.aborted) return;
        setUnits(u); setCategories(c);
        const numberUnit = u.find(item => item.name.trim() === "عدد" || ["PCS", "EA", "NUMBER"].includes(item.code.toUpperCase()));
        setUnitId(current => u.some(item => item.id === current) ? current : (numberUnit ?? u[0])?.id ?? "");
      }).catch(cause => { if (!controller.signal.aborted) { setError(errorText(cause)); if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [business.id, product, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current || loading || uncertainCreate) return; setError("");
    if(pending){await sendOpening(pending);return;}
    const amount = normalize(price.trim()) || "0";
    if (!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(amount) || (amount.split(".")[1]?.length ?? 0) > business.currencyScale) {
      setError("قیمت معتبر وارد کنید؛ مبلغ پس از تبدیل به ریال باید عدد صحیح باشد."); return;
    }
    if (!name.trim() || (!product && !unitId)) { setError("نام و واحد کالا را مشخص کنید."); return; }
    const manualCode = normalize(code.trim().toUpperCase());
    if (manualCode && !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(manualCode)) { setError("کد دستی باید لاتین، عدد یا خط تیره باشد."); setMore(true); return; }
    if (product && name.trim() === product.name && amount === product.salePrice && manualCode === product.code && (barcode.trim() || null) === product.barcode && active === product.isActive) {
      setError("تغییری برای ذخیره وجود ندارد."); return;
    }
    if(!product&&(opening||requireOpeningForGoods)&&kind==="GOODS"){
      if(openingLoading||openingError){setError("ابتدا اطلاعات انبار و دوره مالی را دریافت کنید.");return;}
      const period=periodForDate(periods,openingDate);
      if(!period||!warehouseId){setError("انبار و تاریخ دارای دوره مالی باز را مشخص کنید.");return;}
      try{
        const q=cashOperationAmount(quantity,6),value=cashOperationAmount(inventoryValue,business.currencyScale);
        const request={key:`web-product-opening-${crypto.randomUUID()}`,body:{product:{...(manualCode?{code:manualCode}:{}),name:name.trim(),kind,salePrice:amount,unitId,...(categoryId?{categoryId}:{}),...(barcode.trim()?{barcode:barcode.trim()}:{})},opening:{periodId:period.id,warehouseId,documentDate:openingDate,quantity:q,inventoryValue:value}}};
        sessionStorage.setItem(pendingKey,JSON.stringify(request));setPending(request);await sendOpening(request);
      }catch(e){setError(e instanceof Error?e.message:"امکان نگهداری درخواست وجود ندارد.");}
      return;
    }
    sending.current = true; setBusy(true);
    try {
      const saved = product ? await updateProduct(business.id, product.id, { code: manualCode, name: name.trim(), salePrice: amount, barcode: barcode.trim() || null, isActive: active })
      : await createProduct(business.id, { ...(manualCode ? { code: manualCode } : {}), name: name.trim(), kind, salePrice: amount, unitId, ...(categoryId ? { categoryId } : {}), ...(barcode.trim() ? { barcode: barcode.trim() } : {}) });
      if (alive.current) onSaved(product?.id ?? saved.id);
    } catch (cause) {
      if (alive.current) {
        if (!product && (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408)) setUncertainCreate(true);
        setError(cause instanceof ApiError && cause.status === 403 ? "اجازه ثبت یا ویرایش کالا را ندارید." : cause instanceof ApiError && cause.status < 500 && cause.code?.startsWith("PRODUCT_DEACTIVATE_") ? errorText(cause) : cause instanceof ApiError && cause.status === 409 ? "این کد قبلاً استفاده شده است یا تغییر کالا با وابستگی موجود سازگار نیست." : !(cause instanceof ApiError) ? "نتیجه ذخیره مشخص نیست؛ پیش از تکرار درخواست، فهرست کالاها را بررسی کنید." : errorText(cause));
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      }
    } finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  async function sendOpening(request:{body:ProductOpeningInput;key:string}){
    if(sending.current)return;sending.current=true;setBusy(true);setError("");
    try{const saved=await createProductWithOpening(business.id,request.body,request.key);sessionStorage.removeItem(pendingKey);setPending(null);if(alive.current)onSaved(saved.id,request.body.opening.warehouseId);}
    catch(e){if(alive.current){const uncertain=!(e instanceof ApiError)||e.status>=500||e.status===408||e.status===409;
      if(!uncertain){sessionStorage.removeItem(pendingKey);setPending(null);}
      setError(uncertain?"نتیجه ثبت کالا و افتتاحیه مشخص نیست. فقط پیگیری همان درخواست را بزنید؛ درخواست تکراری ساخته نمی‌شود.":e instanceof ApiError&&e.status===403?"برای ثبت افتتاحیه، مجوز ثبت قطعی موجودی لازم است؛ از مالک فروشگاه بخواهید دسترسی را بررسی کند.":errorText(e));
      if(e instanceof ApiError&&e.status===401)onSessionExpired();
    }}finally{sending.current=false;if(alive.current)setBusy(false);}
  }
  return <FormDrawer title={product ? `ویرایش ${product.name}` : "ثبت کالا یا خدمت"} busy={busy} onClose={onCancel}>
    <section className="product-form-panel rev6-product-form">
      <p className="muted rev6-form-intro">مشخصات ضروری را وارد کنید؛ سایر جزئیات اختیاری هستند.</p>
      {loading && <p role="status">در حال دریافت واحدها و دسته‌ها…</p>}
      {error && <div className="notice error" role="alert">{error}{!product && !units.length && <button type="button" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button>}</div>}
      <form onSubmit={submit}><fieldset disabled={busy || loading || uncertainCreate || !!pending} className="product-form-fields">
        <label>نام {kind === "GOODS" ? "کالا" : "خدمت"}<input autoFocus value={name} onChange={event => setName(event.target.value)} required maxLength={200} placeholder="مثلاً کولر گازی ۱۸ هزار" /></label>
      <MasterNameHint key={business.id} businessId={business.id} kind="PRODUCT" name={name} excludeId={product?.id} onSessionExpired={onSessionExpired} />
        {!product && <><label>نوع<select value={kind} onChange={event => setKind(event.target.value as "GOODS" | "SERVICE")}><option value="GOODS">کالا</option><option value="SERVICE">خدمت / محصول آماده</option></select></label><label>واحد<select value={unitId} onChange={event => setUnitId(event.target.value)} required><option value="">انتخاب واحد</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{!units.length && !loading && <small className="muted">ابتدا از اطلاعات پایه یک واحد مانند «عدد» تعریف کنید.</small>}</>}
        <label>قیمت فروش ({storeMoneyUnit(business)})<MoneyInput business={business} value={price} onChange={setPrice} required /><small className="muted">اگر هنوز قیمت مشخص نیست، صفر بگذارید.</small></label>
        {product && <label>وضعیت (برای کنارگذاشتن مورد تکراری، غیرفعال را انتخاب کنید)<select value={active ? "ACTIVE" : "INACTIVE"} onChange={event => setActive(event.target.value === "ACTIVE")}><option value="ACTIVE">فعال</option><option value="INACTIVE">غیرفعال</option></select><small>با ذخیره، از انتخاب‌های جدید کنار می‌رود؛ سوابق قبلی حفظ می‌شوند. موجودی غیرصفر یا پیش‌نویس مرتبط باید ابتدا بررسی شود.</small></label>}
      </fieldset>
      {!product&&kind==="GOODS"&&<fieldset className="product-form-fields" disabled={busy||!!pending}>
        {requireOpeningForGoods ? <p className="notice">برای فروش کالای جدید، موجودی اولیه واقعی و بهای آن را ثبت کنید. این ثبت مستقل از فاکتور است و با انصراف از فاکتور باقی می‌ماند.</p> : <label><input type="checkbox" checked={opening} onChange={e=>setOpening(e.target.checked)}/> این کالا از قبل در مغازه موجود است</label>}
        {opening&&<><p className="notice">کالا و موجودی اولیه با هم ثبت قطعی می‌شوند. بهای موجودی، قیمت فروش نیست؛ ارزش خرید یا بهای تمام‌شده همه این تعداد را وارد کنید.</p>
          {openingLoading&&<p role="status">در حال دریافت انبار و دوره…</p>}{openingError&&<p role="alert">{openingError}<button type="button" onClick={()=>setRetry(v=>v+1)}>دریافت دوباره</button></p>}
          <label>انبار<select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)} required><option value="">انتخاب انبار</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <JalaliDateField id="product-opening-date" label="تاریخ موجودی اولیه (شمسی)" value={openingDate} onChange={setOpeningDate}/>
          <label>تعداد موجودی اولیه<MoneyInput value={quantity} onChange={setQuantity} required/></label>
          <label>بهای کل موجودی اولیه ({storeMoneyUnit(business)})<MoneyInput business={business} value={inventoryValue} onChange={setInventoryValue} required/></label>
          <small>برای مثال: ۱۰ عدد با بهای خرید هر عدد ۱۰۰٬۰۰۰ ریال؛ بهای کل ۱٬۰۰۰٬۰۰۰ ریال است. تاریخ باید در یک دوره مالی باز باشد.</small>
        </>}
      </fieldset>}
      {uncertainCreate&&<p role="alert" className="notice">نتیجه ثبت مشخص نیست؛ ارسال دوباره متوقف شد. به فاکتور برگردید و فهرست کالاها را به‌روزرسانی کنید.</p>}
      {pending&&<p className="notice" role="status">یک درخواست کالا همراه افتتاحیه در انتظار تعیین نتیجه است؛ مشخصات آن ثابت می‌ماند.<button type="button" disabled={busy} onClick={()=>void sendOpening(pending)}>پیگیری همان درخواست</button></p>}
      <button type="button" className="rev6-more-button secondary" aria-expanded={more} onClick={() => setMore(value => !value)}>{more ? "▴ بستن اطلاعات بیشتر" : "▾ اطلاعات بیشتر (اختیاری)"}</button>
      {more && <fieldset disabled={busy || loading || uncertainCreate || !!pending} className="product-form-fields rev6-extra-fields">
        <label>کد کالا <input dir="ltr" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={64} placeholder={product ? "" : "تولید خودکار هنگام ذخیره"}/><small className="muted">{product ? "کد فعلی قابل ویرایش است." : "خالی بگذارید تا سرور یک کد یکتا بسازد."}</small></label>
        <label>بارکد<input dir="ltr" value={barcode} onChange={event => setBarcode(event.target.value)} maxLength={64} placeholder="اختیاری" /></label>
        {!product && <label>دسته‌بندی<select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">بدون دسته‌بندی</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </fieldset>}
      <div className="form-actions"><button className="primary" type="submit" disabled={busy || loading || uncertainCreate || !!pending || (!product && !unitId)}>{busy ? "در حال ذخیره…" : product ? (!active&&product.isActive ? "ذخیره و غیرفعال‌سازی" : "ذخیره تغییرات") : opening&&kind==="GOODS" ? "ثبت کالا و موجودی اولیه" : "ثبت کالا"}</button><button className="secondary" type="button" disabled={busy} onClick={onCancel}>انصراف</button></div></form>
    </section>
  </FormDrawer>;
}
