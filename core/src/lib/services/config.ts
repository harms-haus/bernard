// Service endpoint configurations
export const SERVICES = {
  bernardAgent: {
    name: 'BERNARD_AGENT',
    url: process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024',
    healthPath: '/health',
  },
  bernardUi: {
    name: 'BERNARD_UI',
    url: process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810',
    healthPath: '/health',
  },
  whisper: {
    name: 'WHISPER',
    url: process.env.WHISPER_URL || 'http://127.0.0.1:8870',
    healthPath: '/health',
  },
  kokoro: {
    name: 'KOKORO',
    url: process.env.KOKORO_URL || 'http://127.0.0.1:8880',
    healthPath: '/health',
  },
} as const;

// V1 API route mappings
export const V1_UPSTREAMS = {
  'chat/completions': {
    url: SERVICES.bernardAgent.url,
    path: '/v1/chat/completions',
    streaming: true,
  },
  'audio/transcriptions': {
    url: SERVICES.whisper.url,
    path: '/inference',
    streaming: false,
  },
  'audio/speech': {
    url: SERVICES.kokoro.url,
    path: '/v1/audio/speech',
    streaming: false,
  },
} as const;

// Valid services for log streaming
export const VALID_LOG_SERVICES = [
  'redis',
  'shared',
  'bernard-agent',
  'bernard-ui',
  'whisper',
  'kokoro',
  'core',
] as const;

export type LogService = (typeof VALID_LOG_SERVICES)[number];
