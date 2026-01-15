import { betterAuth, type BetterAuthOptions } from "better-auth";
import { redisAdapter } from "./redis-adapter";
import { admin, bearer } from "better-auth/plugins";
import bcrypt from "bcrypt";
import { getRedis } from "@/lib/infra/redis";
import { env } from "@/lib/config/env";

export const runtime = 'nodejs';

/**
 * Parse admin user IDs from environment variable
 * Comma-separated list of user IDs that should have admin privileges
 */
function getAdminUserIds(): string[] {
  if (!env.BETTER_AUTH_ADMIN_USER_IDS) {
    return [];
  }
  return env.BETTER_AUTH_ADMIN_USER_IDS.split(',').map(id => id.trim()).filter(Boolean);
}

/**
 * Custom hook to make the first registered user an admin automatically.
 * This ensures the first user to sign up becomes the system administrator.
 */
function createFirstUserAdminHook() {
  let initialized = false;

  return {
    /**
     * Hook to run after a user signs up.
     * If this is the first user in the system, make them an admin.
     */
    onSignUp: async ({ user }: { user: { id: string } }) => {
      const redis = getRedis();
      const keyPrefix = "auth:";

      // Check if this is the first user
      const userKeys = await redis.keys(`${keyPrefix}user:*`);

      // If there are no other users (only the one just created), make them admin
      if (userKeys.length <= 1) {
        const userKey = `${keyPrefix}user:${user.id}`;
        await redis.hset(userKey, { role: "admin" });
        console.log(`[Auth] First user ${user.id} promoted to admin`);
      }
    },
  };
}

/**
 * Create and configure the BetterAuth instance with Redis storage.
 * This is the core authentication configuration for Bernard AI Assistant.
 */
export const auth = betterAuth({
  appName: "Bernard AI Assistant",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: redisAdapter(getRedis(), {
    client: getRedis(),
    keyPrefix: "auth:",
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    requireEmailVerification: false,
    password: {
      hash: async (password: string) => {
        const salt = await bcrypt.genSalt(12);
        return bcrypt.hash(password, salt);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return bcrypt.compare(password, hash);
      },
    },
  },

  socialProviders: {
    // Add OAuth providers here when needed
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    freshAge: 60 * 10, // 10 minutes
  },

  rateLimit: {
    enabled: true,
    window: 60, // 60 seconds
    max: 100, // 100 requests per window
  },

  plugins: [
    admin({
      adminUserIds: getAdminUserIds(),
    }),
    bearer(),
  ],

  hooks: {
    ...createFirstUserAdminHook(),
  },

  advanced: {
    cookiePrefix: "bernard",
    useSecureCookies: env.NODE_ENV === "production",
    trustedOrigins: [env.BERNARD_UI_URL],
  },
} as BetterAuthOptions);
