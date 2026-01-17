import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { redisAdapter } from "./redis-adapter";
import Redis from "ioredis";
import { getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore';
import { getRedis } from '@/lib/infra/redis';

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
    // To use Redis:
    database: redisAdapter(redis),

    // To use SQLite:
    // database: sqlite,

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
                    // Block new user registrations if signups are disabled
                    const settings = await getSettings();
                    const limits = await settings.getLimits();
                    if (!limits.allowSignups) {
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
