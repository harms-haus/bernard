#!/usr/bin/env tsx
/**
 * Development startup script for Bernard Core
 * 
 * This script:
 * 1. Starts all services in dependency order
 * 2. Waits for services to be healthy
 * 3. Starts the Next.js development server
 * 4. Handles graceful shutdown
 */

import { spawn, type ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const CORE_DIR = path.resolve(path.dirname(__filename), '..')
const ROOT_DIR = path.resolve(CORE_DIR, '..')

// ANSI color codes for output
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

interface ServiceInfo {
  name: string
  pid?: number
  process?: ChildProcess
  running: boolean
  healthy: boolean
}

const services: Map<string, ServiceInfo> = new Map()
let nextDevProcess: ChildProcess | null = null
let shuttingDown = false

/**
 * Spawn a process and capture its output
 */
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

  const info: ServiceInfo = {
    name,
    process: spawnedProcess,
    running: true,
    healthy: false,
  }
  services.set(name, info)

  // Handle stdout
  const stdout = readline.createInterface({ input: spawnedProcess.stdout! })
  stdout.on('line', (line) => {
    logService(name, line, color)
  })

  // Handle stderr
  const stderr = readline.createInterface({ input: spawnedProcess.stderr! })
  stderr.on('line', (line) => {
    logService(name, line, 'red')
  })

  // Handle process exit
  spawnedProcess.on('exit', (code: number | null) => {
    info.running = false
    info.pid = undefined
    if (!shuttingDown) {
      logService(name, `Exited with code ${code}`, 'yellow')
    }
  })

  // Handle process error
  spawnedProcess.on('error', (error: Error) => {
    logService(name, `Error: ${error.message}`, 'red')
    info.running = false
  })

  info.pid = spawnedProcess.pid
  return spawnedProcess
}

/**
 * Start a service using the ServiceManager
 */
async function startService(serviceId: string): Promise<boolean> {
  const ServiceManager = await import('../src/lib/services/ServiceManager')
  const manager = new ServiceManager.ServiceManager()

  logService(serviceId, 'Starting service...', 'cyan')

  try {
    const result = await manager.start(serviceId)
    if (result.success) {
      logService(serviceId, 'Service started successfully', 'green')
      return true
    } else {
      logService(serviceId, `Failed to start: ${result.error}`, 'red')
      return false
    }
  } catch (error) {
    logService(serviceId, `Error: ${error}`, 'red')
    return false
  }
}

/**
 * Wait for a service to be healthy
 */
async function waitForHealthy(serviceId: string, timeoutSeconds: number = 60): Promise<boolean> {
  const ServiceManager = await import('../src/lib/services/ServiceManager')
  const manager = new ServiceManager.ServiceManager()

  logService(serviceId, 'Waiting for healthy...', 'yellow')

  const startTime = Date.now()
  while (Date.now() - startTime < timeoutSeconds * 1000) {
    try {
      const status = await manager.getStatus(serviceId)
      if (status && status.health === 'healthy' && status.status === 'running') {
        logService(serviceId, 'Service is healthy', 'green')
        return true
      }
    } catch {
      // Ignore errors during health check
    }
    await sleep(2000)
  }

  logService(serviceId, 'Health check timed out', 'red')
  return false
}

/**
 * Start all dependent services
 */
async function startAllServices(): Promise<boolean> {
  log('\n=== Starting Services ===\n', 'magenta')

  // Import service configuration
  const { SERVICE_START_ORDER } = await import('../src/lib/services/ServiceConfig')

  for (const serviceId of SERVICE_START_ORDER) {
    const success = await startService(serviceId)
    if (success) {
      await waitForHealthy(serviceId, 30)
    } else {
      logService(serviceId, 'Failed to start, continuing...', 'yellow')
    }
  }

  log('\n=== All Services Started ===\n', 'green')
  return true
}

/**
 * Kill any process using a specific port
 */
async function killPortProcess(port: number): Promise<boolean> {
  const { execSync } = await import('node:child_process')
  
  try {
    // Use fuser to kill processes using the port
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    await sleep(500)
    return true
  } catch {}
  return false
}

/**
 * Start the Next.js development server
 */
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

  // Monitor for ready signal
  const rl = readline.createInterface({ input: nextProcess.stdout! })
  rl.on('line', (line) => {
    logService('next', line, 'blue')
    if (line.includes('Ready in') || line.includes('compiled')) {
      log('\n=== Bernard Core is Ready! ===\n', 'green')
      log('Access the dashboard at: http://localhost:3456/status', 'green')
    }
  })

  return nextProcess
}

/**
 * Display service status
 */
function displayStatus() {
  log('\n=== Service Status ===\n', 'magenta')
  
  for (const [id, info] of Array.from(services.entries())) {
    const status = info.running ? (info.healthy ? '🟢 running' : '🟡 starting') : '🔴 stopped'
    const pid = info.pid ? ` (PID: ${info.pid})` : ''
    log(`  ${id.padEnd(12)} ${status}${pid}`)
  }

  console.log()
}

/**
 * Stop all services gracefully
 */
async function stopAllServices(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log('\n=== Stopping Services ===\n', 'magenta')

  // Stop Next.js dev server first
  if (nextDevProcess && !nextDevProcess.killed) {
    logService('next-dev', 'Sending SIGINT...', 'yellow')
    nextDevProcess.kill('SIGINT')
    await sleep(1000)
  }

  // Stop all managed services in reverse order
  const ServiceManager = await import('../src/lib/services/ServiceManager')
  const manager = new ServiceManager.ServiceManager()

  try {
    await manager.stop()
    logService('services', 'All services stopped', 'green')
  } catch (error) {
    logService('services', `Error stopping services: ${error}`, 'red')
  }

  // Kill any remaining processes
  for (const [id, info] of Array.from(services.entries())) {
    if (info.process && !info.process.killed) {
      try {
        info.process.kill('SIGTERM')
        logService(id, 'Process killed', 'yellow')
      } catch {
        // Ignore errors
      }
    }
  }

  log('\n=== Shutdown Complete ===\n', 'green')
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Main entry point
 */
async function main() {
  console.clear()
  log('╔════════════════════════════════════════════════════════╗', 'magenta')
  log('║          Bernard Core Development Server               ║', 'magenta')
  log('╚════════════════════════════════════════════════════════╝', 'magenta')
  console.log()

  try {
    // Check for dependencies
    log('Checking prerequisites...', 'cyan')
    
    // Check if Redis is running
    const redisOk = await checkRedis()
    if (!redisOk) {
      log('Redis is not running. Starting Redis...', 'yellow')
      await startRedisDocker()
    }

    // Start all services
    await startAllServices()

    // Start Next.js dev server
    nextDevProcess = await startNextDev()

    // Handle interrupts
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

    // Keep the process running
    log('\nPress Ctrl+C to stop all services\n', 'cyan')

    // Wait for Next.js to be ready
    await sleep(5000)

    // Display initial status
    displayStatus()

    // Periodically display status
    setInterval(() => {
      if (!shuttingDown) {
        displayStatus()
      }
    }, 30000)

  } catch (error) {
    log(`\nFatal error: ${error}`, 'red')
    await stopAllServices()
    process.exit(1)
  }
}

/**
 * Check if Redis is running
 */
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

/**
 * Start Redis using Docker
 */
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

    // Wait for Redis to be ready
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

// Run the main function
main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
