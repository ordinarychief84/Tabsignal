/**
 * Admin POS integration endpoint.
 *
 *   GET  → current `PosIntegration` row (sans `encryptedCredentials`) + the
 *          last 50 `PosSyncLog` rows. Used by the admin POS page.
 *   PATCH → updates provider/status and (optionally) credentials. Plaintext
 *          credentials are encrypted via `lib/pos/crypto` before persistence;
 *          the encrypted blob is *never* returned in the response.
 *
 * Both gated by `gateAdminRoute(slug, "free", "pos.manage")` — every plan
 * gets to see the POS card; the permission limits writes to OWNER/MANAGER.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { encryptCredentials } from "@/lib/pos/crypto";
import type { PosIntegrationStatus } from "@prisma/client";

// Node runtime — `lib/pos/crypto` uses `node:crypto`. The default for app
// router is Node anyway, but pinning makes the constraint explicit so a
// future "let's try edge" experiment can't silently break encryption.
export const runtime = "nodejs";

const PROVIDERS = ["NONE", "TOAST", "SQUARE", "CLOVER"] as const;
const STATUSES: PosIntegrationStatus[] = ["PENDING", "CONNECTED", "DISCONNECTED", "ERROR"];

const PatchBody = z.object({
  provider: z.enum(PROVIDERS).optional(),
  status: z.enum(STATUSES as [PosIntegrationStatus, ...PosIntegrationStatus[]]).optional(),
  // Free-form credentials JSON (token, refresh token, account id, etc.).
  // We accept it as an object and stringify before encryption so each
  // provider can shape its own credential schema.
  credentials: z.record(z.unknown()).optional(),
});

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "pos.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // `select` deliberately omits `encryptedCredentials`. The frontend never
  // needs it, and surfacing it would be a needless serialization of secret
  // material across the wire.
  const integration = await db.posIntegration.findUnique({
    where: { venueId: gate.venueId },
    select: {
      id: true,
      provider: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const logs = await db.posSyncLog.findMany({
    where: { venueId: gate.venueId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      provider: true,
      action: true,
      status: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    integration: integration
      ? {
          ...integration,
          lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
          createdAt: integration.createdAt.toISOString(),
          updatedAt: integration.updatedAt.toISOString(),
        }
      : null,
    logs: logs.map(l => ({
      id: l.id,
      provider: l.provider,
      action: l.action,
      status: l.status,
      errorMessage: l.errorMessage,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "pos.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed: z.infer<typeof PatchBody>;
  try {
    parsed = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  if (parsed.provider === undefined && parsed.status === undefined && parsed.credentials === undefined) {
    return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  }

  // Encrypt before persistence — the plaintext object never lands in
  // Postgres. `JSON.stringify` is deterministic enough for credentials
  // (no Dates / regexes expected).
  const encrypted = parsed.credentials !== undefined
    ? encryptCredentials(JSON.stringify(parsed.credentials))
    : undefined;

  // Upsert: a venue may not yet have a `PosIntegration` row (we don't
  // mint one on signup — it appears the first time someone visits this
  // page and saves).
  const row = await db.posIntegration.upsert({
    where: { venueId: gate.venueId },
    create: {
      venueId: gate.venueId,
      provider: parsed.provider ?? "NONE",
      status: parsed.status ?? "PENDING",
      encryptedCredentials: encrypted ?? null,
    },
    update: {
      ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(encrypted !== undefined ? { encryptedCredentials: encrypted } : {}),
    },
    select: {
      id: true,
      provider: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    integration: {
      ...row,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
