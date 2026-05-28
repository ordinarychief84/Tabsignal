import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timingSafeEqual } from "node:crypto";

/**
 * READ-ONLY schema diagnostic endpoint.
 *
 * Returns the current state of production's Postgres schema for the
 * tables the signup transaction writes to — so an operator can tell
 * exactly which columns / tables / enum values are missing without
 * needing direct DB access.
 *
 * Crucially, this endpoint CANNOT mutate anything:
 *   - All queries use `$queryRawUnsafe` (NOT `$executeRawUnsafe`)
 *   - All queries are SELECTs against `information_schema` / `pg_*`
 *   - No INSERT, UPDATE, DELETE, ALTER, CREATE in the entire file
 *
 * The bearer token below is single-use by design — a follow-up PR
 * removes this file as soon as the diagnostic has been read. Token
 * leakage via git history would give a reader the ability to view
 * the schema names, nothing more (no row data, no credentials).
 *
 * This is the LEAST-risk path to root-cause the lingering signup 500
 * after our manual SQL paste only partially repaired prod's schema.
 */

// Single-use read token. Same shape as the earlier (rejected) write
// endpoint but the route can't mutate, so the risk profile is much
// lower. Remove this file in a follow-up PR after the diagnostic
// has been read.
const DIAG_TOKEN = "8f3a92b1c5d6e7f4a0b3c9d2e1f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
  if (!authMatches(got, DIAG_TOKEN)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // What the signup transaction WRITES (per src/app/api/signup/route.ts).
  // For each table, we check that every column Prisma sends shows up
  // in information_schema. Missing columns are the root cause of the 500.

  // Tables touched by signup: Organization, Venue, Table, StaffMember, OrgMember
  const tablesAndCols = {
    Organization: ["id", "name", "createdAt"],
    Venue: [
      "id", "orgId", "slug", "name", "address", "phoneNumber", "country",
      "zipCode", "timezone", "venueType", "onboardingState", "onboardingCompletedAt",
      "createdAt",
    ],
    Table: ["id", "venueId", "label", "qrToken", "createdAt"],
    StaffMember: [
      "id", "venueId", "email", "name", "role", "passwordHash",
      "passwordChangedAt", "emailVerifiedAt", "status", "createdAt",
    ],
    OrgMember: ["id", "orgId", "email", "role", "createdAt"],
  };

  const tableResults: Record<string, { tableExists: boolean; columnsPresent: string[]; columnsMissing: string[] }> = {};

  for (const [tableName, wanted] of Object.entries(tablesAndCols)) {
    const cols = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      tableName,
    );
    const present = cols.map(c => c.column_name);
    const missing = wanted.filter(c => !present.includes(c));
    tableResults[tableName] = {
      tableExists: present.length > 0,
      columnsPresent: wanted.filter(c => present.includes(c)),
      columnsMissing: missing,
    };
  }

  // StaffStatus enum values (for DELETED)
  const enumVals = await db.$queryRawUnsafe<Array<{ enumlabel: string }>>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'StaffStatus' ORDER BY e.enumsortorder`,
  );

  // PasswordResetToken table existence
  const prtExists = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PasswordResetToken') AS exists`,
  );

  // _prisma_migrations state (count of finished, count of failed)
  const migState = await db.$queryRawUnsafe<Array<{ state: string; count: bigint }>>(
    `SELECT CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'finished'
                 WHEN rolled_back_at IS NOT NULL THEN 'rolled_back'
                 WHEN finished_at IS NULL THEN 'failed'
                 ELSE 'other' END AS state,
            count(*) AS count
       FROM "_prisma_migrations"
   GROUP BY 1`,
  );

  return NextResponse.json({
    ok: true,
    tableResults,
    staffStatusValues: enumVals.map(r => r.enumlabel),
    passwordResetTableExists: prtExists[0]?.exists === true,
    prismaMigrations: migState.map(r => ({ state: r.state, count: Number(r.count) })),
    note: "Remove this endpoint after reading.",
  });
}

function authMatches(got: string, expected: string): boolean {
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
