import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import type { Business } from "./api";
import {formatDecimal} from './api';
import type {PartyBalanceRow} from './api';
import type {PartyReportSide,PartyReportSnapshot} from './partyReportData';
import './assistant-party-report.css';
export type PartyAnswer={side:PartyReportSide;snapshot:PartyReportSnapshot;receivedAt:string;selectedParty?:PartyBalanceRow};
export default function AssistantPartyReport({business,answer:a}:{business?:Business;answer:PartyAnswer}){
 const s=a.snapshot;
 if(a.selectedParty){const r=a.selectedParty;return <section className="assistant-party-report" aria-label="مانده شخص انتخاب‌شده"><h3>ماندهٔ فعلی {r.party.name}{!r.party.isActive?' (غیرفعال)':''} · {storeMoneyUnit(business)}</h3><p>{r.balanceSide==='ZERO'?'ماندهٔ این شخص صفر است.':r.balanceSide==='DEBIT'?'طلب شما از این شخص:':'بدهی شما به این شخص:'} <strong>{formatStoreMoney(business,r.balanceAmount)}</strong></p>{a.side==='RECEIVABLES'&&r.balanceSide==='CREDIT'&&<p>طبق خالص دفتر، شما به این شخص بدهکارید.</p>}{a.side==='PAYABLES'&&r.balanceSide==='DEBIT'&&<p>طبق خالص دفتر، این شخص به شما بدهکار است.</p>}<details><summary>جزئیات گزارش</summary><small>خالص همهٔ ثبت‌های قطعی دفتر در تمام دوره‌ها؛ پیش‌نویس‌ها محاسبه نمی‌شوند. زمان دریافت: {a.receivedAt}</small></details></section>;}
 const groups=a.side==='RECEIVABLES'?[{title:'طلب‌های شما از اشخاص',total:s.receivable,rows:s.debtors}]:a.side==='PAYABLES'?[{title:'بدهی‌های شما به اشخاص',total:s.payable,rows:s.creditors}]:[{title:'طلب‌های شما از اشخاص',total:s.receivable,rows:s.debtors},{title:'بدهی‌های شما به اشخاص',total:s.payable,rows:s.creditors}];
 const row=(r:PartyBalanceRow)=><li key={r.party.id}><span>{r.party.name}{!r.party.isActive?' (غیرفعال)':''}</span><strong><bdi>{formatStoreMoney(business,r.balanceAmount)}</bdi></strong></li>;
 return <section className="assistant-party-report" aria-label="گزارش طلب و بدهی اشخاص"><h3>ماندهٔ فعلی اشخاص · {storeMoneyUnit(business)}</h3>{groups.map(g=><section key={g.title}><h4>{g.title}</h4><p>جمع: <strong>{formatStoreMoney(business,g.total)}</strong> · تعداد: {formatDecimal(String(g.rows.length))}</p>{!g.rows.length?<p>شخصی با این سمت مانده در دفتر ثبت‌شده وجود ندارد.</p>:<><ul>{g.rows.slice(0,20).map(row)}</ul>{g.rows.length>20&&<details><summary>نمایش {formatDecimal(String(g.rows.length-20))} شخص دیگر</summary><ul>{g.rows.slice(20).map(row)}</ul></details>}</>}</section>)}<details><summary>جزئیات گزارش</summary><small>بر اساس خالص ماندهٔ هر شخص در همهٔ ثبت‌های قطعی دفتر و تمام دوره‌ها؛ شامل اشخاص غیرفعال. مانده‌های صفر در فهرست نیستند. این اعداد جمع فاکتورهای تسویه‌نشده یا گردش امروز نیستند. زمان دریافت: {a.receivedAt}</small></details></section>;
}
