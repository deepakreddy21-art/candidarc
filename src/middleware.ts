import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "candidarc_session";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/app/") || request.nextUrl.pathname === "/app") {
    if (!request.cookies.get(SESSION_COOKIE)?.value) {
      const signIn = new URL("/sign-in", request.url);
      signIn.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(signIn);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
