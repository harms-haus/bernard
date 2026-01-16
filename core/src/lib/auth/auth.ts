import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { redisAdapter } from "./redis-adapter";
import Redis from "ioredis";

// Redis Instance (Ensure Redis is running locally or provide a connection string)
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

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
                }
            }
        }
    }
});
