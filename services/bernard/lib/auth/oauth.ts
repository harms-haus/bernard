import type { IncomingMessage } from "node:http";

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
}
import { 
  base64Encode,
  createCodeVerifier,
  createChallenge,
  exchangeCode,
  fetchUserInfo
} from "@shared/auth/index";
import type { 
  OAuthProvider,
  ProviderConfig
} from "@shared/auth/index";
import { buildSessionCookie, clearSessionCookie } from "./auth";
import { getRedis } from "@/lib/infra/redis";
import { SessionStore } from "./sessionStore";
import { UserStore } from "./userStore";
import { appSettings } from "@shared/config/appSettings";
import { logger } from "@/lib/logging";

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

export async function startOAuthLogin(provider: OAuthProvider, req: IncomingMessage): Promise<HttpResponse> {
  const { authUrl, clientId, redirectUri, scope } = await getProviderConfig(provider);
  logger.info({ event: 'oauth.start', provider, redirectUri }, `OAuth start: redirectUri=${redirectUri}`);
  const state = base64Encode(Buffer.from(crypto.randomUUID()));
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createChallenge(codeVerifier);

  // Parse URL from request
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const returnTo = url.searchParams.get('redirect') ?? "/";

  const redis = getRedis();
  await redis.set(stateKey(provider, state), JSON.stringify({ codeVerifier, returnTo }), "EX", STATE_TTL_SECONDS);

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

  return {
    status: 302,
    headers: {
      Location: authorizeUrl.toString()
    }
  };
}

const parseState = async (provider: OAuthProvider, state: string): Promise<{ codeVerifier: string; returnTo: string } | null> => {
  const redis = getRedis();
  const raw = await redis.get(stateKey(provider, state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { codeVerifier: string; returnTo: string };
  } catch (err: unknown) {
    logger.error({ event: 'oauth.state.parse_error', provider, error: err instanceof Error ? err.message : String(err) }, "Failed to parse OAuth state");
    return null;
  }
};

const deleteState = async (provider: OAuthProvider, state: string) => {
  const redis = getRedis();
  await redis.del(stateKey(provider, state));
};

export async function handleOAuthCallback(provider: OAuthProvider, req: IncomingMessage): Promise<HttpResponse> {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return {
      status: 302,
      headers: {
        Location: "/login?error=no_code",
        "Set-Cookie": clearSessionCookie()
      }
    };
  }

  try {
    const storedState = await parseState(provider, state);
    if (!storedState) {
      return {
        status: 302,
        headers: {
          Location: "/login?error=invalid_state",
          "Set-Cookie": clearSessionCookie()
        }
      };
    }
    await deleteState(provider, state);
    const config = await getProviderConfig(provider);
    const token = await exchangeCode(provider, config, code, storedState.codeVerifier);
    if (!token.access_token) {
      return {
        status: 302,
        headers: {
          Location: "/login?error=no_token",
          "Set-Cookie": clearSessionCookie()
        }
      };
    }
    const { id, displayName, email, avatarUrl } = await fetchUserInfo(provider, config.userInfoUrl, token.access_token);
    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);
    const user = await userStore.upsertOAuthUser(id, displayName, email, avatarUrl);
    if (user.status !== "active") {
      return {
        status: 302,
        headers: {
          Location: "/login?error=account_disabled",
          "Set-Cookie": clearSessionCookie()
        }
      };
    }
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);

    return {
      status: 302,
      headers: {
        Location: storedState.returnTo ?? "/",
        "Set-Cookie": buildSessionCookie(session.id, maxAge)
      }
    };
  } catch (err: unknown) {
    logger.error({
      event: 'oauth.callback.error',
      provider,
      error: err instanceof Error ? err.message : String(err)
    }, `Auth callback failed (${provider})`);
    return {
      status: 302,
      headers: {
        Location: "/login?error=auth_failed",
        "Set-Cookie": clearSessionCookie()
      }
    };
  }
}
