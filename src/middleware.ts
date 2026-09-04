import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "candidarc_session";

const LEGACY_SEGMENTS = new Set(["research", "evidence", "audits", "activity", "application", "resume"]);

function radarEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_RADAR !== "false";
}

function legacyRedirect(request: NextRequest): NextResponse | null {

  const { pathname } = request.nextUrl;



  if (pathname === "/app/evidence") {

    return NextResponse.redirect(new URL("/app/settings/profile", request.url));

  }



  const opportunityMatch = pathname.match(/^\/app\/opportunities\/([^/]+)\/([^/]+)$/);

  if (opportunityMatch) {

    const [, opportunityId, segment] = opportunityMatch;

    if (LEGACY_SEGMENTS.has(segment)) {

      return NextResponse.redirect(new URL(`/app/opportunities/${opportunityId}`, request.url));

    }

  }



  const applicationMatch = pathname.match(/^\/app\/applications(?:\/(.*))?$/);

  if (applicationMatch) {

    const rest = applicationMatch[1];

    if (!rest) return NextResponse.redirect(new URL("/app/opportunities", request.url));

    const [applicationId] = rest.split("/");

    return NextResponse.redirect(new URL(`/app/opportunities/${applicationId}`, request.url));

  }



  return null;

}



export function middleware(request: NextRequest) {

  const legacy = legacyRedirect(request);

  if (legacy) return legacy;

  if (!radarEnabled() && request.nextUrl.pathname.startsWith("/app/radar")) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

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

