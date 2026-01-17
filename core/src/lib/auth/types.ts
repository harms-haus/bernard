export type UserRole = "guest" | "user" | "admin";

export type UserRecord = {
  id: string;
  displayName: string;
  role: UserRole;
  status: "active" | "disabled" | "deleted";
  createdAt: string;
  updatedAt: string;
  avatarUrl?: string | undefined;
  email?: string | undefined;
};

export type SessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
};

export type TokenStatus = "active" | "revoked";

export type ApiTokenRecord = {
  id: string;
  name: string;
  token: string;
  status: TokenStatus;
  userId?: string | undefined;
  createdAt: string;
  lastUsedAt?: string | undefined;
};

export type OAuthProvider = "default" | "google" | "github";
export type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scope: string;
  clientId: string;
  clientSecret?: string | undefined;
};

export type AuthenticatedUser = {
  user: UserRecord;
  sessionId: string | null;
};

export type AccessGrant = {
  token: string;
  source: "api-token" | "session";
  user?: UserRecord;
};

