import type { ReactNode } from "react";

type Props = { index: number; title: string; hint: string; children: ReactNode; className?: string; id?: string };
export default function InvoiceStep({ index, title, hint, children, className = "", id }: Props) {
  const heading = id ?? `invoice-step-${index}`;
  return <section className={`return-step ${className}`} aria-labelledby={heading}>
    <div className="return-step-header"><span className="return-step-number">{index.toLocaleString("fa-IR")}</span>
      <div><h3 id={heading}>{title}</h3><p>{hint}</p></div></div>
    {children}
  </section>;
}
