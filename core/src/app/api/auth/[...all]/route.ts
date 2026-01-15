import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/better-auth";

/**
 * BetterAuth API route handler for Next.js App Router.
 * This single route handles all authentication endpoints:
 * - GET/POST /api/auth/signup
 * - GET/POST /api/auth/signin
 * - POST /api/auth/signout
 * - GET /api/auth/session
 * - GET /api/auth/user
 * - And all other BetterAuth endpoints
 */
export const { GET, POST } = toNextJsHandler(auth);
