import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware. Sole job today: stamp the request's pathname into a
 * downstream header so RSC layouts that issue auth-redirects (e.g.
 * /admin/v/[slug]/layout.tsx) can preserve the *exact* path the user
 * was trying to reach via `?next=`. Without this, a layout-level
 * redirect strips deeper paths (e.g. .../billing/upgrade-contact).
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  const path = req.nextUrl.pathname + (req.nextUrl.search ?? "");
  headers.set("x-pathname", path);
  return NextResponse.next({ request: { headers } });
}

// Skip static + image assets so the middleware doesn't cost us per-asset
// edge invocations. The auth redirect only matters for app pages.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/realtime/socket).*)",
  ],
};
