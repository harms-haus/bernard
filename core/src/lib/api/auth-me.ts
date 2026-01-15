import { NextRequest, NextResponse } from "next/server";
import { error, ok } from "./response";
import { auth } from "@/lib/auth/better-auth";

export interface MeUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  isAdmin?: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeResponse {
  user: MeUser;
  sessionId: string;
}

export async function handleMe(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return error("Not authenticated", 401);
    }

    return ok<MeResponse>({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? undefined,
        isAdmin: (session.user as { isAdmin?: boolean }).isAdmin,
        emailVerified: session.user.emailVerified,
        createdAt: session.user.createdAt.toISOString(),
        updatedAt: session.user.updatedAt.toISOString(),
      },
      sessionId: session.session.id,
    });
  } catch {
    return error("Failed to get user", 500);
  }
}
