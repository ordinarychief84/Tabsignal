"use client";

import { useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  categoryId: string | null;
  isActive: boolean;
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

function parseDollars(s: string): number | null {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function MenuPanel({ slug, initialCategories, initialItems }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [error, setError] = useState<string | null>(null);

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

  async function addCategory() {
    const name = prompt("New category name (e.g. Cocktails)");
    if (!name) return;
    try {
      const res = await api<{ id: string }>("POST", `/menu/categories`, {
        name,
        sortOrder: categories.length,
      });
      setCategories(prev => [...prev, { id: res.id, name, sortOrder: prev.length, isActive: true }]);
    } catch {}
  }

  async function renameCategory(c: Category) {
    const name = prompt("New name", c.name);
    if (!name || name === c.name) return;
    try {
      await api("PATCH", `/menu/categories/${c.id}`, { name });
      setCategories(prev => prev.map(x => x.id === c.id ? { ...x, name } : x));
    } catch {}
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

  async function addItem(categoryId: string | null) {
    const name = prompt("Item name");
    if (!name) return;
    const priceStr = prompt("Price (e.g. 12.50)");
    if (!priceStr) return;
    const priceCents = parseDollars(priceStr);
    if (priceCents === null) {
      alert("Invalid price");
      return;
    }
    try {
      const res = await api<{ id: string }>("POST", `/menu/items`, {
        name,
        priceCents,
        categoryId,
      });
      setItems(prev => [
        ...prev,
        {
          id: res.id, name, description: null, priceCents, categoryId,
          isActive: true, ageRestricted: false, sortOrder: 0, imageUrl: null,
        },
      ]);
    } catch {}
  }

  async function renameItem(it: Item) {
    const name = prompt("New name", it.name);
    if (!name || name === it.name) return;
    try {
      await api("PATCH", `/menu/items/${it.id}`, { name });
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, name } : x));
    } catch {}
  }

  async function changePrice(it: Item) {
    const priceStr = prompt("New price", dollars(it.priceCents));
    if (!priceStr) return;
    const priceCents = parseDollars(priceStr);
    if (priceCents === null) {
      alert("Invalid price");
      return;
    }
    try {
      await api("PATCH", `/menu/items/${it.id}`, { priceCents });
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, priceCents } : x));
    } catch {}
  }

  async function toggleItemActive(it: Item) {
    try {
      await api("PATCH", `/menu/items/${it.id}`, { isActive: !it.isActive });
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, isActive: !it.isActive } : x));
    } catch {}
  }

  async function toggleAgeRestricted(it: Item) {
    try {
      await api("PATCH", `/menu/items/${it.id}`, { ageRestricted: !it.ageRestricted });
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, ageRestricted: !it.ageRestricted } : x));
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

      <div className="flex justify-end">
        <button
          onClick={addCategory}
          className="rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90"
        >
          + New category
        </button>
      </div>

      {categories.map(c => (
        <CategoryBlock
          key={c.id}
          category={c}
          items={itemsByCategory.get(c.id) ?? []}
          onRenameCategory={() => renameCategory(c)}
          onToggleCategoryActive={() => toggleCategoryActive(c)}
          onDeleteCategory={() => deleteCategory(c)}
          onAddItem={() => addItem(c.id)}
          onRenameItem={renameItem}
          onChangePrice={changePrice}
          onToggleItemActive={toggleItemActive}
          onToggleAgeRestricted={toggleAgeRestricted}
          onDeleteItem={deleteItem}
        />
      ))}

      <CategoryBlock
        category={{ id: "_uncat_", name: "Uncategorized", sortOrder: 9999, isActive: true }}
        items={itemsByCategory.get(null) ?? []}
        hideCategoryActions
        onAddItem={() => addItem(null)}
        onRenameItem={renameItem}
        onChangePrice={changePrice}
        onToggleItemActive={toggleItemActive}
        onToggleAgeRestricted={toggleAgeRestricted}
        onDeleteItem={deleteItem}
      />

      {categories.length === 0 && items.length === 0 ? (
        <p className="rounded-lg border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/60">
          No menu yet. Add a category to get started — try &ldquo;Cocktails&rdquo; or &ldquo;Beer&rdquo;.
        </p>
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
  onRenameItem,
  onChangePrice,
  onToggleItemActive,
  onToggleAgeRestricted,
  onDeleteItem,
}: {
  category: Category;
  items: Item[];
  hideCategoryActions?: boolean;
  onRenameCategory?: () => void;
  onToggleCategoryActive?: () => void;
  onDeleteCategory?: () => void;
  onAddItem: () => void;
  onRenameItem: (it: Item) => void;
  onChangePrice: (it: Item) => void;
  onToggleItemActive: (it: Item) => void;
  onToggleAgeRestricted: (it: Item) => void;
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
            <li key={it.id} className={["flex items-center justify-between px-5 py-3 text-sm", it.isActive ? "" : "opacity-50"].join(" ")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{it.name}</span>
                  {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                  {!it.isActive ? <span className="rounded-full bg-slate/10 px-2 text-[10px] text-slate/60">86&apos;d</span> : null}
                </div>
                {it.description ? <p className="text-[11px] text-slate/50">{it.description}</p> : null}
              </div>
              <span className="mx-3 font-mono text-xs">{dollars(it.priceCents)}</span>
              <div className="flex gap-1 text-xs">
                <button onClick={() => onRenameItem(it)} className="rounded px-2 py-1 hover:bg-slate/5">Edit</button>
                <button onClick={() => onChangePrice(it)} className="rounded px-2 py-1 hover:bg-slate/5">Price</button>
                <button onClick={() => onToggleItemActive(it)} className="rounded px-2 py-1 hover:bg-slate/5">
                  {it.isActive ? "86" : "Un-86"}
                </button>
                <button onClick={() => onToggleAgeRestricted(it)} className="rounded px-2 py-1 hover:bg-slate/5">
                  {it.ageRestricted ? "21- " : "21+ "}
                </button>
                <button onClick={() => onDeleteItem(it)} className="rounded px-2 py-1 text-coral hover:bg-coral/5">Delete</button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
