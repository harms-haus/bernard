import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Routes that require authentication (any logged-in user)
const protectedRoutes = [
  "/bernard/chat",
  "/bernard/profile",
  "/bernard/keys",
  "/bernard/user",
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

  // For admin routes, verify session exists (role check done server-side in layout)
  // Edge Runtime can't verify admin role without jose library - layout will return 403
  if (isAdminRoute) {
    // Session exists - let the layout handle admin verification and return 403 if needed
    return NextResponse.next();
  }

  // Session cookie exists and route is not admin-protected - allow access
  // Role-based access control for admin routes is handled above
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
  ],
};
