import {useEffect, useState} from 'react';
import {installedWindow, installAvailable, requestInstall, subscribeInstall} from './desktopInstallEvents';
import './DesktopInstall.css';
export default function DesktopInstall() {
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [help, setHelp] = useState(false);
  useEffect(() => subscribeInstall(() => refresh(value => value + 1)), []);
  if (installedWindow()) return null;
  async function install() {
    if (busy) return;
    if (!installAvailable()) { setHelp(true); return; }
    setBusy(true);
    const result = await requestInstall();
    setBusy(false);
    if (result === 'accepted') setMessage('درخواست نصب پذیرفته شد؛ مراحل مرورگر را دنبال کنید.');
    else if (result === 'dismissed') setMessage('نصب انجام نشد؛ هر زمان خواستید از منوی مرورگر نصب کنید.');
    else { setHelp(true); setMessage('نصب را از منوی مرورگر ادامه دهید.'); }
  }
  return <div className="desktop-install">
    <button type="button" className="desktop-install-button" disabled={busy} onClick={install}>
      {busy ? 'در حال باز کردن نصب…' : 'نصب روی ویندوز'}
    </button>
    <span className="desktop-install-meta">همان حساب و اطلاعات · نیازمند اینترنت</span>
    <details open={help} onToggle={event => setHelp(event.currentTarget.open)}>
      <summary>راهنمای نصب روی کامپیوتر</summary>
      <p>سایت ronyar.ir را در Microsoft Edge یا Google Chrome روی ویندوز باز کنید. دکمهٔ نصب را بزنید؛ اگر پنجره باز نشد، از نشان نصب کنار نوار آدرس یا منوی مرورگر استفاده کنید.</p>
      <p>در Edge گزینهٔ Apps و سپس Install this site as an app را پیدا کنید. در Chrome گزینهٔ Install page as app ممکن است در بخش Cast, save and share باشد. نام گزینه‌ها با زبان و نسخهٔ مرورگر فرق می‌کند.</p>
      <p>رانیار در پنجرهٔ جدا باز می‌شود. با حساب فعلی وارد شوید. این نسخه آنلاین است؛ برای کار با اطلاعات فروشگاه به اینترنت نیاز دارید.</p>
      <p>پس از انتشار تغییرات، با بازکردن دوباره یا تازه‌سازی برنامه نسخهٔ وب دریافت می‌شود. پیش از تازه‌سازی، کار فرم باز را تمام کنید.</p>
    </details>
    {message && <p role="status">{message}</p>}
  </div>;
}
