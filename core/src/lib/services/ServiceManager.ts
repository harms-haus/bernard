import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProcessManager } from '@/lib/services/ProcessManager';
import { HealthChecker, HealthStatus } from '@/lib/services/HealthChecker';
import {
  ServiceConfig,
  SERVICES,
  SERVICE_START_ORDER,
} from '@/lib/services/ServiceConfig';

export type ServiceStatusType = "running" | "stopped" | "starting" | "failed"

export interface ServiceStatus {
  id: string
  name: string
  port?: number
  status: ServiceStatusType
  uptime?: number
  lastStarted?: Date
  lastStopped?: Date
  health: "healthy" | "unhealthy" | "unknown"
  color: string
}

export interface CheckResult {
  service?: string
  passed: boolean
  details?: {
    typeCheck?: boolean
    lint?: boolean
    build?: boolean
  }
  error?: string
}

export interface StartResult {
  service?: string
  success: boolean
  pid?: number
  error?: string
}

export interface StopResult {
  service?: string
  success: boolean
}

export interface RestartResult {
  service?: string
  success: boolean
  error?: string
}

export class ServiceManager {
  private processManager: ProcessManager
  private healthChecker: HealthChecker
  private startTimes: Map<string, Date> = new Map()

  constructor() {
    this.processManager = new ProcessManager()
    this.healthChecker = new HealthChecker()
  }

  async check(serviceId?: string): Promise<CheckResult> {
    if (serviceId) {
      return this.checkService(serviceId)
    }

    const results: CheckResult[] = []
    for (const id of Object.keys(SERVICES)) {
      const result = await this.checkService(id)
      results.push(result)
    }

    const allPassed = results.every((r) => r.passed)
    return { passed: allPassed }
  }

  private async checkService(serviceId: string): Promise<CheckResult> {
    const config = SERVICES[serviceId]
    if (!config) {
      return { service: serviceId, passed: false, error: "Unknown service" }
    }

    if (!config.check) {
      return { service: serviceId, passed: true }
    }

    const details: CheckResult["details"] = {}

    try {
      if (config.check.typeCheck) {
        details.typeCheck = await this.runCheck(config.check.typeCheck, config.directory)
      }
      if (config.check.lint) {
        details.lint = await this.runCheck(config.check.lint, config.directory)
      }
      if (config.check.build) {
        details.build = await this.runCheck(config.check.build, config.directory)
      }

      const passed = Object.values(details).every((v) => v === true)
      return { service: serviceId, passed, details }
    } catch (error) {
      return {
        service: serviceId,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async runCheck(command: string, directory?: string): Promise<boolean> {
    const { execSync } = await import("node:child_process")
    const cwd = directory
      ? path.join(process.cwd(), directory)
      : process.cwd()

    try {
      execSync(command, {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000,
      })
      return true
    } catch {
      return false
    }
  }

  async init(serviceId?: string): Promise<void> {
    if (serviceId) {
      await this.initService(serviceId)
      return
    }

    for (const id of SERVICE_START_ORDER) {
      await this.initService(id)
    }
  }

  private async initService(serviceId: string): Promise<void> {
    const config = SERVICES[serviceId]
    if (!config) return

    console.log(`[ServiceManager] Initializing ${config.name}...`)

    if (config.type === "node" && config.directory) {
      await this.runNpmInstall(config.directory)
    } else if (config.type === "python" && config.directory) {
      await this.initPythonService(config.directory)
    } else if (config.type === "docker" && config.id === "redis") {
      await this.initRedis()
    }

    console.log(`[ServiceManager] ${config.name} initialized`)
  }

  private async runNpmInstall(directory: string): Promise<void> {
    const { execSync } = await import("node:child_process")
    const cwd = path.join(process.cwd(), directory)

    try {
      execSync("npm install --legacy-peer-deps", {
        cwd,
        encoding: "utf-8",
        stdio: "inherit",
        timeout: 300000,
      })
    } catch (error) {
      console.error(`[ServiceManager] Failed to install dependencies in ${directory}`)
      throw error
    }
  }

  private async initPythonService(directory: string): Promise<void> {
    const { execSync } = await import("node:child_process")
    const cwd = path.join(process.cwd(), directory)

    const venvDir = path.join(cwd, ".venv")
    const hasVenv = fs.existsSync(venvDir)

    if (!hasVenv) {
      console.log(`[ServiceManager] Creating Python virtual environment...`)
      try {
        execSync("python3 -m venv .venv", {
          cwd,
          encoding: "utf-8",
          stdio: "inherit",
        })
      } catch {
        execSync("uv venv", {
          cwd,
          encoding: "utf-8",
          stdio: "inherit",
        })
      }
    }

    console.log(`[ServiceManager] Installing Python dependencies...`)
    try {
      execSync(".venv/bin/pip install -e .", {
        cwd,
        encoding: "utf-8",
        stdio: "inherit",
        timeout: 300000,
      })
    } catch {
      execSync("uv pip install -e .", {
        cwd,
        encoding: "utf-8",
        stdio: "inherit",
        timeout: 300000,
      })
    }
  }

  private async initRedis(): Promise<void> {
    const { execSync } = await import("node:child_process")
    const containerName = "bernard-redis"

    try {
      execSync(`docker inspect -f '{{.State.Running}}' ${containerName}`, {
        encoding: "utf-8",
        stdio: "pipe",
      })
      console.log(`[ServiceManager] Redis container already exists`)
    } catch {
      console.log(`[ServiceManager] Pulling Redis image...`)
      execSync(
        "docker run -d --name bernard-redis -p 6379:6379 --restart unless-stopped -v bernard-redis-data:/data docker.io/redis/redis-stack-server:7.4.0-v0",
        {
          encoding: "utf-8",
          stdio: "inherit",
        }
      )
    }
  }

  async clean(serviceId?: string): Promise<void> {
    if (serviceId) {
      await this.cleanService(serviceId)
      return
    }

    for (const id of Object.keys(SERVICES)) {
      await this.cleanService(id)
    }
  }

  private async cleanService(serviceId: string): Promise<void> {
    const config = SERVICES[serviceId]
    if (!config) return

    console.log(`[ServiceManager] Cleaning ${config.name}...`)

    if (config.type === "node" && config.directory) {
      const nodeModules = path.join(process.cwd(), config.directory, "node_modules")
      const dist = path.join(process.cwd(), config.directory, "dist")
      
      if (fs.existsSync(nodeModules)) {
        fs.rmSync(nodeModules, { recursive: true, force: true })
      }
      if (fs.existsSync(dist)) {
        fs.rmSync(dist, { recursive: true, force: true })
      }
    } else if (config.id === "redis") {
      const { execSync } = await import("node:child_process")
      execSync("docker rm -f bernard-redis 2>/dev/null || true", {
        encoding: "utf-8",
        stdio: "pipe",
      })
      execSync("docker volume rm bernard-redis-data 2>/dev/null || true", {
        encoding: "utf-8",
        stdio: "pipe",
      })
    }

    console.log(`[ServiceManager] ${config.name} cleaned`)
  }

  async start(serviceId?: string): Promise<StartResult> {
    if (serviceId) {
      return this.startService(serviceId)
    }

    console.log("[ServiceManager] Starting all services...")

    for (const id of SERVICE_START_ORDER) {
      const result = await this.startService(id)
      if (!result.success) {
        console.error(`[ServiceManager] Failed to start ${id}: ${result.error}`)
      }
    }

    console.log("[ServiceManager] All services started")
    return { success: true }
  }

  private async startService(serviceId: string): Promise<StartResult> {
    const config = SERVICES[serviceId]
    if (!config) {
      return { service: serviceId, success: false, error: "Unknown service" }
    }

    console.log(`[ServiceManager] Starting ${config.name}...`)

    if (config.type === "docker") {
      return this.startDockerService(config)
    }

    const result = await this.processManager.start(config)
    
    if (result.success) {
      const healthy = await this.healthChecker.waitForHealthy(
        serviceId,
        config.startupTimeout
      )
      
      if (healthy) {
        this.startTimes.set(serviceId, new Date())
        console.log(`[ServiceManager] ${config.name} is ready!`)
        return { service: serviceId, success: true, pid: result.pid }
      } else {
        return {
          service: serviceId,
          success: false,
          error: "Health check failed",
        }
      }
    }

    return {
      service: serviceId,
      success: false,
      error: result.error || "Unknown error",
    }
  }

  private async startDockerService(config: ServiceConfig): Promise<StartResult> {
    const { execSync } = await import("node:child_process")

    try {
      if (config.id === "redis") {
        execSync("docker start bernard-redis", {
          encoding: "utf-8",
          stdio: "inherit",
        })

        let attempts = 0
        while (attempts < 30) {
          try {
            execSync("docker exec bernard-redis redis-cli ping", {
              encoding: "utf-8",
              stdio: "pipe",
            })
            this.startTimes.set(config.id, new Date())
            console.log(`[ServiceManager] ${config.name} is ready!`)
            return { service: config.id, success: true }
          } catch {
            await this.delay(1000)
            attempts++
          }
        }

        return {
          service: config.id,
          success: false,
          error: "Redis health check failed",
        }
      }

      return { service: config.id, success: false, error: "Unknown docker service" }
    } catch (error) {
      return {
        service: config.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async stop(serviceId?: string): Promise<StopResult> {
    if (serviceId) {
      return this.stopService(serviceId)
    }

    console.log("[ServiceManager] Stopping all services...")

    const reverseOrder = [...SERVICE_START_ORDER].reverse()
    for (const id of reverseOrder) {
      await this.stopService(id)
    }

    return { success: true }
  }

  private async stopService(serviceId: string): Promise<StopResult> {
    const config = SERVICES[serviceId]
    if (!config) {
      return { service: serviceId, success: false }
    }

    console.log(`[ServiceManager] Stopping ${config.name}...`)

    if (config.type === "docker") {
      return this.stopDockerService(config)
    }

    const success = await this.processManager.stop(config)
    this.startTimes.delete(serviceId)

    return { service: serviceId, success }
  }

  private async stopDockerService(config: ServiceConfig): Promise<StopResult> {
    const { execSync } = await import("node:child_process")

    try {
      if (config.id === "redis") {
        execSync("docker stop bernard-redis", {
          encoding: "utf-8",
          stdio: "inherit",
        })
        this.startTimes.delete(config.id)
        return { service: config.id, success: true }
      }

      return { service: config.id, success: false }
    } catch (error) {
      return {
        service: config.id,
        success: false,
      }
    }
  }

  async restart(serviceId?: string): Promise<RestartResult> {
    if (serviceId) {
      return this.restartService(serviceId)
    }

    await this.stop()
    await this.delay(1000)
    const result = await this.start()

    return {
      service: serviceId,
      success: result.success,
    }
  }

  private async restartService(serviceId: string): Promise<RestartResult> {
    const config = SERVICES[serviceId]
    if (!config) {
      return { service: serviceId, success: false, error: "Unknown service" }
    }

    const stopResult = await this.stopService(serviceId)
    if (!stopResult.success) {
      return { service: serviceId, success: false, error: "Failed to stop" }
    }

    await this.delay(1000)

    const startResult = await this.startService(serviceId)
    return {
      service: serviceId,
      success: startResult.success,
      error: startResult.error,
    }
  }

  async getStatus(serviceId: string): Promise<ServiceStatus | null> {
    const config = SERVICES[serviceId]
    if (!config) return null

    // For docker services, check container status directly
    let isRunning = false
    if (config.type === 'docker') {
      try {
        const { execSync } = await import('node:child_process')
        const result = execSync(`docker inspect -f '{{.State.Running}}' ${config.container}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        isRunning = result.trim() === 'true'
      } catch {
        isRunning = false
      }
    } else {
      isRunning = await this.processManager.isRunning(config)
    }
    
    const health = await this.healthChecker.check(serviceId)

    const startTime = this.startTimes.get(serviceId)
    const uptime = startTime
      ? Math.floor((Date.now() - startTime.getTime()) / 1000)
      : undefined

    let status: ServiceStatusType
    if (!isRunning) {
      status = "stopped"
    } else if (health.status === "up") {
      status = "running"
    } else if (health.status === "starting") {
      status = "starting"
    } else {
      status = "failed"
    }

    return {
      id: config.id,
      name: config.name,
      port: config.port,
      status,
      uptime,
      lastStarted: startTime,
      health: health.status === "up" ? "healthy" : health.status === "down" ? "unhealthy" : "unknown",
      color: config.color,
    }
  }

  async getAllStatus(): Promise<ServiceStatus[]> {
    const statuses: ServiceStatus[] = []

    for (const serviceId of Object.keys(SERVICES)) {
      const status = await this.getStatus(serviceId)
      if (status) {
        statuses.push(status)
      }
    }

    return statuses
  }

  async getUptime(serviceId: string): Promise<number | null> {
    const startTime = this.startTimes.get(serviceId)
    if (!startTime) return null
    return Math.floor((Date.now() - startTime.getTime()) / 1000)
  }

  async healthCheck(serviceId: string): Promise<HealthStatus | null> {
    return this.healthChecker.check(serviceId)
  }

  async healthCheckAll(): Promise<Map<string, HealthStatus>> {
    return this.healthChecker.checkAll()
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
