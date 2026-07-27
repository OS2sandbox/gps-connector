import { NextResponse, type NextRequest } from "next/server"

import { getCookieCache } from "better-auth/cookies"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (
    pathname === "/api/auth/get-access-token" ||
    pathname === "/api/auth/refresh-token"
  ) {
    return new NextResponse("Not found", { status: 404 })
  }

  const session = await getCookieCache(req)

  if (!session) {
    if (req.nextUrl.pathname.startsWith("/api")) {
      return new NextResponse("Authentication required", { status: 401 })
    }
    return NextResponse.redirect(new URL("/sign-in", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sign-in|api/auth).*)",
    "/api/auth/get-access-token",
    "/api/auth/refresh-token",
  ],
}
