/**
 * Client-safe auth helpers that work in Client Components.
 * These functions use client-side API calls instead of server-only APIs.
 */

export interface Session {
    user: {
        id: string;
        email: string;
        name: string;
        image?: string;
        role: string;
    };
    session?: {
        id: string;
        userId: string;
        expiresAt: Date;
    };
}

export const getSession = async (): Promise<Session | null> => {
    try {
        const response = await fetch('/api/auth/get-session', {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.session;
    } catch {
        return null;
    }
};

export const redirectToLogin = () => {
    if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
    }
};

export const redirectIfNotAuthenticated = async (): Promise<Session | null> => {
    const session = await getSession();

    if (!session) {
        redirectToLogin();
        return null;
    }

    return session;
};

export const redirectIfNotAdmin = async (): Promise<Session | null> => {
    const session = await getSession();

    if (!session || session.user.role !== "admin") {
        redirectToLogin();
        return null;
    }

    return session;
};

/**
 * Trusted hostnames for redirect validation.
 * Add any trusted external domains here.
 */
const TRUSTED_HOSTNAMES: ReadonlySet<string> = new Set([
    "localhost",
    "127.0.0.1",
    // Add trusted external domains here if needed
    // e.g., "myapp.com", "example.com",
]);

/**
 * Default redirect URL when validation fails.
 */
const DEFAULT_REDIRECT = "/bernard/chat";

/**
 * Validates and returns a safe redirect URL.
 * Prevents open redirect vulnerabilities by only allowing:
 * - Relative paths (starting with "/")
 * - URLs matching trusted hostnames
 *
 * @param redirectUrl - The URL or search params containing redirectTo
 * @returns A safe redirect URL, or DEFAULT_REDIRECT if invalid
 */
export const getSafeRedirect = (
    redirectUrl: URL | URLSearchParams | string | null | undefined
): string => {
    // Handle null/undefined/empty cases
    if (!redirectUrl) {
        return DEFAULT_REDIRECT;
    }

    let urlString: string;

    // Extract the redirectTo value from different input types
    if (redirectUrl instanceof URL) {
        urlString = redirectUrl.toString();
    } else if (redirectUrl instanceof URLSearchParams) {
        urlString = redirectUrl.get("redirectTo") || "";
    } else {
        urlString = String(redirectUrl);
    }

    // Empty string falls back to default
    if (!urlString) {
        return DEFAULT_REDIRECT;
    }

    try {
        // Attempt to parse as a full URL
        const url = new URL(urlString);

        // Check if it's a relative path (no host) or matches a trusted hostname
        const currentHost = typeof window !== "undefined" ? window.location.host : "";
        const isRelative = !url.host || url.host === currentHost;
        const isTrustedHostname = TRUSTED_HOSTNAMES.has(url.hostname);
        if (isRelative) {
            // Preserve pathname, search, and hash for relative URLs
            const path = url.pathname + url.search + url.hash;
            if (path.startsWith("/") && !path.startsWith("//")) {
                return path;
            }
            return `/${path}`;
        }

        if (isTrustedHostname) {
            return urlString;
        }

        // Not a safe redirect - return default
        console.warn(
            `[Auth] Blocked unsafe redirect attempt: ${urlString}`
        );
        return DEFAULT_REDIRECT;
    } catch {
        // If URL parsing fails, check if it's a relative path
        // Ensure it's a single slash (not protocol-relative //evil.com)
        if (urlString.startsWith("/") && !urlString.startsWith("//")) {
            return urlString;
        }

        // Not a valid URL or safe relative path
        console.warn(
            `[Auth] Blocked invalid redirect attempt: ${urlString}`
        );
        return DEFAULT_REDIRECT;
    }
};