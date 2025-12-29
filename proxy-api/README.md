# Bernard Unified Server

A Fastify-based server that provides authentication, API proxying, and service integration for the Bernard AI assistant.

## Features

- OAuth authentication (GitHub)
- API proxying to backend services
- Session management
- Admin authentication via API key
- CORS support
- Multipart file uploads

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

The service loads environment variables from the root `.env` file. Configure the following OAuth settings in the root `.env` file:

#### OAuth Setup (Required for GitHub login)

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Configure:
   - **Application name**: Bernard Admin
   - **Homepage URL**: `http://localhost:3456`
   - **Authorization callback URL**: `http://localhost:3456/bernard/api/auth/github/callback`
4. Update `.env` with your OAuth credentials:
   ```env
   OAUTH_GITHUB_CLIENT_ID=your-client-id
   OAUTH_GITHUB_CLIENT_SECRET=your-client-secret
   ```

#### Admin Access

You can access admin features using either:
- OAuth login (recommended for production)
- Admin API key (for development/testing)

```env
ADMIN_API_KEY=your-secure-admin-token
```

### 3. Build and Run

```bash
# Development
npm run dev

# Production build
npm run build
npm run start
```

## API Routes

### Authentication
- `GET /auth/github/login` - Start GitHub OAuth flow
- `GET /auth/google/login` - Start Google OAuth flow
- `GET /auth/me` - Get current user info
- `POST /auth/logout` - Clear session
- `GET /auth/admin` - Check admin status

### OAuth Callbacks (handled by Next.js app)
- `GET /bernard/api/auth/github/callback` - Handle GitHub OAuth callback
- `GET /bernard/api/auth/google/callback` - Handle Google OAuth callback

### API Proxying
- `/v1/*` - OpenAI-compatible API endpoints
- `/bernard/*` - Bernard UI and API
- `/api/*` - Proxied to Next.js backend

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run dev:whisper` - Start Whisper service

### Project Structure

```
src/
├── index.ts           # Server entry point
├── lib/
│   ├── auth/          # Authentication logic
│   ├── config/        # Settings management
│   ├── infra/         # Infrastructure (Redis)
│   └── logger.ts      # Logging utilities
├── routes/            # Route handlers
└── services/          # Background services
```

## Environment Variables

See `.env.example` for all available configuration options.

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3456` |
| `HOST` | Server host | `0.0.0.0` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth client ID | - |
| `OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | - |
| `ADMIN_API_KEY` | Admin access token | - |

## Security Notes

- The `.env` file contains sensitive information and is gitignored
- Use strong, unique values for `ADMIN_API_KEY`
- Configure proper OAuth redirect URIs for production
- Enable HTTPS in production environments
