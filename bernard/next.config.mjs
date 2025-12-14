import path from "node:path";
import { fileURLToPath } from "node:url";

const PROXY_TARGET = process?.env?.PROXY_TARGET || 'http://localhost:4200';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the project root so Turbopack ignores stray lockfiles outside this app.
    root: projectRoot
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
        source: '/:path*',
        destination: `${PROXY_TARGET}/:path*`
      }
    ]
  }
};

export default nextConfig;
