# LLMRTC Integration Guide

A focused guide on LLMRTC's core concepts and how to integrate it with your existing OpenAI-compatible endpoint and local services.

## Table of Contents

1. [What LLMRTC Does](#what-llmrtc-does)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Core Concepts](#core-concepts)
5. [Provider Configuration](#provider-configuration)
6. [Runtime & Connection Flow](#runtime--connection-flow)
7. [Debugging & Optimization](#debugging--optimization)

---

## What LLMRTC Does

LLMRTC is a **real-time audio orchestration framework** that handles:

- **WebRTC audio I/O**: Bidirectional audio streaming between client and server
- **VAD (Voice Activity Detection)**: Automatically detect when user starts/stops speaking
- **Streaming coordination**: Route audio chunks to STT, text chunks to LLM, and audio chunks to TTS in real-time
- **Connection lifecycle**: Manage WebRTC connections, reconnection logic, keepalive

**What it does NOT do:**
- Run LLM inference (you provide the endpoint)
- Process audio locally (you provide the STT/TTS endpoints)
- Store conversation history (you manage that in your LLM)

LLMRTC is a **glue layer** that makes real-time bidirectional voice conversations work smoothly without the latency and complexity of managing WebRTC connections manually.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Browser / React Frontend                    │
│         (Microphone + Speaker Access via Browser)        │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ WebRTC Connection
                       │ (Real-time audio stream)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                  LLMRTC Server (Port 8080)               │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ WebRTC Connection Manager                           ││
│  │ - Accepts audio from microphone                     ││
│  │ - Sends audio to speaker                            ││
│  │ - Manages codec negotiation                         ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
│  ┌────────────┬──────────┴─────────┬──────────────────┐ │
│  │            │                    │                  │ │
│  ▼            ▼                    ▼                  ▼ │
│  ┌──────┐  ┌───────┐          ┌────────┐          ┌──┐│
│  │VAD   │→ │STT    │→ LLM →   │TTS     │→ Audio   │  ││
│  │      │  │       │          │        │          │  ││
│  └──────┘  └───────┘          └────────┘          └──┘│
│  (Local)  (Remote)           (Remote)   (Remote)      │
│                                                        │
│  All providers route HTTP requests to :3456/api/v1/   │
└────────────────────┬─────────────────────────────────┘
                     │
                     │ HTTP/JSON
                     ▼
     ┌───────────────────────────────────┐
     │ Your Unified Service Proxy (:3456)│
     │                                   │
     │ POST /api/v1/audio/transcriptions │
     │ POST /api/v1/chat/completions    │
     │ POST /api/v1/audio/speech        │
     └───────────────────────────────────┘
```

**Key insight**: LLMRTC is just the WebRTC server + request router. It converts real-time audio streams into HTTP calls to your existing services.

---

## Installation

### NPM

```bash
npm install @llmrtc/llmrtc-backend @llmrtc/core
```

**Required dependencies** (usually included):
- `ws` for WebSocket signaling
- Native WebRTC bindings (handled by `@llmrtc/llmrtc-backend`)

### Minimal Setup

```bash
npm install dotenv  # For .env file support
```

---

## Core Concepts

### 1. Providers

A **provider** is LLMRTC's abstraction for any service it needs to call. There are three types:

#### STT Provider (Speech-to-Text)
Receives raw audio bytes, returns text transcription.

```typescript
interface STTProvider {
  name: string;
  transcribe(audioBuffer: ArrayBuffer): Promise<string>;
}
```

#### LLM Provider (Language Model)
Receives text messages in OpenAI format, returns text response.

```typescript
interface LLMProvider {
  name: string;
  chat(messages: OpenAIMessage[]): Promise<string>;
  chatStream?(messages: OpenAIMessage[]): AsyncGenerator<string>;
}
```

#### TTS Provider (Text-to-Speech)
Receives text, returns audio bytes (WAV, MP3, etc).

```typescript
interface TTSProvider {
  name: string;
  synthesize(text: string): Promise<ArrayBuffer>;
  synthesizeStream?(text: string): AsyncGenerator<ArrayBuffer>;
}
```

**You implement these by calling your API.**

### 2. VAD (Voice Activity Detection)

VAD tells LLMRTC when to stop listening and send audio to STT. Prevents transcribing silence.

```typescript
config: {
  vad: {
    enabled: true,
    threshold: 0.5,  // 0.0 = always on, 1.0 = very strict
    minSpeechDuration: 200,  // ms of speech required before transcribing
    maxSilenceDuration: 500,  // ms of silence before ending utterance
  }
}
```

**Low threshold** = sensitive, catches quiet speech but may transcribe breath sounds
**High threshold** = conservative, ignores background noise but may miss soft speech

### 3. Streaming

Two types of streaming:

**Request Streaming**: LLM returns text word-by-word as it's generated
- Reduces latency: user hears first word in ~500ms instead of waiting for full response
- TTS can start immediately on first chunk

**Response Streaming**: TTS returns audio chunks as they're synthesized
- Audio plays back smoothly without waiting for full TTS output

Both should be **enabled** for best real-time experience:

```typescript
config: {
  streaming: {
    enabled: true,
    chunkSize: 1024,  // Bytes per chunk
    flushInterval: 100,  // ms between chunks
  }
}
```

---

## Provider Configuration

### STT Provider Example

Your Whisper service at `:3456/api/v1/audio/transcriptions` returns `{ text: "..." }`.

```typescript
const sttProvider = {
  name: 'whisper',
  transcribe: async (audioBuffer: ArrayBuffer) => {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }));
    formData.append('model', 'base');

    const response = await fetch(
      'http://localhost:3456/api/v1/audio/transcriptions',
      {
        method: 'POST',
        body: formData,
      }
    );

    const result = await response.json();
    return result.text;
  },
};
```

**That's it.** LLMRTC calls `transcribe(audioBuffer)` and expects back a string.

### LLM Provider Example

Your LangGraph service at `:3456/api/v1/chat/completions` speaks OpenAI format.

```typescript
const llmProvider = {
  name: 'langgraph',
  chat: async (messages) => {
    const response = await fetch(
      'http://localhost:3456/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          stream: false,
        }),
      }
    );

    const result = await response.json();
    return result.choices[0]?.message?.content || '';
  },

  chatStream: async function* (messages) {
    const response = await fetch(
      'http://localhost:3456/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          stream: true,
        }),
      }
    );

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  },
};
```

**Key points:**
- `chat()` is synchronous - waits for full response
- `chatStream()` is async generator - yields chunks as they arrive
- Both receive OpenAI-format `messages: [{ role, content }]`
- Both return text (streaming returns text chunks, not tokens)

### TTS Provider Example

Your Kokoro service at `:3456/api/v1/audio/speech` returns WAV audio bytes.

```typescript
const ttsProvider = {
  name: 'kokoro',
  synthesize: async (text) => {
    const response = await fetch(
      'http://localhost:3456/api/v1/audio/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: 'default',  // Your config
          speed: 1.0,
        }),
      }
    );

    return await response.arrayBuffer();
  },

  synthesizeStream: async function* (text) {
    const response = await fetch(
      'http://localhost:3456/api/v1/audio/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: 'default',
          stream: true,
        }),
      }
    );

    const reader = response.body?.getReader();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;  // Yield audio chunks
    }
  },
};
```

**Key points:**
- `synthesize()` returns full audio as `ArrayBuffer`
- `synthesizeStream()` yields audio chunks as they're generated
- Both receive plain text string, not messages
- Streaming is important here—audio can start playing immediately

---

## Runtime & Connection Flow

### Initialization

```typescript
import { LLMRTCServer } from '@llmrtc/llmrtc-backend';

const server = new LLMRTCServer({
  port: 8080,
  host: '0.0.0.0',
  providers: {
    llm: llmProvider,
    stt: sttProvider,
    tts: ttsProvider,
  },
  config: {
    vad: {
      enabled: true,
      threshold: 0.5,
    },
    streaming: {
      enabled: true,
      chunkSize: 1024,
    },
  },
});

await server.start();
console.log('✅ LLMRTC running on port 8080');
```

### Client Connection (Browser)

```typescript
import { LLMRTCClient } from '@llmrtc/llmrtc-client';

const client = new LLMRTCClient({
  serverUrl: 'ws://localhost:8080',  // WebSocket URL
  autoReconnect: true,
});

// Events
client.on('connected', () => console.log('🟢 Connected'));
client.on('disconnected', () => console.log('🔴 Disconnected'));
client.on('message', (msg) => console.log('Message:', msg));
client.on('error', (err) => console.error('Error:', err));

await client.connect();

// Start listening
await client.startListening();

// Stop listening
await client.stopListening();
```

### Message Flow (What Happens Behind Scenes)

1. **User speaks** → Microphone captures audio → Sent to LLMRTC via WebRTC
2. **VAD detects speech** → Audio buffered locally on server
3. **VAD detects silence** → Buffered audio sent to STT provider
4. **STT returns text** → Text sent to LLM provider as new user message
5. **LLM returns text** → Response text sent to TTS provider (or streamed chunk-by-chunk)
6. **TTS returns audio** → Audio sent back to browser via WebRTC
7. **User hears response** → Audio played through speaker

**All of this happens with minimal latency** because:
- Audio is streamed (not buffered)
- LLM response is streamed (not waiting for full output)
- TTS audio is streamed (audio starts playing before synthesis is complete)

---

## Debugging & Optimization

### Test Each Provider Independently

Before integrating with LLMRTC, test your providers individually:

```bash
# Test STT
curl -X POST http://localhost:3456/api/v1/audio/transcriptions \
  -F "file=@audio.wav" \
  -F "model=base"

# Test LLM
curl -X POST http://localhost:3456/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "hello"}]}'

# Test TTS
curl -X POST http://localhost:3456/api/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"text": "hello world"}' \
  --output output.wav
ffplay output.wav
```

If any of these fail, LLMRTC can't work—fix the underlying service first.

### Measure Latency

The **end-to-end latency** is the sum of:
- STT latency (how long Whisper takes to transcribe)
- Network latency (API call round-trip)
- LLM latency (how long until first token)
- Network latency (streaming response chunks)
- TTS latency (how long until first audio chunk)
- Network latency (streaming audio)

**Most latency comes from STT and LLM**, not LLMRTC itself.

```bash
# Profile each service
time curl -X POST http://localhost:3456/api/v1/audio/transcriptions ...
time curl -X POST http://localhost:3456/api/v1/chat/completions ...
time curl -X POST http://localhost:3456/api/v1/audio/speech ...
```

### Common Issues

#### Transcription is slow (>3 seconds)

**Cause**: Whisper model too large
```bash
# Check which model you're running
# base = 140MB (~1-2s for 10s audio)
# small = 244MB (~3-5s)
# medium = 769MB (~10-15s)
# large = 2.9GB (~20-30s)

# Solution: Switch to smaller model in your proxy config
```

#### First token latency is high (>2s)

**Cause**: LLM model too large or not using GPU
```bash
# Check if your LLM is using GPU
# Ask your LLM provider or check system memory/GPU usage while running

# Solution: Use quantized model or smaller model
ollama pull mistral:7b-instruct-q4_K_M  # Quantized is ~2x faster
```

#### Audio sounds choppy or cuts off

**Cause 1**: Streaming is disabled
```typescript
// Make sure this is true:
streaming: {
  enabled: true,  // ← Check this
}
```

**Cause 2**: TTS provider not implementing `synthesizeStream()`
```typescript
// Ensure your TTS provider has:
synthesizeStream: async function* (text) {
  // yields audio chunks
}
```

**Cause 3**: Network latency
```bash
# Test latency to your API proxy
ping localhost  # Should be <1ms
time curl http://localhost:3456/api/v1/health
```

#### Client disconnects randomly

**Cause**: No keepalive/heartbeat

**Solution**: Add to your client code:
```typescript
setInterval(() => {
  if (client.isConnected()) {
    client.ping();
  }
}, 30000);  // Every 30 seconds
```

#### VAD not triggering (no STT call)

**Cause**: Threshold too high
```typescript
config: {
  vad: {
    threshold: 0.5,  // Try lowering to 0.3
  }
}
```

**Cause 2**: Audio level too quiet
```typescript
config: {
  vad: {
    threshold: 0.5,
    minSpeechDuration: 100,  // Lower this to catch quick speech
  }
}
```

Test by enabling debug logging (check LLMRTC docs for logging configuration).

### Optimization Checklist

- [ ] STT latency < 2s (use `base` or `small` model)
- [ ] LLM first-token latency < 500ms (use quantized model, enable streaming)
- [ ] TTS streaming enabled (implement `synthesizeStream()`)
- [ ] LLM streaming enabled (implement `chatStream()`)
- [ ] VAD configured appropriately for your use case
- [ ] Client has keepalive/heartbeat
- [ ] Each provider tested independently before integration
- [ ] Tested with full end-to-end conversation (5+ turns)

---

## Key Takeaways

**LLMRTC is a framework, not a product.**

- You provide the providers (HTTP calls to your endpoints)
- LLMRTC orchestrates the real-time audio flow
- Streaming at every layer (STT, LLM, TTS) is critical for low latency
- Test providers independently first
- Latency is mostly from your services, not LLMRTC

**Integration is straightforward**: 
1. Implement three provider objects (STT, LLM, TTS)
2. Each provider makes an HTTP call to your API
3. Pass providers to `LLMRTCServer`
4. Connect client via WebSocket

The framework handles WebRTC, audio codec negotiation, VAD, buffering, and connection lifecycle. You just write the HTTP bridge code.

---

**Last Updated**: January 23, 2026
