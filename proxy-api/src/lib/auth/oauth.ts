import { 
  base64Encode,
  createCodeVerifier,
  createChallenge,
  exchangeCode,
  fetchUserInfo
} from "@shared/auth/index";
import type { OAuthProvider, ProviderConfig } from "@shared/auth/index";

export type { OAuthProvider, ProviderConfig };
import { appSettings } from "../config/settingsStore";
import { getRedis } from "../infra/redis";
import { UserStore } from "@shared/auth/index";
import { SessionStore } from "@shared/auth/index";
import { buildSessionCookie, clearSessionCookie } from "./auth";
import { logger } from "../../lib/logger";
import type { FastifyRequest, FastifyReply } from "fastify";

const STATE_TTL_SECONDS = 10 * 60;
const STATE_NAMESPACE = "bernard:oauth:state";

const stateKey = (provider: OAuthProvider, state: string) => `${STATE_NAMESPACE}:${provider}:${state}`;

export const getProviderConfig = async (provider: OAuthProvider): Promise<ProviderConfig> => {
  const oauthSettings = await appSettings.getOAuth();
  const fromSettings =
    provider === "google"
      ? oauthSettings.google
      : provider === "github"
        ? oauthSettings.github
        : oauthSettings.default;

  const config: ProviderConfig = {
    authUrl: fromSettings.authUrl,
    tokenUrl: fromSettings.tokenUrl,
    userInfoUrl: fromSettings.userInfoUrl,
    redirectUri: fromSettings.redirectUri,
    scope: fromSettings.scope,
    clientId: fromSettings.clientId
  };

  if (fromSettings.clientSecret) {
    config.clientSecret = fromSettings.clientSecret;
  }

  return config;
};

export async function startOAuthLogin(provider: OAuthProvider, req: FastifyRequest, reply: FastifyReply) {
  try {
    const { authUrl, clientId, redirectUri, scope } = await getProviderConfig(provider);
    logger.info({ event: 'oauth.start', provider, redirectUri }, `OAuth start: redirectUri=${redirectUri}`);
    
    const state = base64Encode(Buffer.from(crypto.randomUUID()));
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createChallenge(codeVerifier);

    const returnTo = (req.query as any).redirect ?? "/";

    const redis = getRedis();
    try {
      // Ensure Redis is connected - ioredis with lazyConnect will auto-connect on first command
      // but we need to handle connection errors explicitly
      await redis.set(stateKey(provider, state), JSON.stringify({ codeVerifier, returnTo }), "EX", STATE_TTL_SECONDS);
    } catch (redisError) {
      const error = redisError as Error & { code?: string };
      logger.error({ 
        event: 'oauth.redis_error', 
        provider, 
        error: error.message || String(redisError),
        code: error.code,
        redisStatus: redis.status
      }, "Redis connection failed during OAuth start");
      
      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.message?.includes('max retries')) {
        return reply.status(503).send({ 
          error: true, 
          message: "Service temporarily unavailable. Please ensure Redis is running." 
        });
      }
      
      return reply.status(500).send({ 
        error: true, 
        message: "Failed to start OAuth login" 
      });
    }

    const authorizeUrl = new URL(authUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    if (provider === "google") {
      authorizeUrl.searchParams.set("access_type", "offline");
      authorizeUrl.searchParams.set("prompt", "consent");
    }

    return reply.redirect(authorizeUrl.toString());
  } catch (err) {
    logger.error({
      event: 'oauth.start.error',
      provider,
      error: err instanceof Error ? err.message : String(err)
    }, `OAuth start failed (${provider})`);
    return reply.status(500).send({ 
      error: true, 
      message: "Failed to start OAuth login" 
    });
  }
}

const parseState = async (provider: OAuthProvider, state: string): Promise<{ codeVerifier: string; returnTo: string } | null> => {
  try {
    const redis = getRedis();
    // Ensure Redis is connected before use
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    const raw = await redis.get(stateKey(provider, state));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { codeVerifier: string; returnTo: string };
    } catch (err) {
      logger.error({ event: 'oauth.state.parse_error', provider, error: err instanceof Error ? err.message : String(err) }, "Failed to parse OAuth state");
      return null;
    }
  } catch (redisError) {
    logger.error({ 
      event: 'oauth.state.redis_error', 
      provider, 
      error: redisError instanceof Error ? redisError.message : String(redisError) 
    }, "Redis connection failed during state parse");
    return null;
  }
};

const deleteState = async (provider: OAuthProvider, state: string) => {
  try {
    const redis = getRedis();
    await redis.del(stateKey(provider, state));
  } catch (redisError) {
    logger.error({ 
      event: 'oauth.state.delete.redis_error', 
      provider, 
      error: redisError instanceof Error ? redisError.message : String(redisError) 
    }, "Redis connection failed during state delete");
    // Don't throw - this is cleanup, failure is not critical
  }
};

export async function handleOAuthCallback(provider: OAuthProvider, req: FastifyRequest, reply: FastifyReply) {
  const code = (req.query as any).code;
  const state = (req.query as any).state;

  if (!code || !state) {
    return reply.redirect("/login?error=no_code");
  }

  try {
    const storedState = await parseState(provider, state);
    if (!storedState) {
      return reply.redirect("/login?error=invalid_state");
    }
    await deleteState(provider, state);
    
    const config = await getProviderConfig(provider);
    const token = await exchangeCode(provider, config, code, storedState.codeVerifier);
    if (!token.access_token) {
      return reply.redirect("/login?error=no_token");
    }
    
    const { id, displayName, email, avatarUrl } = await fetchUserInfo(provider, config.userInfoUrl, token.access_token);
    const redis = getRedis();
    try {
      // Ensure Redis is connected before creating stores
      await redis.ping();
    } catch (redisError) {
      logger.error({ 
        event: 'oauth.callback.redis_error', 
        provider, 
        error: redisError instanceof Error ? redisError.message : String(redisError) 
      }, "Redis connection failed during OAuth callback");
      return reply.redirect("/login?error=service_unavailable");
    }
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);
    
    const user = await userStore.upsertOAuthUser(id, displayName, email, avatarUrl);
    if (user.status !== "active") {
      return reply.redirect("/login?error=account_disabled");
    }
    
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);

    reply.header("Set-Cookie", buildSessionCookie(session.id, maxAge));
    return reply.redirect(storedState.returnTo ?? "/");
  } catch (err) {
    logger.error({
      event: 'oauth.callback.error',
      provider,
      error: err instanceof Error ? err.message : String(err)
    }, `Auth callback failed (${provider})`);
    return reply.redirect("/login?error=auth_failed");
  }
}
