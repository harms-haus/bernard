import logging
import json
import httpx
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .services.config import BERNARD_URL, VLLM_URL, WHISPER_URL, KOKORO_URL, TIMEOUT_SECONDS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("openai-proxy")

app = FastAPI(title="Bernard OpenAI Proxy")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared HTTP client for all requests
http_client = httpx.AsyncClient(timeout=TIMEOUT_SECONDS)

@app.on_event("shutdown")
async def shutdown_event():
    await http_client.aclose()

@app.get("/health")
async def health_check():
    health = {"status": "ok", "services": {}}
    
    # Check backends
    for name, url in [
        ("bernard", BERNARD_URL),
        ("vllm", VLLM_URL),
        ("whisper", WHISPER_URL),
        ("kokoro", KOKORO_URL)
    ]:
        try:
            # Simple health check for each service
            # For Bernard, we can check /api/status if it exists, or just root
            check_url = f"{url}/api/status" if name == "bernard" else f"{url}/health"
            # Some services might not have /health, fallback to root
            try:
                resp = await http_client.get(check_url, timeout=2.0)
                status = "up" if resp.status_code < 500 else "error"
            except:
                resp = await http_client.get(url, timeout=2.0)
                status = "up" if resp.status_code < 500 else "error"
            health["services"][name] = status
        except Exception as e:
            health["services"][name] = f"down ({str(e)})"
            health["status"] = "degraded"
            
    return health

@app.get("/v1/models")
async def list_models():
    """Aggregate models from all backends"""
    models = []
    
    # 1. Models from Bernard
    try:
        resp = await http_client.get(f"{BERNARD_URL}/api/v1/models")
        if resp.status_code == 200:
            models.extend(resp.json().get("data", []))
    except Exception as e:
        logger.warning(f"Failed to fetch models from Bernard: {e}")

    # 2. Models from vLLM
    try:
        resp = await http_client.get(f"{VLLM_URL}/v1/models")
        if resp.status_code == 200:
            models.extend(resp.json().get("data", []))
    except Exception as e:
        logger.warning(f"Failed to fetch models from vLLM: {e}")

    # 3. Static models for audio
    models.append({
        "id": "whisper-1",
        "object": "model",
        "created": 1677649963,
        "owned_by": "openai"
    })
    models.append({
        "id": "kokoro-v1.0",
        "object": "model",
        "created": 1677649963,
        "owned_by": "kokoro"
    })

    return {"object": "list", "data": models}

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Proxy chat completions to Bernard"""
    body = await request.json()
    logger.info(f"Proxying chat completion request to Bernard: {body.get('model')}")
    
    # We use stream=True by default for forwarding to Bernard
    # if the client requested a stream, we should stream it back
    stream_requested = body.get("stream", False)
    
    # Forward the request to Bernard
    # Note: we strip /api from internal URL if it's already there
    # Bernard routes are at /api/v1/...
    target_url = f"{BERNARD_URL}/api/v1/chat/completions"
    
    if not stream_requested:
        try:
            resp = await http_client.post(target_url, json=body, headers=dict(request.headers))
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers)
            )
        except Exception as e:
            logger.error(f"Error in chat completion: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    # Handle streaming
    async def stream_generator():
        async with http_client.stream("POST", target_url, json=body, headers=dict(request.headers)) as response:
            async for chunk in response.aiter_bytes():
                yield chunk

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@app.post("/v1/embeddings")
async def embeddings(request: Request):
    """Proxy embeddings to vLLM"""
    body = await request.json()
    logger.info(f"Proxying embedding request to vLLM: {body.get('model')}")
    
    target_url = f"{VLLM_URL}/v1/embeddings"
    try:
        resp = await http_client.post(target_url, json=body, headers=dict(request.headers))
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers)
        )
    except Exception as e:
        logger.error(f"Error in embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/audio/transcriptions")
async def transcriptions(request: Request):
    """Proxy transcriptions to Whisper wrapper"""
    # Transcription usually comes as multipart/form-data
    form_data = await request.form()
    logger.info(f"Proxying transcription request to Whisper")
    
    files = {}
    data = {}
    for key, value in form_data.items():
        if hasattr(value, "filename"):
            files[key] = (value.filename, await value.read(), value.content_type)
        else:
            data[key] = value

    target_url = f"{WHISPER_URL}/v1/audio/transcriptions"
    try:
        resp = await http_client.post(target_url, data=data, files=files, headers=dict(request.headers))
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers)
        )
    except Exception as e:
        logger.error(f"Error in transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/audio/speech")
async def speech(request: Request):
    """Proxy speech (TTS) to Kokoro"""
    body = await request.json()
    logger.info(f"Proxying speech request to Kokoro: {body.get('voice')}")
    
    target_url = f"{KOKORO_URL}/v1/audio/speech"
    try:
        resp = await http_client.post(target_url, json=body, headers=dict(request.headers))
        # TTS returns a binary stream (usually mp3/wav)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers)
        )
    except Exception as e:
        logger.error(f"Error in speech: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    from .services.config import PROXY_HOST, PROXY_PORT
    uvicorn.run(app, host=PROXY_HOST, port=PROXY_PORT)

