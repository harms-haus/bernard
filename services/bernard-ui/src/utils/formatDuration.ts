/**
 * Format a duration in milliseconds to a human-readable string
 * @param ms Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  // Handle invalid inputs
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }

  if (ms < 1) {
    // Show sub-millisecond precision (e.g., 0.123ms for very fast operations)
    return `${ms.toFixed(3)}ms`;
  } else if (ms < 1000) {
    // Show milliseconds for values under 1 second
    return `${Math.round(ms)}ms`;
  } else {
    // Show seconds with 2 decimal places for values >= 1 second
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
  }
}
