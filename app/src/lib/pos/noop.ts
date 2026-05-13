/**
 * No-op POS provider — the default when a venue hasn't connected anything.
 *
 * Every method records a `PosSyncLog` row so the admin sync-log table still
 * shows that a sync was attempted (even if the result is "we didn't talk to
 * any vendor"). This keeps the audit story consistent regardless of whether
 * a venue is live on Toast/Square/Clover yet — and gives QA an easy way to
 * exercise the surrounding workflow without touching a real vendor sandbox.
 */

import { logPosSync } from "@/lib/pos/log";
import type { PosProvider, PosResult } from "@/lib/pos/provider";

const NAME = "NONE" as const;

async function record(venueId: string, action: string, request?: unknown): Promise<PosResult> {
  await logPosSync(venueId, NAME, action, "success", request, { stub: true });
  return { ok: true };
}

export const noopProvider: PosProvider = {
  name: NAME,

  async syncMenu(venueId) {
    return record(venueId, "menu.sync");
  },

  async sendOrder(venueId, orderId) {
    return record(venueId, "order.send", { orderId });
  },

  async updateOrderStatus(venueId, orderId, status) {
    return record(venueId, "order.update_status", { orderId, status });
  },

  async fetchBill(venueId, billId) {
    return record(venueId, "bill.fetch", { billId });
  },

  async markBillPaid(venueId, billId, splitId) {
    return record(venueId, "bill.mark_paid", { billId, splitId });
  },
};
