import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import type { Business } from "./api";
import { formatDecimal } from "./api";
import type { Dashboard } from "./api";
import { jalaliText } from "./jalaliDate";
// Only the chart geometry is scaled; labels keep exact decimal strings.
export function chartGeometry(values:string[]):(number|null)[]{
 const matches=values.map(v=>/^-?\d+(?:\.\d+)?$/.test(v)&&v.length<=1000?v:null);
 const scale=Math.max(0,...matches.map(v=>v?.split(".")[1]?.length??0));
 const ints=matches.map(v=>v===null?null:BigInt(v.replace(".",""))*10n**BigInt(scale-(v.split(".")[1]?.length??0)));
 const maximum=ints.reduce<bigint>((m,v)=>v===null?m:(v<0n?-v:v)>m?(v<0n?-v:v):m,0n);
 return ints.map(v=>v===null?null:maximum===0n?0:Number(v*10000n/maximum)/100);
}
function Bars({business,title,subtitle,rows}:{business?:Business;title:string;subtitle:string;rows:{label:string;value:string;color:string}[]}){
 const ratios=chartGeometry(rows.map(r=>r.value));
 return <section className="snapshot-chart"><header><h2>{title}</h2><span>{subtitle}</span></header><div className="snapshot-rows">{rows.map((row,i)=><div className="snapshot-row" key={row.label}><div><span><i style={{background:row.color}}/>{row.label}</span><strong><bdi>{ratios[i]===null?"نامشخص":formatStoreMoney(business,row.value)}</bdi></strong></div><svg viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="1" width="400" height="12" rx="6" fill="#eef5f8"/><line x1="200" x2="200" y1="0" y2="14" stroke="#b4cdd9"/>{ratios[i]!==null&&<rect x={ratios[i]!<0?200+ratios[i]!*2:200} y="1" width={Math.abs(ratios[i]!)*2} height="12" rx="5" fill={row.color}/>}</svg></div>)}</div><p className="snapshot-chart-note">{ratios.every(v=>v===0)?"در این بازه مبلغی ثبت نشده است.":"طول میله‌ها نسبت مبلغ‌ها را نشان می‌دهد؛ مبالغ منفی سمت چپ خط میانی‌اند."}</p></section>;
}
export default function DashboardSnapshotChart({business,dashboard:d}:{business?:Business;dashboard:Dashboard}){
 const unit=business?storeMoneyUnit(business):storeMoneyUnit(business);
 return <div className="snapshot-charts" aria-label="نمودارهای واقعی فروش و سود"><Bars business={business} title="فروش و برگشت" subtitle={`${jalaliText(d.date)} · ${unit}`} rows={[{label:"فروش ثبت‌شده",value:d.dailySales.saleAmount,color:"#0097a7"},{label:"برگشت فروش",value:d.dailySales.returnAmount,color:"#e2a05b"},{label:"فروش خالص",value:d.dailySales.netAmount,color:"#075477"}]}/><Bars business={business} title="درآمد، هزینه و سود" subtitle={`تا ${jalaliText(d.date)} · ${unit}`} rows={[{label:"درآمد",value:d.profitToDate.totalRevenue,color:"#00a7a0"},{label:"هزینه",value:d.profitToDate.totalExpense,color:"#8b9ec7"},{label:d.profitToDate.result==="LOSS"?"زیان خالص":"سود خالص",value:d.profitToDate.netProfit,color:d.profitToDate.result==="LOSS"?"#c65b69":"#075477"}]}/></div>;
}
