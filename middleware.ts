import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = [
  "/marcar",
  "/login",
  "/api/marcar",
  "/api/public-booking",
  "/api/uploadthing",
  "/_next",
  "/favicon.ico",
  "/brand",
  "/images",
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path))

  if (isPublicPath) {
    return NextResponse.next()
  }

  const adminCookie = request.cookies.get("famadetail_admin")?.value

  if (adminCookie && adminCookie === process.env.ADMIN_ACCESS_TOKEN) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("redirect", pathname)

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
}
