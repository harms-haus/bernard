import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the project root so Turbopack ignores stray lockfiles outside this app.
    root: projectRoot
  }
};

export default nextConfig;



