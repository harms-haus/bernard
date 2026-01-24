import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

const betterAuthUrl = import.meta.env.VITE_BETTER_AUTH_URL;

if (import.meta.env.PROD && !betterAuthUrl) {
    throw new Error("VITE_BETTER_AUTH_URL is required in production but is not set");
}

if (!import.meta.env.PROD && !betterAuthUrl) {
    console.warn("VITE_BETTER_AUTH_URL is not set, using default localhost fallback");
}

const baseURL = betterAuthUrl || "http://localhost:3456";

export const authClient = createAuthClient({
    baseURL,
    plugins: [
        adminClient()
    ]
});
