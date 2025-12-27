# Bernard Project Structure

Bernard is organized into a service-oriented architecture with a tiered structure.

## Directory Map

### `/api` (formerly `/server`)
The primary entry point for the application.
- **Role**: Unified Fastify proxy server.
- **Key Files**: 
  - `src/index.ts`: Server entry point.
  - `.env`: Primary environment configuration for all services.
- **Port**: 3456

### `/services` (formerly `/api`)
Contains the core AI engines and the application components.
- **Sub-services**:
  - `bernard/`: The main Agent application (Next.js).
  - `bernard-ui/`: The React/Vite frontend.
  - `kokoro/`: Text-to-Speech engine (Port 8880).
  - `whisper.cpp/`: Speech-to-Text engine (Port 8002).
  - `vllm_venv/`: Text embedding engine (Port 8001).

### `/lib/shared`
Common code used by multiple components.
- `config/`: Unified settings management (`appSettings.ts`).
- `auth/`: Shared authentication logic and stores.
- `infra/`: Shared infrastructure (Redis, etc.).

### `/scripts/services`
Management scripts for starting, stopping, and checking the status of all components.

## Settings Hierarchy

Application settings are managed by the shared `SettingsManager` and follow this priority:
1. **Redis Value**: Runtime overrides stored in Redis.
2. **Environment Variable**: Loaded from `api/.env` at startup.
3. **Default Value**: Hardcoded defaults in the code.

## Documentation

- [Kokoro TTS Guide](./services/kokoro.md)
- [Whisper STT Guide](./services/whisper.md)
- [vLLM Embedding Guide](./services/vllm.md)
- [Bernard Agent Guide](./services/bernard.md)

