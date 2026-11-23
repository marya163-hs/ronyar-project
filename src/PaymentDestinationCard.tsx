import {useState} from "react";
import type {ShopPaymentDestination} from "./api";
export default function PaymentDestinationCard({destination:d}:{destination:ShopPaymentDestination}) {
 const [notice,setNotice]=useState("");
 return <div className="shop-quote"><b>کارت مقصد پرداخت</b><p><bdi dir="ltr" style={{userSelect:"all",fontSize:"1.15em",letterSpacing:".04em"}}>{d.cardNumber.replace(/(.{4})(?=.)/g,"$1 ")}</bdi></p><p>{d.accountHolder} · {d.bankName}</p><button type="button" className="secondary" onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(d.cardNumber);setNotice("شماره کارت کپی شد.");}catch{setNotice("کپی خودکار انجام نشد؛ شماره کارت را انتخاب و کپی کنید.");}})();}}>کپی شماره کارت</button>{notice&&<small role="status">{notice}</small>}<small>مبلغ نهایی همین درخواست را واریز و شماره پیگیری را به پشتیبانی اعلام کنید. فعال‌سازی پس از تأیید واریز انجام می‌شود.</small></div>;
}
