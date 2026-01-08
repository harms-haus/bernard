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
  check?: {
    typeCheck?: string
    lint?: string
    build?: string
  }
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
  shared: {
    id: "shared",
    name: "SHARED",
    displayName: "Shared Library",
    type: "node",
    directory: "lib/shared",
    dependencies: ["redis"],
    startupTimeout: 10,
    color: "#4ecdc4",
  },
  "bernard-api": {
    id: "bernard-api",
    name: "BERNARD-API",
    displayName: "Bernard API",
    port: 8800,
    type: "node",
    directory: "services/bernard-api",
    script: "tsx watch src/index.ts",
    healthPath: "/health",
    dependencies: ["redis"],
    startupTimeout: 20,
    color: "#feca57",
    check: {
      typeCheck: "npm run type-check",
      lint: "npm run lint",
      build: "npm run build",
    },
  },
  "proxy-api": {
    id: "proxy-api",
    name: "PROXY-API",
    displayName: "Proxy API",
    port: 3456,
    type: "node",
    directory: "proxy-api",
    script: "tsx watch src/index.ts",
    healthPath: "/health",
    dependencies: ["bernard-api"],
    startupTimeout: 20,
    color: "#54a0ff",
    check: {
      typeCheck: "npm run type-check",
      lint: "npm run lint",
      build: "npm run build",
    },
  },
  "bernard-agent": {
    id: "bernard-agent",
    name: "BERNARD-AGENT",
    displayName: "Bernard Agent",
    port: 2024,
    type: "node",
    directory: "services/bernard-api",
    script: "npx @langchain/langgraph-cli dev --port 2024 --host 127.0.0.1",
    healthPath: "/info",
    dependencies: ["bernard-api"],
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
    script: "vite",
    healthPath: "/",
    dependencies: ["proxy-api"],
    startupTimeout: 20,
    color: "#5f27cd",
    check: {
      typeCheck: "npm run type-check",
      lint: "npm run lint",
      build: "npm run build",
    },
  },
  vllm: {
    id: "vllm",
    name: "VLLM",
    displayName: "vLLM Embeddings",
    port: 8860,
    type: "python",
    directory: "services/vllm",
    script: "python -m vllm.entrypoints.openai.api_server --model nomic-embed/nomic-embed-text-v1.5 --host 0.0.0.0 --port 8860",
    healthPath: "/health",
    dependencies: [],
    startupTimeout: 120,
    color: "#48dbfb",
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
    script: "python -m kokoro api",
    healthPath: "/health",
    dependencies: [],
    startupTimeout: 30,
    color: "#ff9f43",
  },
} as const

export const SERVICE_START_ORDER = [
  "redis",
  "shared",
  "bernard-api",
  "proxy-api",
  "bernard-agent",
  "bernard-ui",
  "vllm",
  "whisper",
  "kokoro",
] as const

export type ServiceId = (typeof SERVICES)[keyof typeof SERVICES]["id"]
