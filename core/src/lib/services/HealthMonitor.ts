import { HealthChecker, HealthStatus, HealthStatusType } from './HealthChecker';
import { SERVICES } from './ServiceConfig';
import { logger } from '@/lib/logging/logger';

export type HealthStreamStatus = 'up' | 'down' | 'starting' | 'degraded';

export interface HealthStreamUpdate {
  service: string;
  name: string;
  status: HealthStreamStatus;
  timestamp: string;
  isChange: boolean;
  previousStatus?: HealthStreamStatus;
  responseTime?: number;
  error?: string;
}

export interface HealthStreamSnapshot {
  services: HealthStreamUpdate[];
  generatedAt: string;
}

interface Subscriber {
  (update: HealthStreamUpdate): void;
}

/**
 * HealthMonitor - Background health checker with pub/sub for SSE streaming
 *
 * Mirrors the pattern from LogStreamer:
 * - Runs periodic health checks
 * - Tracks state changes
 * - Notifies subscribers of updates
 */
export class HealthMonitor {
  private healthChecker: HealthChecker;
  private lastStates: Map<string, HealthStatus> = new Map();
  private subscribers: Set<Subscriber> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private heartbeatIntervalMs: number;

  constructor(options: { checkIntervalMs?: number; heartbeatIntervalMs?: number } = {}) {
    this.healthChecker = new HealthChecker();
    this.checkIntervalMs = options.checkIntervalMs ?? 5000; // Default: 5s
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60000; // Default: 60s
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('[HealthMonitor] Already running');
      return;
    }

    logger.info(
      { checkIntervalMs: this.checkIntervalMs, heartbeatIntervalMs: this.heartbeatIntervalMs },
      '[HealthMonitor] Starting'
    );

    // Run initial check immediately
    this.checkAll();

    // Periodic health checks
    this.checkInterval = setInterval(() => {
      this.checkAll();
    }, this.checkIntervalMs);

    // Periodic heartbeat (emit all services even if unchanged)
    this.heartbeatInterval = setInterval(() => {
      this.emitHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop all health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.subscribers.clear();
    logger.info('[HealthMonitor] Stopped');
  }

  /**
   * Get a snapshot of all service statuses
   */
  async getSnapshot(): Promise<HealthStreamSnapshot> {
    const results = await this.healthChecker.checkAll();
    const services: HealthStreamUpdate[] = [];

    for (const [serviceId, status] of results) {
      const config = SERVICES[serviceId];
      services.push({
        service: serviceId,
        name: config?.displayName || serviceId,
        status: this.mapStatus(status.status),
        timestamp: status.lastChecked.toISOString(),
        isChange: false,
        responseTime: status.responseTime,
        error: status.error,
      });
    }

    return {
      services,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Subscribe to health updates
   */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Check all services and emit updates on changes
   */
  private async checkAll(): Promise<void> {
    try {
      const results = await this.healthChecker.checkAll();

      for (const [serviceId, status] of results) {
        const prev = this.lastStates.get(serviceId);
        const update = this.buildUpdate(serviceId, status, prev);

        // Always emit for periodic checks (this catches recovery scenarios)
        this.emitUpdate(update);

        // Track state
        this.lastStates.set(serviceId, status);
      }
    } catch (error) {
      logger.error({ error }, '[HealthMonitor] Check failed');
    }
  }

  /**
   * Emit heartbeat with all current states
   */
  private emitHeartbeat(): Promise<void> {
    return this.getSnapshot().then((snapshot) => {
      for (const service of snapshot.services) {
        const update: HealthStreamUpdate = {
          ...service,
          isChange: false, // Heartbeat is not a change
        };
        this.emitUpdate(update);
      }
    });
  }

  /**
   * Build an update from health status
   */
  private buildUpdate(
    serviceId: string,
    status: HealthStatus,
    prev: HealthStatus | undefined
  ): HealthStreamUpdate {
    const config = SERVICES[serviceId];
    const isChange = !prev || prev.status !== status.status;

    return {
      service: serviceId,
      name: config?.displayName || serviceId,
      status: this.mapStatus(status.status),
      timestamp: status.lastChecked.toISOString(),
      isChange,
      previousStatus: prev ? this.mapStatus(prev.status) : undefined,
      responseTime: status.responseTime,
      error: status.error,
    };
  }

  /**
   * Emit update to all subscribers
   */
  private emitUpdate(update: HealthStreamUpdate): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(update);
      } catch (error) {
        logger.error({ error, service: update.service }, '[HealthMonitor] Subscriber error');
      }
    }
  }

  /**
   * Map HealthChecker status to stream status
   */
  private mapStatus(status: HealthStatusType): HealthStreamStatus {
    switch (status) {
      case 'up':
        return 'up';
      case 'down':
        return 'down';
      case 'starting':
        return 'starting';
      case 'degraded':
        return 'degraded';
      default:
        return 'down';
    }
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.checkInterval !== null;
  }
}

// Singleton instance
let healthMonitor: HealthMonitor | null = null;

export function getHealthMonitor(): HealthMonitor {
  if (!healthMonitor) {
    healthMonitor = new HealthMonitor();
  }
  return healthMonitor;
}

export function startHealthMonitor(): void {
  getHealthMonitor().start();
}

export function stopHealthMonitor(): void {
  if (healthMonitor) {
    healthMonitor.stop();
    healthMonitor = null;
  }
}
