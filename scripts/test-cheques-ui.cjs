const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript"),
  crypto = require("node:crypto");
let count = 0;
const memory = new Map(),
  sessionStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
const unit = { id: "u", name: "عدد", code: "PCS" },
  wh = { id: "w", name: "اصلی", isDefault: true, isActive: true, code: "WH" },
  supplier = {
    id: "s1",
    name: "محمد احمدی",
    supplierEnabled: true,
    customerEnabled: false,
    isCashCustomer: false,
    isActive: true,
    externalCode: null,
  };
const product = {
    id: "p1",
    name: "پفک",
    kind: "GOODS",
    isActive: true,
    unit,
    code: "100001",
    salePrice: "0",
    barcode: null,
    category: null,
  },
  savedProduct = { ...product, id: "p-new", name: "جدید", code: "100003" },
  business = { id: "b", currencyScale: 0, baseCurrency: "IRR" };
class ApiError extends Error {
  constructor(status) {
    super("API");
    this.status = status;
  }
}
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
function compile(file, requireFn) {
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      module: mod,
      exports: mod.exports,
      require:r=>r==='./storeMoney'?compile('storeMoney.ts'):requireFn?.(r),
      sessionStorage,
      AbortController,
      crypto: crypto.webcrypto,
      Date,
      console,
    },
  );
  return mod.exports;
}
const helpers = compile("purchaseQuickCreateUtils.ts"),
  amounts = compile("saleAmounts.ts"),
  period = compile("documentPeriod.ts");
function harness(file, api, extra = {}) {
  const states = [],
    refs = [],
    effects = [],
    cleanup = [],
    stubs = {};
  let si,
    ri,
    ei,
    queue = [],
    tree,
    props;
  const react = {
    useState: (v) => {
      const i = si++;
      if (!(i in states)) states[i] = typeof v === "function" ? v() : v;
      return [
        states[i],
        (next) =>
          (states[i] = typeof next === "function" ? next(states[i]) : next),
      ];
    },
    useRef: (v) => {
      const i = ri++;
      return refs[i] ?? (refs[i] = { current: v });
    },
    useEffect: (f, deps) => {
      const i = ei++;
      if (!effects[i] || deps.some((v, k) => v !== effects[i][k])) {
        effects[i] = deps;
        queue.push(() => {
          cleanup[i]?.();
          cleanup[i] = f();
        });
      }
    },
  };
  const jsx = {
    jsx: (type, props, key) => ({ type, props: props || {}, key }),
    jsxs: (type, props, key) => ({ type, props: props || {}, key }),
    Fragment: "Fragment",
  };
  const component = compile(file, (r) =>
    r === "react"
      ? react
      : r === "react/jsx-runtime"
        ? jsx
        : r === "./api"
          ? {
              ApiError,
              errorText: () => "خطا",
              formatDecimal: (x) => x,
              tehranToday: () => "2026-10-29",
              ...api,
            }
          : r === "./purchaseQuickCreateUtils"
            ? helpers
            : r === "./saleAmounts"
              ? amounts
              : r === "./documentPeriod"
                ? period
                : r === "./chequeClientState"
                  ? compile("chequeClientState.ts", () => ({}))
                  : r === "./cashOperationOptions"
                    ? compile("cashOperationOptions.ts", (x) =>
                        x === "./api" ? {} : amounts,
                      )
                    : r in extra
                      ? extra[r]
                      : r.endsWith(".css")
                        ? {}
                        : {
                            default:
                              stubs[r] ?? (stubs[r] = function Stub() {}),
                          },
  ).default;
  return {
    render(p = props) {
      props = p;
      si = ri = ei = 0;
      tree = component(p);
      const q = queue;
      queue = [];
      q.forEach((f) => f());
      return tree;
    },
    get tree() {
      return tree;
    },
    type: (r) => stubs[r],
    unmount() {
      cleanup.forEach((f) => f?.());
    },
  };
}
function nodes(n) {
  if (!n || typeof n !== "object") return [];
  if (Array.isArray(n)) return n.flatMap(nodes);
  return [n, ...nodes(n.props?.children)];
}
function text(n) {
  if (n == null || n === false) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(text).join("");
  return text(n.props?.children);
}
const find = (h, type, p = () => true) =>
    nodes(h.tree).find((n) => n.type === type && p(n)),
  button = (h, t) => find(h, "button", (n) => text(n).includes(t)),
  form = (h) => find(h, "form");
function field(h, t, type = "input") {
  return nodes(find(h, "label", (n) => text(n).includes(t))).find(
    (n) => n.type === type,
  );
}
const tick = () => new Promise((r) => setImmediate(r)),
  event = { preventDefault() {} };

const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const cheque = {
  id,
  kind: "RECEIVABLE",
  state: "IN_HAND",
  serial: "123",
  bankName: "Bank",
  sayadId: null,
  amount: "100",
  currency: "IRR",
  partyId: "s1",
  issuerAccountId: null,
  issueDate: "2026-10-01",
  dueDate: "2026-11-30",
  lastEventDate: "2026-10-01",
  version: 1,
};
async function make(mode = "pass", rows = [], allowed = true) {
  memory.clear();
  let posts = [],
    gets = 0,
    saved = 0,
    expired = 0,
    release;
  const api = {
    listCheques: async () => ({
      items: rows,
      total: rows.length,
      page: 1,
      totalPages: 1,
    }),
    getCheque: async () => ({ ...cheque, events: [] }),
    recoverChequeRequest: async () => {
      gets++;
      if (mode === "not-found") throw new ApiError(404);
      return cheque;
    },
    listFiscalPeriods: async () => [
      {
        id: "period",
        name: "year",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "OPEN",
      },
    ],
    listActiveAccounts: async () => [
      {
        id: "bank",
        name: "Bank",
        type: "ASSET",
        normalSide: "DEBIT",
        isActive: true,
        isPosting: true,
        isCashBank: true,
      },
    ],
    listParties: async () => ({
      items: [{ ...supplier, customerEnabled: true }],
      totalPages: 1,
    }),
    listOpeningBalances: async () => [],
    listSales: async () => ({
      items: [
        {
          id: "sale",
          party: { id: "s1" },
          number: "1",
          documentDate: "2026-10-01",
          total: "1000",
        },
      ],
      totalPages: 1,
    }),
    listPurchases: async () => ({
      items: [
        {
          id: "purchase",
          party: { id: "s1" },
          number: "2",
          documentDate: "2026-10-01",
          total: "1000",
        },
      ],
      totalPages: 1,
    }),
    chequeCommand: async (b, id, body, key) => {
      posts.push({ b, id, body, key });
      if (mode === "unknown" || mode === "not-found") throw new ApiError(408);
      if (mode === "expired") throw new ApiError(401);
      if(mode === "allocation" || mode === "key-conflict"){const e=new ApiError(409);e.code=mode==="allocation"?"CHEQUE_ALLOCATION":"CHEQUE_KEY";throw e;}
      if (mode === "deferred") await new Promise((r) => (release = r));
      return cheque;
    },
  };
  const extra = {
    "./StorePermissions": { useStoreCan: () => () => allowed },
    "./jalaliDate": { jalaliText: (x) => x },
  };
  const h = harness("ChequeManager.tsx", api, extra),
    props = {
      business,
      userId: "user-a",
      onClose: () => {},
      onSessionExpired: () => expired++,
    };
  h.render(props);
  await tick();
  h.render();
  return {
    h,
    api,
    extra,
    props,
    posts,
    gets: () => gets,
    expired: () => expired,
    release: () => release?.(),
  };
}
async function fill(x) {
  const h = x.h;
  button(h, "چک جدید").props.onClick();
  h.render();
  await tick();
  h.render();
  field(h, "شماره چک").props.onChange({ target: { value: "۱۲۳" } });
  field(h, "نام بانک").props.onChange({ target: { value: "بانک تست" } });
  nodes(h.tree)
    .find((n) => n.type === h.type("./MoneyInput"))
    .props.onChange("100");
  nodes(h.tree)
    .find(
      (n) =>
        n.type === h.type("./JalaliDateField") && n.props.id === "cheque-due",
    )
    .props.onChange("2026-11-30");
  nodes(find(h, "label", (n) => text(n).startsWith("مشتری")))
    .find((n) => n.type === "select")
    .props.onChange({ target: { value: "s1" } });
  h.render();
  await tick();
  h.render();
  nodes(find(h, "label", (n) => text(n).startsWith("سند مرتبط")))
    .find((n) => n.type === "select")
    .props.onChange({ target: { value: "sale" } });
  nodes(h.tree)
    .find((n) => n.type === "input" && n.props.type === "checkbox")
    .props.onChange({ target: { checked: true } });
  h.render();
}
async function check(name, fn) {
  await fn();
  count++;
  console.log("PASS", name);
}
(async () => {
  await check("opening cheque manager never posts automatically", async () => {
    const x = await make();
    assert.equal(x.posts.length, 0);
  });
  await check(
    "received cheque submits exact amount, allocation and scope",
    async () => {
      const x = await make();
      await fill(x);
      await form(x.h).props.onSubmit(event);
      assert.equal(x.posts.length, 1);
      assert.equal(x.posts[0].b, business.id);
      assert.equal(x.posts[0].body.amount, "100");
      assert.equal(x.posts[0].body.serial, "123");
      assert.equal(x.posts[0].body.allocations[0].targetType, "SALE");
      assert.equal(x.posts[0].body.allocations[0].targetId, "sale");
      assert.equal(memory.size, 0);
    },
  );
  await check(
    "unknown result retains frozen request and same replay key/body",
    async () => {
      const x = await make("unknown");
      await fill(x);
      await form(x.h).props.onSubmit(event);
      x.h.render();
      assert(!form(x.h));
      await button(x.h, "تکرار همان درخواست").props.onClick();
      assert.equal(x.posts.length, 2);
      assert.equal(x.posts[0].key, x.posts[1].key);
      assert.equal(
        JSON.stringify(x.posts[0].body),
        JSON.stringify(x.posts[1].body),
      );
    },
  );
  await check(
    "recovery is GET only, missing result keeps pending request",
    async () => {
      const x = await make("not-found");
      await fill(x);
      await form(x.h).props.onSubmit(event);
      x.h.render();
      await button(x.h, "بررسی نتیجه").props.onClick();
      await tick();
      assert.equal(x.posts.length, 1);
      assert.equal(x.gets(), 1);
      assert.equal(memory.size, 1);
    },
  );
  await check(
    "successful read recovery clears pending without posting",
    async () => {
      const x = await make("unknown");
      await fill(x);
      await form(x.h).props.onSubmit(event);
      x.h.render();
      await button(x.h, "بررسی نتیجه").props.onClick();
      await tick();
      assert.equal(x.posts.length, 1);
      assert.equal(memory.size, 0);
    },
  );
  await check(
    "remount preserves request and another user has isolated storage",
    async () => {
      const x = await make("unknown");
      await fill(x);
      await form(x.h).props.onSubmit(event);
      const key = x.posts[0].key;
      x.h.unmount();
      const h = harness("ChequeManager.tsx", x.api, x.extra);
      h.render(x.props);
      await tick();
      h.render();
      await button(h, "تکرار همان درخواست").props.onClick();
      await tick();
      assert.equal(x.posts[1].key, key);
      const other = harness("ChequeManager.tsx", x.api, x.extra);
      other.render({ ...x.props, userId: "user-b" });
      await tick();
      other.render();
      assert(!button(other, "تکرار همان درخواست"));
    },
  );
  await check("double click sends once", async () => {
    const x = await make("deferred");
    await fill(x);
    const handler = form(x.h).props.onSubmit,
      p = handler(event);
    await handler(event);
    assert.equal(x.posts.length, 1);
    x.release();
    await p;
  });
  await check("storage failure blocks financial write", async () => {
    const x = await make();
    await fill(x);
    const old = sessionStorage.setItem;
    sessionStorage.setItem = () => {
      throw Error("blocked");
    };
    try {
      await form(x.h).props.onSubmit(event);
      assert.equal(x.posts.length, 0);
    } finally {
      sessionStorage.setItem = old;
    }
  });
  await check("invalid money remains blocked", async () => {
    const x = await make();
    await fill(x);
    nodes(x.h.tree)
      .find((n) => n.type === x.h.type("./MoneyInput"))
      .props.onChange("-100");
    x.h.render();
    await form(x.h).props.onSubmit(event);
    assert.equal(x.posts.length, 0);
  });
  await check("expiry preserves session callback", async () => {
    const x = await make("expired");
    await fill(x);
    await form(x.h).props.onSubmit(event);
    assert.equal(x.expired(), 1);
  });
  await check("read only account has no create or action control", async () => {
    const x = await make("pass", [cheque], false);
    assert(!button(x.h, "چک جدید"));
    assert(!button(x.h, "واگذاری به تأمین‌کننده"));
  });
  await check(
    "endorsed clearance does not ask for or submit our bank account",
    async () => {
      const x = await make("pass", [{ ...cheque, state: "ENDORSED" }]);
      button(x.h, "ثبت وصول / پاس‌شدن").props.onClick();
      x.h.render();
      await tick();
      x.h.render();
      assert(!field(x.h, "حساب وصول", "select"));
      field(x.h, "شرح / شماره", "textarea").props.onChange({
        target: { value: "وصول توسط دارنده تأیید شد" },
      });
      nodes(x.h.tree)
        .find((n) => n.type === "input" && n.props.type === "checkbox")
        .props.onChange({ target: { checked: true } });
      x.h.render();
      await form(x.h).props.onSubmit(event);
      assert.equal(x.posts[0].body.action, "CLEAR");
      assert(!("accountId" in x.posts[0].body));
      assert.equal(x.posts[0].body.version, 1);
    },
  );
  await check(
    "terminal cheque offers history without mutation actions",
    async () => {
      const x = await make("pass", [{ ...cheque, state: "CLEARED" }]);
      assert(!button(x.h, "ثبت برگشت چک"));
      assert(!button(x.h, "ابطال چک"));
      assert(button(x.h, "سابقه"));
    },
  );

  await check("known allocation rejection permits correction without pending write",async()=>{const x=await make("allocation");await fill(x);await form(x.h).props.onSubmit(event);x.h.render();assert.equal(x.posts.length,1);assert.equal(memory.size,0);assert(form(x.h));});
  await check("conflicting request key stays frozen for review",async()=>{const x=await make("key-conflict");await fill(x);await form(x.h).props.onSubmit(event);x.h.render();assert.equal(memory.size,1);assert(!form(x.h));});
  await check("overlong sayad identifier is rejected rather than truncated",async()=>{const x=await make();await fill(x);const f=field(x.h,"شناسه صیادی");assert(f.props.maxLength>16);f.props.onChange({target:{value:"12345678901234567"}});x.h.render();await form(x.h).props.onSubmit(event);assert.equal(x.posts.length,0);});
  await check("issued cheque carries issuing account and purchase allocation",async()=>{const x=await make();await fill(x);field(x.h,"نوع چک","select").props.onChange({target:{value:"PAYABLE"}});x.h.render();nodes(find(x.h,"label",n=>text(n).startsWith("تأمین‌کننده"))).find(n=>n.type==="select").props.onChange({target:{value:"s1"}});x.h.render();await tick();x.h.render();nodes(find(x.h,"label",n=>text(n).startsWith("سند مرتبط"))).find(n=>n.type==="select").props.onChange({target:{value:"purchase"}});nodes(find(x.h,"label",n=>text(n).startsWith("حساب صادرکننده"))).find(n=>n.type==="select").props.onChange({target:{value:"bank"}});x.h.render();await form(x.h).props.onSubmit(event);assert.equal(x.posts[0].body.issuerAccountId,"bank");assert.equal(x.posts[0].body.kind,"PAYABLE");assert.equal(x.posts[0].body.allocations[0].targetType,"PURCHASE");});
  console.log(
    "PASS",
    count,
    "actual cheque TSX hook/storage/network checks; no live writes",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
