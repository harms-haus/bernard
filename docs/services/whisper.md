# Whisper STT Service

The Whisper service provides Speech-to-Text transcription capabilities.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `WHISPER_PORT` | Port | `8002` | The port the Whisper service listens on. |
| `WHISPER_MODEL` | Path | `models/whisper/ggml-small.bin` | Path to the Whisper model file. |

### Why these settings?
- `WHISPER_PORT`: The API server uses this port to expose the transcription endpoint.
- `WHISPER_MODEL`: The `whisper.cpp` binary requires a model file to process audio.

## Debugging

### Check if service is running
Since `WHISPER_PORT` is set to 8002, run:
```bash
lsof -i :8002
```

### Check logs
Logs are stored in `services/logs/whisper.log`:
```bash
tail -f services/logs/whisper.log
```

### Manual Health Check
```bash
curl http://localhost:8002/health
```

### Location
The core binary is in `services/whisper.cpp/` and the Fastify wrapper is in `api/src/services/whisper.ts`.

