import type { SessionClaims } from "./token";

const RAW = process.env.OPERATOR_EMAILS ?? "";
const ALLOWLIST = RAW
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export function isOperator(session: SessionClaims | null | undefined): boolean {
  if (!session) return false;
  return ALLOWLIST.includes(session.email.toLowerCase());
}

export function operatorAllowlist(): readonly string[] {
  return ALLOWLIST;
}
