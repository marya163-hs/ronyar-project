import { useRef, useState } from "react";
import { ApiError, shopUploadReceipt, type ShopReceipt } from "./api";
export default function PaymentReceiptUpload({
  businessId,
  orderId,
  receipts,
  onUploaded,
}: {
  businessId: string;
  orderId: string;
  receipts: ShopReceipt[];
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const command = useRef(crypto.randomUUID());
  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await shopUploadReceipt(businessId, orderId, command.current, file);
      setMessage(
        "فیش ارسال شد و به پشتیبانی اطلاع داده شد؛ تأیید واریز در انتظار بررسی است.",
      );
      setFile(null);
      onUploaded();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setMessage(
        code === "SHOP_RECEIPT_LIMIT"
          ? "سقف ارسال فیش تکمیل شده؛ با پشتیبانی تماس بگیرید."
          : code === "SHOP_RECEIPT_CLOSED"
            ? "این درخواست فیش جدید نمی‌پذیرد؛ اطلاعات را به‌روز کنید."
            : code === "SHOP_RECEIPT_FILE"
              ? "فقط تصویر JPG یا PNG تا ۲ مگابایت پذیرفته می‌شود."
              : "ارسال تأیید نشد؛ اطلاعات را به‌روز کنید. برای تلاش دوباره همان فایل را ارسال کنید.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shop-quote">
      <b>ارسال فیش واریز</b>
      {receipts.length > 0 && (
        <p>
          {new Intl.NumberFormat("fa-IR").format(receipts.length)} فیش دریافت
          شده؛ در انتظار بررسی پشتیبانی.
        </p>
      )}
      <label>
        تصویر فیش
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy || receipts.length >= 3}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setMessage("");
            if (!f) return;
            if (
              !["image/png", "image/jpeg"].includes(f.type) ||
              f.size > 2 * 1024 * 1024
            ) {
              setFile(null);
              setMessage("فقط تصویر JPG یا PNG تا ۲ مگابایت انتخاب کنید.");
              return;
            }
            setFile(f);
            command.current = crypto.randomUUID();
          }}
        />
      </label>
      <small>
        حداکثر ۳ تصویر برای هر درخواست؛ ارسال فیش به‌معنای تأیید پرداخت نیست.
      </small>
      <button
        type="button"
        disabled={!file || busy || receipts.length >= 3}
        onClick={() => void submit()}
      >
        {busy ? "در حال ارسال…" : "ارسال فیش به پشتیبانی"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
