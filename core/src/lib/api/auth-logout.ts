import { NextResponse } from "next/server";
import { error, ok } from "./response";
import { auth } from "@/lib/auth/better-auth";

export async function handleLogout(): Promise<NextResponse> {
  try {
    await auth.api.signOut();
    return ok({ success: true });
  } catch {
    return error("Failed to logout", 500);
  }
}
