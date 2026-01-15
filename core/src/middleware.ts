import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";

const PUBLIC_PATHS = [
  "/health",
  "/api/health",
  "/api/auth",
  "/api/proxy-stream",
  "/auth",
  "/bernard",
  "/bernard/",
  "/bernard/login",
  "/bernard/api/",
  "/bernard/api/auth/",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log(`[Middleware] Processing ${pathname}`);

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Use Next.js native cookie handling
  const sessionCookie = request.cookies.get("bernard.session_token")?.value;
  console.log(`[Middleware] Session cookie:`, sessionCookie ? "found" : "null");

  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });
  console.log(`[Middleware] Session:`, session?.user?.email);

  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-user-id", session.user.id);
  response.headers.set("x-user-email", session.user.email);
  response.headers.set("x-user-name", session.user.name);
  // The admin plugin adds isAdmin to the user object
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin ?? false;
  response.headers.set("x-user-admin", String(isAdmin));

  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
