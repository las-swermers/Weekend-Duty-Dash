import { auth } from "@/lib/auth";

export default auth((req) => {
  if (!req.auth && !req.nextUrl.pathname.startsWith("/signin")) {
    const signInUrl = new URL("/signin", req.url);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon).*)"],
};
