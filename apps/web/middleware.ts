import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Route prefixes that require an authenticated session.
 * `/clasificacion` stays public: standings are visible to everyone.
 */
const PROTECTED_PREFIXES = ["/equipo", "/liga", "/admin"];

export default auth((request) => {
  const { nextUrl } = request;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => nextUrl.pathname === prefix || nextUrl.pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.auth) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/equipo/:path*", "/liga/:path*", "/admin/:path*"],
};
