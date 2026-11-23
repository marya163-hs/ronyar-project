import { useEffect, useRef, useState } from "react";
import FormDrawer from "./FormDrawer";
import {
  createIssue,
  listIssues,
  issueProgress,
  claimIssueReward,
  lastIssueFailure,
  errorText,
  ApiError,
} from "./api";
import {
  issueDecision,
  issueStage,
  type IssueReport,
  type IssueInput,
  type IssueProgress,
} from "./issueTypes";
import "./IssueReporter.css";
export default function IssueReporter({
  businessId,
  context,
  onSessionExpired,
}: {
  businessId: string;
  context: string;
  onSessionExpired: () => void;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<IssueReport[]>([]),
    [progress, setProgress] = useState<IssueProgress | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [title, setTitle] = useState(""),
    [steps, setSteps] = useState(""),
    [expected, setExpected] = useState(""),
    [actual, setActual] = useState(""),
    [participate, setParticipate] = useState(false),
    [pending, setPending] = useState<IssueInput | null>(null);
  const flight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function failure(e: unknown) {
    if (e instanceof ApiError && e.status === 401) onSessionExpired();
    setError(errorText(e));
  }
  async function load() {
    const [reports, p] = await Promise.all([
      listIssues(businessId, page),
      issueProgress(),
    ]);
    if (alive.current) {
      setItems(reports.items);
      setProgress(p);
    }
  }
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    Promise.all([
      listIssues(businessId, page, undefined, c.signal),
      issueProgress(c.signal),
    ])
      .then(([x, p]) => {
        if (!c.signal.aborted) {
          setItems(x.items);
          setProgress(p);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) failure(e);
      });
    return () => c.abort();
  }, [open, businessId, page]);
  async function submit() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const d =
      lastIssueFailure?.businessId === businessId &&
      Date.now() - lastIssueFailure.at < 1800000
        ? lastIssueFailure
        : null;
    const input = pending || {
      requestKey: crypto.randomUUID(),
      title,
      steps,
      expected,
      actual,
      context,
      challengeId: participate ? progress?.campaign?.id : undefined,
      requestId: d?.requestId,
      errorCode: d?.errorCode,
      method: d?.method,
    };
    setPending(input);
    try {
      const saved = await createIssue(businessId, input);
      if (!alive.current) return;
      setPending(null);
      setTitle("");
      setSteps("");
      setExpected("");
      setActual("");
      setParticipate(false);
      setNotice("گزارش ثبت شد. کد پیگیری: " + saved.id);
      await load().catch(failure);
    } catch (e) {
      if (!alive.current) return;
      failure(e);
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408
      )
        setPending(null);
      else
        setError(
          "نتیجه ارسال مشخص نیست. فقط «بررسی نتیجه» را بزنید؛ اطلاعات گزارش حفظ شده است.",
        );
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function recover() {
    if (!pending || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await listIssues(businessId, 1, pending.requestKey);
      if (r.items.length) {
        setPending(null);
        setTitle("");
        setSteps("");
        setExpected("");
        setActual("");
        setNotice("ثبت گزارش قبلی تأیید شد: " + r.items[0].id);
        await load();
      } else
        setError(
          "گزارش هنوز پیدا نشد؛ می‌توانید همان درخواست را با همان شناسه دوباره ارسال کنید.",
        );
    } catch (e) {
      failure(e);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const active =
    progress?.campaign?.active &&
    Date.parse(progress.campaign.startsAt) <= Date.now() &&
    Date.parse(progress.campaign.endsAt) > Date.now();
  return (
    <>
      <button
        className="issue-launch"
        type="button"
        onClick={() => setOpen(true)}
      >
        گزارش مشکل
      </button>
      {open && (
        <FormDrawer
          title="گزارش مشکل و پیگیری"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <div className="issue-content">
            <p>
              گزارش‌های شما فقط برای خودتان و کارکنان مجاز پشتیبانی قابل
              مشاهده‌اند. رمز، توکن، اطلاعات کارت یا اطلاعات محرمانه مشتریان را
              ننویسید.
            </p>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            {progress?.campaign && (
              <section className="issue-challenge">
                <h3>چالش پیدا کردن باگ</h3>
                <p>
                  هر فرد با ۱۰ باگ واقعی، متمایز و تأییدشده یک جایزه ۵ میلیون
                  تومانی می‌گیرد. هر باگ فقط برای نخستین گزارش معتبر شمرده
                  می‌شود؛ پیشنهاد بهبود و گزارش تکراری امتیاز ندارند. جایزه برای
                  هر فرد یک بار است و پرداخت پس از بررسی مدیر انجام می‌شود.
                </p>
                <p>
                  بازه:{" "}
                  {new Date(progress.campaign.startsAt).toLocaleString("fa-IR")}{" "}
                  تا{" "}
                  {new Date(progress.campaign.endsAt).toLocaleString("fa-IR")}
                </p>
                <strong>
                  باگ‌های تأییدشده شما در همه فروشگاه‌ها: {progress.accepted} از
                  ۱۰
                </strong>
                <p>
                  {progress.claim?.status === "PAID"
                    ? "پرداخت جایزه ثبت شده است."
                    : progress.claim
                      ? "درخواست جایزه در انتظار بررسی است."
                      : active
                        ? "پذیرش گزارش چالش فعال است."
                        : "پذیرش گزارش جدید چالش فعلاً فعال نیست."}
                </p>
                {progress.accepted >= 10 && !progress.claim && (
                  <button
                    disabled={busy}
                    type="button"
                    onClick={async () => {
                      if (flight.current) return;
                      flight.current = true;
                      setBusy(true);
                      try {
                        await claimIssueReward();
                        await load();
                      } catch (e) {
                        failure(e);
                      } finally {
                        flight.current = false;
                        setBusy(false);
                      }
                    }}
                  >
                    درخواست بررسی جایزه
                  </button>
                )}
              </section>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <fieldset disabled={busy || !!pending}>
                <label>
                  عنوان مشکل
                  <input
                    required
                    minLength={5}
                    maxLength={160}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  مراحل تکرار مشکل
                  <textarea
                    required
                    minLength={10}
                    maxLength={4000}
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                    placeholder="۱ وارد بخش خرید شدم، ۲ ..."
                  />
                </label>
                <label>
                  انتظار داشتید چه اتفاقی بیفتد؟
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                  />
                </label>
                <label>
                  چه اتفاقی افتاد؟
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    value={actual}
                    onChange={(e) => setActual(e.target.value)}
                  />
                </label>
                {active && (
                  <label>
                    <input
                      type="checkbox"
                      checked={participate}
                      onChange={(e) => setParticipate(e.target.checked)}
                    />
                    شرکت در چالش با شرایط بالا؛ آزمایش فقط روی داده آزمایشی خودم
                    انجام شده است.
                  </label>
                )}
              </fieldset>
              {!pending && (
                <button type="submit" className="primary" disabled={busy}>
                  ارسال گزارش
                </button>
              )}
            </form>
            {pending && (
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void recover()}
                >
                  بررسی نتیجه
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  ارسال مجدد همان درخواست
                </button>
                <p>
                  ویرایش تا تعیین نتیجه غیرفعال است. شناسه:{" "}
                  <span dir="ltr">{pending.requestKey}</span>
                </p>
              </div>
            )}
            <h3>گزارش‌های من در این فروشگاه</h3>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load().catch(failure)}
            >
              به‌روزرسانی
            </button>
            {items.map((i) => (
              <article key={i.id}>
                <h4>{i.title}</h4>
                <small dir="ltr">{i.id}</small>
                <p>
                  {issueDecision[i.decision]} · {issueStage[i.stage]}
                </p>
                <details>
                  <summary>متن و پاسخ</summary>
                  <p>مراحل: {i.steps}</p>
                  <p>انتظار: {i.expected}</p>
                  <p>نتیجه: {i.actual}</p>
                  <p>{i.reply || "هنوز پاسخی ثبت نشده است."}</p>
                </details>
              </article>
            ))}
            {!items.length && <p>هنوز گزارشی در این صفحه نیست.</p>}
            <div>
              <button
                disabled={page === 1 || busy}
                type="button"
                onClick={() => setPage((p) => p - 1)}
              >
                قبلی
              </button>
              <span> صفحه {page} </span>
              <button
                disabled={items.length < 20 || busy}
                type="button"
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </button>
            </div>
          </div>
        </FormDrawer>
      )}
    </>
  );
}
