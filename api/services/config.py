import os

# Base backend service URLs
# These are the internal ports for the individual services
BERNARD_URL = os.getenv("BERNARD_URL", "http://localhost:3000")
VLLM_URL = os.getenv("VLLM_URL", "http://localhost:8001")
WHISPER_URL = os.getenv("WHISPER_URL", "http://localhost:8002")
KOKORO_URL = os.getenv("KOKORO_URL", "http://localhost:8003")

# Proxy settings
PROXY_HOST = os.getenv("PROXY_HOST", "0.0.0.0")
PROXY_PORT = int(os.getenv("PROXY_PORT", "8000"))

# Inference settings
TIMEOUT_SECONDS = float(os.getenv("INFERENCE_TIMEOUT", "300.0"))

