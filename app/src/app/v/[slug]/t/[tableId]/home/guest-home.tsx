"use client";

import { useCallback, useMemo, useState } from "react";
import { ServiceSheet } from "@/components/guest/service-sheet";
import { MOOD_PROMPTS, itemsForPrompt, type MoodPrompt } from "@/lib/menu-discovery";
import { ChefsPick } from "./chefs-pick";
import { ItemSheet } from "@/components/guest/item-sheet";

/**
 * The guest home.
 *
 * Five sections behind a sticky tab bar, with the service control docked
 * underneath all of them. Client-side because the whole point is that
 * saving a pick or switching tabs is instant on a phone with two bars of
 * restaurant wifi — the data arrived in one server pass, so moving around
 * costs nothing.
 *
 * Nothing here orders anything. Picks are a shortlist the guest shows
 * their server; "Ready to order" raises a signal. The POS still takes the
 * order, the bill and the money.
 */

type Item = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isFeatured: boolean;
  tags: string[];
  categoryId: string | null;
};

type Promo = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  endsAt: string | null;
  itemIds: string[];
};

type Pick = { menuItemId: string; quantity: number; notes: string | null };

type TabId = "for-you" | "menu" | "drinks" | "specials" | "picks";

const DRINK_TAGS = new Set(["drink", "drinks", "cocktail", "wine", "beer", "coffee"]);

export function GuestHome(props: {
  venueSlug: string;
  tableSeg: string;
  sessionToken: string;
  /** The wishlist API authenticates on (sessionId, sessionToken). */
  sessionId: string;
  venueName: string;
  tableLabel: string;
  serverName: string | null;
  brandColor: string | null;
  greeting: string;
  items: Item[];
  categories: { id: string; name: string }[];
  prompts: MoodPrompt[];
  chefsPick: {
    answerId: string;
    basis: "popular" | "featured";
    choices: { id: string; name: string; imageUrl: string | null; priceCents: number }[];
  } | null;
  promotions: Promo[];
  specials: { id: string; title: string; description: string | null }[];
  picks: Pick[];
  tablePicks: { menuItemId: string; quantity: number }[];
  config: {
    menuDiscovery: boolean;
    specials: boolean;
    myPicks: boolean;
    tablePicks: boolean;
    feedback: boolean;
  };
  requestsEnabled: boolean;
  /** Undefined when the venue has feedback switched off. */
  feedbackHref?: string;
  initialTab: string;
}) {
  const accent = props.brandColor || "#F2E7B7";
  const [picks, setPicks] = useState<Pick[]>(props.picks);
  const [tab, setTab] = useState<TabId>(normalizeTab(props.initialTab));
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The dish a guest tapped into. Rows used to be inert: the only
  // interactive thing was a small unlabelled star, so there was no way to
  // read a description that didn't fit on two lines.
  const [openItem, setOpenItem] = useState<Item | null>(null);

  const byId = useMemo(() => new Map(props.items.map(i => [i.id, i])), [props.items]);
  const pickedIds = useMemo(() => new Set(picks.map(p => p.menuItemId)), [picks]);

  const drinks = useMemo(
    () => props.items.filter(i => i.tags.some(t => DRINK_TAGS.has(t.toLowerCase()))),
    [props.items],
  );

  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: "for-you", label: "For You", show: true },
    { id: "menu", label: "Menu", show: true },
    { id: "drinks", label: "Drinks", show: drinks.length > 0 },
    { id: "specials", label: "Specials", show: props.config.specials && (props.promotions.length > 0 || props.specials.length > 0) },
    { id: "picks", label: "My Picks", show: props.config.myPicks },
  ];

  const savePick = useCallback(
    async (item: Item) => {
      if (busyItem) return;
      setBusyItem(item.id);
      const already = pickedIds.has(item.id);
      // Optimistic: a shortlist has to feel instant to be worth using.
      setPicks(curr =>
        already
          ? curr.filter(p => p.menuItemId !== item.id)
          : [...curr, { menuItemId: item.id, quantity: 1, notes: null }],
      );
      try {
        const res = await fetch(`/api/v/${props.venueSlug}/wishlist`, {
          method: already ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: props.sessionId,
            sessionToken: props.sessionToken,
            menuItemId: item.id,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setToast(already ? `Removed ${item.name}` : `Saved ${item.name}`);
        setTimeout(() => setToast(null), 1800);
      } catch {
        // Put it back — a silent failure would leave the guest showing
        // their server a list that isn't what the kitchen sees.
        setPicks(props.picks);
        setToast("Couldn't save that. Try again.");
        setTimeout(() => setToast(null), 2200);
      } finally {
        setBusyItem(null);
      }
    },
    [busyItem, pickedIds, props.picks, props.sessionId, props.sessionToken, props.venueSlug],
  );

  return (
    // pb-36 clears the docked control plus its scrim, so the last row of a
    // menu is readable instead of half-hidden under it.
    <div className="min-h-[100dvh] bg-oat pb-36 text-slate">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 opacity-50"
        style={{ background: `radial-gradient(70% 100% at 50% 0%, ${accent}44 0%, transparent 70%)` }}
      />

      <header className="px-5 pt-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{props.venueName}</p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight">
          {props.greeting}, {props.tableLabel}
        </h1>
      </header>

      <nav className="sticky top-0 z-30 mt-5 overflow-x-auto border-b border-umber-soft/30 bg-oat/90 px-5 backdrop-blur">
        <ul className="flex gap-1">
          {tabs.filter(t => t.show).map(t => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={[
                  "-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3 text-[14px] transition-colors",
                  tab === t.id
                    ? "border-slate font-semibold text-slate"
                    : "border-transparent text-slate/50",
                ].join(" ")}
              >
                {t.label}
                {t.id === "picks" && picks.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-slate px-1.5 py-0.5 text-[10px] font-semibold text-oat">
                    {picks.length}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="px-5 pt-6">
        {tab === "for-you" ? (
          <ForYou
            {...props}
            picks={picks}
            pickedIds={pickedIds}
            onSave={savePick}
            onOpen={setOpenItem}
            accent={accent}
            onOpenTab={setTab}
          />
        ) : null}

        {tab === "menu" ? (
          <MenuList
            items={props.items}
            categories={props.categories}
            pickedIds={pickedIds}
            onSave={savePick}
            onOpen={setOpenItem}
            canSave={props.config.myPicks}
          />
        ) : null}

        {tab === "drinks" ? (
          <MenuList
            items={drinks}
            categories={props.categories}
            pickedIds={pickedIds}
            onSave={savePick}
            onOpen={setOpenItem}
            canSave={props.config.myPicks}
          />
        ) : null}

        {tab === "specials" ? (
          <Specials promotions={props.promotions} specials={props.specials} byId={byId} accent={accent} />
        ) : null}

        {tab === "picks" ? (
          <MyPicks
            picks={picks}
            byId={byId}
            tablePicks={props.config.tablePicks ? props.tablePicks : []}
            onRemove={id => {
              const item = byId.get(id);
              if (item) void savePick(item);
            }}
            venueSlug={props.venueSlug}
            sessionToken={props.sessionToken}
            sessionId={props.sessionId}
            serverName={props.serverName}
          />
        ) : null}
      </main>

      {openItem ? (
        <ItemSheet
          item={{
            id: openItem.id,
            name: openItem.name,
            description: openItem.description,
            priceCents: openItem.priceCents,
            imageUrl: openItem.imageUrl,
            tags: openItem.tags,
          }}
          saved={pickedIds.has(openItem.id)}
          canSave={props.config.myPicks}
          onToggleSave={() => void savePick(openItem)}
          onClose={() => setOpenItem(null)}
        />
      ) : null}

      {/* Above the docked control, not behind it. */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-fit rounded-full bg-slate px-4 py-2 text-[13px] text-oat shadow-lift"
        >
          {toast}
        </div>
      ) : null}

      {props.requestsEnabled ? (
        <ServiceSheet
          serverName={props.serverName}
          sessionToken={props.sessionToken}
          sessionId={props.sessionId}
          venueSlug={props.venueSlug}
          feedbackHref={props.feedbackHref}
        />
      ) : null}
    </div>
  );
}

function normalizeTab(value: string): TabId {
  const allowed: TabId[] = ["for-you", "menu", "drinks", "specials", "picks"];
  return (allowed as string[]).includes(value) ? (value as TabId) : "for-you";
}

/* ------------------------------- For You ------------------------------ */

function ForYou({
  prompts,
  chefsPick,
  items,
  promotions,
  pickedIds,
  onSave,
  onOpen,
  accent,
  onOpenTab,
  config,
  sessionToken,
}: {
  prompts: MoodPrompt[];
  chefsPick: {
    answerId: string;
    basis: "popular" | "featured";
    choices: { id: string; name: string; imageUrl: string | null; priceCents: number }[];
  } | null;
  items: Item[];
  promotions: Promo[];
  picks: Pick[];
  pickedIds: Set<string>;
  onSave: (item: Item) => void;
  onOpen: (item: Item) => void;
  accent: string;
  onOpenTab: (t: TabId) => void;
  config: { menuDiscovery: boolean; specials: boolean; myPicks: boolean };
  sessionToken: string;
}) {
  const [mood, setMood] = useState<string | null>(null);
  const prompt = mood ? MOOD_PROMPTS.find(p => p.id === mood) ?? null : null;
  const matches = prompt ? itemsForPrompt(prompt, items, sessionToken).slice(0, 8) : [];
  const headline = promotions[0] ?? null;

  return (
    <div className="space-y-8">
      {config.specials && headline ? (
        <RevealCard promo={headline} accent={accent} onExplore={() => onOpenTab("specials")} />
      ) : null}

      {/* One round, once per visit. A second would make it a quiz. */}
      {chefsPick ? (
        <ChefsPick
          choices={chefsPick.choices}
          answerId={chefsPick.answerId}
          basis={chefsPick.basis}
          onView={() => onOpenTab("menu")}
        />
      ) : null}

      {config.menuDiscovery && prompts.length > 0 ? (
        <section>
          <h2 className="text-[17px] font-semibold tracking-tight">
            What are you in the mood for?
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {prompts.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setMood(mood === p.id ? null : p.id)}
                  aria-pressed={mood === p.id}
                  className={[
                    "flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[14px] transition-all",
                    mood === p.id
                      ? "border-transparent bg-slate font-medium text-oat"
                      : "border-umber-soft/50 bg-white text-slate",
                  ].join(" ")}
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.label}
                </button>
              </li>
            ))}
          </ul>

          {prompt ? (
            <div className="mt-4 space-y-2">
              {matches.length === 0 ? (
                <p className="text-[14px] text-slate/55">
                  Nothing tagged for that tonight — try another.
                </p>
              ) : (
                matches.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    saved={pickedIds.has(item.id)}
                    onSave={() => onSave(item)}
                    onOpen={() => onOpen(item)}
                    canSave={config.myPicks}
                  />
                ))
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">Featured tonight</h2>
        <div className="mt-3 space-y-2">
          {items.filter(i => i.isFeatured).slice(0, 5).map(item => (
            <ItemRow
              key={item.id}
              item={item}
              saved={pickedIds.has(item.id)}
              onSave={() => onSave(item)}
              onOpen={() => onOpen(item)}
              canSave={config.myPicks}
            />
          ))}
          {items.filter(i => i.isFeatured).length === 0 ? (
            <p className="text-[14px] text-slate/55">
              Have a look at the full menu — it&rsquo;s all worth a read.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/**
 * A promotion the guest has to tap to open.
 *
 * The reveal is the whole interaction: a small moment of anticipation, no
 * countdown pressure and no invented scarcity. Nothing here claims a
 * quantity — if a venue wants to say "only six left" that has to come from
 * a real number, and we don't have one.
 */
function RevealCard({
  promo,
  accent,
  onExplore,
}: {
  promo: Promo;
  accent: string;
  onExplore: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative w-full overflow-hidden rounded-3xl p-6 text-left shadow-card transition-transform active:scale-[0.99]"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}77)` }}
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate/70">
            Something special tonight
          </p>
          <p className="mt-2 text-[24px] font-semibold tracking-tight text-slate">Tap to reveal</p>
          <span aria-hidden className="absolute right-5 top-1/2 -translate-y-1/2 text-3xl opacity-70">
            ✨
          </span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white p-6 shadow-card ring-1 ring-umber-soft/30 motion-safe:animate-[reveal_420ms_cubic-bezier(0.16,1,0.3,1)]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {promo.type.replace(/_/g, " ").toLowerCase()}
          </p>
          <h3 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight">
            {promo.title}
          </h3>
          {promo.description ? (
            <p className="mt-2 text-[15px] leading-relaxed text-slate/70">{promo.description}</p>
          ) : null}
          {promo.endsAt ? (
            <p className="mt-3 text-[12px] text-slate/50">
              Until {new Date(promo.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onExplore}
            className="mt-5 min-h-[48px] w-full rounded-2xl bg-slate text-[15px] font-semibold text-oat"
          >
            Explore specials
          </button>
        </div>
      )}
      <style jsx global>{`
        @keyframes reveal {
          from { transform: scale(0.97) translateY(6px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);   opacity: 1; }
        }
      `}</style>
    </section>
  );
}

/* -------------------------------- Menu -------------------------------- */

function MenuList({
  items,
  categories,
  pickedIds,
  onSave,
  onOpen,
  canSave,
}: {
  items: Item[];
  categories: { id: string; name: string }[];
  pickedIds: Set<string>;
  onSave: (item: Item) => void;
  onOpen: (item: Item) => void;
  canSave: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-[15px] text-slate/55">The menu isn&rsquo;t up yet — ask your server.</p>;
  }
  const grouped = categories
    .map(c => ({ ...c, items: items.filter(i => i.categoryId === c.id) }))
    .filter(g => g.items.length > 0);
  const uncategorised = items.filter(i => !i.categoryId || !categories.some(c => c.id === i.categoryId));

  return (
    <div className="space-y-8">
      {/* Jump to a section. A real menu is sixty items deep, and scrolling
          past every cocktail to reach the food is the thing that makes a
          guest give up and put the phone down. */}
      {grouped.length > 1 ? (
        <nav className="sticky top-[52px] z-20 -mx-5 overflow-x-auto bg-oat/95 px-5 py-2 backdrop-blur">
          <ul className="flex gap-1.5">
            {grouped.map(group => (
              <li key={group.id}>
                <a
                  href={`#cat-${group.id}`}
                  onClick={e => {
                    e.preventDefault();
                    document
                      .getElementById(`cat-${group.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-full border border-umber-soft/50 bg-white px-3.5 text-[13px] text-slate/75 active:bg-oat"
                >
                  {group.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {grouped.map(group => (
        <section key={group.id} id={`cat-${group.id}`} className="scroll-mt-28">
          <h2 className="text-[17px] font-semibold tracking-tight">{group.name}</h2>
          <div className="mt-3 space-y-2">
            {group.items.map(item => (
              <ItemRow key={item.id} item={item} saved={pickedIds.has(item.id)} onSave={() => onSave(item)} onOpen={() => onOpen(item)} canSave={canSave} />
            ))}
          </div>
        </section>
      ))}
      {uncategorised.length > 0 ? (
        <section>
          {grouped.length > 0 ? (
            <h2 className="text-[17px] font-semibold tracking-tight">More</h2>
          ) : null}
          <div className="mt-3 space-y-2">
            {uncategorised.map(item => (
              <ItemRow key={item.id} item={item} saved={pickedIds.has(item.id)} onSave={() => onSave(item)} onOpen={() => onOpen(item)} canSave={canSave} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  saved,
  onSave,
  onOpen,
  canSave,
}: {
  item: Item;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  canSave: boolean;
}) {
  return (
    <article className="flex items-stretch gap-1 rounded-2xl bg-white ring-1 ring-umber-soft/25">
      {/* The whole row opens the dish. It used to be inert — the only
          interactive thing was the star — so a two-line description was
          all a guest could ever read. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[64px] flex-1 items-center gap-3 rounded-l-2xl p-3 text-left active:bg-oat/60"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-slate">{item.name}</span>
          {item.description ? (
            <span className="mt-0.5 line-clamp-1 block text-[13px] leading-snug text-slate/55">
              {item.description}
            </span>
          ) : null}
          <span className="mt-1 block font-mono text-[13px] tabular-nums text-slate/70">
            ${(item.priceCents / 100).toFixed(2)}
          </span>
        </span>
      </button>

      {canSave ? (
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.name} from My Picks` : `Save ${item.name} to My Picks`}
          className="flex w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-r-2xl border-l border-umber-soft/20 active:bg-oat/60"
        >
          <span
            aria-hidden
            className={["text-xl leading-none", saved ? "text-slate" : "text-slate/30"].join(" ")}
          >
            {saved ? "★" : "☆"}
          </span>
          {/* Labelled. An unexplained star on a restaurant menu reads as a
              rating, not a shortlist. */}
          <span className={["text-[10px] leading-none", saved ? "text-slate" : "text-slate/40"].join(" ")}>
            {saved ? "Saved" : "Save"}
          </span>
        </button>
      ) : null}
    </article>
  );
}

/* ------------------------------ Specials ------------------------------ */

function Specials({
  promotions,
  specials,
  byId,
  accent,
}: {
  promotions: Promo[];
  specials: { id: string; title: string; description: string | null }[];
  byId: Map<string, Item>;
  accent: string;
}) {
  if (promotions.length === 0 && specials.length === 0) {
    return <p className="text-[15px] text-slate/55">Nothing running tonight.</p>;
  }
  return (
    <div className="space-y-4">
      {promotions.map(p => (
        <article key={p.id} className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-umber-soft/25">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {p.type.replace(/_/g, " ").toLowerCase()}
          </p>
          <h3 className="mt-1.5 text-[19px] font-semibold tracking-tight">{p.title}</h3>
          {p.description ? (
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate/70">{p.description}</p>
          ) : null}
          {p.itemIds.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {p.itemIds.map(id => byId.get(id)).filter(Boolean).map(item => (
                <li
                  key={item!.id}
                  className="rounded-full px-3 py-1 text-[12px] text-slate"
                  style={{ background: `${accent}55` }}
                >
                  {item!.name}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
      {specials.map(s => (
        <article key={s.id} className="rounded-3xl bg-white p-5 ring-1 ring-umber-soft/25">
          <h3 className="text-[19px] font-semibold tracking-tight">{s.title}</h3>
          {s.description ? (
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate/70">{s.description}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/* ------------------------------ My Picks ------------------------------ */

function MyPicks({
  picks,
  byId,
  tablePicks,
  onRemove,
  venueSlug,
  sessionToken,
  sessionId,
  serverName,
}: {
  picks: Pick[];
  byId: Map<string, Item>;
  tablePicks: { menuItemId: string; quantity: number }[];
  onRemove: (menuItemId: string) => void;
  venueSlug: string;
  sessionToken: string;
  sessionId: string;
  serverName: string | null;
}) {
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = serverName ?? "your server";

  async function show() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/v/${venueSlug}/wishlist/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionToken }),
      });
      setShared(true);
    } catch {
      /* the picks are still saved; the guest can show their phone */
    } finally {
      setBusy(false);
    }
  }

  if (picks.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[15px] text-slate/60">Nothing saved yet.</p>
        <p className="mt-1.5 text-[14px] text-slate/45">
          Tap ☆ on anything that looks good and it lands here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">My Picks</h2>
        <div className="mt-3 space-y-2">
          {picks.map(p => {
            const item = byId.get(p.menuItemId);
            if (!item) return null;
            return (
              <article
                key={p.menuItemId}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-umber-soft/25"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{item.name}</p>
                  <p className="font-mono text-[13px] tabular-nums text-slate/60">
                    ${(item.priceCents / 100).toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(p.menuItemId)}
                  aria-label={`Remove ${item.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-slate/40"
                >
                  ✕
                </button>
              </article>
            );
          })}
        </div>

        <button
          type="button"
          onClick={show}
          disabled={busy || shared}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-slate text-[15px] font-semibold text-oat disabled:opacity-70"
        >
          {shared ? `${cap(who)} can see these` : busy ? "Sharing…" : `Show ${who}`}
        </button>
        <p className="mt-2 text-center text-[12px] leading-relaxed text-slate/45">
          A shortlist to talk through — your server still takes the order.
        </p>
      </section>

      {tablePicks.length > 0 ? (
        <section>
          <h2 className="text-[17px] font-semibold tracking-tight">Your table is eyeing</h2>
          <ul className="mt-3 space-y-1.5">
            {tablePicks
              .map(t => ({ item: byId.get(t.menuItemId), quantity: t.quantity }))
              .filter(t => t.item)
              .sort((a, b) => b.quantity - a.quantity)
              .map(t => (
                <li
                  key={t.item!.id}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-3.5 py-2.5 text-[14px] ring-1 ring-umber-soft/20"
                >
                  <span>{t.item!.name}</span>
                  <span className="font-mono tabular-nums text-slate/55">× {t.quantity}</span>
                </li>
              ))}
          </ul>
          {/* Counts only. Who saved what never leaves the database. */}
          <p className="mt-2 text-[12px] text-slate/45">
            What everyone at the table has saved, all together.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
