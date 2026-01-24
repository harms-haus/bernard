import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { redisAdapter } from "./redis-adapter";
import Redis from "ioredis";
import { getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore';
import { getRedis } from '@/lib/infra/redis';
import { env } from '@/lib/config/env';

// Redis Instance (Ensure Redis is running locally or provide a connection string)
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// Lazy initialization for settings store (respects Redis → .env priority)
let settingsInitialized = false;

async function getSettings() {
  if (!settingsInitialized) {
    await initializeSettingsStore(undefined, getRedis());
    settingsInitialized = true;
  }
  return getSettingsStore();
}

export const auth = betterAuth({
    // Base URL for the application (required for cookie domain and CORS)
    baseURL: env.BETTER_AUTH_URL,
    // Base path where auth routes are mounted (defaults to /api/auth)
    basePath: "/api/auth",
    // Secret for signing cookies and tokens (required)
    secret: env.BETTER_AUTH_SECRET || "dev-secret-change-in-production-min-32-chars",
    // To use Redis:
    database: redisAdapter(redis),

    // To use SQLite:
    // database: sqlite,

    // Allow requests from configured origins
    // Load from AUTH_TRUSTED_ORIGINS (comma-separated) or APP_URL, fall back to localhost in dev
    trustedOrigins: (() => {
        const origins: string[] = [];
        const isProduction = process.env.NODE_ENV === "production";

        // Load from environment variable (comma-separated list)
        if (process.env.AUTH_TRUSTED_ORIGINS) {
            const envOrigins = process.env.AUTH_TRUSTED_ORIGINS.split(",")
                .map(origin => origin.trim())
                .filter(origin => origin.length > 0);
            origins.push(...envOrigins);
        } else if (process.env.APP_URL) {
            // Fall back to APP_URL if AUTH_TRUSTED_ORIGINS is not set
            origins.push(process.env.APP_URL.trim());
        }

        // In development, add localhost origins if not in production
        if (!isProduction) {
            const devOrigins = [
                "http://0.0.0.0:3456",
                "http://localhost:3456",
                "http://127.0.0.1:3456",
            ];
            // Only add dev origins if they're not already in the list
            for (const devOrigin of devOrigins) {
                if (!origins.includes(devOrigin)) {
                    origins.push(devOrigin);
                }
            }
        }

        // If no origins configured, use localhost as fallback (for development)
        if (origins.length === 0) {
            origins.push("http://localhost:3456");
        }

        return origins;
    })(),

    emailAndPassword: {
        enabled: true
    },
    plugins: [
        admin()
    ],
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    // Block new user registrations if signups are explicitly disabled
                    const settings = await getSettings();
                    const limits = await settings.getLimits();
                    if (limits && limits.allowSignups === false) {
                        throw new Error("User registrations are disabled");
                    }

                    // Check if any admin exists in Redis
                    // Using the helper keys we defined in the adapter
                    const userIds = await redis.smembers("ba:s:user:ids");
                    let hasAdmin = false;

                    for (const id of userIds) {
                        const role = await redis.hget(`ba:m:user:${id}`, "role");
                        if (role === "admin") {
                            hasAdmin = true;
                            break;
                        }
                    }

                    if (!hasAdmin) {
                        return {
                            data: {
                                ...user,
                                role: "admin"
                            }
                        };
                    }

                    // New users get "guest" role by default
                    return {
                        data: {
                            ...user,
                            role: "guest"
                        }
                    };
                }
            }
        }
    }
});
