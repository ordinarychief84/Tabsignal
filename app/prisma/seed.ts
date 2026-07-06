/**
 * Dev seed: one venue where every core flow works out of the box.
 *
 *   bun run db:seed        (idempotent — safe to re-run, upserts throughout)
 *
 * Seeds: org → venue "The Local Dev Taproom" (slug dev-taproom) → tables
 * T1–T4 with STABLE qrTokens → owner + server staff (password login,
 * email pre-verified) → menu categories/items → one open guest session
 * with a small tab on T1 so the bill/split/pay screens render data
 * immediately.
 *
 * Guarded by scripts/assert-dev-db.mjs via the db:seed script — this
 * never runs against a remote database.
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

// Stable tokens so bookmarked guest URLs survive re-seeds.
const TABLE_TOKENS: Record<string, string> = {
  T1: "devqr-t1-0000000000000001",
  T2: "devqr-t2-0000000000000002",
  T3: "devqr-t3-0000000000000003",
  T4: "devqr-t4-0000000000000004",
};

const STAFF = [
  { email: "owner@dev.local", name: "Devon Owner", role: "OWNER" as const },
  { email: "maya@dev.local", name: "Maya Server", role: "SERVER" as const },
];
const DEV_PASSWORD = "devpass123";

const MENU: Record<string, { name: string; priceCents: number; description?: string }[]> = {
  Cocktails: [
    { name: "House Margarita", priceCents: 1200, description: "Lime, agave, salted rim" },
    { name: "Old Fashioned", priceCents: 1400 },
    { name: "Espresso Martini", priceCents: 1500 },
  ],
  Beer: [
    { name: "IPA Draft", priceCents: 800 },
    { name: "Lager Draft", priceCents: 700 },
  ],
  Snacks: [
    { name: "Truffle Fries", priceCents: 950 },
    { name: "Smash Burger", priceCents: 1600, description: "Two patties, house pickles" },
  ],
};

async function main() {
  const org = await db.organization.upsert({
    where: { id: "dev_org" },
    update: {},
    create: { id: "dev_org", name: "Dev Taproom Group" },
  });

  const venue = await db.venue.upsert({
    where: { slug: "dev-taproom" },
    update: {},
    create: {
      orgId: org.id,
      slug: "dev-taproom",
      name: "The Local Dev Taproom",
      zipCode: "78701",
      country: "US",
      timezone: "America/Chicago",
      brandColor: "#d6f34e",
      onboardingCompletedAt: new Date(),
    },
  });

  for (const [label, qrToken] of Object.entries(TABLE_TOKENS)) {
    await db.table.upsert({
      where: { venueId_label: { venueId: venue.id, label } },
      update: {},
      create: { venueId: venue.id, label, qrToken },
    });
  }

  const passwordHash = await hash(DEV_PASSWORD, 10);
  for (const s of STAFF) {
    await db.staffMember.upsert({
      where: { email: s.email },
      update: {},
      create: {
        venueId: venue.id,
        name: s.name,
        email: s.email,
        role: s.role,
        status: "ACTIVE",
        passwordHash,
        emailVerifiedAt: new Date(), // password login requires a verified email
      },
    });
  }

  for (const [catName, items] of Object.entries(MENU)) {
    const existing = await db.menuCategory.findFirst({
      where: { venueId: venue.id, name: catName },
    });
    const category =
      existing ??
      (await db.menuCategory.create({ data: { venueId: venue.id, name: catName } }));
    for (const item of items) {
      const found = await db.menuItem.findFirst({
        where: { venueId: venue.id, name: item.name },
      });
      if (!found) {
        await db.menuItem.create({
          data: { venueId: venue.id, categoryId: category.id, ...item },
        });
      }
    }
  }

  // One open session with a small tab on T1 so bill screens have data.
  const t1 = await db.table.findUniqueOrThrow({
    where: { venueId_label: { venueId: venue.id, label: "T1" } },
  });
  const open = await db.guestSession.findFirst({
    where: { tableId: t1.id, paidAt: null, expiresAt: { gt: new Date() } },
  });
  if (!open) {
    await db.guestSession.create({
      data: {
        venueId: venue.id,
        tableId: t1.id,
        sessionToken: randomBytes(24).toString("hex"),
        expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
        lineItems: [
          { name: "House Margarita", quantity: 2, unitCents: 1200 },
          { name: "Truffle Fries", quantity: 1, unitCents: 950 },
        ],
      },
    });
  }

  // Same URL shape lib/qr.ts prints on the tent sheet — the ?s= token
  // is required (resolveGuestSession token-compares it).
  console.log(`
Seeded "The Local Dev Taproom" (slug dev-taproom).

  Guest T1 (open tab): /v/dev-taproom/t/T1?s=${TABLE_TOKENS.T1}
  Guest T2 (fresh):    /v/dev-taproom/t/T2?s=${TABLE_TOKENS.T2}
  Staff login:         /staff/login → maya@dev.local / ${DEV_PASSWORD}
  Owner login:         /login       → owner@dev.local / ${DEV_PASSWORD}
`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
