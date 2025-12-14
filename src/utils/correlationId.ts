/**
 * Minimal Correlation ID utility for tracking requests
 * Generates unique IDs to trace errors and log issues
 */

/**
 * Generate a correlation ID
 * Format: timestamp-randomString (e.g., 1731628800123-abc123xyz)
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${random}`;
}

/**
 * Format timestamp for logging
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}
