import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";

const PUBLIC_PATHS = [
  "/health",
  "/api/health",
  "/api/proxy-stream",
  "/api/auth", // Better Auth routes
  "/auth",
  "/bernard/login",
  "/bernard/api",
  "/bernard/api/auth",
];

const ADMIN_PATHS = [
  "/bernard/admin",
  "/bernard/admin/",
];

const ALLOWED_ORIGINS = [
  "http://localhost:8810",
  "https://bernard.harms.haus",
  "http://localhost:3456",
];

function isPublicPath(pathname: string): boolean {
  // Exact match
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  // Prefix match for paths like /api/auth/signin, /bernard/api/*, etc.
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path + "/"));
}

function setCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Cache-Control");
  return response;
}

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Get the current session from the request using Better Auth.
 * Returns null if no valid session exists.
 */
export async function getSession(request: NextRequest): Promise<SessionResult | null> {
  // Try to get session token from cookie first
  const sessionToken = request.cookies.get("bernard_session")?.value ||
                       request.cookies.get("ba_session")?.value ||
                       request.cookies.get("session_token")?.value;

  if (!sessionToken) return null;

  // Pass headers with cookie for Better Auth to validate
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${sessionToken}`);

  return auth.api.getSession({
    headers,
  });
}

/**
 * Check if the request is authenticated.
 * Returns the session if valid, otherwise returns a redirect response.
 */
export async function requireAuth(request: NextRequest): Promise<SessionResult | NextResponse> {
  const session = await getSession(request);
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return session;
}

/**
 * Check if the request is authenticated and the user is an admin.
 * Returns the session if valid and admin, otherwise returns an error response.
 */
export async function requireAdmin(request: NextRequest): Promise<SessionResult | NextResponse> {
  const session = await requireAuth(request);
  if (session instanceof NextResponse) return session;
  if (!session) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return session;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle OPTIONS preflight requests - set CORS headers and return
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    return setCorsHeaders(response, request);
  }

  // Set CORS headers for API auth routes (Better Auth handles the rest)
  if (pathname.startsWith("/api/auth")) {
    const response = NextResponse.next();
    return setCorsHeaders(response, request);
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await getSession(request);
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check admin access for admin paths
  const isAdminPath = ADMIN_PATHS.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );
  if (isAdminPath) {
    const isAdmin = (session.user as { role?: string }).role === "admin";
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/bernard", request.url));
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-user-id", session.user.id);
  response.headers.set("x-user-email", session.user.email);
  response.headers.set("x-user-name", session.user.name);
  const isAdmin = (session.user as { role?: string }).role === "admin";
  response.headers.set("x-user-admin", String(isAdmin));

  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
