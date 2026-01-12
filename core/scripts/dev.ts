#!/usr/bin/env tsx
/**
 * Development startup script for Bernard Core
 *
 * This script:
 * 1. Starts Redis (required for queue)
 * 2. Starts Next.js development server
 * 3. Other services are started via queue when requested through API
 * 4. Handles graceful shutdown
 */

import { spawn, type ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const CORE_DIR = path.resolve(path.dirname(__filename), '..')
const ROOT_DIR = path.resolve(CORE_DIR, '..')

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

function log(message: string, color: keyof typeof colors = 'white') {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
  console.log(`${colors.cyan}[${timestamp}]${colors.reset} ${colors[color]}${message}${colors.reset}`)
}

function logService(service: string, message: string, color: keyof typeof colors = 'white') {
  log(`[${service.padEnd(12)}] ${message}`, color)
}

let nextDevProcess: ChildProcess | null = null
let utilityWorkerProcess: ChildProcess | null = null
let shuttingDown = false

function spawnProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    name: string
    color?: keyof typeof colors
  }
): ChildProcess {
  const { cwd = CORE_DIR, env = process.env, name, color = 'white' } = options
  const currentProcessEnv = process.env

  logService(name, `Starting: ${command} ${args.join(' ')}`, color)

  const spawnedProcess = spawn(command, args, {
    cwd,
    env: { ...currentProcessEnv, FORCE_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const stdout = readline.createInterface({ input: spawnedProcess.stdout! })
  stdout.on('line', (line) => {
    logService(name, line, color)
  })

  const stderr = readline.createInterface({ input: spawnedProcess.stderr! })
  stderr.on('line', (line) => {
    logService(name, line, 'red')
  })

  spawnedProcess.on('exit', (code: number | null) => {
    if (!shuttingDown) {
      logService(name, `Exited with code ${code}`, 'yellow')
    }
  })

  spawnedProcess.on('error', (error: Error) => {
    logService(name, `Error: ${error.message}`, 'red')
  })

  return spawnedProcess
}

async function killPortProcess(port: number): Promise<boolean> {
  const { execSync } = await import('node:child_process')

  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    await sleep(500)
    return true
  } catch {}
  return false
}

async function startNextDev(): Promise<ChildProcess> {
  log('\n=== Starting Next.js Dev Server ===\n', 'magenta')

  await killPortProcess(3456)

  const nextProcess = spawnProcess('npm', ['run', 'dev:core'], {
    cwd: CORE_DIR,
    name: 'next-dev',
    color: 'blue',
    env: {
      ...process.env,
      PORT: process.env.CORE_PORT || '3456',
      HOST: process.env.HOST || '0.0.0.0',
    },
  })

  const rl = readline.createInterface({ input: nextProcess.stdout! })
  rl.on('line', (line) => {
    logService('next', line, 'blue')
    if (line.includes('Ready in') || line.includes('compiled')) {
      log('\n=== Bernard Core is Ready! ===\n', 'green')
      log('Access dashboard to manage services: http://localhost:3456', 'green')
      log('Services are queued for background execution', 'cyan')
    }
  })

  return nextProcess
}

async function startUtilityWorker(): Promise<ChildProcess> {
  log('\n=== Starting Utility Queue Worker ===\n', 'magenta')

  const workerProcess = spawnProcess('npx', ['tsx', 'scripts/worker.ts'], {
    cwd: CORE_DIR,
    name: 'utility-worker',
    color: 'yellow',
    env: {
      ...process.env,
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    },
  })

  return workerProcess
}

async function stopAllServices(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log('\n=== Stopping Services ===\n', 'magenta')

  if (utilityWorkerProcess && !utilityWorkerProcess.killed) {
    logService('utility-worker', 'Sending SIGINT...', 'yellow')
    utilityWorkerProcess.kill('SIGINT')
    await sleep(1000)
  }

  if (nextDevProcess && !nextDevProcess.killed) {
    logService('next-dev', 'Sending SIGINT...', 'yellow')
    nextDevProcess.kill('SIGINT')
    await sleep(1000)
  }

  log('\n=== Shutdown Complete ===\n', 'green')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.clear()
  log('╔════════════════════════════════════════════════════╗', 'magenta')
  log('║          Bernard Core Development Server               ║', 'magenta')
  log('╚════════════════════════════════════════════════════╝', 'magenta')
  console.log()

  try {
    log('Checking prerequisites...', 'cyan')

    const redisOk = await checkRedis()
    if (!redisOk) {
      log('Redis is not running. Starting Redis...', 'yellow')
      await startRedisDocker()
    } else {
      log('Redis is already running', 'green')
    }

    log('\n=== Service Queue Architecture ===', 'magenta')
    log('Services are now managed via queue', 'cyan')
    log('Access dashboard to start services: http://localhost:3456', 'green')

    log('\n=== Starting Utility Queue Worker ===\n', 'magenta')
    utilityWorkerProcess = await startUtilityWorker()

    log('\n=== Starting Next.js Dev Server ===\n', 'magenta')

    nextDevProcess = await startNextDev()

    process.on('SIGINT', async () => {
      log('\nReceived SIGINT (Ctrl+C)', 'yellow')
      await stopAllServices()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      log('\nReceived SIGTERM', 'yellow')
      await stopAllServices()
      process.exit(0)
    })

    log('\nPress Ctrl+C to stop\n', 'cyan')

    await sleep(5000)

  } catch (error) {
    log(`\nFatal error: ${error}`, 'red')
    await stopAllServices()
    process.exit(1)
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process')
    execSync('docker inspect -f "{{.State.Running}}" bernard-redis 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

async function startRedisDocker(): Promise<void> {
  const { execSync } = await import('node:child_process')

  log('Starting Redis container...', 'cyan')

  try {
    execSync(
      'docker run -d --name bernard-redis -p 6379:6379 --restart unless-stopped -v bernard-redis-data:/data docker.io/redis/redis-stack-server:7.4.0-v0',
      {
        encoding: 'utf-8',
        stdio: 'inherit',
      }
    )

    log('Waiting for Redis to be ready...', 'yellow')
    let attempts = 0
    while (attempts < 30) {
      try {
        execSync('docker exec bernard-redis redis-cli ping', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        log('Redis is ready!', 'green')
        return
      } catch {
        await sleep(1000)
        attempts++
      }
    }
    throw new Error('Redis health check failed')
  } catch (error) {
    log(`Failed to start Redis: ${error}`, 'red')
    throw error
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
