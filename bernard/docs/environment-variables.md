# Bernard Environment Variables Documentation

This document provides comprehensive documentation for all environment variables used in Bernard AI Assistant, with special focus on the new SearXNG web search integration.

## Table of Contents

1. [Core Configuration](#core-configuration)
2. [Web Search Configuration](#web-search-configuration)
3. [Model Configuration](#model-configuration)
4. [External Service Configuration](#external-service-configuration)
5. [Advanced Configuration](#advanced-configuration)
6. [Configuration Best Practices](#configuration-best-practices)

## Core Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `ADMIN_API_KEY` | Admin bearer token for token management | `super-secret-admin-token` |

### Optional Core Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RK_NAMESPACE` | Redis namespace for RecordKeeper | `bernard:rk` | `custom:namespace` |
| `NODE_ENV` | Node.js environment | `production` | `development` |
| `PORT` | HTTP server port | `3000` | `8080` |

## Web Search Configuration

### SearXNG Configuration (Recommended)

SearXNG is the recommended web search provider due to its privacy-focused design and self-hostable nature.

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `SEARXNG_API_URL` | SearXNG instance URL | ✅ | - | `https://searxng.example.com/search` |
| `SEARXNG_API_KEY` | API key if required by instance | ❌ | - | `your-searxng-key` |
| `SEARXNG_USER_AGENT` | User agent for SearXNG requests | ❌ | `bernard-assistant` | `my-app/1.0` |
| `SEARXNG_TIMEOUT_MS` | Request timeout in milliseconds | ❌ | `5000` | `8000` |

#### SearXNG Configuration Examples

**Public Instance:**
```bash
SEARXNG_API_URL=https://searx.be/search
```

**Self-Hosted Instance:**
```bash
SEARXNG_API_URL=https://your-searxng-instance.com/search
SEARXNG_API_KEY=your-api-key-if-configured
SEARXNG_TIMEOUT_MS=10000
```

**With Custom Settings:**
```bash
SEARXNG_API_URL=https://searxng.example.com/search
SEARXNG_USER_AGENT=bernard-assistant/2.0
SEARXNG_TIMEOUT_MS=7500
```

### Configuration Priority and Fallback

Bernard uses the following priority order for web search configuration:

1. **SearXNG environment variables** (highest priority)
2. **Redis settings** (persistent fallback)
3. **Default values** (lowest priority)

#### Fallback Behavior

- If `SEARXNG_API_URL` is set, SearXNG is used
- If SearXNG is not configured, an error is returned: "Search tool is not configured"

## Model Configuration

### Model Configuration

⚠️ **Deprecation Notice**: Models are now primarily configured through the admin UI instead of environment variables. Configure providers and models in the Models section of the admin interface.

**Migration Guide**:
1. Navigate to the Admin UI Models section
2. Configure your models through the web interface

**Legacy Support**: Environment variables are still supported for CLI/legacy use cases only. See the reference table below for available variables.

📖 [Admin UI Models Documentation](#) (link to be added)

## External Service Configuration

### Memory and Indexing

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `MEMORY_INDEX_NAME` | Memory index name | `bernard_memories` | `custom_index` |
| `MEMORY_KEY_PREFIX` | Memory key prefix | `bernard:memories` | `app:memories` |
| `MEMORY_NAMESPACE` | Memory namespace | `bernard:memories` | `custom:namespace` |

### Geocoding Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `NOMINATIM_URL` | Nominatim geocoding URL | `https://nominatim.openstreetmap.org/search` |
| `NOMINATIM_USER_AGENT` | User agent for geocoding | `your-app-name` |
| `NOMINATIM_EMAIL` | Contact email for geocoding | `ops@example.com` |
| `NOMINATIM_REFERER` | Referer URL for geocoding | `https://example.com` |

### Weather Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `WEATHER_API_KEY` | OpenWeather API key | `openweather-api-key` |
| `WEATHER_API_URL` | OpenWeather API URL | `https://api.openweathermap.org/data/2.5/weather` |
| `OPEN_METEO_FORECAST_URL` | Open-Meteo forecast URL | `https://api.open-meteo.com/v1/forecast` |
| `OPEN_METEO_HISTORICAL_URL` | Open-Meteo historical URL | `https://archive-api.open-meteo.com/v1/archive` |

## Backup Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `BACKUP_DEBOUNCE_SECONDS` | Backup debounce delay | `60` | `120` |
| `BACKUP_DIR` | Backup directory | `./backups` | `/var/backups/bernard` |
| `BACKUP_RETENTION_DAYS` | Backup retention days | `14` | `30` |
| `BACKUP_RETENTION_COUNT` | Backup retention count | `20` | `50` |

## OAuth Configuration

### Generic OAuth

| Variable | Description | Example |
|----------|-------------|---------|
| `OAUTH_AUTH_URL` | OAuth authorization URL | `https://auth.example.com/oauth/authorize` |
| `OAUTH_TOKEN_URL` | OAuth token URL | `https://auth.example.com/oauth/token` |
| `OAUTH_USERINFO_URL` | OAuth userinfo URL | `https://auth.example.com/oauth/userinfo` |
| `OAUTH_CLIENT_ID` | OAuth client ID | `bernard-admin` |
| `OAUTH_CLIENT_SECRET` | OAuth client secret | `replace-me` |
| `OAUTH_REDIRECT_URI` | OAuth redirect URI | `http://localhost:3000/api/auth/callback` |
| `OAUTH_SCOPES` | OAuth scopes | `openid profile email` |

### Google OAuth

| Variable | Description | Example |
|----------|-------------|---------|
| `OAUTH_GOOGLE_AUTH_URL` | Google auth URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| `OAUTH_GOOGLE_TOKEN_URL` | Google token URL | `https://oauth2.googleapis.com/token` |
| `OAUTH_GOOGLE_USERINFO_URL` | Google userinfo URL | `https://openidconnect.googleapis.com/v1/userinfo` |
| `OAUTH_GOOGLE_REDIRECT_URI` | Google redirect URI | `http://localhost:3456/bernard/api/auth/google/callback` |
| `OAUTH_GOOGLE_SCOPES` | Google scopes | `openid profile email` |
| `OAUTH_GOOGLE_CLIENT_ID` | Google client ID | `google-client-id` |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google client secret | `google-client-secret` |

### GitHub OAuth

| Variable | Description | Example |
|----------|-------------|---------|
| `OAUTH_GITHUB_AUTH_URL` | GitHub auth URL | `https://github.com/login/oauth/authorize` |
| `OAUTH_GITHUB_TOKEN_URL` | GitHub token URL | `https://github.com/login/oauth/access_token` |
| `OAUTH_GITHUB_USERINFO_URL` | GitHub userinfo URL | `https://api.github.com/user` |
| `OAUTH_GITHUB_REDIRECT_URI` | GitHub redirect URI | `http://localhost:3456/bernard/api/auth/github/callback` |
| `OAUTH_GITHUB_SCOPES` | GitHub scopes | `read:user user:email` |
| `OAUTH_GITHUB_CLIENT_ID` | GitHub client ID | `github-client-id` |
| `OAUTH_GITHUB_CLIENT_SECRET` | GitHub client secret | `github-client-secret` |

## Session Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SESSION_TTL_SECONDS` | Session time-to-live | `604800` (7 days) | `86400` (1 day) |

## Advanced Configuration

### Logging Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `info`, `debug`, `error` |
| `LOG_FORMAT` | Log format | `json`, `text` |

### Performance Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `MAX_CONCURRENT_REQUESTS` | Max concurrent requests | `100` | `200` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` | `30000` |
| `RATE_LIMIT_MAX` | Rate limit max requests | `1000` | `500` |

## Configuration Best Practices

### Security Best Practices

1. **Never commit secrets**: Use `.env` files and exclude from version control
2. **Use strong tokens**: Generate random, complex API keys and tokens
3. **Rotate secrets**: Regularly rotate API keys and tokens
4. **Limit permissions**: Use least-privilege access for all services
5. **Use HTTPS**: Always use HTTPS for all external service URLs

### Environment Variable Management

```bash
# Create .env file from template
cp env.example .env

# Set permissions to restrict access
chmod 600 .env

# Add .env to .gitignore
 echo ".env" >> .gitignore
```

### Configuration Validation

```bash
# Check if required variables are set
node -e "
  const missing = [];
  if (!process.env.REDIS_URL) missing.push('REDIS_URL');
  if (!process.env.ADMIN_API_KEY) missing.push('ADMIN_API_KEY');
  if (!process.env.SEARXNG_API_URL && !process.env.SEARCH_API_KEY) missing.push('SEARCH_CONFIG');
  if (missing.length) {
    console.error('Missing required variables:', missing.join(', '));
    process.exit(1);
  }
  console.log('Configuration valid');
"
```

### Production vs Development Configuration

**Development Configuration:**
```bash
NODE_ENV=development
LOG_LEVEL=debug
SEARXNG_API_URL=https://searxng-dev.example.com/search
SEARXNG_TIMEOUT_MS=10000
```

**Production Configuration:**
```bash
NODE_ENV=production
LOG_LEVEL=info
SEARXNG_API_URL=https://searxng-prod.example.com/search
SEARXNG_TIMEOUT_MS=5000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=1000
```

### Configuration Priority Order

1. **Environment variables** (highest priority)
2. **Command line arguments**
3. **Config files** (`.env`, `config.json`)
4. **Default values** (lowest priority)

## SearXNG-Specific Best Practices

### Instance Selection

- **Public instances**: Good for testing and development
- **Self-hosted**: Recommended for production (better privacy and control)
- **Geographic proximity**: Choose instances close to your server location

### Performance Optimization

```bash
# For faster responses
SEARXNG_TIMEOUT_MS=3000

# For more reliable connections
SEARXNG_TIMEOUT_MS=8000
```

### Monitoring and Maintenance

```bash
# Check SearXNG instance health
curl -s "https://your-searxng-instance.com/healthz"

# Monitor search performance
curl -s http://localhost:3000/api/status | jq '.services.search'
```

## Troubleshooting Configuration Issues

### Common Configuration Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Search tool is not configured" | Missing search configuration | Set `SEARXNG_API_URL` or `SEARCH_API_KEY` |
| "Invalid search API URL" | Malformed URL | Use absolute URL with `https://` |
| "Search service unavailable" | Network issues | Check connectivity and provider status |
| "Missing API key" | Placeholder key used | Replace with real API key |

### Debugging Configuration

```bash
# Check loaded configuration
node -e "console.log(process.env)" | grep SEARXNG

# Test configuration resolution
node -e "
  const {verifySearchConfigured} = require('./agent/harness/router/tools/web-search.ts');
  console.log('Search config:', verifySearchConfigured());
"
```

## Complete Environment Variable Reference

### All Variables in Alphabetical Order

| Variable | Category | Required | Description |
|----------|----------|----------|-------------|
| `ADMIN_API_KEY` | Core | ✅ | Admin bearer token |
| `BACKUP_DEBOUNCE_SECONDS` | Backup | ❌ | Backup debounce delay |
| `BACKUP_DIR` | Backup | ❌ | Backup directory |
| `BACKUP_RETENTION_COUNT` | Backup | ❌ | Backup retention count |
| `BACKUP_RETENTION_DAYS` | Backup | ❌ | Backup retention days |




| `MEMORY_INDEX_NAME` | Memory | ❌ | Memory index name |
| `MEMORY_KEY_PREFIX` | Memory | ❌ | Memory key prefix |
| `MEMORY_NAMESPACE` | Memory | ❌ | Memory namespace |
| `NOMINATIM_EMAIL` | Geocoding | ❌ | Nominatim contact email |
| `NOMINATIM_REFERER` | Geocoding | ❌ | Nominatim referer URL |
| `NOMINATIM_URL` | Geocoding | ❌ | Nominatim geocoding URL |
| `NOMINATIM_USER_AGENT` | Geocoding | ❌ | Nominatim user agent |
| `OAUTH_AUTH_URL` | OAuth | ❌ | OAuth authorization URL |
| `OAUTH_CLIENT_ID` | OAuth | ❌ | OAuth client ID |
| `OAUTH_CLIENT_SECRET` | OAuth | ❌ | OAuth client secret |
| `OAUTH_GITHUB_AUTH_URL` | OAuth | ❌ | GitHub auth URL |
| `OAUTH_GITHUB_CLIENT_ID` | OAuth | ❌ | GitHub client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | OAuth | ❌ | GitHub client secret |
| `OAUTH_GITHUB_REDIRECT_URI` | OAuth | ❌ | GitHub redirect URI |
| `OAUTH_GITHUB_SCOPES` | OAuth | ❌ | GitHub OAuth scopes |
| `OAUTH_GITHUB_TOKEN_URL` | OAuth | ❌ | GitHub token URL |
| `OAUTH_GITHUB_USERINFO_URL` | OAuth | ❌ | GitHub userinfo URL |
| `OAUTH_GOOGLE_AUTH_URL` | OAuth | ❌ | Google auth URL |
| `OAUTH_GOOGLE_CLIENT_ID` | OAuth | ❌ | Google client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | OAuth | ❌ | Google client secret |
| `OAUTH_GOOGLE_REDIRECT_URI` | OAuth | ❌ | Google redirect URI |
| `OAUTH_GOOGLE_SCOPES` | OAuth | ❌ | Google OAuth scopes |
| `OAUTH_GOOGLE_TOKEN_URL` | OAuth | ❌ | Google token URL |
| `OAUTH_GOOGLE_USERINFO_URL` | OAuth | ❌ | Google userinfo URL |
| `OAUTH_REDIRECT_URI` | OAuth | ❌ | OAuth redirect URI |
| `OAUTH_SCOPES` | OAuth | ❌ | OAuth scopes |
| `OAUTH_TOKEN_URL` | OAuth | ❌ | OAuth token URL |
| `OAUTH_USERINFO_URL` | OAuth | ❌ | OAuth userinfo URL |
| `OPEN_METEO_FORECAST_URL` | Weather | ❌ | Open-Meteo forecast URL |
| `OPEN_METEO_HISTORICAL_URL` | Weather | ❌ | Open-Meteo historical URL |


| `REDIS_URL` | Core | ✅ | Redis connection URL |

| `RK_NAMESPACE` | Core | ❌ | Redis namespace |
| `SEARXNG_API_KEY` | Search | ❌ | SearXNG API key |
| `SEARXNG_API_URL` | Search | ❌ | SearXNG instance URL |
| `SEARXNG_TIMEOUT_MS` | Search | ❌ | SearXNG timeout |
| `SEARXNG_USER_AGENT` | Search | ❌ | SearXNG user agent |
| `SESSION_TTL_SECONDS` | Session | ❌ | Session TTL |

| `WEATHER_API_KEY` | Weather | ❌ | Weather API key |
| `WEATHER_API_URL` | Weather | ❌ | Weather API URL |

This comprehensive environment variables documentation covers all configuration options for Bernard AI Assistant, with special emphasis on the new SearXNG web search integration and its configuration parameters.