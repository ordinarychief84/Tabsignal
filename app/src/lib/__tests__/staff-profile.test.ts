/**
 * A server editing their own guest-facing profile.
 *
 * The risk in any self-service endpoint on a staff record is that it
 * quietly becomes a role-escalation. A route that took a partial
 * StaffMember and passed it to update() would let a server set their own
 * role, move themselves to another venue, or un-suspend an account
 * somebody deliberately disabled — none of which would look wrong in a
 * diff, because the form on top only shows three fields.
 *
 * So the properties defended here are: the allowlist is on the WAY IN
 * rather than in the form; the write is scoped to the signed-in row and
 * takes no id; and a suspended account cannot keep editing what guests
 * see.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTE_PATH = join(import.meta.dir, "../../app/api/staff/profile/route.ts");
const ROUTE = readFileSync(ROUTE_PATH, "utf8");

const state: {
  staff: { id: string; status: string } | null;
  updates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
} = { staff: null, updates: [] };

const SESSION = { staffId: "staff_1", venueId: "venue_1", role: "SERVER" };

beforeEach(() => {
  state.staff = { id: "staff_1", status: "ACTIVE" };
  state.updates = [];

  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async () => state.staff,
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          state.updates.push(args);
          return { displayName: null, photoUrl: null, welcomeMessage: null };
        },
      },
    },
  }));
  mock.module("@/lib/auth/session", () => ({
    getStaffSession: async () => SESSION,
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true,
      secure: true,
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
  }));
  mock.module("@/lib/storage", () => ({
    uploadToBucket: async () => ({ ok: true, publicUrl: "https://cdn/x.jpg", path: "x" }),
  }));
});

afterEach(() => {
  mock.restore();
});

function patch(body: unknown) {
  return new Request("https://tab-call.test/api/staff/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

describe("only the three guest-facing fields can be written", () => {
  test("the allowlist is applied on the way in, not left to the form", () => {
    // A route that spread the parsed body into update() would look
    // identical in review and be a role-escalation.
    const body = ROUTE.split("export async function PATCH")[1] ?? "";
    expect(body).not.toMatch(/data:\s*parsed/);
    expect(body).not.toMatch(/\.\.\.parsed/);
  });

  test("a payload carrying role, venue or status writes none of them", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    const res = await PATCH(
      patch({
        displayName: "Maya",
        role: "OWNER",
        venueId: "venue_2",
        status: "ACTIVE",
        email: "attacker@example.com",
        passwordHash: "x",
        sessionsValidAfter: null,
      }),
    );
    expect(res.status).toBe(200);
    expect(state.updates.length).toBe(1);
    expect(Object.keys(state.updates[0]!.data)).toEqual(["displayName"]);
  });

  test("the legal name is not writable here", async () => {
    // `name` can be a legal name on an employment record. displayName is
    // what a stranger's phone shows, and only that is theirs to set.
    const { PATCH } = await import("../../app/api/staff/profile/route");
    await PATCH(patch({ name: "Someone Else", displayName: "Maya" }));
    expect(Object.keys(state.updates[0]!.data)).not.toContain("name");
  });

  test("all three permitted fields do write", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    await PATCH(
      patch({
        displayName: "Maya",
        welcomeMessage: "Hi, I'm Maya.",
        photoUrl: "https://cdn.example.com/a.jpg",
      }),
    );
    expect(Object.keys(state.updates[0]!.data).sort()).toEqual(
      ["displayName", "photoUrl", "welcomeMessage"].sort(),
    );
  });
});

describe("it always writes the signed-in row", () => {
  test("the route takes no id at all", () => {
    // No id in the path, no id in the body — there is no shape of
    // request that edits a colleague's profile.
    expect(ROUTE).not.toContain("params.id");
    expect(ROUTE).not.toContain("ctx.params");
  });

  test("the update targets the session's own staff id", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    await PATCH(patch({ displayName: "Maya" }));
    expect(state.updates[0]!.where).toEqual({ id: "staff_1" });
  });
});

describe("a disabled account can't keep editing", () => {
  test("suspended is refused", async () => {
    state.staff = { id: "staff_1", status: "SUSPENDED" };
    const { PATCH } = await import("../../app/api/staff/profile/route");
    const res = await PATCH(patch({ displayName: "Maya" }));
    expect(res.status).toBe(403);
    expect(state.updates).toEqual([]);
  });

  test("deleted is refused", async () => {
    state.staff = { id: "staff_1", status: "DELETED" };
    const { PATCH } = await import("../../app/api/staff/profile/route");
    const res = await PATCH(patch({ displayName: "Maya" }));
    expect(res.status).toBe(403);
    expect(state.updates).toEqual([]);
  });

  test("a vanished row is refused rather than crashing", async () => {
    state.staff = null;
    const { PATCH } = await import("../../app/api/staff/profile/route");
    expect((await PATCH(patch({ displayName: "Maya" }))).status).toBe(403);
  });
});

describe("clearing a field falls back rather than blanking", () => {
  test("an empty string is stored as null", async () => {
    // Null means "use the venue's default". An empty string stored
    // literally would render a guest a nameless greeting.
    const { PATCH } = await import("../../app/api/staff/profile/route");
    await PATCH(patch({ displayName: "", welcomeMessage: "" }));
    expect(state.updates[0]!.data.displayName).toBeNull();
    expect(state.updates[0]!.data.welcomeMessage).toBeNull();
  });

  test("a field that wasn't sent isn't touched", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    await PATCH(patch({ displayName: "Maya" }));
    expect(Object.keys(state.updates[0]!.data)).not.toContain("welcomeMessage");
    expect(Object.keys(state.updates[0]!.data)).not.toContain("photoUrl");
  });
});

describe("guards", () => {
  test("a cross-origin write is refused", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    const res = await PATCH(
      new Request("https://tab-call.test/api/staff/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "sec-fetch-site": "cross-site" },
        body: JSON.stringify({ displayName: "Maya" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(state.updates).toEqual([]);
  });

  test("an oversized display name is rejected, not truncated", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    const res = await PATCH(patch({ displayName: "x".repeat(100) }));
    expect(res.status).toBe(400);
    expect(state.updates).toEqual([]);
  });

  test("a non-URL photo is rejected", async () => {
    const { PATCH } = await import("../../app/api/staff/profile/route");
    expect((await PATCH(patch({ photoUrl: "javascript:alert(1)" }))).status).toBe(400);
    expect(state.updates).toEqual([]);
  });

  test("uploads are namespaced to the venue and the staff member", () => {
    // A path keyed on the session means a server can only ever overwrite
    // their own images, whatever they send.
    expect(ROUTE).toContain("${session.venueId}/${session.staffId}/");
  });
});

describe("image URLs can't smuggle a scheme", () => {
  test("only http and https are accepted", async () => {
    // z.string().url() accepts every scheme the URL parser knows, and
    // this value is rendered into an <img src> on a guest's phone.
    const { imageUrl } = await import("@/lib/image-url");
    for (const good of [
      "https://cdn.example.com/a.jpg",
      "http://localhost:3000/a.png",
    ]) {
      expect(imageUrl.safeParse(good).success).toBe(true);
    }
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "file:///etc/passwd",
      "not a url",
      "",
    ]) {
      expect(imageUrl.safeParse(bad).success).toBe(false);
    }
  });

  test("both routes that accept a photo use it", async () => {
    // The admin route had the same weakness. Fixing one and not the
    // other would leave the hole open through a manager's form.
    const admin = readFileSync(
      join(import.meta.dir, "../../app/api/admin/staff/[id]/route.ts"),
      "utf8",
    );
    for (const src of [ROUTE, admin]) {
      expect(src).toContain("imageUrl");
      expect(src).not.toContain("photoUrl: z.string().url()");
    }
  });
});
