import { GuideHint, formHelpTopic } from "./Guidance";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
type Props = { title: string; busy: boolean; onClose: () => void; children: ReactNode };
export default function FormDrawer({ title, busy, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { const element = dialog.current; if (!element) return; const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; const previousOverflow = document.body.style.overflow; element.showModal(); document.body.style.overflow = "hidden"; return () => { element.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); }; }, []);
  return <dialog ref={dialog} className="form-drawer" aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="drawer-header"><div><span className="eyebrow">رانیار</span><h2 id={titleId}>{title}</h2></div><GuideHint topic={formHelpTopic(title)} /><button type="button" className="drawer-close" aria-label="بستن فرم" disabled={busy} onClick={onClose}>&#215;</button></header>
    <div className="drawer-content">{children}</div>
  </dialog>;
}