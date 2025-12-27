# Kokoro TTS Service

The Kokoro service provides Text-to-Speech capabilities for Bernard.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `KOKORO_URL` | URL | `http://localhost:8880` | The base URL where the Kokoro service is accessible. |
| `KOKORO_PORT` | Port | `8880` | The port the Kokoro service listens on. |

### Why these settings?
- `KOKORO_URL`: Used by the API and Agent to send speech synthesis requests.
- `KOKORO_PORT`: Used by the startup script to launch the FastAPI server.

## Debugging

### Check if service is running
Since `KOKORO_PORT` is set to 8880, run:
```bash
lsof -i :8880
```
If nothing is returned, the service is not running.

### Check logs
Logs are stored in `services/logs/kokoro.log`. You can tail them:
```bash
tail -f services/logs/kokoro.log
```

### Manual Health Check
```bash
curl http://localhost:8880/health
```

### Location
The service code is located in `services/kokoro/`.

