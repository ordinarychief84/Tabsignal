import { randomBytes } from "node:crypto";

export function newQrToken(): string {
  return randomBytes(16).toString("base64url");
}

export function tableUrl(baseUrl: string, slug: string, tableLabel: string, qrToken: string): string {
  const encodedLabel = encodeURIComponent(tableLabel);
  const encodedToken = encodeURIComponent(qrToken);
  return `${baseUrl.replace(/\/$/, "")}/v/${slug}/t/${encodedLabel}?s=${encodedToken}`;
}
