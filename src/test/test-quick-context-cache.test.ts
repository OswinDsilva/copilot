/**
 * Tests for Quick Context Cache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QuickContextCache } from '../router/services/quickContextCache';

describe('QuickContextCache', () => {
  let cache: QuickContextCache;

  beforeEach(() => {
    cache = new QuickContextCache();
  });

  afterEach(() => {
    // Clear all timers
    vi.clearAllTimers();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve context', () => {
      cache.set('user1', {
        lastIntent: 'EQUIPMENT_OPTIMIZATION',
        lastQuestion: 'best combos for 1200 tons',
        lastAnswer: 'Here are the best combinations...',
        lastParameters: { tonnage: 1200 }
      });

      const context = cache.get('user1');
      
      expect(context).toBeDefined();
      expect(context?.userId).toBe('user1');
      expect(context?.lastIntent).toBe('EQUIPMENT_OPTIMIZATION');
      expect(context?.lastQuestion).toBe('best combos for 1200 tons');
      expect(context?.lastParameters?.tonnage).toBe(1200);
      expect(context?.timestamp).toBeGreaterThan(0);
    });

    it('should return null for non-existent user', () => {
      const context = cache.get('non-existent-user');
      
      expect(context).toBeNull();
    });

    it('should check if context exists', () => {
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test question',
        lastParameters: {}
      });

      expect(cache.has('user1')).toBe(true);
      expect(cache.has('user2')).toBe(false);
    });

    it('should clear specific user context', () => {
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: {}
      });

      expect(cache.has('user1')).toBe(true);
      
      cache.clear('user1');
      
      expect(cache.has('user1')).toBe(false);
    });

    it('should clear all contexts', () => {
      cache.set('user1', {
        lastIntent: 'TEST1',
        lastQuestion: 'test1',
        lastParameters: {}
      });

      cache.set('user2', {
        lastIntent: 'TEST2',
        lastQuestion: 'test2',
        lastParameters: {}
      });

      expect(cache.size()).toBe(2);
      
      cache.clearAll();
      
      expect(cache.size()).toBe(0);
    });

    it('should return correct cache size', () => {
      expect(cache.size()).toBe(0);

      cache.set('user1', { lastIntent: 'TEST', lastQuestion: 'test', lastParameters: {} });
      expect(cache.size()).toBe(1);

      cache.set('user2', { lastIntent: 'TEST', lastQuestion: 'test', lastParameters: {} });
      expect(cache.size()).toBe(2);

      cache.clear('user1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('Timestamp Handling', () => {
    it('should auto-generate timestamp', () => {
      const beforeTime = Date.now();
      
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: {}
      });

      const context = cache.get('user1');
      const afterTime = Date.now();
      
      expect(context?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(context?.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should update timestamp on overwrite', async () => {
      cache.set('user1', {
        lastIntent: 'TEST1',
        lastQuestion: 'test1',
        lastParameters: {}
      });

      const firstContext = cache.get('user1');
      const firstTimestamp = firstContext!.timestamp;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      cache.set('user1', {
        lastIntent: 'TEST2',
        lastQuestion: 'test2',
        lastParameters: {}
      });

      const secondContext = cache.get('user1');
      const secondTimestamp = secondContext!.timestamp;
      
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire context after TTL', async () => {
      vi.useFakeTimers();
      
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: {}
      });

      expect(cache.has('user1')).toBe(true);

      // Fast-forward 5 minutes + 1 second
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      expect(cache.has('user1')).toBe(false);
      
      vi.useRealTimers();
    });

    it('should not expire context before TTL', async () => {
      vi.useFakeTimers();
      
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: {}
      });

      // Fast-forward 4 minutes (still within TTL)
      vi.advanceTimersByTime(4 * 60 * 1000);

      expect(cache.has('user1')).toBe(true);
      
      vi.useRealTimers();
    });

    it('should handle multiple users with different TTLs', async () => {
      vi.useFakeTimers();
      
      cache.set('user1', {
        lastIntent: 'TEST1',
        lastQuestion: 'test1',
        lastParameters: {}
      });

      // Fast-forward 2 minutes
      vi.advanceTimersByTime(2 * 60 * 1000);

      cache.set('user2', {
        lastIntent: 'TEST2',
        lastQuestion: 'test2',
        lastParameters: {}
      });

      // Fast-forward 4 minutes (total 6 for user1, 4 for user2)
      vi.advanceTimersByTime(4 * 60 * 1000);

      expect(cache.has('user1')).toBe(false); // expired
      expect(cache.has('user2')).toBe(true);  // still valid
      
      vi.useRealTimers();
    });
  });

  describe('Data Integrity', () => {
    it('should store optional fields', () => {
      cache.set('user1', {
        lastIntent: 'EQUIPMENT_OPTIMIZATION',
        lastQuestion: 'test question',
        lastAnswer: 'test answer',
        lastParameters: { tonnage: 1200 },
        routeTaken: 'optimize'
      });

      const context = cache.get('user1');
      
      expect(context?.lastAnswer).toBe('test answer');
      expect(context?.routeTaken).toBe('optimize');
    });

    it('should handle missing optional fields', () => {
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: {}
      });

      const context = cache.get('user1');
      
      expect(context?.lastAnswer).toBeUndefined();
      expect(context?.routeTaken).toBeUndefined();
    });

    it('should store complex parameters', () => {
      cache.set('user1', {
        lastIntent: 'EQUIPMENT_OPTIMIZATION',
        lastQuestion: 'test',
        lastParameters: {
          tonnage: 1200,
          bench: 1,
          equipment_type: 'tipper-excavator',
          exclude: ['E-001', 'T-002'],
          nested: {
            deep: {
              value: 42
            }
          }
        }
      });

      const context = cache.get('user1');
      
      expect(context?.lastParameters?.exclude).toEqual(['E-001', 'T-002']);
      expect(context?.lastParameters?.nested?.deep?.value).toBe(42);
    });

    it('should store complex parameters by reference', () => {
      // JavaScript objects are stored by reference, not deep cloned
      const originalParams = { tonnage: 1200, bench: 1 };
      
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: originalParams
      });

      const context = cache.get('user1');
      context!.lastParameters!.tonnage = 9999;
      
      // Original is also changed (stored by reference)
      expect(originalParams.tonnage).toBe(9999);
      
      // Retrieving again should show the modified value in cache
      const context2 = cache.get('user1');
      expect(context2?.lastParameters?.tonnage).toBe(9999);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid successive sets', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`user${i}`, {
          lastIntent: `INTENT_${i}`,
          lastQuestion: `question ${i}`,
          lastParameters: { index: i }
        });
      }

      expect(cache.size()).toBe(100);
      
      const context50 = cache.get('user50');
      expect(context50?.lastIntent).toBe('INTENT_50');
      expect(context50?.lastParameters?.index).toBe(50);
    });

    it('should handle interleaved set/get operations', () => {
      cache.set('user1', {
        lastIntent: 'INTENT1',
        lastQuestion: 'q1',
        lastParameters: {}
      });

      const c1 = cache.get('user1');
      expect(c1?.lastIntent).toBe('INTENT1');

      cache.set('user2', {
        lastIntent: 'INTENT2',
        lastQuestion: 'q2',
        lastParameters: {}
      });

      const c1Again = cache.get('user1');
      const c2 = cache.get('user2');
      
      expect(c1Again?.lastIntent).toBe('INTENT1');
      expect(c2?.lastIntent).toBe('INTENT2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      cache.set('user1', {
        lastIntent: '',
        lastQuestion: '',
        lastParameters: {}
      });

      const context = cache.get('user1');
      
      expect(context?.lastIntent).toBe('');
      expect(context?.lastQuestion).toBe('');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: longString,
        lastParameters: {}
      });

      const context = cache.get('user1');
      
      expect(context?.lastQuestion).toBe(longString);
      expect(context?.lastQuestion.length).toBe(10000);
    });

    it('should handle special characters in user ID', () => {
      const specialUserId = 'user-123_test@example.com';
      
      cache.set(specialUserId, {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: {}
      });

      expect(cache.has(specialUserId)).toBe(true);
      const context = cache.get(specialUserId);
      expect(context?.userId).toBe(specialUserId);
    });

    it('should handle undefined parameters gracefully', () => {
      cache.set('user1', {
        lastIntent: 'TEST',
        lastQuestion: 'test',
        lastParameters: undefined as any
      });

      const context = cache.get('user1');
      
      expect(context?.lastParameters).toBeUndefined();
    });
  });
});
