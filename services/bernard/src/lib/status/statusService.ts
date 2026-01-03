/**
 * Status Service for managing status messages during tool execution.
 * Provides both single status messages and rotating message pools.
 */

export interface StatusData {
  description: string;
  done: boolean;
  hidden: boolean;
}

export interface StatusEvent {
  type: "status";
  data: StatusData;
}

export class StatusService {
  private currentStatus: StatusData | null = null;
  private statusPool: string[] = [];
  private poolIndex = 0;
  private rotationInterval: NodeJS.Timeout | null = null;
  private rotationDelay = 5000; // 5 seconds
  private pendingEvents: StatusEvent[] = [];
  private onStatusChange?: ((event: StatusEvent) => void) | undefined;

  constructor(onStatusChange?: (event: StatusEvent) => void) {
    this.onStatusChange = onStatusChange;
  }

  /**
   * Set a single status message
   */
  setStatus(message: string, done = false, hidden = false): void {
    this.stopRotation();
    this.currentStatus = { description: message, done, hidden };
    this.emitStatusEvent();
  }

  /**
   * Set a pool of status messages that will rotate every 5 seconds
   */
  setStatusPool(messages: string[], done = false, hidden = false): void {
    if (messages.length === 0) {
      this.clearStatus();
      return;
    }

    this.stopRotation();
    this.statusPool = messages;
    this.poolIndex = 0;
    const message = messages[this.poolIndex];
    if (message) {
      this.currentStatus = {
        description: message,
        done,
        hidden
      };
      this.emitStatusEvent();
    }

    // Start rotation if there are multiple messages
    if (messages.length > 1) {
      this.startRotation();
    }
  }

  /**
   * Clear the current status
   */
  clearStatus(): void {
    this.stopRotation();
    this.currentStatus = null;
    this.statusPool = [];
    this.poolIndex = 0;
  }

  /**
   * Get the current status message
   */
  getCurrentStatus(): StatusData | null {
    return this.currentStatus;
  }

  /**
   * Start automatic rotation of status messages
   */
  private startRotation(): void {
    if (this.rotationInterval) {
      this.stopRotation();
    }

    this.rotationInterval = setInterval(() => {
      if (this.statusPool.length > 1) {
        this.poolIndex = (this.poolIndex + 1) % this.statusPool.length;
        if (this.currentStatus) {
          const nextMessage = this.statusPool[this.poolIndex];
          if (nextMessage) {
            this.currentStatus.description = nextMessage;
            this.emitStatusEvent();
          }
        }
      }
    }, this.rotationDelay);
  }

  /**
   * Stop automatic rotation
   */
  private stopRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }

  /**
   * Mark current status as completed
   */
  markCompleted(hidden = true): void {
    this.stopRotation();
    if (this.currentStatus) {
      this.currentStatus.done = true;
      this.currentStatus.hidden = hidden;
      this.emitStatusEvent();
    }
  }

  /**
   * Emit a status event if there's a change handler
   */
  private emitStatusEvent(): void {
    if (this.currentStatus) {
      const event: StatusEvent = {
        type: "status",
        data: { ...this.currentStatus }
      };

      this.pendingEvents.push(event);

      if (this.onStatusChange) {
        this.onStatusChange(event);
      }
    }
  }

  /**
   * Get and clear pending status events
   */
  getPendingEvents(): StatusEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  /**
   * Check if there are pending events
   */
  hasPendingEvents(): boolean {
    return this.pendingEvents.length > 0;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopRotation();
    this.clearStatus();
  }
}
