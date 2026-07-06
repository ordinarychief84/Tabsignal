/**
 * MOVED (restructure Phase 1, PR 1.5): guest-session resolution lives in
 * src/domain/sessions/resolve.ts. This shim keeps old import paths
 * working — the remaining consumers are the orphaned /guest/[qrToken]
 * pages, which Phase 3 deletes along with this file. New code imports
 * from "@/domain/sessions/resolve".
 */
export * from "@/domain/sessions/resolve";
