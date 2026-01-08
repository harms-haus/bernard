import { spawn, ChildProcess, SpawnOptions } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { ServiceConfig } from "./ServiceConfig"

const PIDS_DIR = path.join(process.cwd(), "logs", "pids")

interface ProcessInfo {
  pid: number
  serviceId: string
  startTime: Date
}

export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map()

  constructor() {
    if (!fs.existsSync(PIDS_DIR)) {
      fs.mkdirSync(PIDS_DIR, { recursive: true })
    }
  }

  async start(config: ServiceConfig): Promise<{ pid: number; success: boolean; error?: string }> {
    const isCurrentlyRunning = await this.isRunning(config)
    if (isCurrentlyRunning) {
      const pid = await this.getPid(config)
      if (pid) {
        return { pid, success: true }
      }
    }

    const logFile = path.join(process.cwd(), "logs", `${config.id}.log`)

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

      const [command, ...args] = config.script.split(" ")
      const fullArgs = [...args]

      const options: SpawnOptions = {
        cwd: config.directory ? path.join(process.cwd(), config.directory) : process.cwd(),
        stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")],
        detached: false,
        env: {
          ...process.env,
          TZ: process.env.TZ || "America/Chicago",
        },
      }

      const child = spawn(command, fullArgs, options)

      child.on("error", (error) => {
        reject(error)
      })

      child.on("spawn", () => {
        resolve(child.pid!)
      })

      child.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[ProcessManager] Process ${config.id} exited with code ${code}`)
        }
      })
    })
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
      console.error(`[ProcessManager] Failed to stop ${config.id}:`, error)
      return false
    }
  }

  async restart(config: ServiceConfig): Promise<{ success: boolean; error?: string }> {
    const wasRunning = await this.isRunning(config)
    
    if (wasRunning) {
      const stopped = await this.stop(config)
      if (!stopped) {
        return { success: false, error: "Failed to stop service" }
      }
      await this.delay(500)
    }

    const result = await this.start(config)
    return result
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
    return path.join(PIDS_DIR, `${serviceId}.pid`)
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
}
