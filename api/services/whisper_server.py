import subprocess
import tempfile
import json
import os
import logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whisper-server")

app = FastAPI(title="Whisper.cpp OpenAI-Compatible Server")

# Base paths - adjusted for the project structure
# We assume whisper.cpp is installed in api/whisper.cpp by the install script
BASE_DIR = Path(__file__).parent.parent.resolve()
WHISPER_DIR = BASE_DIR / "whisper.cpp"
WHISPER_BINARY = WHISPER_DIR / "build" / "bin" / "main"
WHISPER_MODEL_DIR = BASE_DIR.parent / "models" / "whisper"
WHISPER_MODEL = WHISPER_MODEL_DIR / "ggml-small.bin"

# Fallback paths if not found in api/
if not WHISPER_BINARY.exists():
    # Try looking in function-gemma/llama.cpp if built there (some setups share build)
    ALT_WHISPER_BINARY = BASE_DIR.parent / "function-gemma" / "llama.cpp" / "build" / "bin" / "whisper"
    if ALT_WHISPER_BINARY.exists():
        WHISPER_BINARY = ALT_WHISPER_BINARY

@app.get("/health")
async def health():
    if not WHISPER_BINARY.exists():
        return JSONResponse(status_code=503, content={"status": "error", "message": f"Whisper binary not found at {WHISPER_BINARY}"})
    if not WHISPER_MODEL.exists():
        return JSONResponse(status_code=503, content={"status": "error", "message": f"Whisper model not found at {WHISPER_MODEL}"})
    return {"status": "up", "model": str(WHISPER_MODEL)}

@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("whisper-1"),
    language: str = Form(None),
    prompt: str = Form(None),
    response_format: str = Form("json"),
    temperature: float = Form(0.0)
):
    if not WHISPER_BINARY.exists():
        raise HTTPException(status_code=500, detail="Whisper binary not found")

    # Read the uploaded file
    temp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        content = await file.read()
        temp_audio.write(content)
        temp_audio.close()

        # Build command
        # whisper.cpp main args: -m [model] -f [file] -oj (output json)
        cmd = [
            str(WHISPER_BINARY),
            "-m", str(WHISPER_MODEL),
            "-f", temp_audio.name,
            "-oj", # output json to stdout
            "--no-prints" # suppress extra logs
        ]
        
        if language:
            cmd.extend(["-l", language])
        
        logger.info(f"Running whisper command: {' '.join(cmd)}")
        
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode != 0:
            logger.error(f"Whisper process failed: {process.stderr}")
            raise HTTPException(status_code=500, detail=f"Transcription failed: {process.stderr}")

        # Whisper.cpp with -oj outputs JSON. We need to parse it and adapt to OpenAI format
        # Sometimes whisper.cpp outputs a file.json or just to stdout
        # If it outputs to stdout, it might contain the JSON
        try:
            # Look for JSON in stdout
            output_json = json.loads(process.stdout)
            # OpenAI format expects {"text": "..."}
            # Whisper.cpp JSON has {"transcription": [...]}
            text = ""
            if "transcription" in output_json:
                text = " ".join([item.get("text", "") for item in output_json["transcription"]])
            elif "result" in output_json:
                text = output_json.get("text", "")
            else:
                # If stdout is just text
                text = process.stdout.strip()
            
            return {"text": text}
        except json.JSONDecodeError:
            # Fallback if stdout isn't JSON
            return {"text": process.stdout.strip()}

    finally:
        if os.path.exists(temp_audio.name):
            os.remove(temp_audio.name)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)

