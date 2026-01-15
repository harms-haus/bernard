import { authClient } from "./client";

/**
 * Get the current session using Better Auth's client.
 * This properly handles cookies and authentication state.
 */
export const useSession = () => {
  return authClient.useSession();
};

/**
 * Make an authenticated fetch request using Better Auth's client.
 * This properly includes cookies and handles authentication.
 */
export const authenticatedFetch = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  return authClient.$fetch(endpoint, {
    ...options,
    credentials: "include",
  });
};

/**
 * Get the current session data directly.
 */
export const getSession = async () => {
  const session = authClient.useSession();
  return session;
};