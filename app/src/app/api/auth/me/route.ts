import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    staffId: session.staffId,
    venueId: session.venueId,
    email: session.email,
    role: session.role,
  });
}
