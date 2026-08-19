"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root-layout error boundary.
 *
 * `app/error.tsx` sits INSIDE the root layout, so it can't catch a crash
 * in the layout itself (or in the providers it renders). Those fall
 * through to Next's default error page and — because no React tree
 * survives — never reach Sentry's client integration either. This
 * boundary replaces the whole document, which is why it has to render
 * its own <html> and <body>.
 *
 * Kept deliberately styleless beyond inline CSS: the failure it handles
 * may well be the layout that loads the stylesheet.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[app/global-error] caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F3EFE7",
          color: "#25303A",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: "24rem", padding: "0 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500, letterSpacing: "-0.01em", margin: 0 }}>
            Something didn&rsquo;t load
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", lineHeight: 1.6, opacity: 0.65 }}>
            Try again. If it keeps happening, ask your server for a fresh QR or
            reload the page from a different network.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#25303A",
              color: "#F3EFE7",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p
              style={{
                marginTop: "1.5rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.625rem",
                letterSpacing: "0.08em",
                opacity: 0.35,
              }}
            >
              ref: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
