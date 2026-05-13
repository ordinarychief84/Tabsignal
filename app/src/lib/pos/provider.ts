/**
 * POS provider interface — every concrete provider (Toast, Square, Clover,
 * the noop fallback) implements this surface. Routes and background jobs
 * obtain a provider via `getProviderFor(venueId)` and call methods on the
 * returned object without knowing which vendor sits behind it.
 *
 * The "provider name" doubles as the discriminator we persist on
 * `PosIntegration.provider` (a free string column — see schema comment).
 *
 * Result shape is intentionally narrow. Concrete providers should:
 *   - Translate vendor responses into `{ ok: true, reference }` on success,
 *     where `reference` is the vendor's id for the synced resource
 *     (e.g. the Toast `guid`) so we can correlate later in audits.
 *   - Surface a human-readable error string on failure and let the helper
 *     in `lib/pos/log.ts` persist the safe payload to `PosSyncLog`.
 */

export type PosProviderName = "TOAST" | "SQUARE" | "CLOVER" | "NONE";

export type PosResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string };

export interface PosProvider {
  name: PosProviderName;
  syncMenu(venueId: string): Promise<PosResult>;
  sendOrder(venueId: string, orderId: string): Promise<PosResult>;
  updateOrderStatus(venueId: string, orderId: string, status: string): Promise<PosResult>;
  fetchBill(venueId: string, billId: string): Promise<PosResult>;
  markBillPaid(venueId: string, billId: string, splitId: string | null): Promise<PosResult>;
}
