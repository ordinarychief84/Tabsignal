"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemEditor, type EditableItem } from "./item-editor";
import { ImportPanel } from "./import-panel";

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type Item = {
  id: string;
  tags?: string[];
  name: string;
  description: string | null;
  priceCents: number;
  categoryId: string | null;
  isActive: boolean;
  isFeatured: boolean;
  ageRestricted: boolean;
  sortOrder: number;
  imageUrl: string | null;
};

type Props = {
  slug: string;
  initialCategories: Category[];
  initialItems: Item[];
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}


export function MenuPanel({ slug, initialCategories, initialItems }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  // The item being edited, or a blank draft for "add". Null = drawer shut.
  const [editing, setEditing] = useState<EditableItem | null>(null);
  const [importing, setImporting] = useState(false);
  // Inline category naming: { id } for a rename, null for a new one.
  const [namingCategory, setNamingCategory] = useState<{ id: string | null; value: string } | null>(null);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string | null, Item[]>();
    for (const it of items) {
      const k = it.categoryId;
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }, [items]);

  async function api<T = unknown>(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    setError(null);
    const res = await fetch(`/api/admin/v/${slug}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const msg = (detail as { error?: string; detail?: string })?.error ?? `HTTP ${res.status}`;
      setError(msg);
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  }

  async function commitCategoryName() {
    const pending = namingCategory;
    if (!pending) return;
    const name = pending.value.trim();
    if (!name) { setNamingCategory(null); return; }

    try {
      if (pending.id) {
        await api("PATCH", `/menu/categories/${pending.id}`, { name });
        setCategories(prev => prev.map(x => (x.id === pending.id ? { ...x, name } : x)));
      } else {
        const res = await api<{ id: string }>("POST", `/menu/categories`, {
          name,
          sortOrder: categories.length,
        });
        setCategories(prev => [...prev, { id: res.id, name, sortOrder: prev.length, isActive: true }]);
      }
      setNamingCategory(null);
    } catch { /* api() already surfaced it */ }
  }

  async function renameCategory(c: Category) {
    setNamingCategory({ id: c.id, value: c.name });
  }


  async function toggleCategoryActive(c: Category) {
    try {
      await api("PATCH", `/menu/categories/${c.id}`, { isActive: !c.isActive });
      setCategories(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
    } catch {}
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`Delete "${c.name}"? Items in this category will become uncategorized.`)) return;
    try {
      await api("DELETE", `/menu/categories/${c.id}`);
      setCategories(prev => prev.filter(x => x.id !== c.id));
      setItems(prev => prev.map(it => it.categoryId === c.id ? { ...it, categoryId: null } : it));
    } catch {}
  }

  /** Open the editor on a blank item in this category. */
  function addItem(categoryId: string | null) {
    setEditing({
      id: null,
      name: "",
      description: null,
      priceCents: 0,
      categoryId,
      imageUrl: null,
      tags: [],
      isActive: true,
      isFeatured: false,
      ageRestricted: false,
    });
  }

  function editItem(it: Item) {
    setEditing({
      id: it.id,
      name: it.name,
      description: it.description,
      priceCents: it.priceCents,
      categoryId: it.categoryId,
      imageUrl: it.imageUrl,
      tags: it.tags ?? [],
      isActive: it.isActive,
      isFeatured: it.isFeatured,
      ageRestricted: it.ageRestricted,
    });
  }

  /**
   * One save path for both create and update, so the two can't drift into
   * supporting different fields — which is how the old flow ended up able
   * to set a name and a price and nothing else.
   */
  async function saveItem(draft: EditableItem) {
    const payload = {
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      priceCents: draft.priceCents,
      categoryId: draft.categoryId,
      imageUrl: draft.imageUrl,
      tags: draft.tags,
      isActive: draft.isActive,
      isFeatured: draft.isFeatured,
      ageRestricted: draft.ageRestricted,
    };

    if (draft.id) {
      await api("PATCH", `/menu/items/${draft.id}`, payload);
      setItems(prev =>
        prev.map(x => (x.id === draft.id ? { ...x, ...payload, id: draft.id! } : x)),
      );
    } else {
      const res = await api<{ id: string }>("POST", `/menu/items`, payload);
      setItems(prev => [...prev, { ...payload, id: res.id, sortOrder: prev.length }]);
    }
    setEditing(null);
  }




  async function toggleItemActive(it: Item) {
    try {
      await api("PATCH", `/menu/items/${it.id}`, { isActive: !it.isActive });
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, isActive: !it.isActive } : x));
    } catch {}
  }


  async function deleteItem(it: Item) {
    if (!confirm(`Delete "${it.name}"?`)) return;
    try {
      await api("DELETE", `/menu/items/${it.id}`);
      setItems(prev => prev.filter(x => x.id !== it.id));
    } catch {}
  }

  return (
    <section className="space-y-8">
      {error ? (
        <div className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] leading-relaxed text-slate/55">
          {items.length === 0
            ? "Paste a menu you already have, or add items one at a time."
            : `${items.length} ${items.length === 1 ? "item" : "items"} · ${
                items.filter(i => (i.tags?.length ?? 0) > 0).length
              } tagged for guest discovery`}
        </p>
        <div className="flex gap-2">
          {/* Import sits beside item creation, not buried in settings —
              a venue with a menu in a spreadsheet should see the fast
              route before they start typing. */}
          <button
            onClick={() => setImporting(true)}
            className="rounded-full border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate/5"
          >
            Import a menu
          </button>
          <button
            onClick={() => addItem(categories[0]?.id ?? null)}
            className="rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90"
          >
            + New item
          </button>
          <button
            onClick={() => setNamingCategory({ id: null, value: "" })}
            className="rounded-full border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate/5"
          >
            + Category
          </button>
        </div>
      </div>

      {namingCategory ? (
        <div className="rounded-2xl border border-sea/40 bg-white p-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
              {namingCategory.id ? "Rename category" : "New category"}
            </span>
            <input
              autoFocus
              value={namingCategory.value}
              onChange={e => setNamingCategory(n => (n ? { ...n, value: e.target.value } : n))}
              onKeyDown={e => {
                if (e.key === "Enter") void commitCategoryName();
                if (e.key === "Escape") setNamingCategory(null);
              }}
              maxLength={80}
              placeholder="Cocktails"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 px-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void commitCategoryName()}
              disabled={!namingCategory.value.trim()}
              className="min-h-[40px] rounded-xl bg-slate px-4 text-sm font-medium text-oat disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setNamingCategory(null)}
              className="min-h-[40px] rounded-xl border border-slate/15 px-4 text-sm text-slate hover:bg-slate/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {categories.map(c => (
        <CategoryBlock
          key={c.id}
          category={c}
          items={itemsByCategory.get(c.id) ?? []}
          onRenameCategory={() => renameCategory(c)}
          onToggleCategoryActive={() => toggleCategoryActive(c)}
          onDeleteCategory={() => deleteCategory(c)}
          onAddItem={() => addItem(c.id)}
          onEditItem={editItem}
          onToggleItemActive={toggleItemActive}
          onDeleteItem={deleteItem}
        />
      ))}

      <CategoryBlock
        category={{ id: "_uncat_", name: "Uncategorized", sortOrder: 9999, isActive: true }}
        items={itemsByCategory.get(null) ?? []}
        hideCategoryActions
        onAddItem={() => addItem(null)}
        onEditItem={editItem}
        onToggleItemActive={toggleItemActive}
        onDeleteItem={deleteItem}
      />

      {categories.length === 0 && items.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-5 py-10 text-center">
          <p className="text-sm font-medium text-slate">No menu yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate/60">
            If you already have one written down, pasting it in is the
            quickest way — categories and prices come across with it.
          </p>
          <button
            onClick={() => setImporting(true)}
            className="mt-5 min-h-[44px] rounded-xl bg-slate px-5 text-sm font-medium text-oat"
          >
            Paste your menu
          </button>
        </div>
      ) : null}

      {editing ? (
        <ItemEditor
          slug={slug}
          item={editing}
          categories={categories.map(c => ({ id: c.id, name: c.name }))}
          menuItems={items.map(i => ({ id: i.id, name: i.name, isActive: i.isActive }))}
          onSave={saveItem}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {importing ? (
        <ImportPanel
          slug={slug}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            // Re-read from the server rather than reconstructing what the
            // import created — categories may have been made too.
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function CategoryBlock({
  category,
  items,
  hideCategoryActions = false,
  onRenameCategory,
  onToggleCategoryActive,
  onDeleteCategory,
  onAddItem,
  onEditItem,
  onToggleItemActive,
  onDeleteItem,
}: {
  category: Category;
  items: Item[];
  hideCategoryActions?: boolean;
  onRenameCategory?: () => void;
  onToggleCategoryActive?: () => void;
  onDeleteCategory?: () => void;
  onAddItem: () => void;
  onEditItem: (it: Item) => void;
  onToggleItemActive: (it: Item) => void;
  onDeleteItem: (it: Item) => void;
}) {
  if (hideCategoryActions && items.length === 0) return null;

  return (
    <section className={[
      "rounded-2xl border bg-white",
      category.isActive ? "border-slate/10" : "border-slate/10 opacity-60",
    ].join(" ")}>
      <header className="flex items-center justify-between border-b border-slate/10 px-5 py-3">
        <div>
          <h2 className="text-base font-medium">{category.name}</h2>
          {!category.isActive ? (
            <p className="text-[11px] text-umber">Hidden from guests</p>
          ) : null}
        </div>
        <div className="flex gap-2 text-xs">
          {!hideCategoryActions ? (
            <>
              <button onClick={onRenameCategory} className="rounded px-2 py-1 hover:bg-slate/5">Rename</button>
              <button onClick={onToggleCategoryActive} className="rounded px-2 py-1 hover:bg-slate/5">
                {category.isActive ? "Hide" : "Show"}
              </button>
              <button onClick={onDeleteCategory} className="rounded px-2 py-1 text-coral hover:bg-coral/5">Delete</button>
            </>
          ) : null}
          <button onClick={onAddItem} className="rounded bg-slate px-2 py-1 text-oat hover:bg-slate/90">+ Item</button>
        </div>
      </header>

      <ul className="divide-y divide-slate/5">
        {items.length === 0 ? (
          <li className="px-5 py-4 text-sm text-slate/50">No items yet.</li>
        ) : (
          items.map(it => (
            <li key={it.id} className={["flex items-center gap-3 px-5 py-3 text-sm", it.isActive ? "" : "opacity-50"].join(" ")}>
              {/* The photo is the fastest way to spot the items still
                  missing one — the old row never showed it at all. */}
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : (
                <span
                  aria-hidden
                  title="No photo yet"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-umber-soft/50 text-slate/20"
                >
                  ▦
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{it.name}</span>
                  {it.isFeatured ? (
                    <span className="rounded-full bg-chartreuse/30 px-2 text-[10px] font-medium text-umber">
                      Featured
                    </span>
                  ) : null}
                  {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                  {!it.isActive ? <span className="rounded-full bg-slate/10 px-2 text-[10px] text-slate/60">86&apos;d</span> : null}
                </div>
                {it.description ? <p className="truncate text-[11px] text-slate/50">{it.description}</p> : null}
                {(it.tags?.length ?? 0) > 0 ? (
                  <p className="mt-0.5 text-[11px] text-umber">{it.tags!.join(" · ")}</p>
                ) : null}
              </div>
              <span className="mx-3 font-mono text-xs">{dollars(it.priceCents)}</span>
              {/* Two actions, not six. "86" stays inline because it's the
                  one a manager hits mid-service, when opening a form is
                  the wrong amount of ceremony; everything else lives in
                  the editor where it has room to be labelled. */}
              <div className="flex shrink-0 items-center gap-1 text-xs">
                <button
                  onClick={() => onToggleItemActive(it)}
                  title={it.isActive ? "Hide from guests" : "Put back on the menu"}
                  className="rounded-lg px-2.5 py-1.5 text-slate/70 hover:bg-slate/5 hover:text-slate"
                >
                  {it.isActive ? "86" : "Un-86"}
                </button>
                <button
                  onClick={() => onEditItem(it)}
                  className="rounded-lg border border-slate/15 px-3 py-1.5 text-slate hover:bg-slate/5"
                >
                  Edit
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
