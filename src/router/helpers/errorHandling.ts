/**
 * Error Handling Utilities
 * Provides retry logic, timeout handling, and error context management
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  timeout?: number;
}

export interface ErrorContext {
  operation: string;
  query?: string;
  intent?: string;
  step?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * Enhanced error class with context
 */
export class ContextualError extends Error {
  constructor(
    message: string,
    public context: ErrorContext,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ContextualError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      originalError: this.originalError?.message,
      stack: this.stack
    };
  }
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${errorMessage} (after ${timeoutMs}ms)`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    timeout = 30000
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Retry] ${context.operation} - Attempt ${attempt}/${maxAttempts}`);
      
      // Wrap function call with timeout
      const result = await withTimeout(
        fn(),
        timeout,
        `${context.operation} timed out`
      );
      
      if (attempt > 1) {
        console.log(`[Retry] ${context.operation} - Succeeded on attempt ${attempt}`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        console.error(`[Retry] ${context.operation} - Non-retryable error:`, lastError.message);
        throw new ContextualError(
          `${context.operation} failed: ${lastError.message}`,
          context,
          lastError
        );
      }

      // If this was the last attempt, throw
      if (attempt === maxAttempts) {
        console.error(`[Retry] ${context.operation} - All ${maxAttempts} attempts failed`);
        throw new ContextualError(
          `${context.operation} failed after ${maxAttempts} attempts: ${lastError.message}`,
          { ...context, additionalInfo: { ...context.additionalInfo, attempts: maxAttempts } },
          lastError
        );
      }

      // Wait before retrying (with exponential backoff)
      console.warn(
        `[Retry] ${context.operation} - Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      
      // Increase delay for next attempt (capped at maxDelay)
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new ContextualError(
    `${context.operation} failed unexpectedly`,
    context,
    lastError
  );
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors - retryable
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed')
  ) {
    return true;
  }

  // Rate limit errors - retryable
  if (
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  ) {
    return true;
  }

  // Temporary server errors - retryable
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('gateway timeout')
  ) {
    return true;
  }

  // Client errors (4xx except 429) - not retryable
  if (
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404') ||
    message.includes('bad request') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found')
  ) {
    return false;
  }

  // Validation errors - not retryable
  if (
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('malformed')
  ) {
    return false;
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Circuit breaker for repeated failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly name: string = 'CircuitBreaker'
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceFailure > this.timeout) {
        console.log(`[${this.name}] Circuit half-open, attempting request`);
        this.state = 'half-open';
      } else {
        throw new Error(
          `[${this.name}] Circuit breaker is open. Too many recent failures. Try again in ${Math.ceil((this.timeout - timeSinceFailure) / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      
      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        console.log(`[${this.name}] Circuit closed after successful request`);
      }
      this.failures = 0;
      this.state = 'closed';
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(
          `[${this.name}] Circuit breaker opened after ${this.failures} failures`
        );
      }

      throw error;
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'closed';
    console.log(`[${this.name}] Circuit breaker manually reset`);
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Global circuit breakers for different services
export const llmCircuitBreaker = new CircuitBreaker(5, 60000, 'LLM');
export const databaseCircuitBreaker = new CircuitBreaker(10, 30000, 'Database');
