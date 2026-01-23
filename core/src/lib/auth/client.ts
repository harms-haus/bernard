import { createAuthClient } from "better-auth/react";

const BETTER_AUTH_URL = import.meta.env.VITE_BETTER_AUTH_URL || "http://127.0.0.1:3456";

export const authClient = createAuthClient({
  baseURL: BETTER_AUTH_URL,
});

// Export the hooks from the client for use in React components
export const useSession = authClient.useSession;
export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
