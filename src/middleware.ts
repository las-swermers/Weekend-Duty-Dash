import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  // Only this exact public page uses fictional fixtures. APIs remain protected.
  if (req.nextUrl.pathname === "/demo") return NextResponse.next();
  // This exact endpoint authenticates CRON_SECRET in its own handler.
  if (
    ["/api/cron/weekly-reports", "/api/cron/watchlist-sync"].includes(
      req.nextUrl.pathname,
    )
  )
    return NextResponse.next();
  if (!req.auth && !req.nextUrl.pathname.startsWith("/signin")) {
    const signInUrl = new URL("/signin", req.url);
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon).*)"],
};
