/**
 * Quick Context Cache
 * 
 * In-memory cache for recent conversation context to enable fast follow-up detection
 * without database queries.
 * 
 * TTL: 5 minutes (300,000ms)
 */

export interface QuickContext {
  userId: string;
  lastIntent: string;
  lastQuestion: string;
  lastAnswer?: string;
  lastParameters?: Record<string, any>;
  timestamp: number;
  routeTaken?: string;
}

export class QuickContextCache {
  private cache = new Map<string, QuickContext>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Store context for a user
   */
  set(userId: string, context: Omit<QuickContext, 'userId' | 'timestamp'>): void {
    const timestamp = Date.now();
    this.cache.set(userId, {
      userId,
      ...context,
      timestamp
    });

    // Auto-cleanup after TTL
    setTimeout(() => {
      const cached = this.cache.get(userId);
      if (cached && cached.timestamp === timestamp) {
        this.cache.delete(userId);
      }
    }, this.TTL);
  }

  /**
   * Get context for a user (returns null if expired or not found)
   */
  get(userId: string): QuickContext | null {
    const context = this.cache.get(userId);
    
    if (!context) {
      return null;
    }

    // Check if expired
    const age = Date.now() - context.timestamp;
    if (age > this.TTL) {
      this.cache.delete(userId);
      return null;
    }

    return context;
  }

  /**
   * Check if context exists and is valid
   */
  has(userId: string): boolean {
    return this.get(userId) !== null;
  }

  /**
   * Clear context for a user
   */
  clear(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clear all contexts (useful for testing)
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (for monitoring)
   */
  size(): number {
    return this.cache.size;
  }
}

// Singleton instance
export const quickContextCache = new QuickContextCache();
