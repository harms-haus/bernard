import type { Connection} from 'home-assistant-js-websocket'
import {
  createLongLivedTokenAuth,
  createConnection,
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
} from 'home-assistant-js-websocket'

/**
 * Home Assistant WebSocket connection pool manager
 * Maintains persistent connections per Home Assistant instance
 */
class HAConnectionPool {
  private connections: Map<string, Connection> = new Map();

  /**
   * Get or create a WebSocket connection for a Home Assistant instance
   */
  async getConnection(baseUrl: string, accessToken: string): Promise<Connection> {
    const key = baseUrl;

    // Return existing connection if available and connected
    const existingConnection = this.connections.get(key);
    if (existingConnection && existingConnection.connected) {
      return existingConnection;
    }

    try {
      // Create authentication
      const auth = createLongLivedTokenAuth(baseUrl, accessToken);

      // Create new connection
      const connection = await createConnection({ auth });

      // Store the connection
      this.connections.set(key, connection);

      // Handle connection events
      connection.addEventListener('disconnected', () => {
        console.warn(`[HA WebSocket] Connection lost for ${baseUrl}`);
      });

      connection.addEventListener('ready', () => {
        console.warn(`[HA WebSocket] Connection ready for ${baseUrl}`);
      });

      connection.addEventListener('reconnect-error', (conn, error) => {
        console.error(`[HA WebSocket] Reconnection failed for ${baseUrl}:`, error);
      });

      return connection;
    } catch (error) {
      console.error(`[HA WebSocket] Failed to connect to ${baseUrl}:`, error);

      // Clean up failed connection
      this.connections.delete(key);

      // Re-throw with context
      if (error === ERR_CANNOT_CONNECT) {
        throw new Error(`Cannot connect to Home Assistant at ${baseUrl}. Please check the URL and network connectivity.`);
      } else if (error === ERR_INVALID_AUTH) {
        throw new Error(`Authentication failed for Home Assistant at ${baseUrl}. Please check your access token.`);
      } else {
        throw new Error(`Failed to connect to Home Assistant: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Close a specific connection
   */
  closeConnection(baseUrl: string): void {
    const key = baseUrl;
    const connection = this.connections.get(key);

    if (connection) {
      try {
        connection.close();
      } catch (error) {
        console.warn(`[HA WebSocket] Error closing connection for ${baseUrl}:`, error);
      } finally {
        this.connections.delete(key);
      }
    }
  }

  /**
   * Close all connections
   */
  closeAllConnections(): void {
    for (const [baseUrl, connection] of this.connections.entries()) {
      try {
        connection.close();
      } catch (error) {
        console.warn(`[HA WebSocket] Error closing connection for ${baseUrl}:`, error);
      }
    }
    this.connections.clear();
  }

  /**
   * Get connection statistics for debugging
   */
  getStats(): { totalConnections: number; connectedConnections: number; connections: string[] } {
    const connections = Array.from(this.connections.keys());
    const connectedConnections = Array.from(this.connections.values())
      .filter(conn => conn.connected).length;

    return {
      totalConnections: this.connections.size,
      connectedConnections,
      connections
    };
  }
}

// Singleton instance
const connectionPool = new HAConnectionPool();

/**
 * Get a WebSocket connection for Home Assistant
 */
export async function getHAConnection(baseUrl: string, accessToken: string): Promise<Connection> {
  return connectionPool.getConnection(baseUrl, accessToken);
}

/**
 * Close a specific Home Assistant WebSocket connection
 */
export function closeHAConnection(baseUrl: string): void {
  connectionPool.closeConnection(baseUrl);
}

/**
 * Close all Home Assistant WebSocket connections
 */
export function closeAllHAConnections(): void {
  connectionPool.closeAllConnections();
}

/**
 * Get connection pool statistics
 */
export function getHAConnectionStats() {
  return connectionPool.getStats();
}
