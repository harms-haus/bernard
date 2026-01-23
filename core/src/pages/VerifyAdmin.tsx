"use client";

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Validates and sanitizes a redirectTo parameter to prevent open redirects.
 * Only allows relative paths starting with a single slash.
 */
function validateRedirectTo(redirectTo: string | null, defaultPath: string): string {
  if (!redirectTo || typeof redirectTo !== "string") {
    return defaultPath;
  }

  // Must start with a single slash (not //)
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return defaultPath;
  }

  // Must not contain a scheme (e.g., http:, https:, javascript:)
  if (redirectTo.includes(":/")) {
    return defaultPath;
  }

  // Must be a non-empty string
  if (redirectTo.trim().length === 0) {
    return defaultPath;
  }

  return redirectTo;
}

export function VerifyAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state: authState } = useAuth();

  useEffect(() => {
    if (authState.loading) return;

    const redirectTo = searchParams.get("redirectTo");
    const safeRedirectTo = validateRedirectTo(redirectTo, "/bernard/admin");

    if (!authState.user || authState.user.role !== "admin") {
      // Not authenticated or not admin - redirect to login
      navigate(`/auth/login?redirectTo=${encodeURIComponent(safeRedirectTo)}`, { replace: true });
      return;
    }

    // Admin verified - redirect to original destination
    navigate(safeRedirectTo, { replace: true });
  }, [authState, searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-xl font-medium">Verifying admin access...</p>
      </div>
    </div>
  );
}
