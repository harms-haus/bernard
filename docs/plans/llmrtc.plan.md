# LLMRTC Integration Plan for Bernard

**Created**: January 23, 2026
**Status**: Draft (Validated - Minor documentation gaps)
**Phase count**: 6

---

## Executive Summary

This plan implements LLMRTC (Real-Time Voice & Vision AI Agent framework) to add WebRTC-based voice conversation capabilities to the Bernard platform. The integration follows existing patterns in the codebase while leveraging LLMRTC's provider-agnostic architecture.

---

## Validation Summary (Added Jan 23, 2026)

**Status**: ✅ MOSTLY VIABLE with minor documentation gaps

### ✅ Verified - Bernard API Endpoints

| Endpoint | Path | Status | Notes |
|-----------|-------|--------|-------|
| Chat Completions | `POST /api/v1/chat/completions` | ✅ EXISTS | Full streaming support, OpenAI-compatible SSE format (core/backend/routes/v1.ts) |
| STT Transcription | `POST /api/v1/audio/transcriptions` | ✅ EXISTS | Proxies to whisper `/inference` endpoint (core/backend/routes/proxy.ts) |
| TTS Speech | `POST /api/v1/audio/speech` | ✅ EXISTS | Proxies to kokoro `/v1/audio/speech` endpoint (core/backend/routes/proxy.ts) |

**Note**: Whisper endpoint uses `/inference` not `/transcriptions` - plan correctly uses `/inference` in provider code.

### ✅ Verified - Redis Settings Structure

Settings system correctly provides (core/src/lib/config/appSettings.ts):
- `settings.services.stt.baseUrl` - For Whisper STT endpoint
- `settings.services.tts.baseUrl` - For Kokoro TTS endpoint
- `settings.services.kokoro.baseUrl` - Direct Kokoro access

**Priority order**: Redis settings → Environment variables → Hardcoded defaults

### ✅ Verified - Service Configuration

ServiceConfig.ts structure (core/src/lib/services/ServiceConfig.ts) supports:
- Adding new services with all required fields
- Extending SERVICE_START_ORDER array
- All configuration options used in plan (id, name, displayName, port, type, directory, script, healthPath, dependencies, startupTimeout, color, env)

### ✅ Verified - LLMRTC Dependencies

**Backend (@llmrtc/llmrtc-backend)**:
- `LLMRTCServer` constructor supports: providers, port, host, systemPrompt
- Provider interfaces (LLMProvider, STTProvider, TTSProvider) match Bernard's needs
- TypeScript types are well-defined

**Web Client (@llmrtc/llmrtc-web-client)**:
- `LLMRTCWebClient` constructor supports: signallingUrl, iceServers, reconnection config
- Event handlers match plan expectations (transcript, llmChunk, ttsTrack, stateChange, error)
- Audio/video sharing methods available (shareAudio, shareVideo, shareScreen)

### ⚠️ Documentation Gaps - Need Verification During Implementation

1. **VAD Configuration Options**
   - Plan originally specified: `vad: { enabled, threshold, minSpeechDuration, maxSilenceDuration }`
   - **Status**: Not explicitly documented in LLMRTC GitHub README
   - **Action**: Remove from plan, verify actual options after installing packages

2. **Streaming Configuration Options**
   - Plan originally specified: `streaming: { enabled, chunkSize, flushInterval }`
   - **Status**: Only `streamingTTS: boolean` is documented
   - **Action**: Remove from plan, use only `streamingTTS: true` instead

3. **Health Check Endpoint**
   - Plan specifies: `healthPath: "/health"`
   - **Status**: Not explicitly documented in LLMRTC README
   - **Action**: Keep in plan but add note to verify actual endpoint path during testing

4. **WebSocket Signaling Path**
   - Plan assumes: WebSocket at root path on port 8787
   - **Status**: No explicit documentation on exact WebSocket path
   - **Action**: Standard assumption (likely correct), verify during testing

5. **npm Package Details**
   - **Status**: npmjs.com returned 403 Forbidden - could not verify version info
   - **Action**: Install packages locally to inspect types and verify API

### Recommendations Before Implementation

1. **Install packages and inspect types**:
   ```bash
   cd core
   bun add @llmrtc/llmrtc-backend @llmrtc/llmrtc-web-client
   # Check exported types
   bun -e "import { LLMRTCServer } from '@llmrtc/llmrtc-backend'; console.log(LLMRTCServer)"
   ```

2. **Create minimal test server** to verify:
   - What config options are actually accepted by LLMRTCServer
   - What health endpoint path is exposed
   - What WebSocket path is used
   - Whether VAD/streaming config options exist

3. **Review package TypeScript definitions**:
   ```bash
   cat node_modules/@llmrtc/llmrtc-backend/dist/index.d.ts
   ```

### Adjustments Needed to Plan

**Phase 1.4 - LLMRTC Server Script** (lines 247-269):
- Use only documented config options
- **REMOVE**: `config: { vad: { ... }, streaming: { ... } }` (undocumented)
- **KEEP**: `streamingTTS: true` (documented)

Updated server config should be:
```typescript
const server = new LLMRTCServer({
  port: 8787,
  host: '0.0.0.0',
  providers: {
    llm: bernardLLMProvider,
    stt: bernardSTTProvider,
    tts: bernardTTSProvider,
  },
  streamingTTS: true,  // Documented option
  systemPrompt: 'You are Bernard, a helpful AI assistant...',
});
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser Client (React)                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ /bernard/voice UI Page                         │  │
│  │ - Audio controls (mute, connect, speaker)       │  │
│  │ - Visual feedback (audio visualizer, status)     │  │
│  │ - Session info (connection state, latency)        │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │ WebRTC                        │
└───────────────────────────┼──────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  LLMRTC Server (New Node.js Service)                  │
│  Port: 8787 (WebRTC + Signaling)                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Providers (HTTP calls to :3456)              │  │
│  │ • STT Provider → /api/v1/audio/transcriptions │  │
│  │ • LLM Provider → /api/v1/chat/completions   │  │
│  │ • TTS Provider → /api/v1/audio/speech         │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                                 │
└───────────────────────────┼─────────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Core API Gateway (:3456)                             │
│  - Proxies STT requests to Whisper (:8870)          │
│  - Proxies LLM requests to Bernard Agent (:2024)     │
│  - Proxies TTS requests to Kokoro (:8880)           │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend Infrastructure (LLMRTC Server)

**Objective**: Create LLMRTC backend service that bridges WebRTC to existing HTTP endpoints.

### 1.1 Install Dependencies

```bash
cd core
bun add @llmrtc/llmrtc-backend
```

### 1.2 Create LLMRTC Service Configuration

**File**: `core/src/lib/services/ServiceConfig.ts`

Add new service entry:

```typescript
llmrtc: {
  id: "llmrtc",
  name: "LLMRTC",
  displayName: "LLMRTC Voice Server",
  port: 8787,
  type: "node",
  directory: "core",
  script: "bun run scripts/start-llmrtc.ts",
  healthPath: "/health",
  dependencies: ["redis", "core"],
  startupTimeout: 30,
  color: "#8b5cf6",
}
```

### 1.3 Create Provider Implementations

**File**: `core/src/lib/llmrtc/providers.ts`

Implement three providers that call existing endpoints:

```typescript
import type { LLMProvider, STTProvider, TTSProvider } from '@llmrtc/llmrtc-core';

const API_BASE_URL = process.env.VITE_APP_URL || 'http://localhost:3456';

// STT Provider - Calls Whisper via Core API
export const bernardSTTProvider: STTProvider = {
  name: 'whisper',
  transcribe: async (audioBuffer: ArrayBuffer) => {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }));
    formData.append('model', 'base');

    const response = await fetch(`${API_BASE_URL}/api/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    return result.text;
  },
};

// LLM Provider - Calls Bernard Agent via Core API
export const bernardLLMProvider: LLMProvider = {
  name: 'bernard',
  chat: async (messages) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: false,
      }),
    });

    const result = await response.json();
    return result.choices[0]?.message?.content || '';
  },

  chatStream: async function* (messages) {
    const response = await fetch(`${API_BASE_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: true,
      }),
    });

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

// TTS Provider - Calls Kokoro via Core API
export const bernardTTSProvider: TTSProvider = {
  name: 'kokoro',
  synthesize: async (text) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: 'default',
        speed: 1.0,
      }),
    });

    return await response.arrayBuffer();
  },

  synthesizeStream: async function* (text) {
    const response = await fetch(`${API_BASE_URL}/api/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: 'default',
        stream: true,
      }),
    });

    const reader = response.body?.getReader();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  },
};
```

### 1.4 Create LLMRTC Server Script

**File**: `core/src/scripts/start-llmrtc.ts`

```typescript
#!/usr/bin/env bun
import { LLMRTCServer } from '@llmrtc/llmrtc-backend';
import {
  bernardLLMProvider,
  bernardSTTProvider,
  bernardTTSProvider,
} from '@/lib/llmrtc/providers';

const server = new LLMRTCServer({
  port: 8787,
  host: '0.0.0.0',
  providers: {
    llm: bernardLLMProvider,
    stt: bernardSTTProvider,
    tts: bernardTTSProvider,
  },
  config: {
    vad: {
      enabled: true,
      threshold: 0.5,
      minSpeechDuration: 200,
      maxSilenceDuration: 500,
    },
    streaming: {
      enabled: true,
      chunkSize: 1024,
      flushInterval: 100,
    },
  },
  systemPrompt: 'You are Bernard, a helpful AI assistant. You speak naturally and respond in plain text without markdown or emojis, as your responses will be spoken aloud.',
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[LLMRTC] Shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[LLMRTC] Interrupt received. Shutting down...');
  await server.stop();
  process.exit(0);
});

console.log('✅ LLMRTC server starting on port 8787...');
await server.start();
console.log('✅ LLMRTC server running on port 8787');
```

### 1.5 Update Service Startup Order

**File**: `core/src/lib/services/ServiceConfig.ts`

```typescript
export const SERVICE_START_ORDER = [
  "redis",
  "core",
  "bernard-agent",
  "whisper",
  "kokoro",
  "llmrtc",  // Add LLMRTC after core
] as const
```

---

## Phase 2: Frontend UI Components

**Objective**: Create a voice interaction UI page at `/bernard/voice`.

### 2.1 Install Frontend Dependencies

```bash
cd core
bun add @llmrtc/llmrtc-web-client
```

### 2.2 Create Voice Page Component

**File**: `core/src/pages/Voice.tsx`

```typescript
"use client";

import { useState, useEffect, useRef } from 'react';
import { LLMRTCWebClient } from '@llmrtc/llmrtc-web-client';
import { useAuth } from '@/hooks/useAuth';
import { Mic, MicOff, Volume2, VolumeX, RotateCcw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useDynamicHeader } from '@/components/dynamic-header';

const CLIENT_URL = (import.meta.env.VITE_APP_URL || 'http://localhost:3456').replace(/\/$/, '');
const LLMRTC_WS_URL = CLIENT_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/llmrtc/ws';

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  latency?: number;
}

export function Voice() {
  const { state: authState } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'disconnected' });
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [volume, setVolume] = useState(1);
  const clientRef = useRef<LLMRTCWebClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const { setTitle, setSubtitle } = useDynamicHeader();

  useEffect(() => {
    setTitle('Voice Assistant');
    setSubtitle('Real-time voice conversation');
  }, [setTitle, setSubtitle]);

  // Initialize LLMRTC client
  useEffect(() => {
    const client = new LLMRTCWebClient({
      signallingUrl: LLMRTC_WS_URL,
      autoReconnect: true,
    });

    client.on('connected', () => {
      setConnectionState({ status: 'connected' });
    });

    client.on('disconnected', () => {
      setConnectionState({ status: 'disconnected' });
      setIsListening(false);
    });

    client.on('stateChange', (state) => {
      setConnectionState({ status: state as ConnectionState['status'] });
    });

    client.on('transcript', (text) => {
      setTranscript(text);
    });

    client.on('llmChunk', (chunk) => {
      setResponse(prev => prev + chunk);
    });

    client.on('ttsTrack', (stream) => {
      // Audio will be played automatically via WebRTC
    });

    client.on('error', (err) => {
      console.error('[LLMRTC] Error:', err);
      setConnectionState({ status: 'failed' });
    });

    clientRef.current = client;

    return () => {
      client.close();
    };
  }, []);

  // Connect to LLMRTC server
  const connect = async () => {
    if (!clientRef.current) return;
    setConnectionState({ status: 'connecting' });
    try {
      await clientRef.current.connect();
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupAudioVisualizer(stream);
      await clientRef.current.shareAudio(stream);
      setIsListening(true);
    } catch (error) {
      console.error('[Voice] Failed to connect:', error);
      setConnectionState({ status: 'failed' });
    }
  };

  // Disconnect from LLMRTC server
  const disconnect = async () => {
    if (!clientRef.current) return;
    setIsListening(false);
    await clientRef.current.stopListening();
    clientRef.current.close();
    setConnectionState({ status: 'disconnected' });
    setTranscript('');
    setResponse('');
  };

  // Toggle microphone
  const toggleMic = async () => {
    if (isListening) {
      await clientRef.current?.stopListening();
      setIsListening(false);
    } else {
      await clientRef.current?.startListening();
      setIsListening(true);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    // Adjust audio volume based on mute state
    setVolume(isMuted ? 1 : 0);
  };

  // Setup audio visualizer
  const setupAudioVisualizer = (stream: MediaStream) => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    source.connect(analyser);
  };

  // Get status icon and color
  const getStatusDisplay = () => {
    switch (connectionState.status) {
      case 'connected':
        return { icon: CheckCircle2, color: 'text-green-500', label: 'Connected' };
      case 'connecting':
        return { icon: Loader2, color: 'text-yellow-500', label: 'Connecting...' };
      case 'reconnecting':
        return { icon: RotateCcw, color: 'text-yellow-500', label: 'Reconnecting...' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-500', label: 'Connection Failed' };
      default:
        return { icon: XCircle, color: 'text-gray-500', label: 'Disconnected' };
    }
  };

  const status = getStatusDisplay();
  const StatusIcon = status.icon;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-4xl w-full">
          {/* Connection Status */}
          <div className="mb-8 text-center">
            <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-lg ${status.color} bg-slate-800`}>
              <StatusIcon className="w-6 h-6" />
              <span className="font-semibold">{status.label}</span>
            </div>
          </div>

          {/* Audio Visualizer */}
          {connectionState.status === 'connected' && (
            <div className="mb-8 h-24 bg-slate-800 rounded-lg overflow-hidden">
              <div className="h-full flex items-end justify-center gap-1 px-4">
                {/* Visualizer bars would go here */}
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2 bg-blue-500 rounded-full transition-all duration-75"
                    style={{ height: `${Math.random() * 80 + 20}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Transcript Display */}
          {transcript && (
            <div className="mb-8 p-6 bg-slate-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">👤</span>
                </div>
                <div className="flex-1">
                  <p className="text-slate-300 text-sm mb-1">You said:</p>
                  <p className="text-slate-100 text-lg">{transcript}</p>
                </div>
              </div>
            </div>
          )}

          {/* Response Display */}
          {response && (
            <div className="mb-8 p-6 bg-slate-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🤖</span>
                </div>
                <div className="flex-1">
                  <p className="text-slate-300 text-sm mb-1">Bernard says:</p>
                  <p className="text-slate-100 text-lg">{response}</p>
                </div>
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-4">
            {connectionState.status === 'disconnected' || connectionState.status === 'failed' ? (
              <button
                onClick={connect}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Mic className="w-6 h-6" />
                <span>Connect Microphone</span>
              </button>
            ) : (
              <>
                {/* Toggle Mic */}
                <button
                  onClick={toggleMic}
                  disabled={connectionState.status !== 'connected'}
                  className={`p-4 rounded-full transition-colors ${
                    isListening
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                  disabled={connectionState.status !== 'connected'}
                >
                  {isListening ? <Mic className="w-8 h-8 text-white" /> : <MicOff className="w-8 h-8 text-white" />}
                </button>

                {/* Mute/Unmute */}
                <button
                  onClick={toggleMute}
                  className="p-4 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-8 h-8 text-white" /> : <Volume2 className="w-8 h-8 text-white" />}
                </button>

                {/* Disconnect */}
                <button
                  onClick={disconnect}
                  className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
                >
                  <XCircle className="w-8 h-8 text-white" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 2.3 Update App Routing

**File**: `core/src/App.tsx`

Add import and route:

```typescript
// Add import with other imports
import { Voice } from './pages/Voice';

// In Routes, within BernardLayout:
<Route element={<BernardLayout />}>
  <Route path="/bernard" element={<Home />} />
  <Route path="/bernard/voice" element={<Voice />} />  {/* Add this */}
  <Route element={<ChatLayout />}>
    <Route path="/bernard/chat" element={<Chat />} />
  </Route>
  {/* ... other routes */}
</Route>
```

### 2.4 Update Home Page Navigation

**File**: `core/src/pages/Home.tsx`

Add voice chat card/link to navigation.

---

## Phase 3: Backend API Proxy

**Objective**: Create WebSocket proxy endpoint for LLMRTC signaling through Core API.

### 3.1 Create WebSocket Proxy

**File**: `core/src/services/llmrtc-ws.ts`

```typescript
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/deno';

const app = new Hono();

// Proxy WebSocket connections to LLMRTC server
app.get('/llmrtc/ws', upgradeWebSocket(async (c) => {
  const ws = c.req.url;
  const llmrtcWsUrl = 'ws://localhost:8787';

  return fetch(llmrtcWsUrl + ws.search, {
    headers: c.req.header,
  });
}));

export { app as llmrtcWsHandler };
```

### 3.2 Integrate WebSocket Proxy

**File**: `core/src/backend/server.ts` (or wherever Hono app is configured)

```typescript
import { llmrtcWsHandler } from '@/services/llmrtc-ws';

// Mount WebSocket proxy
app.route('/llmrtc/ws', llmrtcWsHandler);
```

---

## Phase 4: Service Management

**Objective**: Add LLMRTC service to admin panel for management.

### 4.1 Add LLMRTC to Services Page

**File**: `core/src/pages/Services.tsx`

The services page already displays all services from `SERVICES` config. LLMRTC will appear automatically after adding to `ServiceConfig.ts`.

### 4.2 Add LLMRTC to Service Startup Script

**File**: `root/scripts/start-services.ts` (or equivalent)

Add LLMRTC to service startup sequence.

---

## Phase 5: Configuration & Environment Variables

**Objective**: Make LLMRTC configurable.

### 5.1 Add Environment Variables

**File**: `.env.example`

```bash
# LLMRTC Configuration
LLMRTC_ENABLED=true
LLMRTC_PORT=8787
LLMRTC_HOST=0.0.0.0

# Streaming TTS (documented option)
LLMRTC_STREAMING_TTS=true

# Note: VAD configuration (threshold, minSpeechDuration, etc.) not documented in LLMRTC README.
# Will verify available options after package installation.
```

### 5.2 Update Settings Schema

**File**: `core/src/lib/config/settings.ts`

Add LLMRTC settings section if customization is needed (voice, threshold, etc.).

---

## Phase 6: Testing

**Objective**: Ensure LLMRTC integration works correctly.

### 6.1 Unit Tests

**File**: `core/src/lib/llmrtc/providers.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { bernardSTTProvider, bernardLLMProvider, bernardTTSProvider } from './providers';

describe('LLMRTC Providers', () => {
  describe('STT Provider', () => {
    it('should transcribe audio buffer', async () => {
      // Mock fetch and test
    });
  });

  describe('LLM Provider', () => {
    it('should chat with messages', async () => {
      // Mock fetch and test
    });

    it('should stream chat responses', async () => {
      // Mock fetch and test streaming
    });
  });

  describe('TTS Provider', () => {
    it('should synthesize speech', async () => {
      // Mock fetch and test
    });

    it('should stream speech synthesis', async () => {
      // Mock fetch and test streaming
    });
  });
});
```

### 6.2 Integration Tests

Test end-to-end voice conversation:

1. Start all services (Redis, Core, Bernard Agent, Whisper, Kokoro, LLMRTC)
2. Navigate to `/bernard/voice`
3. Click "Connect Microphone"
4. Grant microphone permission
5. Speak: "Hello Bernard"
6. Verify transcription appears
7. Verify response is generated and spoken
8. Test barge-in (interrupt response)
9. Test mute/unmute
10. Disconnect and reconnect

---

## File Structure Summary

```
core/src/
├── lib/
│   ├── llmrtc/
│   │   ├── providers.ts          # Custom providers for Bernard
│   │   └── providers.test.ts    # Unit tests
│   └── services/
│       └── ServiceConfig.ts      # Add llmrtc service entry
├── scripts/
│   └── start-llmrtc.ts        # LLMRTC server script
├── services/
│   └── llmrtc-ws.ts            # WebSocket proxy
├── pages/
│   └── Voice.tsx                # Voice UI page
├── components/
│   └── voice/
│       ├── AudioVisualizer.tsx    # Optional: Advanced visualizer
│       └── ConnectionStatus.tsx  # Optional: Reusable status component
└── App.tsx                       # Add voice route
```

---

## Key Considerations

### Security
- WebSocket connections should use WSS in production
- Implement authentication for LLMRTC connections (same session as chat)
- Validate STT/LLM/TTS requests in providers

### Performance
- Enable streaming at all layers (STT, LLM, TTS)
- Use appropriate VAD threshold (0.3-0.5 range)
- Consider audio codec negotiation

### Browser Compatibility
- Test on Chrome, Firefox, Safari
- Handle microphone permission denials gracefully
- Provide fallback for browsers without WebRTC support

### Error Handling
- Implement automatic reconnection with exponential backoff
- Display clear error messages to users
- Log errors with context for debugging

### Implementation Notes (Added Jan 23, 2026)
- **VAD Configuration**: Options like `threshold`, `minSpeechDuration`, `maxSilenceDuration` are not documented in LLMRTC README. Only `streamingTTS: boolean` is confirmed. Verify actual VAD config after installation.
- **Streaming Configuration**: Only `streamingTTS` boolean option is documented. Complex streaming config (`chunkSize`, `flushInterval`) may not be supported.
- **Health Endpoint**: Path `/health` is assumed but not explicitly documented. Verify during Phase 1.4 implementation.
- **WebSocket Path**: Assumes root path on port 8787 (standard convention). Verify during testing.
- **Package Installation**: Run `bun add @llmrtc/llmrtc-backend @llmrtc/llmrtc-web-client` before Phase 1 to inspect TypeScript types and verify API.

### Future Enhancements
- Add vision support (camera/screen sharing)
- Implement tool calling through LLMRTC
- Add custom voice selection from Kokoro
- Implement conversation history in voice mode
- Add metrics/monitoring dashboard

---

## Installation Commands

```bash
# Install dependencies
cd core
bun add @llmrtc/llmrtc-backend @llmrtc/llmrtc-web-client

# Run all services including LLMRTC
cd ..
bun run dev

# Start LLMRTC individually
cd core
bun run scripts/start-llmrtc.ts
```

---

## Testing Checklist

- [ ] LLMRTC service starts successfully on port 8787
- [ ] Health check `/health` returns 200 OK
- [ ] Providers successfully call Core API endpoints
- [ ] Voice page loads at `/bernard/voice`
- [ ] Microphone permission request appears
- [ ] Audio visualizer displays input
- [ ] Speech transcribes correctly
- [ ] LLM generates response
- [ ] TTS plays response audio
- [ ] Barge-in (interrupt) works
- [ ] Mute/unmute toggles correctly
- [ ] Reconnection works after network interruption
- [ ] All services appear in admin panel
- [ ] Service can be started/stopped/restarted
- [ ] Tests pass for providers
- [ ] Works on Chrome, Firefox, Safari
- [ ] No console errors in production build

---

## Implementation Notes

This plan provides a comprehensive roadmap for integrating LLMRTC into Bernard while following existing codebase patterns and conventions. The implementation is modular, testable, and maintains separation of concerns between services.

### Integration Benefits

- **Real-time voice**: WebRTC provides sub-second latency compared to HTTP-based audio
- **Barge-in support**: Users can interrupt AI responses naturally
- **Provider-agnostic**: Easy to swap STT/LLM/TTS providers without code changes
- **Streaming pipeline**: Audio flows seamlessly from STT → LLM → TTS with minimal buffering
- **Session resilience**: Automatic reconnection maintains conversation across network issues

### Known Challenges

- **TURN servers required for production**: Users behind NAT/firewalls need TURN for WebRTC
- **WebRTC complexity**: Debugging WebRTC connections requires browser dev tools
- **Audio permissions**: Browsers require user gesture to access microphone
- **Codec negotiation**: Different browsers support different audio codecs

### Resources

- LLMRTC Documentation: https://www.llmrtc.org/
- LLMRTC GitHub: https://github.com/llmrtc/llmrtc
- Integration Guide: `/docs/llmrtc-integration-guide.md`
- TURN Server (free): https://www.metered.ca/tools/openrelay/
