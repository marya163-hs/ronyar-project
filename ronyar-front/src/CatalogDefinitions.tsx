import { useMemo, useState } from "react";
import {
  listUnits, listCategories, createBaseUnit, createBaseCategory,
  updateBaseUnit, updateBaseCategory,
} from "./api";
import type { Business, ProductCategory, ProductUnit } from "./api";
import { useMasterList, MasterStatus, MasterEditor, localValidation, MasterPendingReview } from "./MasterDataShared";
import { BaseHeader, BaseStats, BasePanel, BaseEmpty, filterText } from "./BaseUi";

type Editing = { type: "unit"; value: ProductUnit } | { type: "category"; value: ProductCategory } | null;

export default function CatalogDefinitions({ business, onSessionExpired, categories = false }: {
  business: Business; onSessionExpired: () => void; categories?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parent, setParent] = useState("");
  const [query, setQuery] = useState("");

  const list = useMasterList(async signal => ({
    units: categories ? [] : await listUnits(business.id, signal),
    categories: categories ? await listCategories(business.id, signal) : [],
  }), revision, onSessionExpired);

  const storageKey = `mahan:base-${categories ? "category" : "unit"}:${business.id}`;
  const records = categories ? list.data?.categories ?? [] : list.data?.units ?? [];
  const filtered = records.filter(row => filterText(`${row.name} ${"code" in row ? row.code : ""}`).includes(filterText(query)));

  const categoryById = useMemo(() => new Map((list.data?.categories ?? []).map(c => [c.id, c])), [list.data]);
  const editingCategoryId = editing?.type === "category" ? editing.value.id : null;
  const parentOptions = (list.data?.categories ?? []).filter(candidate => {
    // Do not offer self or any descendant as a new parent.
    let cursor: string | null = candidate.id;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      if (cursor === editingCategoryId) return false;
      visited.add(cursor);
      cursor = categoryById.get(cursor)?.parentId ?? null;
    }
    return true;
  });

  function beginCreate() {
    setEditing(null);
    setName("");
    setCode("");
    setParent("");
    setForm(true);
  }
  function beginEdit(row: ProductUnit | ProductCategory) {
    if ("code" in row) {
      setEditing({ type: "unit", value: row });
      setCode(row.code);
      setParent("");
    } else {
      setEditing({ type: "category", value: row });
      setParent(row.parentId ?? "");
      setCode("");
    }
    setName(row.name);
    setForm(true);
  }
  function closeEditor() {
    setForm(false);
    setEditing(null);
    setRevision(value => value + 1);
  }
  async function save() {
    if (!name.trim()) localValidation("نام لازم است.");
    if (categories) {
      if (editing?.type === "category") {
        await updateBaseCategory(business.id, editing.value.id, { name: name.trim(), parentId: parent || null });
      } else {
        await createBaseCategory(business.id, { name: name.trim(), ...(parent ? { parentId: parent } : {}) });
      }
    } else {
      if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(code)) localValidation("کد واحد باید با حرف لاتین شروع شود و فقط حرف، عدد و زیرخط داشته باشد.");
      if (editing?.type === "unit") {
        await updateBaseUnit(business.id, editing.value.id, { code, name: name.trim() });
      } else {
        await createBaseUnit(business.id, { code, name: name.trim() });
      }
    }
  }

  return <section className="base-page base-has-mobile-cards">
    <BaseHeader
      title={categories ? "دسته‌بندی کالاها" : "واحدهای کالا"}
      description={categories ? "گروه‌بندی کالاها برای انتخاب ساده‌تر هنگام خرید و فروش" : "تعریف و ویرایش واحدهای اندازه‌گیری مانند عدد، بسته، کیلوگرم و متر"}
      actionLabel={categories ? "دسته‌بندی جدید" : "واحد جدید"}
      action={beginCreate}
      secondary={<button type="button" className="secondary base-refresh" onClick={() => setRevision(value => value + 1)}>↻ به‌روزرسانی</button>}
    />
    <BaseStats items={[
      { label: categories ? "دسته‌بندی‌های دریافت‌شده" : "واحدهای دریافت‌شده", value: list.data ? records.length : "—", hint: "تعداد موارد برگشتی از سرور" },
      { label: "نمایش پس از جستجو", value: list.data ? filtered.length : "—", hint: "جستجو در همین فهرست" },
    ]} />
    <BasePanel title={categories ? "فهرست دسته‌بندی‌ها" : "فهرست واحدهای اندازه‌گیری"} note={categories ? "نام و دسته بالادست را می‌توان ویرایش کرد؛ دسته‌بندی‌های دارای کالا حذف نمی‌شوند." : "نام و کد واحد قابل ویرایش‌اند؛ کالاهای مرتبط همچنان به همان واحد متصل می‌مانند."}>
      <div className="base-filters base-filters-simple">
        <label className="base-search">جستجو<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="نام یا کد…" /></label>
      </div>
      <MasterStatus {...list} onRetry={() => setRevision(value => value + 1)} />
      <MasterPendingReview key={revision} storageKey={storageKey} />
      {list.data && (filtered.length ? <>
        <div className="base-table-scroll"><table className="base-table">
          <thead><tr><th>نام</th><th>{categories ? "دسته بالادست" : "کد واحد"}</th><th>عملیات</th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id}>
            <td><strong>{row.name}</strong></td>
            <td>{"code" in row ? <bdi>{String(row.code ?? "")}</bdi> : <span className="base-soft">{row.parentId ? categoryById.get(row.parentId)?.name ?? "دسته بالادست" : "بدون بالادست"}</span>}</td>
            <td><button type="button" className="secondary base-row-edit" disabled={form} onClick={() => beginEdit(row)}>ویرایش</button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="base-mobile-list">{filtered.map(row => <article key={row.id} className="base-mobile-card">
          <div className="base-mobile-card-top"><strong>{row.name}</strong></div>
          <small>{"code" in row ? `کد واحد: ${row.code}` : `دسته بالادست: ${row.parentId ? categoryById.get(row.parentId)?.name ?? "تعریف‌شده" : "بدون بالادست"}`}</small>
          <button type="button" className="secondary" disabled={form} onClick={() => beginEdit(row)}>ویرایش اطلاعات</button>
        </article>)}</div>
      </> : <BaseEmpty title="موردی پیدا نشد" description="جستجو را تغییر دهید یا مورد جدید تعریف کنید." />)}
    </BasePanel>

    {form && <MasterEditor
      key={`${categories ? "category" : "unit"}:${editing?.value.id ?? "new"}`}
      title={`${editing ? "ویرایش" : "تعریف"} ${categories ? "دسته‌بندی" : "واحد"}`}
      storageKey={storageKey}
      onClose={closeEditor}
      onSessionExpired={onSessionExpired}
      onSave={save}
    >
      <label>نام<input value={name} onChange={event => setName(event.target.value)} required maxLength={categories ? 120 : 100} placeholder={categories ? "مثلاً لوازم سرمایشی" : "مثلاً عدد"} /></label>
      {categories ? <label>دسته بالادست (اختیاری)
        <select value={parent} onChange={event => setParent(event.target.value)}>
          <option value="">بدون بالادست</option>
          {parentOptions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label> : <label>کد لاتین
        <input dir="ltr" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="PCS" required maxLength={32} />
      </label>}
    </MasterEditor>}
  </section>;
}
