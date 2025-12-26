#!/bin/bash
set -e

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$BASE_DIR/.." && pwd)"
MODELS_DIR="$ROOT_DIR/models"

echo "-------------------------------------------------------"
echo "Bernard AI Services Installation Script"
echo "-------------------------------------------------------"

# Function to create venv with specific python version if available
create_venv() {
    local venv_path=$1
    echo "Creating virtual environment at $venv_path..."
    if [ -d "$venv_path" ]; then
        rm -rf "$venv_path"
    fi
    
    if command -v python3.11 >/dev/null 2>&1; then
        python3.11 -m venv "$venv_path"
    else
        python3 -m venv "$venv_path"
    fi
}

# 1. Proxy & Whisper Wrapper Environment
echo "Setting up Main Proxy environment..."
create_venv "$BASE_DIR/venv"
source "$BASE_DIR/venv/bin/activate"
pip install --upgrade pip
pip install -r "$BASE_DIR/requirements.txt"
deactivate

# 2. vLLM Environment
echo "Setting up vLLM environment..."
create_venv "$BASE_DIR/vllm_venv"
source "$BASE_DIR/vllm_venv/bin/activate"
pip install --upgrade pip
pip install vllm transformers torch

echo "Downloading nomic-embed-text-v1.5 model..."
export HF_HOME="$MODELS_DIR/huggingface"
mkdir -p "$HF_HOME"
python -c "from transformers import AutoModel; AutoModel.from_pretrained('nomic-ai/nomic-embed-text-v1.5', trust_remote_code=True)"
deactivate

# 3. Whisper.cpp Build & Model Download
echo "Setting up Whisper.cpp..."
WHISPER_DIR="$BASE_DIR/whisper.cpp"
if [ ! -d "$WHISPER_DIR" ]; then
    git clone https://github.com/ggerganov/whisper.cpp "$WHISPER_DIR"
fi

cd "$WHISPER_DIR"
if [ ! -f "build/bin/main" ]; then
    echo "Building Whisper.cpp with CUDA support..."
    mkdir -p build
    cd build
    cmake .. -DGGML_CUDA=ON
    make -j$(nproc)
    cd ..
fi

echo "Downloading Whisper small model..."
mkdir -p "$MODELS_DIR/whisper"
if [ ! -f "$MODELS_DIR/whisper/ggml-small.bin" ]; then
    bash ./models/download-ggml-model.sh small
    mv models/ggml-small.bin "$MODELS_DIR/whisper/"
fi
cd "$BASE_DIR"

# 4. Kokoro TTS Setup
echo "Setting up Kokoro TTS environment..."
KOKORO_DIR="$BASE_DIR/kokoro"
if [ ! -d "$KOKORO_DIR" ]; then
    git clone https://github.com/remsky/Kokoro-FastAPI "$KOKORO_DIR"
fi

create_venv "$KOKORO_DIR/venv"
source "$KOKORO_DIR/venv/bin/activate"
pip install --upgrade pip
cd "$KOKORO_DIR"
pip install -e .
deactivate

echo "-------------------------------------------------------"
echo "Installation complete!"
echo "-------------------------------------------------------"
echo "Run ./api/start.sh to launch all services."
