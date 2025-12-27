# vLLM Embedding Service

The vLLM service provides high-performance text embeddings.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `VLLM_PORT` | Port | `8001` | The port the vLLM service listens on. |
| `EMBEDDING_BASE_URL` | URL | `http://localhost:8001/v1` | Base URL for embedding requests. |
| `EMBEDDING_MODEL` | String | `nomic-embed-text-v1.5` | The model ID used for embeddings. |

### Why these settings?
- `VLLM_PORT`: Used by the startup script to launch the vLLM server.
- `EMBEDDING_BASE_URL`: Used by the Agent to connect to the embedding service.
- `EMBEDDING_MODEL`: Specifies which model the vLLM server should load.

## Debugging

### Check if service is running
Since `VLLM_PORT` is set to 8001, run:
```bash
lsof -i :8001
```

### Check logs
Logs are stored in `services/logs/vllm-embedding.log`:
```bash
tail -f services/logs/vllm-embedding.log
```

### Manual Health Check
```bash
curl http://localhost:8001/health
```

### Location
The environment is in `services/vllm_venv/`.

