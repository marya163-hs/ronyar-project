import "./AccountCodeDetails.css";
export default function AccountCodeDetails({ code }: { code: string }) {
  return <details className="account-code-details"><summary>جزئیات حساب</summary><div><span>کد حساب: </span><bdi dir="ltr">{code}</bdi></div></details>;
}
