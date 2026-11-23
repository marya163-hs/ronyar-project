import { useState } from "react";
import type { Product } from "./api";
import { assistantProductCandidates } from "./saleAssistantMatch";
type Props={products:Product[];name:string|null;disabled:boolean;onChange:(id:string)=>void};
export default function AssistantProductChoice({products,name,disabled,onChange}:Props){
  const [showAll,setShowAll]=useState(false);
  const related=assistantProductCandidates(products,name);
  const filtered=Boolean(name?.trim())&&related.length<products.length;
  const choices=showAll?products:related;
  return <div>
    <label>کدام کالا؟<select value="" disabled={disabled||choices.length===0} onChange={e=>onChange(e.target.value)}>
      <option value="">{choices.length?"انتخاب کالا":"کالای مرتبط پیدا نشد"}</option>
      {choices.map(p=><option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
    </select></label>
    {filtered&&<><small>{showAll?"همه کالاهای فعال نمایش داده می‌شوند.":related.length?`فقط کالاهای مرتبط با «${name}» نمایش داده می‌شوند.`:`کالای مرتبط با «${name}» پیدا نشد.`}</small><button type="button" className="text-button" disabled={disabled} onClick={()=>setShowAll(v=>!v)}>{showAll?"فقط کالاهای مرتبط":"نمایش همه کالاها"}</button></>}
  </div>;
}
