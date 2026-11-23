import { formatStoreMoney, storeMoneyUnit } from "./storeMoney";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import FormDrawer from "./FormDrawer";
import JalaliDateField from "./JalaliDateField";
import MoneyInput from "./MoneyInput";
import JournalDetailsPanel from "./JournalDetailsPanel";
import { useStoreCan } from "./StorePermissions";
import { jalaliText } from "./jalaliDate";
import { periodForDate } from "./documentPeriod";
import { cashOperationAmount } from "./cashOperationOptions";
import {
  ApiError,
  errorText,
  formatDecimal,
  tehranToday,
  listCheques,
  getCheque,
  recoverChequeRequest,
  chequeCommand,
  listActiveAccounts,
  listFiscalPeriods,
  listParties,
  listSales,
  listPurchases,
  listOpeningBalances,
} from "./api";
import type {
  Business,
  ChequeRow,
  ChequeDetails,
  ChequeState,
  ChequeActionName,
  ChequeCreateInput,
  ChequeActionInput,
  Account,
  FiscalPeriod,
  Party,
} from "./api";
import {
  chequeStateLabel,
  chequeActions,
  chequeActionLabel,
  parsePendingCheque,
  chequeDigits,
} from "./chequeClientState";
import type { PendingCheque } from "./chequeClientState";
import "./ChequeManager.css";
type Target = { id: string; label: string };
export default function ChequeManager({
  business,
  userId,
  onClose,
  onSessionExpired,
}: {
  business: Business;
  userId: string;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const can = useStoreCan(),
    scope = `${userId}:${business.id}`,
    storageKey = `ranyar:cheques:${scope}`;
  const [rows, setRows] = useState<ChequeRow[]>([]),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [filter, setFilter] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<"CREATE" | ChequeActionName | null>(
      null,
    ),
    [selected, setSelected] = useState<ChequeRow | null>(null),
    [detail, setDetail] = useState<ChequeDetails | null>(null),
    [entryId, setEntryId] = useState<string | null>(null);
  const [kind, setKind] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE"),
    [serial, setSerial] = useState(""),
    [bankName, setBankName] = useState(""),
    [sayad, setSayad] = useState(""),
    [amount, setAmount] = useState(""),
    [partyId, setPartyId] = useState(""),
    [accountId, setAccountId] = useState(""),
    [date, setDate] = useState(tehranToday),
    [due, setDue] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [targetId, setTargetId] = useState(""),
    [targetKind, setTargetKind] = useState<"INVOICE" | "OPENING">("INVOICE"),
    [targetPage, setTargetPage] = useState(1),
    [targetPages, setTargetPages] = useState(1);
  const [accounts, setAccounts] = useState<Account[]>([]),
    [periods, setPeriods] = useState<FiscalPeriod[]>([]),
    [parties, setParties] = useState<Party[]>([]),
    [targets, setTargets] = useState<Target[]>([]),
    [optionsLoading, setOptionsLoading] = useState(false),
    [optionsError, setOptionsError] = useState(""),
    [targetsLoading, setTargetsLoading] = useState(false),
    [targetsError, setTargetsError] = useState("");
  const [pending, setPending] = useState<PendingCheque | null>(null),
    [storageError, setStorageError] = useState(false);
  const sending = useRef(false),
    alive = useRef(true);
  const canWrite =
    can("payments.manage") &&
    can("payments.post") &&
    can("accounts.read") &&
    can("periods.read") &&
    can("parties.read");
  const supplier =
      editor === "ENDORSE" || (editor === "CREATE" && kind === "PAYABLE"),
    needsTarget = editor === "CREATE" || editor === "ENDORSE";
  useEffect(() => {
    alive.current = true;
    try {
      setPending(parsePendingCheque(sessionStorage.getItem(storageKey), scope));
    } catch (e) {
      setStorageError(true);
      setError(
        e instanceof Error
          ? e.message
          : "امکان بازیابی درخواست قبلی وجود ندارد.",
      );
    }
    return () => {
      alive.current = false;
    };
  }, [storageKey, scope]);
  function fail(e: unknown) {
    if (!alive.current) return;
    setError(
      e instanceof ApiError
        ? errorText(e)
        : e instanceof Error
          ? e.message
          : errorText(e),
    );
    if (e instanceof ApiError && e.status === 401) onSessionExpired();
  }
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    listCheques(business.id, page, filter, c.signal)
      .then((r) => {
        if (c.signal.aborted) return;
        if (r.totalPages > 0 && page > r.totalPages) {
          setPage(r.totalPages);
          return;
        }
        setRows(r.items);
        setPages(Math.max(1, r.totalPages));
      })
      .catch((e) => {
        if (!c.signal.aborted) fail(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [business.id, page, filter, refresh]);
  useEffect(() => {
    if (!editor || !canWrite) return;
    const c = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    (async () => {
      const [a, p] = await Promise.all([
        listActiveAccounts(business.id, c.signal),
        listFiscalPeriods(business.id, c.signal),
      ]);
      const all: Party[] = [];
      for (let page = 1; page <= 100; page++) {
        const r = await listParties(
          business.id,
          "ACTIVE",
          "ALL",
          page,
          c.signal,
        );
        all.push(...r.items);
        if (page >= r.totalPages) {
          if (!c.signal.aborted) {
            setAccounts(a);
            setPeriods(p);
            setParties(all);
          }
          return;
        }
        if (page === 100)
          throw Error(
            "تعداد اشخاص بیش از ظرفیت این فهرست است؛ با پشتیبانی هماهنگ کنید.",
          );
      }
    })()
      .catch((e) => {
        if (!c.signal.aborted) {
          setOptionsError(errorText(e));
          if (e instanceof ApiError && e.status === 401) onSessionExpired();
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setOptionsLoading(false);
      });
    return () => c.abort();
  }, [business.id, editor, canWrite, refresh]);
  useEffect(() => {
    if (!needsTarget || !partyId) {
      setTargets([]);
      return;
    }
    const c = new AbortController();
    setTargetsLoading(true);
    setTargetsError("");
    (async () => {
      if (targetKind === "OPENING") {
        const r = await listOpeningBalances(business.id, c.signal);
        if (!c.signal.aborted) {
          setTargets(
            r
              .filter(
                (x) =>
                  x.partyId === partyId &&
                  x.status === "POSTED" &&
                  !x.reversed &&
                  x.kind === (supplier ? "PAYABLE" : "RECEIVABLE"),
              )
              .map((x) => ({
                id: x.id,
                label: `مانده اولیه · ${jalaliText(x.documentDate)} · ${formatStoreMoney(business, x.remainingAmount)} ${storeMoneyUnit(business)}`,
              })),
          );
          setTargetPages(1);
        }
      } else {
        const r = await (supplier ? listPurchases : listSales)(
          business.id,
          "POSTED",
          targetPage,
          c.signal,
        );
        if (!c.signal.aborted) {
          setTargets(
            r.items
              .filter((x) => x.party?.id === partyId)
              .map((x) => ({
                id: x.id,
                label: `فاکتور ${x.number ?? "—"} · ${jalaliText(x.documentDate)} · مبلغ سند ${formatStoreMoney(business, x.total)}`,
              })),
          );
          setTargetPages(Math.max(1, r.totalPages));
        }
      }
    })()
      .catch((e) => {
        if (!c.signal.aborted) {
          setTargetsError(errorText(e));
          if (e instanceof ApiError && e.status === 401) onSessionExpired();
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setTargetsLoading(false);
      });
    return () => c.abort();
  }, [
    business.id,
    partyId,
    supplier,
    targetKind,
    targetPage,
    needsTarget,
    refresh,
  ]);
  function start(
    action: "CREATE" | ChequeActionName,
    c: ChequeRow | null = null,
  ) {
    setEditor(action);
    setSelected(c);
    setDetail(null);
    setError("");
    setMessage("");
    setPartyId("");
    setAccountId("");
    setTargetId("");
    setTargetKind("INVOICE");
    setTargetPage(1);
    setReason("");
    setAck(false);
    setDate(tehranToday());
    if (action === "CREATE") {
      setKind("RECEIVABLE");
      setSerial("");
      setBankName("");
      setSayad("");
      setAmount("");
      setDue("");
    }
  }
  async function complete(request: PendingCheque) {
    sessionStorage.removeItem(storageKey);
    if (!alive.current) return;
    setPending(null);
    setEditor(null);
    setSelected(null);
    setMessage("عملیات چک ثبت شد؛ فهرست به‌روزرسانی می‌شود.");
    setRefresh((v) => v + 1);
  }
  async function send(request: PendingCheque, replay = false) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await chequeCommand(business.id, request.id, request.body, request.key);
      await complete(request);
    } catch (e) {
      if (!alive.current) return;
      const definite =
        e instanceof ApiError &&
        [
          "CHEQUE_ALLOCATION",
          "CHEQUE_DUPLICATE",
          "CHEQUE_STATE",
          "CHEQUE_VERSION",
          "CHEQUE_PERIOD",
          "CHEQUE_BANK",
          "CHEQUE_ACCOUNT",
          "CHEQUE_REVERSE",
        ].includes(e.code);
      const unknown =
        replay ||
        !(e instanceof ApiError) ||
        e.status >= 500 ||
        e.status === 408 ||
        (e.status === 409 && !definite);
      if (!unknown) {
        try {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        } catch {
          setStorageError(true);
        }
      }
      fail(e);
      if (unknown)
        setError(
          "نتیجه عملیات مشخص نیست؛ اطلاعات ثابت مانده است. ابتدا «بررسی نتیجه» و در صورت نیاز «تکرار همان درخواست» را بزنید.",
        );
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function recover() {
    if (!pending || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await recoverChequeRequest(business.id, pending.key);
      await complete(pending);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        setError(
          "هنوز نتیجه ثبت‌شده‌ای برای این درخواست پیدا نشد. اطلاعات را تغییر ندهید؛ می‌توانید بررسی یا همان درخواست را تکرار کنید.",
        );
      else fail(e);
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending.current || pending || storageError || !canWrite) return;
    setError("");
    try {
      if (
        optionsLoading ||
        optionsError ||
        (needsTarget && (targetsLoading || targetsError))
      )
        throw Error("ابتدا دریافت اطلاعات فرم را کامل کنید.");
      const period = periodForDate(periods, date);
      if (!period) throw Error("برای این تاریخ دوره مالی باز وجود ندارد.");
      if (!ack) throw Error("تأیید اثر مالی عملیات لازم است.");
      const allocationType = supplier
        ? targetKind === "OPENING"
          ? "OPENING_PAYABLE"
          : "PURCHASE"
        : targetKind === "OPENING"
          ? "OPENING_RECEIVABLE"
          : "SALE";
      if (
        needsTarget &&
        (!partyId || !targetId || !targets.some((t) => t.id === targetId))
      )
        throw Error("طرف حساب و سند مرتبط را انتخاب کنید.");
      let body: ChequeCreateInput | ChequeActionInput;
      if (editor === "CREATE") {
        const value = cashOperationAmount(amount, business.currencyScale),
          serialValue = chequeDigits(serial.trim()),
          sayadValue = chequeDigits(sayad.trim());
        if (!serialValue || !bankName.trim() || !due || (kind === 'PAYABLE' && due < date))
          throw Error("شماره، نام بانک و تاریخ سررسید معتبر را وارد کنید.");
        if (sayadValue && !/^\d{16}$/.test(sayadValue))
          throw Error("شناسه صیادی باید ۱۶ رقم باشد.");
        if (kind === "PAYABLE" && !accountId)
          throw Error("حساب صادرکننده چک را انتخاب کنید.");
        body = {
          kind,
          serial: serialValue,
          bankName: bankName.trim(),
          ...(sayadValue ? { sayadId: sayadValue } : {}),
          amount: value,
          partyId,
          periodId: period.id,
          issueDate: date,
          dueDate: due,
          ...(kind === "PAYABLE" ? { issuerAccountId: accountId } : {}),
          allocations: [
            { targetType: allocationType, targetId, amount: value },
          ],
        };
      } else {
        if (!selected || !editor) throw Error("چک انتخاب نشده است.");
        if (reason.trim().length < 10)
          throw Error("شرح یا مدرک عملیات را حداقل در ۱۰ نویسه وارد کنید.");
        if (editor === "CLEAR" && selected.state === "IN_HAND" && !accountId)
          throw Error("حساب وصول چک را انتخاب کنید.");
        body = {
          action: editor,
          version: selected.version,
          periodId: period.id,
          documentDate: date,
          reason: reason.trim(),
          ...(editor === "ENDORSE"
            ? {
                partyId,
                allocations: [
                  {
                    targetType: allocationType,
                    targetId,
                    amount: selected.amount,
                  },
                ],
              }
            : {}),
          ...(editor === "CLEAR" && selected.state === "IN_HAND"
            ? { accountId }
            : {}),
        };
      }
      const request: PendingCheque = {
        scope,
        id: editor === "CREATE" ? null : selected!.id,
        key: `web-cheque-${crypto.randomUUID()}`,
        body,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await send(request);
    } catch (e) {
      fail(e);
    }
  }
  const banks = accounts.filter(
      (x) =>
        x.isActive &&
        x.isPosting &&
        x.isCashBank &&
        x.type === "ASSET" &&
        x.normalSide === "DEBIT",
    ),
    unit = storeMoneyUnit(business);
  const bankField = (
    <label>
      حساب {editor === "CREATE" ? "صادرکننده" : "وصول"}
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        required
      >
        <option value="">انتخاب حساب</option>
        {banks.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <FormDrawer title="مدیریت چک‌ها" busy={busy} onClose={onClose}>
      <section className="cheque-manager">
        {entryId ? (
          <JournalDetailsPanel
            business={business}
            entryId={entryId}
            onClose={() => setEntryId(null)}
            onSessionExpired={onSessionExpired}
          />
        ) : (
          <>
            <details>
              <summary>راهنمای چک‌ها</summary>
              <p>
                دریافت و صدور چک، فاکتور یا مانده اولیه را از طریق حساب اسناد
                دریافتنی/پرداختنی تسویه می‌کند. تا وصول یا پاس‌شدن، این مبلغ وجه
                نقد بانک نیست. واگذاری، تمام مبلغ همان چک را به تأمین‌کننده
                منتقل می‌کند. برگشت چک، مانده اسناد مرتبط را باز می‌کند.
              </p>
              <p>
                این نسخه هر چک را به یک سند متصل می‌کند. چک وصول‌شده، برگشتی یا
                باطل‌شده از همین صفحه دوباره تغییر نمی‌کند؛ برای اصلاح مورد قطعی
                با پشتیبانی هماهنگ کنید.
              </p>
            </details>
            <p className="muted">
              ثبت داخلی چک و پیگیری حسابداری؛ استعلام یا انتقال در سامانه صیاد
              انجام نمی‌شود. موجودی بانک فقط با ثبت وصول یا پاس‌شدن تغییر
              می‌کند.
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {pending && (
              <div className="notice">
                <strong>درخواست در انتظار تعیین نتیجه است.</strong>
                <p>
                  شناسه: <bdi>{pending.key}</bdi>
                </p>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void recover()}
                >
                  بررسی نتیجه
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !canWrite}
                  onClick={() => void send(pending, true)}
                >
                  تکرار همان درخواست
                </button>
              </div>
            )}
            {editor && !pending && (
              <form onSubmit={submit} className="cheque-editor">
                <h3>
                  {editor === "CREATE"
                    ? "ثبت چک جدید"
                    : chequeActionLabel[editor]}
                </h3>
                <fieldset
                  className="cheque-grid"
                  disabled={busy || !!pending || storageError || !canWrite}
                >
                  {editor === "CREATE" ? (
                    <>
                      <label>
                        نوع چک
                        <select
                          value={kind}
                          onChange={(e) => {
                            setKind(e.target.value as typeof kind);
                            setPartyId("");
                            setTargetId("");
                            setTargetPage(1);
                            setAccountId("");
                          }}
                        >
                          <option value="RECEIVABLE">دریافت از مشتری</option>
                          <option value="PAYABLE">صدور برای تأمین‌کننده</option>
                        </select>
                      </label>
                      <label>
                        شماره چک
                        <input
                          value={serial}
                          onChange={(e) => setSerial(e.target.value)}
                          required
                          maxLength={64}
                        />
                      </label>
                      <label>
                        نام بانک
                        <input
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </label>
                      <label>
                        شناسه صیادی (اختیاری)
                        <input
                          inputMode="numeric"
                          dir="ltr"
                          value={sayad}
                          onChange={(e) => setSayad(e.target.value)}
                          maxLength={64}
                        />
                      </label>
                      <label>
                        مبلغ چک ({unit})
                        <MoneyInput business={business}
                          value={amount}
                          onChange={setAmount}
                          required
                        />
                      </label>
                      <JalaliDateField
                        id="cheque-due"
                        label="سررسید (شمسی)"
                        value={due}
                        minISO={kind === 'PAYABLE' ? date : undefined}
                        onChange={setDue}
                      />
                      {kind === "PAYABLE" && bankField}
                    </>
                  ) : (
                    <p className="notice cheque-wide">
                      چک {selected?.serial} ·{" "}
                      {formatStoreMoney(business, selected?.amount ?? "0")} {unit} ·{" "}
                      {selected && chequeStateLabel[selected.state]}
                      <br />
                      {editor === "BOUNCE"
                        ? "برگشت چک، مانده اسناد مرتبط را باز می‌کند. برای چک واگذارشده، تسویه مشتری و تأمین‌کننده هر دو برمی‌گردند."
                        : editor === "CANCEL"
                          ? "ابطال، دریافت یا پرداخت اولیه را با سند معکوس برمی‌گرداند؛ سوابق حذف نمی‌شوند."
                          : editor === "RETURN_ENDORSE"
                            ? "تسویه تأمین‌کننده برمی‌گردد و چک دوباره نزد فروشگاه خواهد بود."
                            : editor === "ENDORSE"
                              ? "کل مبلغ همین چک به تأمین‌کننده واگذار می‌شود؛ بانک فروشگاه تغییر نمی‌کند."
                              : selected?.state === "ENDORSED"
                                ? "فقط پس از تأیید وصول توسط دارنده ثبت کنید؛ بانک فروشگاه تغییری نمی‌کند."
                                : "فقط پس از مشاهده عملیات واقعی بانک ثبت کنید؛ مانده حساب بانک تغییر می‌کند."}
                    </p>
                  )}
                  <JalaliDateField
                    id="cheque-action-date"
                    label={
                      editor === "CREATE"
                        ? "تاریخ دریافت / تحویل (شمسی)"
                        : "تاریخ عملیات (شمسی)"
                    }
                    value={date}
                      minISO={editor === 'CREATE' ? undefined : selected?.lastEventDate}
                    onChange={setDate}
                  />
                  {editor === "CLEAR" &&
                    selected?.state === "IN_HAND" &&
                    bankField}
                  {needsTarget && (
                    <>
                      <label>
                        {supplier ? "تأمین‌کننده" : "مشتری"}
                        <select
                          value={partyId}
                          onChange={(e) => {
                            setPartyId(e.target.value);
                            setTargetId("");
                            setTargetPage(1);
                          }}
                          required
                        >
                          <option value="">انتخاب طرف حساب</option>
                          {parties
                            .filter(
                              (p) =>
                                !p.isCashCustomer &&
                                (supplier
                                  ? p.supplierEnabled
                                  : p.customerEnabled),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        نوع سند مرتبط
                        <select
                          value={targetKind}
                          onChange={(e) => {
                            setTargetKind(e.target.value as typeof targetKind);
                            setTargetId("");
                            setTargetPage(1);
                          }}
                        >
                          <option value="INVOICE">
                            فاکتور {supplier ? "خرید" : "فروش"}
                          </option>
                          <option value="OPENING">
                            مانده اولیه {supplier ? "بدهی" : "مطالبات"}
                          </option>
                        </select>
                      </label>
                      <label className="cheque-wide">
                        سند مرتبط
                        <select
                          value={targetId}
                          onChange={(e) => setTargetId(e.target.value)}
                          required
                          disabled={targetsLoading}
                        >
                          <option value="">انتخاب سند قطعی</option>
                          {targets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <small>
                          فهرست فقط اسناد همین طرف حساب در صفحه انتخابی است.
                          سرور مانده قابل تسویه را دوباره بررسی می‌کند.
                        </small>
                      </label>
                      {targetKind === "INVOICE" && (
                        <div className="cheque-wide form-actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={targetPage <= 1 || targetsLoading}
                            onClick={() => {
                              setTargetPage((v) => v - 1);
                              setTargetId("");
                            }}
                          >
                            صفحه قبل اسناد
                          </button>
                          <span>
                            {targetPage} / {targetPages}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            disabled={
                              targetPage >= targetPages || targetsLoading
                            }
                            onClick={() => {
                              setTargetPage((v) => v + 1);
                              setTargetId("");
                            }}
                          >
                            صفحه بعد اسناد
                          </button>
                        </div>
                      )}
                      {targetsError && (
                        <p className="notice error cheque-wide">
                          {targetsError}
                        </p>
                      )}
                    </>
                  )}
                  {editor !== "CREATE" && (
                    <label className="cheque-wide">
                      شرح / شماره پیگیری یا مدرک عملیات
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                        minLength={10}
                        maxLength={500}
                      />
                    </label>
                  )}
                  <label className="cheque-wide">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      required
                    />{" "}
                    اطلاعات و اثر مالی این عملیات را بررسی و تأیید می‌کنم؛ ثبت
                    قطعی است.
                  </label>
                </fieldset>
                {optionsLoading && <p role="status">دریافت اطلاعات فرم…</p>}
                {optionsError && <p className="notice error">{optionsError}</p>}
                <div className="form-actions">
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      optionsLoading ||
                      !!optionsError ||
                      targetsLoading ||
                      !!targetsError ||
                      storageError ||
                      !canWrite
                    }
                  >
                    {busy ? "در حال ثبت…" : "ثبت قطعی"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setEditor(null)}
                  >
                    بستن فرم
                  </button>
                </div>
              </form>
            )}
            {!editor && (
              <>
                <div className="form-actions">
                  {canWrite && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !!pending || storageError}
                      onClick={() => start("CREATE")}
                    >
                      + چک جدید
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRefresh((v) => v + 1)}
                  >
                    به‌روزرسانی
                  </button>
                  <label>
                    وضعیت
                    <select
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">همه وضعیت‌ها</option>
                      {Object.entries(chequeStateLabel).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {loading ? (
                  <p role="status">دریافت چک‌ها…</p>
                ) : rows.length ? (
                  <div className="base-table-scroll cheque-list">
                    <table className="base-table cheque-table">
                      <thead>
                        <tr>
                          <th>چک / بانک</th>
                          <th>طرف حساب</th>
                          <th>مبلغ</th>
                          <th>سررسید</th>
                          <th>وضعیت</th>
                          <th>عملیات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c) => (
                          <tr key={c.id}>
                            <td data-label="چک / بانک">
                              <strong>{c.serial}</strong>
                              <small>
                                {c.bankName} ·{" "}
                                {c.kind === "RECEIVABLE"
                                  ? "دریافتی"
                                  : "پرداختی"}
                              </small>
                            </td>
                            <td data-label="طرف حساب">
                              {c.partyName}
                              {c.holderName && (
                                <small>دارنده: {c.holderName}</small>
                              )}
                            </td>
                            <td data-label="مبلغ">
                              {formatStoreMoney(business, c.amount)} {unit}
                            </td>
                            <td data-label="سررسید">{jalaliText(c.dueDate)}</td>
                            <td data-label="وضعیت">{chequeStateLabel[c.state]}</td>
                            <td data-label="عملیات">
                              <div className="cheque-row-actions">
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    setError("");
                                    void getCheque(business.id, c.id)
                                      .then(setDetail)
                                      .catch(fail);
                                  }}
                                >
                                  سابقه
                                </button>
                                {canWrite &&
                                  !pending &&
                                  chequeActions(c.kind, c.state).map((a) => (
                                    <button
                                      type="button"
                                      key={a}
                                      className="secondary"
                                      disabled={busy || storageError}
                                      onClick={() => start(a, c)}
                                    >
                                      {chequeActionLabel[a]}
                                    </button>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>چکی در این صفحه نیست.</p>
                )}
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((v) => v - 1)}
                  >
                    قبلی
                  </button>
                  <span>
                    صفحه {page} از {pages}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={page >= pages || loading}
                    onClick={() => setPage((v) => v + 1)}
                  >
                    بعدی
                  </button>
                </div>
              </>
            )}
            {detail && (
              <section className="notice">
                <h3>سابقه چک {detail.serial}</h3>
                <p>
                  شناسه: <bdi>{detail.id}</bdi>
                </p>
                <p>
                  {detail.sayadId && (
                    <>
                      شناسه صیادی: <bdi>{detail.sayadId}</bdi>
                    </>
                  )}
                </p>
                {detail.events.map((e) => {
                  const ids = [
                    ...(e.details.journalEntryIds ?? []),
                    ...(e.details.payments ?? []).map((p) => p.journalEntryId),
                    ...(e.details.journalEntryId
                      ? [e.details.journalEntryId]
                      : []),
                  ];
                  return (
                    <div key={e.id} className="cheque-event">
                      <strong>
                        {e.kind === "RECEIVED"
                          ? "دریافت چک"
                          : e.kind === "ISSUED"
                            ? "صدور چک"
                            : (chequeActionLabel[e.kind as ChequeActionName] ??
                              e.kind)}
                      </strong>{" "}
                      · {jalaliText(e.documentDate)}
                      <p>{e.reason}</p>
                      {can("journals.read") &&
                        ids.map((id) => (
                          <button
                            type="button"
                            className="secondary"
                            key={id}
                            onClick={() => setEntryId(id)}
                          >
                            مشاهده سند حسابداری
                          </button>
                        ))}
                    </div>
                  );
                })}
                <small>حداکثر ۱۰۰ رویداد اخیر نمایش داده می‌شود.</small>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDetail(null)}
                >
                  بستن سابقه
                </button>
              </section>
            )}
          </>
        )}
      </section>
    </FormDrawer>
  );
}
