/**
 * Simple logger for tracking failures and low-confidence queries
 * Writes to failures.log for manual review
 */

import fs from 'fs';
import path from 'path';

export interface FailureLog {
  timestamp: string;
  correlationId: string;
  question: string;
  intent?: string;
  confidence?: number;
  error?: string;
  stack?: string;
}

/**
 * Log a failure or low-confidence query
 */
export function logFailure(data: Omit<FailureLog, 'timestamp'>): void {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({ timestamp, ...data }) + '\n';
  
  const logPath = path.join(process.cwd(), 'failures.log');
  
  try {
    fs.appendFileSync(logPath, logEntry);
  } catch (error) {
    // Don't crash if logging fails
    console.error('[Logger] Failed to write to failures.log:', error);
  }
}

/**
 * Log successful route (optional - for analytics)
 */
export function logRoute(data: {
  correlationId: string;
  question: string;
  intent: string;
  confidence: number;
  task: string;
  latency_ms: number;
}): void {
  // For beta: just console log in JSON format for easy grepping
  console.log(JSON.stringify({
    event: 'route_success',
    timestamp: new Date().toISOString(),
    ...data,
  }));
}
