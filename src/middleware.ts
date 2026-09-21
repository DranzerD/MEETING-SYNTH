import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth";

// Page-level gate: protected routes need a session or get redirected to
// /login (with a `next` param so login can return the user where they were
// headed). API routes enforce auth independently in each handler -- this
// middleware only improves the page UX so a logged-out visitor never sees
// a page that immediately fails its own data fetches with 401s.
const PROTECTED_PREFIXES = ["/dashboard", "/analyze", "/chat", "/meetings"];
const AUTH_PAGES = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await getSessionUser(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_PAGES.includes(pathname) && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/analyze/:path*", "/chat/:path*", "/meetings/:path*", "/login", "/register"],
};
