"use client";

import { useCallback, useMemo, useState } from "react";
import { ServiceSheet } from "@/components/guest/service-sheet";
import {
  BottomGuestNav,
  HeartIcon,
  MenuIcon,
  MoreIcon,
  SparkIcon,
  type GuestNavId,
} from "@/components/guest/bottom-nav";
import {
  ServiceStatusCard,
  type ActiveRequest,
} from "@/components/guest/service-status-card";
import { WaitingRecommendation } from "@/components/guest/waiting-recommendation";
import { MOOD_PROMPTS, itemsForPrompt, type MoodPrompt } from "@/lib/menu-discovery";
import { ChefsPick } from "./chefs-pick";
import { ItemSheet } from "@/components/guest/item-sheet";
import { Stagger, Pop, ProgressRing } from "@/components/guest/motion";
import { guestPalette, accentFor } from "@/lib/guest-palette";

/**
 * The guest home.
 *
 * Sections behind a bottom navigation bar, with the service control
 * raised out of the middle of it. Client-side because the whole point is
 * that saving a pick or switching tabs is instant on a phone with two
 * bars of restaurant wifi — the data arrived in one server pass, so
 * moving around costs nothing.
 *
 * The navigation moved from a sticky strip at the top to a docked bar at
 * the bottom. This is a page opened one-handed at a table, often with a
 * drink in the other hand, and a thumb reaches the bottom of a phone and
 * not the top of it. Drinks and Specials moved behind "More" so the four
 * visible slots are the four a guest actually moves between.
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

/**
 * Four of these are navigation slots; "drinks" and "specials" are
 * reachable views that live behind More (and behind the specials card's
 * own "explore" action) without occupying a slot of their own.
 */
type TabId = "for-you" | "menu" | "drinks" | "specials" | "picks" | "more";

/** Which navigation slot lights up for a given view. */
function navSlotFor(tab: TabId): GuestNavId {
  if (tab === "drinks" || tab === "specials" || tab === "more") return "more";
  if (tab === "picks") return "picks";
  if (tab === "menu") return "menu";
  return "for-you";
}

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
  /**
   * The guest's open request, resolved on the server for this page load.
   * Non-null means they asked for something and nobody has finished it —
   * including on a fresh page load after a refresh, which is the point.
   */
  activeRequest: ActiveRequest | null;
}) {
  // A whole family from the venue's colour, not one wash. Everything the
  // guest sees is tinted with THEIR colour, which is the difference
  // between colourful and merely decorated.
  const palette = guestPalette(props.brandColor);
  const accent = palette.base;
  // Bumped on every save so the header count can pop.
  const [savePulse, setSavePulse] = useState(0);
  const [picks, setPicks] = useState<Pick[]>(props.picks);
  const [tab, setTab] = useState<TabId>(normalizeTab(props.initialTab));
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The dish a guest tapped into. Rows used to be inert: the only
  // interactive thing was a small unlabelled star, so there was no way to
  // read a description that didn't fit on two lines.
  const [openItem, setOpenItem] = useState<Item | null>(null);
  // The bottom bar owns the service button now, so the sheet is opened
  // from out here rather than by a dock of its own.
  const [serviceOpen, setServiceOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(
    props.activeRequest,
  );
  const [requestOpen, setRequestOpen] = useState(props.activeRequest !== null);

  const byId = useMemo(() => new Map(props.items.map(i => [i.id, i])), [props.items]);
  const pickedIds = useMemo(() => new Set(picks.map(p => p.menuItemId)), [picks]);

  const drinks = useMemo(
    () => props.items.filter(i => i.tags.some(t => DRINK_TAGS.has(t.toLowerCase()))),
    [props.items],
  );

  const hasSpecials =
    props.config.specials && (props.promotions.length > 0 || props.specials.length > 0);

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
        if (!already) setSavePulse(n => n + 1);
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

  /**
   * Raise a service request from somewhere other than the service sheet.
   *
   * "I'm ready to order" lives on My Picks because that is where a guest
   * finishes deciding, and making them close the list and find the bell
   * loses the moment. It is the same request the sheet sends — one code
   * path, one rate limit, one row — and it still orders nothing. The
   * server comes over and takes the order the way they always have.
   */
  const sendRequest = useCallback(
    async (type: "ORDER"): Promise<boolean> => {
      try {
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: props.sessionId,
            sessionToken: props.sessionToken,
            type,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.id) throw new Error(String(res.status));
        setActiveRequest({
          id: body.id,
          type,
          status: "PENDING",
          note: null,
          createdAt: new Date().toISOString(),
          acknowledgedAt: null,
        });
        return true;
      } catch {
        setToast("Couldn't reach the service team. Try again.");
        setTimeout(() => setToast(null), 2400);
        return false;
      }
    },
    [props.sessionId, props.sessionToken],
  );

  /**
   * The one thing shown under an open request.
   *
   * Deterministic and drawn only from what the venue actually published:
   * an item attached to tonight's live promotion first, then anything
   * they marked featured, and nothing at all if neither exists. No
   * scoring, no model, nothing invented — a guest waiting on a server is
   * the worst possible moment to show them something made up.
   *
   * Already-saved items are skipped: suggesting something a guest has
   * shortlisted reads as the product not paying attention.
   */
  const waiting = useMemo(() => {
    const promoted = props.promotions[0]?.itemIds ?? [];
    for (const id of promoted) {
      const item = byId.get(id);
      if (item && !pickedIds.has(id)) return { item, reason: "Tonight's special" };
    }
    const featured = props.items.find(i => i.isFeatured && !pickedIds.has(i.id));
    if (featured) return { item: featured, reason: "Featured tonight" };
    return null;
  }, [props.promotions, props.items, byId, pickedIds]);

  const navSlot = navSlotFor(tab);

  return (
    // pb-28 clears the bottom bar so the last row of a menu is readable
    // rather than half-hidden under it.
    <div className="min-h-[100dvh] bg-ivory pb-28 text-plum">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72"
        style={{
          background: `linear-gradient(170deg, ${palette.wash[2]} 0%, ${palette.wash[0]} 45%, transparent 92%)`,
        }}
      />

      <header className="flex items-start justify-between gap-4 px-5 pt-8">
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: palette.deep }}
          >
            {props.venueName}
          </p>
          <h1 className="mt-1.5 text-[27px] font-semibold leading-tight tracking-tight text-plum">
            {props.greeting}, {props.tableLabel}
          </h1>
        </div>

        {/* Quiet progress. Not a score — no points, no streak — just a
            hint that there's more of the menu to look at. Gone once
            they've seen it all rather than congratulating anyone. */}
        {props.config.myPicks && picks.length > 0 ? (
          <span className="mt-1 shrink-0">
            <Pop trigger={savePulse}>
              <span
                className="flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-[13px] font-semibold"
                style={{ background: palette.base, color: palette.on }}
              >
                {picks.length}
              </span>
            </Pop>
          </span>
        ) : null}
      </header>

      <main className="px-5 pt-6">
        {/* Above everything, on every tab: a guest who has asked for
            something should never have to go looking for whether anyone
            heard them. */}
        {props.requestsEnabled ? (
          <ServiceStatusCard
            // Remount when the request changes identity. `initial` seeds
            // useState, and useState ignores a changed prop — so without
            // this the card stayed invisible after sending, which is the
            // exact silence the card exists to end.
            key={activeRequest?.id ?? "none"}
            venueSlug={props.venueSlug}
            sessionId={props.sessionId}
            sessionToken={props.sessionToken}
            serverName={props.serverName}
            initial={activeRequest}
            onStageChange={setRequestOpen}
          >
            {waiting ? (
              <WaitingRecommendation
                item={waiting.item}
                reason={waiting.reason}
                saved={pickedIds.has(waiting.item.id)}
                canSave={props.config.myPicks}
                onSave={() => void savePick(waiting.item)}
                onOpen={() => setOpenItem(waiting.item)}
              />
            ) : null}
          </ServiceStatusCard>
        ) : null}

        {tab === "for-you" ? (
          <ForYou
            {...props}
            picks={picks}
            pickedIds={pickedIds}
            onSave={savePick}
            onOpen={setOpenItem}
            palette={palette}
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
            palette={palette}
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
            palette={palette}
          />
        ) : null}

        {tab === "specials" ? (
          <Specials promotions={props.promotions} specials={props.specials} byId={byId} accent={accent} palette={palette} />
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
            palette={palette}
            onReadyToOrder={props.requestsEnabled ? () => sendRequest("ORDER") : undefined}
            hasOpenRequest={requestOpen}
          />
        ) : null}

        {tab === "more" ? (
          <More
            onOpenTab={setTab}
            hasDrinks={drinks.length > 0}
            hasSpecials={hasSpecials}
            feedbackHref={props.feedbackHref}
            venueName={props.venueName}
            tableLabel={props.tableLabel}
            palette={palette}
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

      {/* Above the bottom bar, not behind it. */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-fit rounded-full bg-plum px-4 py-2 text-[13px] text-ivory shadow-lift"
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
          open={serviceOpen}
          onOpenChange={setServiceOpen}
          onSent={r =>
            setActiveRequest({
              id: r.id,
              type: r.type,
              status: "PENDING",
              note: r.note,
              createdAt: new Date().toISOString(),
              acknowledgedAt: null,
            })
          }
        />
      ) : null}

      <BottomGuestNav
        active={navSlot}
        onSelect={id => setTab(id === "more" ? "more" : (id as TabId))}
        onService={() => setServiceOpen(true)}
        serverName={props.serverName}
        serviceEnabled={props.requestsEnabled}
        serviceActive={requestOpen}
        // Saffron, not the venue's colour. The bar is Deep Plum — a fixed
        // brand surface — and a venue hex picked to work on white has no
        // guarantee of reading on plum. This taproom's is a lime that
        // vanished against it. Everything ABOVE the bar still wears the
        // venue's colour; the bar itself stays brand-constant so the one
        // control that matters is always legible.
        accent="#F4C95D"
        accentOn="#34263F"
        items={[
          { id: "for-you", label: "For You", icon: <SparkIcon /> },
          { id: "menu", label: "Menu", icon: <MenuIcon /> },
          {
            id: "picks",
            label: "My Picks",
            icon: <HeartIcon />,
            badge: props.config.myPicks ? picks.length : 0,
          },
          { id: "more", label: "More", icon: <MoreIcon /> },
        ]}
      />
    </div>
  );
}

function normalizeTab(value: string): TabId {
  const allowed: TabId[] = ["for-you", "menu", "drinks", "specials", "picks", "more"];
  return (allowed as string[]).includes(value) ? (value as TabId) : "for-you";
}

/* --------------------------------- More --------------------------------- */

/**
 * The fifth slot: the things a guest needs occasionally rather than
 * constantly.
 *
 * Drinks and Specials used to sit in the top strip alongside For You and
 * Menu, which gave five equal-weight destinations on a screen where a
 * thumb comfortably reaches four. They aren't gone — they're one tap
 * away, and the specials card on For You still opens Specials directly,
 * so the path most guests take is unchanged.
 *
 * Rows only appear when there is something behind them. A venue with no
 * drinks tagged and no live promotion gets a short list, not a screen of
 * dead ends.
 */
function More({
  onOpenTab,
  hasDrinks,
  hasSpecials,
  feedbackHref,
  venueName,
  tableLabel,
  palette,
}: {
  onOpenTab: (t: TabId) => void;
  hasDrinks: boolean;
  hasSpecials: boolean;
  feedbackHref?: string;
  venueName: string;
  tableLabel: string;
  palette: ReturnType<typeof guestPalette>;
}) {
  const rows: { id: TabId; label: string; hint: string; show: boolean }[] = [
    { id: "drinks", label: "Drinks", hint: "Everything behind the bar", show: hasDrinks },
    { id: "specials", label: "Specials", hint: "On tonight only", show: hasSpecials },
  ];

  return (
    <div className="space-y-6">
      <ul className="overflow-hidden rounded-2xl border border-sandstone bg-surface">
        {rows.filter(r => r.show).map((r, idx) => (
          <li key={r.id} className={idx > 0 ? "border-t border-sandstone" : ""}>
            <button
              type="button"
              onClick={() => onOpenTab(r.id)}
              className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 text-left transition-colors hover:bg-surface-hover"
            >
              <span>
                <span className="block text-[15px] font-medium text-plum">{r.label}</span>
                <span className="block text-[13px] text-graphite">{r.hint}</span>
              </span>
              <span aria-hidden className="text-graphite">&rsaquo;</span>
            </button>
          </li>
        ))}
      </ul>

      {/* Feedback is offered here as well as after asking for the check.
          Some guests want to say something before they leave and never
          press the check button at all — a venue shouldn't lose that
          because the only door to it was behind a different action. */}
      {feedbackHref ? (
        <a
          href={feedbackHref}
          className="flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-sandstone bg-surface text-[15px] font-medium text-plum transition-colors hover:bg-surface-hover"
        >
          How was tonight?
        </a>
      ) : null}

      <p className="px-1 text-[13px] leading-relaxed text-graphite">
        You&rsquo;re at <span className="font-medium text-plum">{tableLabel}</span> in{" "}
        <span className="font-medium text-plum">{venueName}</span>. Anything you save stays
        with this table for tonight.
      </p>

      {/* A plain, honest statement of what the product does and doesn't
          do. Guests scan a code from a table tent with no idea what it
          is; a line saying nobody is taking their money is worth more
          than another button. */}
      <p
        className="rounded-2xl px-4 py-3 text-[12px] leading-relaxed text-graphite"
        style={{ background: palette.wash[0] }}
      >
        TabCall lets you browse, save what you fancy and call your server.
        Ordering and paying still happen with your server, the way they
        always have.
      </p>
    </div>
  );
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
  palette,
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
  palette: ReturnType<typeof guestPalette>;
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
          <h2 className="text-[17px] font-semibold tracking-tight text-plum">
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
                    palette={palette}
                  />
                ))
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-[17px] font-semibold tracking-tight text-plum">Featured tonight</h2>
        <div className="mt-3 space-y-2">
          {items.filter(i => i.isFeatured).slice(0, 5).map(item => (
            <ItemRow
              key={item.id}
              item={item}
              saved={pickedIds.has(item.id)}
              onSave={() => onSave(item)}
              onOpen={() => onOpen(item)}
              canSave={config.myPicks}
              palette={palette}
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
  palette,
}: {
  items: Item[];
  categories: { id: string; name: string }[];
  pickedIds: Set<string>;
  onSave: (item: Item) => void;
  onOpen: (item: Item) => void;
  canSave: boolean;
  palette: ReturnType<typeof guestPalette>;
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
            {grouped.map((group, i) => (
              <li key={group.id}>
                <a
                  href={`#cat-${group.id}`}
                  onClick={e => {
                    e.preventDefault();
                    document
                      .getElementById(`cat-${group.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  // Indexed, not hashed: neighbours must never come out
                  // the same colour.
                  style={{ background: accentFor(palette, group.name, i) }}
                  className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium text-slate transition-transform active:scale-95"
                >
                  {group.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {grouped.map((group, i) => (
        <section key={group.id} id={`cat-${group.id}`} className="scroll-mt-28">
          <h2 className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-plum">
            <span
              aria-hidden
              className="h-5 w-1.5 rounded-full"
              style={{ background: accentFor(palette, group.name, i) }}
            />
            {group.name}
          </h2>
          {/* Rows arrive as you reach them, rather than the whole menu
              being already settled by the time you scroll down. */}
          <Stagger className="mt-3 space-y-2">
            {group.items.map(item => (
              <ItemRow key={item.id} item={item} saved={pickedIds.has(item.id)} onSave={() => onSave(item)} onOpen={() => onOpen(item)} canSave={canSave} palette={palette} />
            ))}
          </Stagger>
        </section>
      ))}
      {uncategorised.length > 0 ? (
        <section>
          {grouped.length > 0 ? (
            <h2 className="text-[17px] font-semibold tracking-tight text-plum">More</h2>
          ) : null}
          <div className="mt-3 space-y-2">
            {uncategorised.map(item => (
              <ItemRow key={item.id} item={item} saved={pickedIds.has(item.id)} onSave={() => onSave(item)} onOpen={() => onOpen(item)} canSave={canSave} palette={palette} />
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
  palette,
}: {
  item: Item;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  canSave: boolean;
  palette: ReturnType<typeof guestPalette>;
}) {
  // Local counter so THIS row's star pops on tap, not every row's.
  const [pulse, setPulse] = useState(0);

  return (
    <article className="flex items-stretch gap-1 rounded-2xl border border-sandstone bg-surface">
      {/* The whole row opens the dish. It used to be inert — the only
          interactive thing was the star — so a two-line description was
          all a guest could ever read. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[64px] flex-1 items-center gap-3 rounded-l-2xl p-3 text-left active:bg-surface-hover"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-plum">{item.name}</span>
          {item.description ? (
            <span className="mt-0.5 line-clamp-1 block text-[13px] leading-snug text-graphite/80">
              {item.description}
            </span>
          ) : null}
          <span className="mt-1 block font-mono text-[13px] tabular-nums text-graphite">
            ${(item.priceCents / 100).toFixed(2)}
          </span>
        </span>
      </button>

      {canSave ? (
        <button
          type="button"
          onClick={() => { setPulse(n => n + 1); onSave(); }}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.name} from My Picks` : `Save ${item.name} to My Picks`}
          style={saved ? { background: `${palette.wash[0]}` } : undefined}
          className="flex w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-r-2xl border-l border-sandstone transition-colors active:bg-surface-hover"
        >
          <Pop trigger={pulse}>
            <span
              aria-hidden
              className="text-xl leading-none"
              style={{ color: saved ? palette.deep : undefined }}
            >
              <span className={saved ? "" : "text-slate/30"}>{saved ? "★" : "☆"}</span>
            </span>
          </Pop>
          {/* Labelled. An unexplained star on a restaurant menu reads as a
              rating, not a shortlist. */}
          <span
            className="text-[10px] leading-none"
            style={{ color: saved ? palette.deep : undefined }}
          >
            <span className={saved ? "" : "text-slate/40"}>{saved ? "Saved" : "Save"}</span>
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
  palette,
}: {
  promotions: Promo[];
  specials: { id: string; title: string; description: string | null }[];
  byId: Map<string, Item>;
  accent: string;
  palette: ReturnType<typeof guestPalette>;
}) {
  if (promotions.length === 0 && specials.length === 0) {
    return <p className="text-[15px] text-slate/55">Nothing running tonight.</p>;
  }
  return (
    <div className="space-y-4">
      {/* Swipeable, per the brief. Snap points so a card always lands
          square rather than half off the edge. */}
      {promotions.length > 0 ? (
        <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {promotions.map((p, i) => (
            <article
              key={p.id}
              className="w-[85%] shrink-0 snap-center rounded-3xl p-5 shadow-card"
              style={{
                background: `linear-gradient(150deg, ${accentFor(palette, p.id, i)}, ${palette.wash[0]})`,
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/70">
                {p.type.replace(/_/g, " ").toLowerCase()}
              </p>
              <h3 className="mt-1.5 text-[20px] font-semibold leading-snug tracking-tight text-slate">
                {p.title}
              </h3>
              {p.description ? (
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate/75">{p.description}</p>
              ) : null}
              {p.itemIds.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {p.itemIds.map(id => byId.get(id)).filter(Boolean).map(item => (
                    <li
                      key={item!.id}
                      className="rounded-full bg-white/70 px-3 py-1 text-[12px] text-slate"
                    >
                      {item!.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {promotions.length > 1 ? (
        <p className="text-center text-[11px] text-slate/40">Swipe for more</p>
      ) : null}
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
  palette,
  onReadyToOrder,
  hasOpenRequest,
}: {
  picks: Pick[];
  byId: Map<string, Item>;
  tablePicks: { menuItemId: string; quantity: number }[];
  onRemove: (menuItemId: string) => void;
  venueSlug: string;
  sessionToken: string;
  sessionId: string;
  serverName: string | null;
  palette: ReturnType<typeof guestPalette>;
  /** Undefined when the venue has service requests switched off. */
  onReadyToOrder?: () => Promise<boolean>;
  /** Hides the prompt when this table already has something in flight. */
  hasOpenRequest: boolean;
}) {
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  // Two steps on purpose. "Ready to order" pulls a person away from
  // another table, so it shouldn't be a single tap next to "remove".
  const [confirming, setConfirming] = useState(false);
  const [ordering, setOrdering] = useState(false);
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
        <h2 className="text-[17px] font-semibold tracking-tight text-plum">My Picks</h2>
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
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-saffron text-[15px] font-semibold text-plum disabled:opacity-70"
        >
          {shared ? `${cap(who)} can see these` : busy ? "Sharing…" : `Show ${who}`}
        </button>
        <p className="mt-2 text-center text-[12px] leading-relaxed text-slate/45">
          A shortlist to talk through — your server still takes the order.
        </p>

        {/* §22. This is a signal, not a checkout: it tells a person the
            table has finished deciding. Nothing is sent to the kitchen,
            nothing is priced, and nobody is charged. */}
        {onReadyToOrder && !hasOpenRequest ? (
          confirming ? (
            <div className="mt-3 rounded-2xl border border-sandstone bg-surface p-4">
              <p className="text-[15px] font-semibold text-plum">Ready to order?</p>
              <p className="mt-1 text-[13px] leading-relaxed text-graphite">
                Let {who} know and they&rsquo;ll be right with you.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="min-h-[48px] flex-1 rounded-xl border border-sandstone text-[14px] text-graphite"
                >
                  Keep browsing
                </button>
                <button
                  type="button"
                  disabled={ordering}
                  onClick={async () => {
                    setOrdering(true);
                    const ok = await onReadyToOrder();
                    setOrdering(false);
                    if (ok) setConfirming(false);
                  }}
                  className="min-h-[48px] flex-[1.4] rounded-xl bg-plum text-[14px] font-semibold text-ivory disabled:opacity-70"
                >
                  {ordering ? "Telling them…" : `Tell ${who} we're ready`}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 min-h-[52px] w-full rounded-2xl border border-plum/25 text-[15px] font-medium text-plum transition-colors hover:bg-plum/5"
            >
              I&rsquo;m ready to order
            </button>
          )
        ) : null}
      </section>

      {tablePicks.length > 0 ? (
        <section>
          <h2 className="text-[17px] font-semibold tracking-tight text-plum">Your table is eyeing</h2>
          <ul className="mt-3 space-y-1.5">
            {tablePicks
              .map(t => ({ item: byId.get(t.menuItemId), quantity: t.quantity }))
              .filter(t => t.item)
              .sort((a, b) => b.quantity - a.quantity)
              .map((t, i, all) => {
                const top = all[0]?.quantity ?? 1;
                return (
                  <li
                    key={t.item!.id}
                    className="relative overflow-hidden rounded-xl bg-white/70 px-3.5 py-2.5 text-[14px] ring-1 ring-umber-soft/20"
                  >
                    {/* Proportional fill — how much of the table wants
                        this, at a glance. Counts only; who saved what
                        never leaves the database. */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                      style={{
                        width: `${Math.round((t.quantity / top) * 100)}%`,
                        background: accentFor(palette, t.item!.id, i),
                        opacity: 0.5,
                      }}
                    />
                    <span className="relative flex items-center justify-between">
                      <span>{t.item!.name}</span>
                      <span className="font-mono tabular-nums text-slate/60">× {t.quantity}</span>
                    </span>
                  </li>
                );
              })}
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
