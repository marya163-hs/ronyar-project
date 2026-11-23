import type { Business } from "./api";
import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useState } from "react";
import { BasePanel } from "./BaseUi";
import { ApiError, errorText, formatDecimal, getYearEndReconciliation } from "./api";
import type { YearEndReconciliation } from "./api";

type Props = { business?: Business; businessId: string; periodId: string; refreshToken: number; onSessionExpired: () => void };
const labels: Record<string, string> = {
  debit: "بدهکار", credit: "بستانکار", difference: "اختلاف", assets: "دارایی‌ها",
  liabilities: "بدهی‌ها", recordedEquity: "حقوق مالکانه ثبت‌شده", unclosedEarnings: "سود و زیان اختتام‌نیافته",
  stockMovementValue: "ارزش گردش انبار", ledgerInventoryValue: "مانده دفتر کل موجودی",
  stockMovementCount: "تعداد گردش‌های انبار", count: "تعداد", mismatchedCount: "اسناد خارج از بازه", missingCount: "حساب‌های نامعتبر",
  receivableLedger: "مانده دریافتنی دفتر کل", payableLedger: "مانده پرداختنی دفتر کل",
  receivableUnassigned: "مانده دریافتنی بدون شخص", payableUnassigned: "مانده پرداختنی بدون شخص",
  unassignedRows: "ردیف بدون شناسه شخص", partiesCount: "تعداد اشخاص دارای گردش",
  postedPayments: "پرداخت‌های قطعی بررسی‌شده", mismatchedPayments: "پرداخت‌های دارای مغایرت", paymentDifference: "مبلغ اختلاف پرداخت‌ها",
  mismatchedParties: "تعداد اشخاص دارای اختلاف", differenceTotal: "مجموع اختلاف قدرمطلق", invalidAllocations: "تخصیص‌های نامعتبر",
  openingBalances: "افتتاحیه‌های لحاظشده", reversedOpenings: "افتتاحیه‌های برگشت‌شده",
  requiredCashBankAccounts: "حساب‌های مشمول بانک/صندوق", declaredMatchedCashBankAccounts: "تطبیق‌های منطبق در پایان دوره",
  missingCashBankAccounts: "بدون بررسی پایان دوره", staleCashBankAccounts: "بررسی‌های منقضی‌شده",
  differentCashBankAccounts: "حساب‌های دارای اختلاف", futureCashBankAccounts: "حساب‌های با تاریخ پایان آینده",
  exceptionalCashBankAccounts: "حساب‌های دارای مشکل ساختاری/غیرفعال",
};
const countFields = new Set(["count", "stockMovementCount", "mismatchedCount", "missingCount", "unassignedRows", "partiesCount", "postedPayments", "mismatchedPayments", "mismatchedParties", "invalidAllocations", "openingBalances", "reversedOpenings", "requiredCashBankAccounts", "declaredMatchedCashBankAccounts", "missingCashBankAccounts", "staleCashBankAccounts", "differentCashBankAccounts", "futureCashBankAccounts", "exceptionalCashBankAccounts"]);

export default function YearEndReconciliationPanel({ business, businessId, periodId, refreshToken, onSessionExpired }: Props) {
  const [data, setData] = useState<YearEndReconciliation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!periodId) { setData(null); return; }
    const controller = new AbortController();
    setData(null); setError(""); setLoading(true);
    getYearEndReconciliation(businessId, periodId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(errorText(err));
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [businessId, periodId, refreshToken, onSessionExpired]);
  return <BasePanel title="تطبیق‌های داخلی پایان سال — Rev8.3k" note="تطبیق مستقل اشخاص و پوشش اظهار مانده بانک/صندوق در پایان دوره بررسی می‌شود؛ اصالت مدارک بانکی و شمارش واقعی همچنان نیازمند بررسی حسابدار است.">
    {loading && <p role="status">در حال تطبیق مانده‌ها…</p>}
    {error && <p className="notice error" role="alert">کنترل تطبیق قابل دریافت نیست: {error}</p>}
    {data && <>
      <p><strong>نتیجه بررسی:</strong> {formatDecimal(String(data.summary.passed))} کنترل بدون اختلاف، {formatDecimal(String(data.summary.failed))} کنترل دارای اختلاف، {formatDecimal(String(data.summary.notChecked))} کنترل انجام‌نشده.</p>
      <div className="base-table-scroll"><table className="base-table"><thead><tr><th>کنترل</th><th>وضعیت</th><th>توضیح و مبالغ</th></tr></thead><tbody>
        {data.checks.map(check => <tr key={check.code}>
          <td><strong>{check.title}</strong></td>
          <td><strong>{check.status === "PASS" ? "بدون اختلاف" : check.status === "FAIL" ? "مغایرت / مانع" : "نیازمند بررسی"}</strong></td>
          <td><div>{check.message}</div>{check.amounts && <div className="base-soft">{Object.entries(check.amounts).map(([key, value]) =>
            <span key={key} style={{ display: "inline-block", marginLeft: 12 }}>{labels[key] ?? key}: {(countFields.has(key) ? formatDecimal(value) : formatStoreMoney(business, value))}{countFields.has(key) ? "" : ` ${storeMoneyUnit(business)}`}</span>
          )}</div>}{check.examples?.length ? <ul>{check.examples.map((example, i) => <li key={i}>{example}</li>)}</ul> : null}
            {check.partyBalances?.length ? <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>ریز مقایسه {formatDecimal(String(check.partyBalances.length))} طرف‌حساب</summary>
              <div className="base-table-scroll"><table className="base-table" style={{ marginTop: 8 }}>
                <thead><tr><th>طرف‌حساب</th><th>طلب عملیاتی</th><th>طلب دفتر کل</th><th>اختلاف طلب</th><th>بدهی عملیاتی</th><th>بدهی دفتر کل</th><th>اختلاف بدهی</th></tr></thead>
                <tbody>{check.partyBalances.map(party => <tr key={party.partyId}>
                  <td><strong>{party.partyName}</strong></td>
                  <td>{formatStoreMoney(business, party.operationalReceivable)}</td><td>{formatStoreMoney(business, party.ledgerReceivable)}</td>
                  <td><strong>{formatStoreMoney(business, party.receivableDifference)}</strong></td>
                  <td>{formatStoreMoney(business, party.operationalPayable)}</td><td>{formatStoreMoney(business, party.ledgerPayable)}</td>
                  <td><strong>{formatStoreMoney(business, party.payableDifference)}</strong></td>
                </tr>)}</tbody>
              </table></div>
              {check.truncated && <p className="notice">فقط ۲۰۰ ردیف اول نمایش داده شده‌اند؛ شمارش مغایرت‌ها روی تمام طرف‌حساب‌ها انجام شده است.</p>}
              <p className="base-soft">تمام مبالغ به {storeMoneyUnit(business)} هستند. اعداد منفی به معنی مانده معکوس یا بستانکاری طرف‌حساب‌اند.</p>
            </details> : null}</td>
        </tr>)}
      </tbody></table></div>
      <p>سود / زیان محاسبه‌شده از گردش‌های همین دوره: <strong>{formatStoreMoney(business, data.metrics.periodProfit)} {storeMoneyUnit(business)}</strong>.</p>
      <p className="notice">{data.note} <strong>صدور سند و اجرای اختتام همچنان غیرفعال است.</strong></p>
    </>}
  </BasePanel>;
}
