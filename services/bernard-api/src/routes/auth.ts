import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getAuthenticatedUser, requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

export async function registerAuthRoutes(fastify: FastifyInstance) {
  // GET /auth/me - Get current user info
  fastify.get("/me", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug({ cookies: request.cookies, sessionCookie: request.cookies.bernard_session }, "Auth me request");
      const authUser = await getAuthenticatedUser(request);
      logger.debug({ authUser: !!authUser }, "Auth me result");
      if (!authUser) {
        return reply.status(401).send({ error: "Not authenticated" });
      }

      return reply
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        .send({
          user: {
            id: authUser.user.id,
            displayName: authUser.user.displayName,
            isAdmin: authUser.user.isAdmin,
            status: authUser.user.status
          }
        });
    } catch (error) {
      logger.error({ error }, "Failed to get user info");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /auth/logout - Clear session
  fastify.post("/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply
        .status(200)
        .setCookie("bernard_session", "", {
          path: "/",
          maxAge: 0,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env["NODE_ENV"] === "production"
        })
        .send({ success: true });
    } catch (error) {
      logger.error({ error }, "Logout failed");
      return reply.status(500).send({ error: "Logout failed" });
    }
  });

  // GET /auth/admin - Check admin status (for admin routes)
  fastify.get("/admin", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUser = await requireAdmin(request);
      if (!adminUser) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      return reply.send({
        user: {
          id: adminUser.user.id,
          displayName: adminUser.user.displayName,
          isAdmin: adminUser.user.isAdmin,
          status: adminUser.user.status
        }
      });
    } catch (error) {
      logger.error({ error }, "Admin check failed");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /auth/validate - Validate token (for other services)
  fastify.post<{ Body: { token?: string } }>("/validate", async (request: FastifyRequest<{ Body: { token?: string } }>, reply: FastifyReply) => {
    try {
      const body = request.body;
      if (!body.token) {
        return reply.status(400).send({ error: "Token required" });
      }

      // This endpoint is used by other services to validate tokens
      // We'll implement proper validation here
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: "Invalid token" });
      }

      return reply.send({
        valid: true,
        user: {
          id: authUser.user.id,
          displayName: authUser.user.displayName,
          isAdmin: authUser.user.isAdmin
        }
      });
    } catch (error) {
      logger.error({ error }, "Token validation failed");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
