# Bernard Agent Service

The main Bernard Agent application (Vite).

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `REDIS_URL` | URL | `redis://localhost:6379` | Connection string for Redis. |
| `ADMIN_API_KEY` | Secret | - | Key used for administrative API access. |
| `PORT` | Port | `3001` | Port the Vite app runs on. |

### Why these settings?
- `REDIS_URL`: Core data store for settings, sessions, and memory.
- `ADMIN_API_KEY`: Secures sensitive operations.

## Debugging

### Check if service is running
Since `PORT` is set to 3001, run:
```bash
lsof -i :3001
```

### Check logs
Check the terminal output where `npm run dev` is running.

### Manual Health Check
```bash
curl http://localhost:3001/health
```

### Location
The code is in `services/bernard2/`.

