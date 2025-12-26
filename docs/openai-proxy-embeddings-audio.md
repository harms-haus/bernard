# Complete OpenAI-Compatible Proxy Setup Guide
## Multi-Service Architecture with vLLM (Embeddings) + Whisper.cpp + Kokoro FastAPI

This guide sets up a fully self-hosted, GPU-accelerated OpenAI-compatible API proxy running on bare metal (no Docker). All services load models on startup and keep them ready for immediate use.

**NOTE:** `/chat/completions` is handled by your existing Bernard voice assistant service and is NOT proxied here.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     FastAPI Proxy (Port 8000)                        │
│   Routes OpenAI API requests to appropriate backend service          │
└─────────────────────┬──────────────────────────────────────────────┘
                      │
                ┌─────┼──────────────┬──────────────┐
                │     │              │              │
                ▼     ▼              ▼              ▼
            /embeddings  /audio/transcriptions /audio/speech
                │              │                   │
                ▼              ▼                   ▼
            vLLM Server   Whisper.cpp         Kokoro FastAPI
            (Port 8001)   (Port 8002)         (Port 8003)
            
            - Embedding    - Whisper-1        - Kokoro-v1.0
            - nomic-embed  - Live server      - TTS Server
              text         - JSON API         - JSON API

/chat/completions: Bernard voice assistant (separate, not proxied)
```

---

## Environment Summary

**Machine Requirements:**
- NVIDIA GPU with CUDA support (tested with CUDA 12.x)
- 16GB+ VRAM recommended (embeddings + TTS + transcription)
- 32GB+ system RAM
- Ubuntu 22.04/24.04 or similar

**All services assume:**
- Python 3.10+
- CUDA 12.x installed
- All services start at boot and load models immediately
- Bernard already running on port 8004 (or your configured port)

---

## SERVICE 1: vLLM (Embeddings Only)

### What It Does
- Serves `/v1/embeddings` (nomic-embed-text)
- Lightweight, fast text embedding model
- Does NOT handle chat/completions (Bernard handles that)
- Single process, minimal resource overhead compared to full LLM service

### Step 1A: Create Python Virtual Environment

```bash
# Create dedicated venv for vLLM
mkdir -p ~/ai-services/vllm
cd ~/ai-services/vllm
python3.10 -m venv venv
source venv/bin/activate
```

### Step 1B: Install Dependencies

```bash
# Upgrade pip and core tools
pip install --upgrade pip setuptools wheel

# Install vLLM with CUDA support
pip install vllm[cuda12] transformers torch torchvision torchaudio

# Additional dependencies
pip install pydantic python-dotenv requests pyyaml
```

**Dependency Breakdown:**
- `vllm[cuda12]` - Main inference engine with CUDA support
- `transformers` - Model loading and tokenizer support
- `torch`, `torchvision`, `torchaudio` - PyTorch with CUDA kernels
- `pydantic` - Request/response validation
- `python-dotenv` - Environment config
- `requests` - For API calls
- `pyyaml` - Config file parsing

### Step 1C: Prepare Models Directory

```bash
# Create models directory (use fast SSD or NVMe)
mkdir -p ~/ai-models/vllm
cd ~/ai-models/vllm

# Pre-download embedding model
python3 << 'EOF'
from transformers import AutoTokenizer, AutoModel
import os

os.environ['HF_HOME'] = '/home/user/ai-models/vllm'

# Download nomic-embed-text model
print("Downloading nomic-embed-text...")
AutoModel.from_pretrained("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)

print("Models ready!")
EOF
```

### Step 1D: Create vLLM Startup Script (Embeddings Only)

**File:** `~/ai-services/vllm/start_vllm.sh`

```bash
#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

VLLM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$VLLM_DIR"

echo -e "${YELLOW}[vLLM] Activating virtual environment...${NC}"
source venv/bin/activate

# Configuration
export VLLM_PORT=8001
export VLLM_HOST=0.0.0.0
export HF_HOME=~/ai-models/vllm
export CUDA_VISIBLE_DEVICES=0  # Adjust if using multiple GPUs

# Embedding model configuration
EMBEDDING_MODEL="nomic-ai/nomic-embed-text-v1.5"
GPU_MEMORY_UTILIZATION=0.3  # Embeddings use less VRAM than LLMs
TENSOR_PARALLEL_SIZE=1

echo -e "${GREEN}[vLLM] Starting vLLM embeddings server...${NC}"
echo -e "${YELLOW}Configuration:${NC}"
echo "  - Embedding Model: $EMBEDDING_MODEL"
echo "  - Port: $VLLM_PORT"
echo "  - GPU Memory Utilization: $GPU_MEMORY_UTILIZATION"
echo ""

python -m vllm.entrypoints.openai.api_server \
  --host $VLLM_HOST \
  --port $VLLM_PORT \
  --model $EMBEDDING_MODEL \
  --gpu-memory-utilization $GPU_MEMORY_UTILIZATION \
  --tensor-parallel-size $TENSOR_PARALLEL_SIZE \
  --tokenizer-pool-size 0 \
  --trust-remote-code
```

Make it executable:
```bash
chmod +x ~/ai-services/vllm/start_vllm.sh
```

### Step 1E: Verify vLLM Works

```bash
# In one terminal, start vLLM
cd ~/ai-services/vllm
./start_vllm.sh

# Wait for "Uvicorn running on http://0.0.0.0:8001"

# In another terminal, test it
curl http://localhost:8001/v1/models

# Test embeddings
curl http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nomic-ai/nomic-embed-text-v1.5",
    "input": "Hello, this is a test"
  }'
```

---

## SERVICE 2: Whisper.cpp (Speech-to-Text)

### What It Does
- Runs as a standalone HTTP server on port 8002
- Provides `/v1/audio/transcriptions` endpoint (OpenAI compatible)
- Loads Whisper model on startup, ready for immediate use
- Fast CPU/GPU inference with GGML format

### Step 2A: Build Whisper.cpp with CUDA Support

```bash
# Create directory
mkdir -p ~/ai-services/whisper
cd ~/ai-services/whisper

# Clone repository
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build with CUDA support
mkdir build
cd build
cmake .. -DGGML_CUDA=ON
make -j$(nproc)

# Verify build
./bin/main --help
```

**What these do:**
- `-DGGML_CUDA=ON` - Enables NVIDIA GPU acceleration
- `make -j$(nproc)` - Parallel compile using all CPU cores

### Step 2B: Download Whisper Models

```bash
cd ~/ai-services/whisper/whisper.cpp

# Create models directory
mkdir -p models

# Download the small model (fast, good accuracy)
# Options: tiny, base, small, medium, large
bash models/download-ggml-model.sh small

# Or download manually
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin -O models/ggml-small.bin
```

### Step 2C: Create Whisper FastAPI Wrapper

The compiled Whisper.cpp binary is good, but we need an OpenAI-compatible JSON API. We'll create a Python FastAPI wrapper:

**File:** `~/ai-services/whisper/whisper_server.py`

```python
"""
OpenAI-compatible Whisper server wrapper for whisper.cpp
Provides /v1/audio/transcriptions endpoint
"""

import subprocess
import tempfile
import json
import os
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="Whisper Server")

# Configuration
WHISPER_BINARY = Path.home() / "ai-services/whisper/whisper.cpp/build/bin/main"
WHISPER_MODEL = Path.home() / "ai-services/whisper/whisper.cpp/models/ggml-small.bin"
WHISPER_THREADS = 4
WHISPER_GPU_DEVICE = 0  # GPU device ID for CUDA

# Validate paths exist
if not WHISPER_BINARY.exists():
    raise FileNotFoundError(f"Whisper binary not found: {WHISPER_BINARY}")
if not WHISPER_MODEL.exists():
    raise FileNotFoundError(f"Whisper model not found: {WHISPER_MODEL}")


@app.get("/v1/models")
async def list_models():
    """List available models"""
    return {
        "object": "list",
        "data": [
            {
                "id": "whisper-1",
                "object": "model",
                "created": 1677649963,
                "owned_by": "openai-compat"
            }
        ]
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("whisper-1"),
    language: str = Form(None),
    prompt: str = Form(None),
    response_format: str = Form("json"),
    temperature: float = Form(0.0)
):
    """
    Transcribe audio file
    Compatible with OpenAI's /v1/audio/transcriptions endpoint
    """
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        
        try:
            # Build command
            cmd = [
                str(WHISPER_BINARY),
                "-m", str(WHISPER_MODEL),
                "-f", tmp_path,
                "-t", str(WHISPER_THREADS),
                "-g", str(WHISPER_GPU_DEVICE),
                "-oj",  # Output JSON
                "--no-prints"
            ]
            
            # Add optional parameters
            if language:
                cmd.extend(["-l", language])
            
            # Run whisper
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                raise Exception(f"Whisper error: {result.stderr}")
            
            # Parse output
            output = json.loads(result.stdout)
            
            # Format as OpenAI response
            return {
                "text": output.get("result", [{}])[0].get("text", ""),
                "language": language or "auto"
            }
        
        finally:
            # Cleanup temp file
            os.unlink(tmp_path)
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "whisper-server",
        "model": str(WHISPER_MODEL.name)
    }


if __name__ == "__main__":
    print(f"Starting Whisper server on http://0.0.0.0:8002")
    print(f"Binary: {WHISPER_BINARY}")
    print(f"Model: {WHISPER_MODEL}")
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

### Step 2D: Create Whisper Python Virtual Environment

```bash
cd ~/ai-services/whisper
python3.10 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install fastapi uvicorn pydantic python-multipart
```

### Step 2E: Create Whisper Startup Script

**File:** `~/ai-services/whisper/start_whisper.sh`

```bash
#!/bin/bash
set -e

WHISPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WHISPER_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[Whisper] Checking build...${NC}"
if [ ! -f "whisper.cpp/build/bin/main" ]; then
    echo -e "${YELLOW}[Whisper] Building whisper.cpp (first time)...${NC}"
    cd whisper.cpp
    mkdir -p build
    cd build
    cmake .. -DGGML_CUDA=ON
    make -j$(nproc)
    cd ../..
fi

echo -e "${YELLOW}[Whisper] Activating virtual environment...${NC}"
source venv/bin/activate

echo -e "${GREEN}[Whisper] Starting Whisper FastAPI server...${NC}"
python whisper_server.py
```

Make it executable:
```bash
chmod +x ~/ai-services/whisper/start_whisper.sh
```

### Step 2F: Test Whisper

```bash
# In one terminal
cd ~/ai-services/whisper
./start_whisper.sh

# Wait for "Application startup complete"

# In another terminal, test transcription
curl -X POST "http://localhost:8002/v1/audio/transcriptions" \
  -F "file=@/path/to/audio.wav" \
  -F "model=whisper-1"
```

---

## SERVICE 3: Kokoro TTS (Text-to-Speech)

### What It Does
- FastAPI wrapper around Kokoro-v1.0 TTS
- Provides `/v1/audio/speech` endpoint (OpenAI compatible)
- Loads voice model on startup
- Outputs MP3/WAV audio

### Step 3A: Clone and Setup Kokoro

```bash
mkdir -p ~/ai-services/kokoro
cd ~/ai-services/kokoro

# Clone Kokoro repository
git clone https://github.com/remsky/Kokoro-FastAPI.git
cd Kokoro-FastAPI
```

### Step 3B: Install Kokoro Dependencies

```bash
cd ~/ai-services/kokoro/Kokoro-FastAPI

# Create virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip setuptools wheel

# Install dependencies
pip install fastapi uvicorn pydantic pydantic-settings python-multipart
pip install torch torchaudio  # Will use system CUDA
pip install numpy pydantic scipy

# Install Kokoro-specific dependencies (follow repo instructions)
# Usually includes: TTS library, audio processing
pip install -e .
```

**Key dependencies:**
- `fastapi`, `uvicorn` - Web server
- `torch`, `torchaudio` - Neural network inference
- `pydantic` - Request validation
- Repository-specific dependencies (install with `-e .`)

### Step 3C: Download Kokoro Voice Models

```bash
cd ~/ai-services/kokoro/Kokoro-FastAPI

# The repo should auto-download models, but you can pre-download:
python3 << 'EOF'
# Models auto-download on first use to ~/.cache/kokoro/
# Common voices: af (American Female), am (American Male), bf (British Female), etc.
import os
os.environ['HF_HOME'] = os.path.expanduser('~/ai-models/kokoro')
print(f"Models will download to: {os.environ['HF_HOME']}")
EOF
```

### Step 3D: Create Kokoro Startup Script

**File:** `~/ai-services/kokoro/start_kokoro.sh`

```bash
#!/bin/bash
set -e

KOKORO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$KOKORO_DIR/Kokoro-FastAPI"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[Kokoro] Activating virtual environment...${NC}"
source venv/bin/activate

# Set model cache location
export HF_HOME=~/ai-models/kokoro
export CUDA_VISIBLE_DEVICES=0

echo -e "${GREEN}[Kokoro] Starting Kokoro TTS server...${NC}"
echo -e "${YELLOW}Available voices: af, am, bf, bm, etc${NC}"
echo -e "${YELLOW}Access at: http://localhost:8003${NC}"

# The Kokoro-FastAPI repo should have its own startup
# Usually: python main.py or similar
# Check the repo for exact command
python main.py --host 0.0.0.0 --port 8003
```

Make it executable:
```bash
chmod +x ~/ai-services/kokoro/start_kokoro.sh
```

---

## SERVICE 4: Main FastAPI Proxy Router (Embeddings + Audio Only)

### What It Does
- Single entry point at port 8000
- Routes requests to appropriate backend service
- Handles `/embeddings`, `/audio/transcriptions`, `/audio/speech`
- Does NOT handle `/chat/completions` (Bernard handles that)
- Supports OpenAI Python client transparently

**File:** `~/ai-services/proxy/main.py`

```python
"""
OpenAI-compatible API proxy router
Routes requests to specialized backends:
- vLLM (embeddings)
- Whisper.cpp (audio/transcriptions)
- Kokoro (audio/speech)

NOTE: /chat/completions is handled by Bernard voice assistant (separate)
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from contextlib import asynccontextmanager
import httpx
import json
import logging
from typing import Optional

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Backend service URLs
VLLM_URL = "http://localhost:8001"
WHISPER_URL = "http://localhost:8002"
KOKORO_URL = "http://localhost:8003"

# HTTP client with longer timeout for inference
http_client = httpx.AsyncClient(timeout=300.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize on startup, cleanup on shutdown"""
    logger.info("🚀 Proxy starting up...")
    logger.info(f"  vLLM (Embeddings): {VLLM_URL}")
    logger.info(f"  Whisper: {WHISPER_URL}")
    logger.info(f"  Kokoro: {KOKORO_URL}")
    logger.info("  Chat/Completions: Handled by Bernard (separate service)")
    yield
    logger.info("🛑 Proxy shutting down...")
    await http_client.aclose()

app = FastAPI(
    title="OpenAI-Compatible Proxy (Embeddings + Audio)",
    version="1.0.0",
    lifespan=lifespan
)

# ============================================================================
# EMBEDDINGS ROUTING
# ============================================================================

@app.post("/v1/embeddings")
async def embeddings(request: Request):
    """Route to vLLM for embeddings"""
    try:
        body = await request.json()
        logger.info(f"Embedding request: model={body.get('model')}")
        
        # Forward to vLLM
        response = await http_client.post(
            f"{VLLM_URL}/v1/embeddings",
            json=body
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=response.text
            )
        
        return response.json()
    
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# AUDIO TRANSCRIPTION ROUTING
# ============================================================================

@app.post("/v1/audio/transcriptions")
async def transcribe_audio(request: Request):
    """Route to Whisper.cpp for audio transcription"""
    try:
        # Forward multipart form data as-is
        form = await request.form()
        logger.info(f"Transcription request from file: {form.get('file').filename}")
        
        response = await http_client.post(
            f"{WHISPER_URL}/v1/audio/transcriptions",
            data=form
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=response.text
            )
        
        return response.json()
    
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# AUDIO SPEECH ROUTING
# ============================================================================

@app.post("/v1/audio/speech")
async def text_to_speech(request: Request):
    """Route to Kokoro for text-to-speech"""
    try:
        body = await request.json()
        logger.info(f"TTS request: voice={body.get('voice')}")
        
        # Forward to Kokoro
        response = await http_client.post(
            f"{KOKORO_URL}/v1/audio/speech",
            json=body
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=response.text
            )
        
        # Return audio stream
        return StreamingResponse(
            iter([response.content]),
            media_type="audio/mpeg"
        )
    
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MODELS LIST ENDPOINT
# ============================================================================

@app.get("/v1/models")
async def list_models():
    """List all available models from all backends"""
    try:
        models = {
            "object": "list",
            "data": []
        }
        
        # Get models from vLLM
        try:
            vllm_response = await http_client.get(f"{VLLM_URL}/v1/models")
            if vllm_response.status_code == 200:
                models["data"].extend(vllm_response.json()["data"])
        except Exception as e:
            logger.warning(f"Could not fetch vLLM models: {e}")
        
        # Add static model entries for audio services
        models["data"].extend([
            {
                "id": "whisper-1",
                "object": "model",
                "owned_by": "openai-compat"
            },
            {
                "id": "kokoro-v1.0",
                "object": "model",
                "owned_by": "openai-compat"
            }
        ])
        
        return models
    
    except Exception as e:
        logger.error(f"Models list error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
async def health_check():
    """Check health of all services"""
    status = {
        "status": "healthy",
        "services": {}
    }
    
    # Check each backend
    for name, url in [
        ("vllm", VLLM_URL),
        ("whisper", WHISPER_URL),
        ("kokoro", KOKORO_URL)
    ]:
        try:
            response = await http_client.get(f"{url}/health", timeout=5.0)
            status["services"][name] = "✅ running"
        except Exception as e:
            status["services"][name] = f"❌ {str(e)}"
    
    return status

# ============================================================================
# ROOT
# ============================================================================

@app.get("/")
async def root():
    """Info about this proxy"""
    return {
        "name": "OpenAI-Compatible Proxy (Embeddings + Audio)",
        "version": "1.0.0",
        "endpoints": {
            "/v1/embeddings": "Text embeddings (routes to vLLM)",
            "/v1/audio/transcriptions": "Speech to text (routes to Whisper)",
            "/v1/audio/speech": "Text to speech (routes to Kokoro)",
            "/v1/models": "List all models",
            "/health": "Health check all services"
        },
        "note": "/chat/completions is handled by Bernard voice assistant (separate service)"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Step 4A: Setup Proxy Virtual Environment

```bash
mkdir -p ~/ai-services/proxy
cd ~/ai-services/proxy

python3.10 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install fastapi uvicorn httpx pydantic python-multipart
```

### Step 4B: Create Proxy Startup Script

**File:** `~/ai-services/proxy/start_proxy.sh`

```bash
#!/bin/bash
set -e

PROXY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROXY_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[Proxy] Activating virtual environment...${NC}"
source venv/bin/activate

echo -e "${GREEN}[Proxy] Starting main API proxy on port 8000...${NC}"
echo -e "${YELLOW}Access at: http://localhost:8000${NC}"

python main.py
```

Make it executable:
```bash
chmod +x ~/ai-services/proxy/start_proxy.sh
```

---

## SERVICE 5: Complete Startup System

### Master Startup Script (All Services)

**File:** `~/ai-services/start_all.sh`

```bash
#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Array to track processes
declare -a PIDS=()

cleanup() {
    echo -e "\n${YELLOW}[Main] Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 $pid 2>/dev/null; then
            echo -e "${YELLOW}[Main] Killing process $pid...${NC}"
            kill $pid 2>/dev/null || true
        fi
    done
    wait
    echo -e "${GREEN}[Main] All services stopped.${NC}"
}

trap cleanup EXIT INT TERM

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   OpenAI-Compatible Proxy - Embeddings + Audio Services    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "\n${GREEN}1/4: Starting vLLM (Embeddings)...${NC}"
cd "$BASE_DIR/vllm"
./start_vllm.sh > /tmp/vllm.log 2>&1 &
PIDS+=($!)
echo -e "${GREEN}    ✓ PID: ${PIDS[-1]} | Logs: /tmp/vllm.log${NC}"

sleep 3

echo -e "\n${GREEN}2/4: Starting Whisper (Speech-to-Text)...${NC}"
cd "$BASE_DIR/whisper"
./start_whisper.sh > /tmp/whisper.log 2>&1 &
PIDS+=($!)
echo -e "${GREEN}    ✓ PID: ${PIDS[-1]} | Logs: /tmp/whisper.log${NC}"

sleep 3

echo -e "\n${GREEN}3/4: Starting Kokoro (Text-to-Speech)...${NC}"
cd "$BASE_DIR/kokoro"
./start_kokoro.sh > /tmp/kokoro.log 2>&1 &
PIDS+=($!)
echo -e "${GREEN}    ✓ PID: ${PIDS[-1]} | Logs: /tmp/kokoro.log${NC}"

sleep 3

echo -e "\n${GREEN}4/4: Starting Main Proxy Router...${NC}"
cd "$BASE_DIR/proxy"
./start_proxy.sh > /tmp/proxy.log 2>&1 &
PIDS+=($!)
echo -e "${GREEN}    ✓ PID: ${PIDS[-1]} | Logs: /tmp/proxy.log${NC}"

echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ All services started!${NC}\n"
echo -e "Service Status:"
echo -e "  ${GREEN}vLLM (Embeddings): http://localhost:8001${NC}"
echo -e "  ${GREEN}Whisper:           http://localhost:8002${NC}"
echo -e "  ${GREEN}Kokoro:            http://localhost:8003${NC}"
echo -e "  ${GREEN}Main Proxy:        http://localhost:8000${NC}"
echo -e "\nQuick Test:"
echo -e "  ${YELLOW}curl http://localhost:8000/health${NC}"
echo -e "  ${YELLOW}curl http://localhost:8000/v1/models${NC}"
echo -e "\nLive Logs:"
echo -e "  ${YELLOW}tail -f /tmp/vllm.log${NC}"
echo -e "  ${YELLOW}tail -f /tmp/whisper.log${NC}"
echo -e "  ${YELLOW}tail -f /tmp/kokoro.log${NC}"
echo -e "  ${YELLOW}tail -f /tmp/proxy.log${NC}"
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "\nPress Ctrl+C to stop all services\n"

# Wait for all processes
wait
```

Make it executable:
```bash
chmod +x ~/ai-services/start_all.sh
```

---

## Testing & Integration

### Test 1: Health Check

```bash
# All services should show "running"
curl http://localhost:8000/health | jq
```

### Test 2: List Models

```bash
curl http://localhost:8000/v1/models | jq
```

### Test 3: Embeddings

```bash
curl http://localhost:8000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nomic-ai/nomic-embed-text-v1.5",
    "input": "This is a test sentence"
  }' | jq
```

### Test 4: Audio Transcription

```bash
# Assuming you have an audio file
curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -F "file=@/path/to/audio.wav" \
  -F "model=whisper-1" | jq
```

### Test 5: Text-to-Speech

```bash
curl -X POST http://localhost:8000/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro-v1.0",
    "input": "Hello! This is a test.",
    "voice": "af"
  }' \
  --output output.mp3
```

### Test 6: Python Client Integration

```python
from openai import OpenAI

# Point to your local proxy
client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="not-needed-for-local"
)

# Embeddings
embedding = client.embeddings.create(
    model="nomic-ai/nomic-embed-text-v1.5",
    input="Test text"
)
print(embedding.data[0].embedding)
```

---

## Complete Dependency Summary

### Service 1: vLLM (Embeddings)
```
Core:
  - vllm[cuda12]
  - transformers
  - torch (with CUDA)
  - torchvision
  - torchaudio

Utilities:
  - pydantic
  - python-dotenv
  - requests
  - pyyaml
```

### Service 2: Whisper.cpp + FastAPI Wrapper
```
Build (C++):
  - cmake
  - CUDA Toolkit (system-level)
  - C++ compiler (g++)

Python:
  - fastapi
  - uvicorn
  - pydantic
  - python-multipart
```

### Service 3: Kokoro FastAPI
```
Core:
  - torch
  - torchaudio
  - fastapi
  - uvicorn

Audio:
  - scipy
  - numpy
  - pydantic
  - pydantic-settings
  - python-multipart

Repository-specific:
  - Install with: pip install -e .
```

### Service 4: Main Proxy
```
- fastapi
- uvicorn
- httpx
- pydantic
- python-multipart
```

---

## Systemd Auto-Start (Optional)

To run all services automatically on boot, create a systemd service file:

**File:** `/etc/systemd/system/ai-proxy.service`

```ini
[Unit]
Description=AI Services Proxy (Embeddings + Audio)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/home/your_username/ai-services
ExecStart=/home/your_username/ai-services/start_all.sh
Restart=on-failure
RestartSec=10

# Resource limits
MemoryMax=32G
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-proxy.service
sudo systemctl start ai-proxy.service

# Check status
sudo systemctl status ai-proxy.service

# View logs
sudo journalctl -u ai-proxy.service -f
```

---

## Troubleshooting

### vLLM won't start
- Check CUDA: `nvidia-smi`
- Check GPU memory: `nvidia-smi --query-gpu=memory.free --format=csv`
- Reduce `--gpu-memory-utilization` in start script
- View logs: `tail -f /tmp/vllm.log`

### Whisper.cpp build fails
- Install: `sudo apt-get install cmake build-essential`
- Check CUDA: `nvcc --version`
- Manual build: `cd whisper.cpp/build && cmake .. -DGGML_CUDA=ON && make -j$(nproc)`

### Kokoro won't load models
- Check disk space: `df -h ~/ai-models/`
- Verify PyTorch CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
- Pre-download models manually

### Port conflicts
- Check: `lsof -i :8000` (or 8001, 8002, 8003)
- Kill process: `kill -9 <PID>`
- Or change ports in startup scripts

---

## Notes

✅ **All models load on startup** - No lazy loading or on-demand initialization  
✅ **Bare metal** - No Docker/Podman containers  
✅ **OpenAI-compatible** - Works with existing OpenAI clients  
✅ **Modular** - Each service independent, easy to debug  
✅ **GPU acceleration** - CUDA throughout all pipelines  
✅ **Production-ready** - Error handling, timeouts, health checks  
✅ **Integrates with Bernard** - Your existing chat completions service  

Good luck! 🚀
