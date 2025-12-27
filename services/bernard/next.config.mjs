import path from "node:path";
import { fileURLToPath } from "node:url";

const PROXY_TARGET = process?.env?.PROXY_TARGET || 'http://localhost:4200';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(projectRoot, "../../");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pino', 'thread-stream'],
  transpilePackages: ['@shared'],
  turbopack: {
    root: workspaceRoot,
    resolveAlias: {
      '@shared': path.resolve(projectRoot, '../../lib/shared'),
    },
  },
  webpack: (config) => {
    config.resolve.alias['@shared'] = path.resolve(projectRoot, '../../lib/shared');
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*'
      },
      {
        source: '/v1/:path*',
        destination: '/api/v1/:path*'
      },
      {
        source: '/_next/:path*',
        destination: '/_next/:path*'
      },
      {
        source: '/bernard/api/:path*',
        destination: '/api/:path*'
      },
      {
        source: '/:path*',
        destination: `${PROXY_TARGET}/:path*`
      }
    ]
  }
};

export default nextConfig;
