import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

/**
 * Type representing a BetterAuth session with admin support.
 * The admin plugin adds role field to the user object.
 */
export interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
    role?: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Create the BetterAuth client for frontend use.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3456",
  plugins: [
    adminClient(),
  ],
});

/**
 * Get the current session by calling the API directly.
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const response = await authClient.$fetch("/get-session", {
      method: "GET",
    });
    return response as unknown as AuthSession;
  } catch {
    return null;
  }
}

/**
 * Sign in with email and password.
 */
export async function signInEmail(
  email: string,
  password: string
): Promise<{ error?: { message: string } }> {
  try {
    const result = await authClient.signIn.email({
      email,
      password,
    });
    if (result.error) {
      return { error: { message: result.error.message || "Sign in failed" } };
    }
    return {};
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : "Sign in failed" } };
  }
}

/**
 * Sign up with email, password, and optional name.
 */
export async function signUpEmail(
  email: string,
  password: string,
  name?: string
): Promise<{ error?: { message: string } }> {
  try {
    const result = await authClient.signUp.email({
      email,
      password,
      name: name ?? "",
    });
    if (result.error) {
      return { error: { message: result.error.message || "Sign up failed" } };
    }
    return {};
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : "Sign up failed" } };
  }
}

/**
 * Sign out the current user.
 */
export async function signOutUser(): Promise<void> {
  await authClient.signOut();
}
