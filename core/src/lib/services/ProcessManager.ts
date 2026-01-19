import { spawn, ChildProcess, SpawnOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ServiceConfig } from '@/lib/services/ServiceConfig';
import { logger } from '@/lib/logging/logger';

interface ProcessInfo {
  pid: number
  serviceId: string
  startTime: Date
}

export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map()

  constructor() {
    if (!fs.existsSync(this.getPidsDir())) {
      fs.mkdirSync(this.getPidsDir(), { recursive: true })
    }
  }

  private getPidsDir(): string {
    return path.join(this.getBaseDir(), "logs", "pids")
  }

  async start(config: ServiceConfig): Promise<{ pid: number; success: boolean; error?: string }> {
    // Check if port is already in use
    const portInUse = config.port ? await this.isPortInUse(config.port) : false

    if (portInUse) {
      // Port is in use - check PID file
      const pid = await this.getPid(config)

      if (pid) {
        // PID file exists - check if process is still running
        if (this.isPidRunning(pid)) {
          // Process is running - return success (connect logs)
          return { pid, success: true }
        }
        // Process is dead but port in use - kill it
        await this.killByPort(config.port!)
        await this.delay(200)
      } else {
        // No PID file but port in use - kill it
        await this.killByPort(config.port!)
        await this.delay(200)
      }
    }

    // Start the service
    const logFile = path.join(this.getBaseDir(), "logs", `${config.id}.log`)

    try {
      const pid = await this.spawnProcess(config, logFile)
      this.processes.set(config.id, {
        pid,
        serviceId: config.id,
        startTime: new Date(),
      })
      this.savePid(config.id, pid)
      return { pid, success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { pid: 0, success: false, error: errorMessage }
    }
  }

  private spawnProcess(config: ServiceConfig, logFile: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!config.script) {
        reject(new Error(`No script defined for service ${config.id}`))
        return
      }

      // Parse environment variables from the start of the script
      // Format: "VAR1=value1 VAR2=value2 command arg1 arg2..."
      const parts = config.script.split(" ")
      const envVars: Record<string, string> = {}
      let commandIndex = 0

      // Parse KEY=value pairs at the start
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (part.includes("=")) {
          const [key, ...valueParts] = part.split("=")
          if (key && valueParts.length > 0) {
            envVars[key] = valueParts.join("=")
          }
          commandIndex = i + 1
        } else {
          // First part that's not a KEY=value is the command
          break
        }
      }

      const command = parts[commandIndex]
      const args = parts.slice(commandIndex + 1)

      let cwd = process.cwd()

      if (config.directory) {
        cwd = path.join(this.getBaseDir(), config.directory)
      }

      // Build environment variables - merge config env vars with process.env
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        TZ: process.env.TZ || "America/Chicago",
        ...envVars,
      }

      const options: SpawnOptions = {
        cwd,
        stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")],
        detached: false,
        env,
      }

      const resolvedCommand = path.isAbsolute(command) ? command : path.join(cwd, command)

      const child = spawn(resolvedCommand, args, options)

      child.on("error", (error) => {
        reject(error)
      })

      child.on("spawn", () => {
        resolve(child.pid!)
      })

      child.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          logger.warn({ service: config.id, exitCode: code }, 'Process exited with non-zero code');
        }
      })
    })
  }

  private getBaseDir(): string {
    const cwd = process.cwd()
    const cwdParts = cwd.split(path.sep)

    if (cwdParts.includes('core')) {
      const coreIndex = cwdParts.indexOf('core')
      return cwdParts.slice(0, coreIndex).join(path.sep) || '/'
    }

    return cwd
  }

  async stop(config: ServiceConfig): Promise<boolean> {
    const pid = await this.getPid(config)
    if (!pid) {
      return true
    }

    try {
      await this.killByPid(pid, true)
      this.removePid(config.id)
      this.processes.delete(config.id)
      return true
    } catch (error) {
      logger.error({ service: config.id, error: (error as Error).message }, 'Failed to stop service');
      return false
    }
  }

  async restart(config: ServiceConfig): Promise<{ success: boolean; error?: string }> {
    // Force kill any process on the port
    if (config.port) {
      await this.killByPort(config.port)
      await this.delay(200)
    }

    // Also try to stop via PID file
    await this.stop(config)

    // Start fresh
    return this.start(config)
  }

  async isRunning(config: ServiceConfig): Promise<boolean> {
    const pid = await this.getPid(config)
    if (!pid) {
      return false
    }
    return this.isPidRunning(pid)
  }

  async getPid(config: ServiceConfig): Promise<number | null> {
    const pidFile = this.getPidPath(config.id)
    
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, "utf-8"), 10)
        if (this.isPidRunning(pid)) {
          return pid
        }
        this.removePid(config.id)
      } catch {
        // Ignore parse errors
      }
    }

    return null
  }

  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  async killByPid(pid: number, graceful = true): Promise<void> {
    if (!this.isPidRunning(pid)) {
      return
    }

    if (graceful) {
      process.kill(pid, "SIGTERM")
      const timeout = 5000
      const start = Date.now()
      
      while (this.isPidRunning(pid) && Date.now() - start < timeout) {
        await this.delay(100)
      }
    }

    if (this.isPidRunning(pid)) {
      process.kill(pid, "SIGKILL")
      await this.delay(200)
    }
  }

  private getPidPath(serviceId: string): string {
    return path.join(this.getPidsDir(), `${serviceId}.pid`)
  }

  private savePid(serviceId: string, pid: number): void {
    const pidPath = this.getPidPath(serviceId)
    fs.writeFileSync(pidPath, pid.toString(), "utf-8")
  }

  private removePid(serviceId: string): void {
    const pidPath = this.getPidPath(serviceId)
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath)
    }
  }

  async executeCommand(
    cmd: string,
    args: string[],
    options: SpawnOptions
  ): Promise<ChildProcess> {
    return spawn(cmd, args, {
      ...options,
      stdio: "inherit",
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Check if a port is currently in use
   */
  async isPortInUse(port: number): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process')
      execSync(`lsof -ti:${port} > /dev/null 2>&1 || fuser ${port}/tcp > /dev/null 2>&1`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Kill any process using a specific port
   */
  async killByPort(port: number): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process')
      // Use lsof or fuser to find and kill process on port
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || fuser -k ${port}/tcp 2>/dev/null || true`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      await this.delay(200)
      return true
    } catch {
      return false
    }
  }
}
