/**
 * Seed a guest session with a demo bill so the bill / payment flow can be
 * end-to-end tested without a staff "add item" UI.
 *
 * Usage:
 *   bun run scripts/seed-bill.ts <sessionId> [--replace]
 *   bun run scripts/seed-bill.ts <sessionId> --base http://localhost:3000
 */

const DEMO_ITEMS = [
  { name: "House margarita", quantity: 2, unitCents: 1200 },
  { name: "IPA draft", quantity: 1, unitCents: 800 },
  { name: "Truffle fries", quantity: 1, unitCents: 950 },
];

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const sessionId = args[0];
  const base =
    process.env.APP_URL ??
    (args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000");
  const mode = args.includes("--replace") ? "replace" : "append";
  return { sessionId, base, mode };
}

async function main() {
  const { sessionId, base, mode } = parseArgs(process.argv);
  if (!sessionId) {
    console.error("Usage: bun run scripts/seed-bill.ts <sessionId> [--replace] [--base <url>]");
    process.exit(2);
  }
  const res = await fetch(`${base}/api/session/${sessionId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: DEMO_ITEMS, mode }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Seed failed (HTTP ${res.status}):`, body);
    process.exit(1);
  }
  console.log(`Seeded session ${sessionId} (${mode}):`);
  console.table(body.items);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
