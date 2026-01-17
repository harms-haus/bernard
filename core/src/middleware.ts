import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Routes that require authentication (any logged-in user)
const protectedRoutes = [
  "/bernard/chat",
  "/status",
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

  // Check if route requires auth or admin
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));
  const requiresAdmin = adminRoutes.some((route) => pathname.startsWith(route));

  // Skip auth check for public routes
  if (!requiresAuth && !requiresAdmin) {
    return NextResponse.next();
  }

  // Get session token from cookie
  const sessionToken = getSessionCookie(request);

  // No session found - redirect to login
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/bernard/chat/:path*",
    "/status/:path*",
    "/bernard/profile/:path*",
    "/bernard/keys/:path*",
    "/bernard/admin/:path*",
    "/bernard/admin/models/:path*",
    "/bernard/admin/services/:path*",
    "/bernard/admin/users/:path*",
  ],
};
