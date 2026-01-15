import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { useSyncExternalStore } from "react";

/**
 * Type representing a BetterAuth session with admin support.
 * The admin plugin adds role field to the user object. isAdmin is computed from role.
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
    adminClient(), // Enable admin features on client side
  ],
});

/**
 * Hook to get the current session in React components.
 * This hook subscribes to the BetterAuth session store.
 */
export function useSession() {
  return useSyncExternalStore(
    (notify) => {
      const unsubscribe = authClient.useSession.subscribe(notify);
      return () => {
        unsubscribe();
      };
    },
    () => authClient.useSession.value,
    () => authClient.useSession.value
  );
}

/**
 * Sign in with email and password.
 */
export async function signInEmail(
  email: string,
  password: string
): Promise<{ error?: { message: string } }> {
  const result = await authClient.signIn.email({
    email,
    password,
  });
  if (result.error) {
    return { error: { message: result.error.message || "Sign in failed" } };
  }
  return {};
}

/**
 * Sign up with email, password, and optional name.
 */
export async function signUpEmail(
  email: string,
  password: string,
  name?: string
): Promise<{ error?: { message: string } }> {
  const result = await authClient.signUp.email({
    email,
    password,
    name: name ?? "",
  });
  if (result.error) {
    return { error: { message: result.error.message || "Sign up failed" } };
  }
  return {};
}

/**
 * Sign out the current user.
 */
export async function signOutUser(): Promise<void> {
  await authClient.signOut();
}
