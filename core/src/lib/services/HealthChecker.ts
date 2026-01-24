import { ServiceConfig, SERVICES } from '@/lib/services/ServiceConfig';

export type HealthStatusType = "up" | "down" | "starting" | "degraded"

export interface HealthStatus {
  service: string
  status: HealthStatusType
  lastChecked: Date
  error?: string
  uptime?: number
  responseTime?: number
}

export class HealthChecker {
  private lastCheckTimes: Map<string, Date> = new Map()
  private startupTimes: Map<string, number> = new Map() // Track service start times for grace periods

  async check(serviceId: string): Promise<HealthStatus> {
    const config = SERVICES[serviceId]
    if (!config) {
      return {
        service: serviceId,
        status: "down",
        lastChecked: new Date(),
        error: "Unknown service",
      }
    }

    const requestStartTime = Date.now()
    const startupStart = this.startupTimes.get(serviceId) ?? 0
    
    if (startupStart > 0 && Date.now() - startupStart < config.startupTimeout * 1000) {
      return {
        service: serviceId,
        status: "starting",
        lastChecked: new Date(),
      }
    }

    try {
      if (config.type === "docker") {
        const result = await this.checkDocker(config)
        return this.buildResponse(serviceId, result, requestStartTime)
      }

      if (config.port) {
        const result = await this.checkPort(config.port)
        return this.buildResponse(serviceId, result, requestStartTime)
      }

      if (config.healthPath) {
        const result = await this.checkHttp(config)
        return this.buildResponse(serviceId, result, requestStartTime)
      }

      return this.buildResponse(serviceId, { healthy: true }, requestStartTime)
    } catch (error) {
      return this.buildResponse(
        serviceId,
        { healthy: false, error: error instanceof Error ? error.message : String(error) },
        requestStartTime
      )
    }
  }

  async checkAll(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>()

    for (const serviceId of Object.keys(SERVICES)) {
      const status = await this.check(serviceId)
      results.set(serviceId, status)
    }

    return results
  }

  async waitForHealthy(
    serviceId: string,
    timeout: number
  ): Promise<boolean> {
    const config = SERVICES[serviceId]
    if (!config) {
      return false
    }

    // Record start time for grace period
    this.startupTimes.set(serviceId, Date.now())

    const maxAttempts = Math.ceil((timeout * 1000) / 500)
    
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.check(serviceId)
      if (status.status === "up") {
        return true
      }
      await this.delay(500)
    }

    return false
  }

  private async checkDocker(config: ServiceConfig): Promise<{ healthy: boolean; error?: string }> {
    if (!config.container) {
      return { healthy: false, error: "No container specified" }
    }

    try {
      const { execSync } = await import("node:child_process")
      execSync(`docker inspect -f '{{.State.Running}}' ${config.container}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })
      return { healthy: true }
    } catch {
      return { healthy: false, error: "Container not running" }
    }
  }

  private async checkPort(port: number): Promise<{ healthy: boolean; error?: string }> {
    try {
      const { execSync } = await import("node:child_process")
      execSync(`lsof -i:${port}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })
      return { healthy: true }
    } catch {
      return { healthy: false, error: `Port ${port} not in use` }
    }
  }

  private async checkHttp(config: ServiceConfig): Promise<{ healthy: boolean; error?: string }> {
    const port = config.port
    const path = config.healthPath || "/health"
    
    if (!port) {
      return { healthy: false, error: "No port specified" }
    }

    try {
      const http = await import("node:http")
      
      return new Promise((resolve) => {
        const request = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path,
            method: "GET",
            timeout: 5000,
          },
          (res) => {
            const healthy = res.statusCode !== undefined && res.statusCode < 400
            resolve({ healthy })
          }
        )

        request.on("error", (error) => {
          resolve({ healthy: false, error: error.message })
        })

        request.on("timeout", () => {
          request.destroy()
          resolve({ healthy: false, error: "Request timeout" })
        })

        request.end()
      })
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private buildResponse(
    serviceId: string,
    result: { healthy: boolean; error?: string },
    startTime: number
  ): HealthStatus {
    const responseTime = Date.now() - startTime
    const lastChecked = new Date()

    this.lastCheckTimes.set(serviceId, lastChecked)

    return {
      service: serviceId,
      status: result.healthy ? "up" : "down",
      lastChecked,
      error: result.error,
      responseTime,
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
