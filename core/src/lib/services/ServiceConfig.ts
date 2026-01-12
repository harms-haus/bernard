export type ServiceType = "docker" | "node" | "python" | "cpp"

export interface ServiceConfig {
  id: string
  name: string
  displayName: string
  port?: number
  type: ServiceType
  directory?: string
  script?: string
  container?: string
  image?: string
  healthPath?: string
  healthCheck?: string
  dependencies: string[]
  startupTimeout: number
  color: string
  env?: Record<string, string>
}

export const SERVICES: Record<string, ServiceConfig> = {
  redis: {
    id: "redis",
    name: "REDIS",
    displayName: "Redis",
    port: 6379,
    type: "docker",
    container: "bernard-redis",
    image: "redis/redis-stack-server:7.4.0-v0",
    healthCheck: "redis-cli ping",
    dependencies: [],
    startupTimeout: 20,
    color: "#ff6b6b",
  },
  core: {
    id: "core",
    name: "CORE",
    displayName: "Core API",
    port: 3456,
    type: "node",
    directory: "core",
    script: "./node_modules/.bin/next dev",
    healthPath: "/api/health",
    dependencies: ["redis"],
    startupTimeout: 30,
    color: "#a29bfe",
  },
  "bernard-agent": {
    id: "bernard-agent",
    name: "BERNARD-AGENT",
    displayName: "Bernard Agent",
    port: 2024,
    type: "node",
    directory: "core",
    script: "./node_modules/.bin/tsx scripts/start-agent.ts",
    healthPath: "/info",
    dependencies: ["redis"],
    startupTimeout: 20,
    color: "#1dd1a1",
  },
  "bernard-ui": {
    id: "bernard-ui",
    name: "BERNARD-UI",
    displayName: "Bernard UI",
    port: 8810,
    type: "node",
    directory: "services/bernard-ui",
    script: "./node_modules/.bin/vite",
    healthPath: "/",
    dependencies: ["redis"],
    startupTimeout: 20,
    color: "#5f27cd",
  },
  whisper: {
    id: "whisper",
    name: "WHISPER",
    displayName: "Whisper STT",
    port: 8870,
    type: "cpp",
    directory: "services/whisper.cpp",
    script: "./build/bin/whisper-server --port 8870 --host 0.0.0.0",
    healthPath: "/health",
    dependencies: [],
    startupTimeout: 30,
    color: "#c8d6e5",
  },
  kokoro: {
    id: "kokoro",
    name: "KOKORO",
    displayName: "Kokoro TTS",
    port: 8880,
    type: "python",
    directory: "services/kokoro",
    script: "PYTHONPATH=services/kokoro:services/kokoro/api ESPEAK_DATA_PATH=/usr/lib/x86_64-linux-gnu/espeak-ng-data MODEL_DIR=src/models VOICES_DIR=src/voices/v1_0 ./.venv/bin/uvicorn api.src.main:app --host 0.0.0.0 --port 8880",
    healthPath: "/health",
    dependencies: [],
    startupTimeout: 30,
    color: "#ff9f43",
  },
} as const

export const SERVICE_START_ORDER = [
  "redis",
  "core",
  "bernard-agent",
  "bernard-ui",
  "whisper",
  "kokoro",
] as const

export type ServiceId = (typeof SERVICES)[keyof typeof SERVICES]["id"]
