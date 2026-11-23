import { formatDecimal } from "./api";
export type ExportCell={value:string;numeric?:boolean};
export type ReportOutput={title:string;businessName:string;scope:string[];exportedAt:string;columns:string[];rows:ExportCell[][];summary:{label:string;cell:ExportCell}[];fileStem:string};
export const textCell=(value:string):ExportCell=>({value});
export const numberCell=(value:string):ExportCell=>({value,numeric:true});
const escape=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export const outputTime=(iso:string)=>new Intl.DateTimeFormat("fa-IR",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Tehran"}).format(new Date(iso));
const display=(c:ExportCell)=>c.numeric?formatDecimal(c.value):c.value;
export function reportHtml(r:ReportOutput):string{
  const rows=r.rows.map(row=>`<tr>${row.map(c=>`<td>${c.numeric?`<bdi>${escape(display(c))}</bdi>`:escape(c.value)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(r.title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;font-size:12px;line-height:1.8;color:#163c32;margin:0;background:#f1f5f1}.tools{padding:12px;text-align:center;background:#fff}.tools button{font:inherit;padding:9px 20px;cursor:pointer}.sheet{background:#fff;margin:18px auto;padding:18px;max-width:290mm}h1{font-size:20px;margin:0}h2{font-size:17px;margin:4px 0 12px}.meta{font-size:11px;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}th,td{border:1px solid #becdc2;padding:7px 5px;text-align:right;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eef4ee}thead{display:table-header-group}tr{break-inside:avoid}.summary{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0;break-inside:avoid}.summary div{border:1px solid #becdc2;padding:8px 12px}bdi{unicode-bidi:isolate}.footer{font-size:10px;margin-top:14px;color:#526e5e}@media print{body{background:#fff;color:#000}.tools{display:none}.sheet{margin:0;padding:0;max-width:none}h1,h2,.meta{break-after:avoid}th{print-color-adjust:exact}}</style></head><body><div class="tools"><button type="button" id="report-print">چاپ یا ذخیره PDF</button></div><main class="sheet"><h1>${escape(r.businessName)}</h1><h2>${escape(r.title)}</h2><div class="meta">${r.scope.map(escape).join(" · ")}<br>زمان تهیه به وقت تهران: ${escape(outputTime(r.exportedAt))} · ${escape(formatDecimal(String(r.rows.length)))} ردیف؛ تمام نتیجه گزارش</div><div class="summary">${r.summary.map(s=>`<div>${escape(s.label)}: <strong>${escape(display(s.cell))}</strong></div>`).join("")}</div><table><thead><tr>${r.columns.map(c=>`<th scope="col">${escape(c)}</th>`).join("")}</tr></thead><tbody>${rows||`<tr><td colspan="${r.columns.length}">گردش یا ردیفی در این محدوده وجود ندارد.</td></tr>`}</tbody></table><p class="footer">رانیار · خروجی از آخرین داده‌ها در زمان دریافت تهیه شده است.</p></main></body></html>`;
}
export function reportCsv(r:ReportOutput):string{
  // Numeric cells are text in spreadsheet applications: preserve all Decimal and bigint digits.
  // Prefix potentially executable user text before CSV quoting; no formulas are generated.
  const csv=(c:ExportCell)=>{const value=c.numeric||/^[\s\u0000-\u001f]*[=+\-@]/.test(c.value)?"'"+c.value:c.value;return '"'+value.replace(/"/g,'""')+'"';};
  const rows:ExportCell[][]=[[textCell(r.title)],[textCell("فروشگاه"),textCell(r.businessName)],...r.scope.map(s=>[textCell(s)]),[textCell("زمان تهیه به وقت تهران"),textCell(outputTime(r.exportedAt))],...r.summary.map(s=>[textCell(s.label),s.cell]),[],r.columns.map(textCell),...r.rows];
  return "\ufeff"+rows.map(row=>row.map(csv).join(",")).join("\r\n");
}
export function downloadReportCsv(r:ReportOutput):void{
  const url=URL.createObjectURL(new Blob([reportCsv(r)],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${r.fileStem.replace(/[^a-zA-Z0-9_-]/g,"-")}-${r.exportedAt.slice(0,10)}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
