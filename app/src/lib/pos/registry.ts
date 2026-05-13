/**
 * Provider resolver. Reads `PosIntegration.provider` for a venue and
 * returns the matching adapter.
 *
 * Today every vendor stub falls through to `noopProvider` after writing a
 * "not yet implemented" log row — this scaffold exists so the routes that
 * push orders / fetch bills can wire to the POS layer immediately; the
 * vendor-specific HTTP code lands later without touching call sites.
 */

import { db } from "@/lib/db";
import { noopProvider } from "@/lib/pos/noop";
import { logPosSync } from "@/lib/pos/log";
import type { PosProvider, PosProviderName, PosResult } from "@/lib/pos/provider";

/**
 * Build a stub provider that records "not yet implemented" then delegates
 * to the noop provider for the actual return value. Concrete adapters will
 * replace these objects with real HTTP clients.
 */
function stubProvider(name: Exclude<PosProviderName, "NONE">): PosProvider {
  // TODO(pos): Replace with a real vendor client. Should:
  //   - Decrypt PosIntegration.encryptedCredentials via lib/pos/crypto
  //   - Translate vendor 4xx into `{ ok: false, error: "..." }`
  //   - Log every call via logPosSync (success + error paths)
  //   - Set PosIntegration.lastSyncAt / lastError appropriately
  async function notImplemented(venueId: string, action: string, request?: unknown): Promise<PosResult> {
    await logPosSync(
      venueId,
      name,
      action,
      "error",
      request,
      null,
      `${name} adapter not yet implemented — falling back to noop`,
    );
    // Still return ok so the surrounding workflow continues (orders + bills
    // live inside TabCall regardless of POS state). Reference noopProvider
    // explicitly so the dependency is visible to call-site readers and any
    // future "do we have a noop fallback?" grep finds it.
    void noopProvider;
    return { ok: true };
  }
  return {
    name,
    async syncMenu(venueId) { return notImplemented(venueId, "menu.sync"); },
    async sendOrder(venueId, orderId) { return notImplemented(venueId, "order.send", { orderId }); },
    async updateOrderStatus(venueId, orderId, status) {
      return notImplemented(venueId, "order.update_status", { orderId, status });
    },
    async fetchBill(venueId, billId) { return notImplemented(venueId, "bill.fetch", { billId }); },
    async markBillPaid(venueId, billId, splitId) {
      return notImplemented(venueId, "bill.mark_paid", { billId, splitId });
    },
  };
}

// TODO(pos): Replace with a real Toast adapter.
//   API docs: https://doc.toasttab.com/openapi/
//   Auth: OAuth2 client_credentials → bearer token (cache per-restaurant).
export const toastProvider: PosProvider = stubProvider("TOAST");

// TODO(pos): Replace with a real Square adapter.
//   API docs: https://developer.squareup.com/reference/square
//   Auth: OAuth or static access token; idempotency-key on writes.
export const squareProvider: PosProvider = stubProvider("SQUARE");

// TODO(pos): Replace with a real Clover adapter.
//   API docs: https://docs.clover.com/docs
//   Auth: per-merchant API token; use the v3 inventory endpoints for menu.
export const cloverProvider: PosProvider = stubProvider("CLOVER");

/**
 * Resolve the active provider for a venue. Falls back to the noop provider
 * if the venue has no `PosIntegration` row, the provider string is unknown,
 * or the integration is explicitly `DISCONNECTED`.
 */
export async function getProviderFor(venueId: string): Promise<PosProvider> {
  const integration = await db.posIntegration.findUnique({
    where: { venueId },
    select: { provider: true, status: true },
  });
  if (!integration) return noopProvider;
  if (integration.status === "DISCONNECTED") return noopProvider;

  switch (integration.provider) {
    case "TOAST": return toastProvider;
    case "SQUARE": return squareProvider;
    case "CLOVER": return cloverProvider;
    case "NONE":
    default:
      return noopProvider;
  }
}
