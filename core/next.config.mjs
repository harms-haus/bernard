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
    return config
  },
  async rewrites() {
    return [
      // Bernard API proxy - forwards /api/* to bernard-api:8800
      {
        source: '/api/bernard/:path*',
        destination: 'http://127.0.0.1:8800/api/:path*',
      },
      // Bernard UI proxy - forwards /bernard/* to bernard-ui:8810
      {
        source: '/bernard/:path*',
        destination: 'http://127.0.0.1:8810/bernard/:path*',
      },
      // LangGraph SDK routes (proxy to Bernard Agent)
      {
        source: '/threads/:path*',
        destination: 'http://127.0.0.1:2024/threads/:path*',
      },
      {
        source: '/runs/:path*',
        destination: 'http://127.0.0.1:2024/runs/:path*',
      },
      {
        source: '/assistants/:path*',
        destination: 'http://127.0.0.1:2024/assistants/:path*',
      },
      {
        source: '/crons/:path*',
        destination: 'http://127.0.0.1:2024/crons/:path*',
      },
      {
        source: '/store/:path*',
        destination: 'http://127.0.0.1:2024/store/:path*',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/api/v1/:path*',
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
    ];
  },
};

export default nextConfig;
