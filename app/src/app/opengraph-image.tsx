import { ImageResponse } from "next/og";

/**
 * Site-wide Open Graph card (1200×630). Pure typography on the brand
 * dark ground — renders at the edge via next/og, no static asset to
 * keep in sync. Pages inherit this unless they define their own.
 */
export const runtime = "edge";
export const alt = "TabCall — QR ordering, pay-at-table & waiter calls for restaurants";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0d0b19",
          backgroundImage:
            "radial-gradient(60% 60% at 85% 10%, rgba(214,243,78,0.18) 0%, rgba(13,11,25,0) 60%)",
          color: "#f7f5f2",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9999,
              backgroundColor: "#d6f34e",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1, display: "flex" }}>
            TabCall
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
              display: "flex",
              maxWidth: 980,
            }}
          >
            Every table becomes a service point.
          </div>
          <div
            style={{
              fontSize: 30,
              color: "rgba(247,245,242,0.72)",
              display: "flex",
              maxWidth: 900,
            }}
          >
            QR ordering · pay-at-table · waiter calls · live staff alerts — on top of your POS
          </div>
        </div>

        <div style={{ fontSize: 24, color: "rgba(247,245,242,0.5)", display: "flex" }}>
          www.tab-call.com
        </div>
      </div>
    ),
    size,
  );
}
