import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";

export async function GET(request: NextRequest) {
  // Sign out the user
  await auth.api.signOut({
    headers: request.headers,
  });

  // Redirect to login page
  return NextResponse.redirect(new URL("/auth/login", request.url));
}
