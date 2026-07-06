import { NextResponse } from "next/server";
import { auth } from "@/auth";

const protectedPrefixes = ["/dashboard"];
const authPages = ["/login", "/signup"];

// Optimistic redirect only, based on the session cookie — the authoritative
// check lives in the dashboard layout/page (see Next.js auth guide).
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = authPages.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
