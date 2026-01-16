import "better-auth";

declare module "better-auth" {
  interface User {
    displayName?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
    isAdmin?: boolean;
    status?: "active" | "disabled" | "deleted";
  }

  interface Session {
    userAgent?: string | null;
    ipAddress?: string | null;
  }
}
