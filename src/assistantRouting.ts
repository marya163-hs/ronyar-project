import { todaySalesQuestion } from "./assistantLocalReports";
import type { ReportId } from "./reportCatalog";
import { intentText } from "./assistantIntent";
export type AssistantRequest={id:string;text:string};
export function assistantReport(text:string):ReportId{
  const t=intentText(text);
  if(/صندوق|بانک/.test(t))return "cash";
  if(/موجودی|انبار|چند تا داریم|چقدر داریم|چقدر مونده|چند تا مونده|موجودیش/.test(t)||/^(?:چند تا|چقدر) .+ (?:داریم|مونده)$/.test(t))return "inventory";
  if(/صندوق|بانک/.test(t))return "cash";
  if(/بدهکار|بستانکار|مانده|صورت حساب|طرف حساب/.test(t))return "parties";
  if(/خرید|خریدم/.test(t))return "purchases";
  if(/فروش|فروخت/.test(t))return "sales";
  if(/سود|زیان|تراز/.test(t))return "financial";
  return "books";
}
export const isTodaySalesQuestion = todaySalesQuestion;
export function assistantPartyQuery(text:string){
  const stop=new Set(["چقدر","چقدره","بدهکار","بستانکار","مانده","حساب","است","هست","هستم","هستیم","دارم","داره","دارد","بهم","به","من","نشون","نشان","بده","لطفا","لطفاً","میشه","مشتری","تأمین","تامین","کننده"]);
  return intentText(text).split(" ").filter(word=>!stop.has(word)).join(" ");
}
