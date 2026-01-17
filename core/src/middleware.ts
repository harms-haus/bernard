import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Routes that require authentication (any logged-in user)
const protectedRoutes = [
  "/bernard/chat",
  "/bernard/profile",
  "/bernard/keys",
];

// Routes that require admin role
const adminRoutes = [
  "/bernard/admin",
  "/bernard/admin/models",
  "/bernard/admin/services",
  "/bernard/admin/users",
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if route requires authentication
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  // Skip auth check for public routes
  if (!requiresAuth && !isAdminRoute) {
    return NextResponse.next();
  }

  // Get session token from cookie
  // Edge Runtime can't verify sessions with Redis, so we only check cookie existence
  const sessionToken = getSessionCookie(request);

  // No session found - redirect to login with redirectTo preserved
  if (!sessionToken) {
    const redirectUrl = new URL("/auth/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Session cookie exists - allow access
  // Role-based access control is handled in API routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/bernard/chat/:path*",
    "/bernard/profile/:path*",
    "/bernard/keys/:path*",
    "/bernard/user/:path*",
    "/bernard/admin/:path*",
    "/bernard/admin/models/:path*",
    "/bernard/admin/services/:path*",
    "/bernard/admin/users/:path*",
    "/status/:path*",
  ],
};
