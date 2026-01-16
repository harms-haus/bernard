/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Enable Node.js externals for server-side rendering
      config.externalsPresets = { node: true };
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
    }
    // Suppress critical dependency warning from langchain/chat_models/universal
    // which uses dynamic require() internally
    config.module.exprContextCritical = false;
    return config
  },
  async rewrites() {
    return [
      // API routes - serve directly from core (no proxy needed)
      {
        source: '/api/settings/:path*',
        destination: '/api/settings/:path*',
      },
      // LangGraph SDK routes (proxy to Bernard Agent via /api/*)
      {
        source: '/api/threads/:path*',
        destination: 'http://127.0.0.1:2024/threads/:path*',
      },
      {
        source: '/api/runs/:path*',
        destination: 'http://127.0.0.1:2024/runs/:path*',
      },
      {
        source: '/api/assistants/:path*',
        destination: 'http://127.0.0.1:2024/assistants/:path*',
      },
      {
        source: '/api/v1/audio/transcriptions',
        destination: 'http://127.0.0.1:8870/inference',
      },
      {
        source: '/api/v1/audio/speech',
        destination: 'http://127.0.0.1:8880/v1/audio/speech',
      },
      {
        source: '/api/store/:path*',
        destination: 'http://127.0.0.1:2024/store/:path*',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/api/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-api-key' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
      {
        source: '/api/langchain/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
      {
        source: '/api/logs/stream',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
      // LangGraph SDK routes that use streaming
      {
        source: '/api/threads/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
      {
        source: '/api/runs/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ];
  },
};

export default nextConfig;
