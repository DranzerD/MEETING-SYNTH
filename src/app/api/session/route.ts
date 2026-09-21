import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth";

// Lets the client ask "am I logged in" without parsing its own cookie --
// the httpOnly flag on the session cookie means client JS can't read it
// directly, which is the point (it's not reachable by an XSS payload).
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ success: true, user: null });
  }
  return NextResponse.json({
    success: true,
    user: { name: user.name, email: user.sub, role: user.role },
  });
}
