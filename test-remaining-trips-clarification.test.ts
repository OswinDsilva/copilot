import { describe, it, expect, beforeEach } from 'vitest';

import { routeQuestion } from './src/router/index';
import { quickContextCache } from './src/router/services/quickContextCache';
import type { ChatMessage } from './src/types';

describe('remaining trips clarification flow', () => {
  beforeEach(() => {
    quickContextCache.clearAll();
  });

  it('keeps remaining_trips through shift-only reply', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';

    // Simulate that the app asked a clarifying question (shift) and stored remaining_trips.
    quickContextCache.set(userId, {
      lastIntent: 'TARGET_OPTIMIZATION',
      lastQuestion: 'I have 100 trips left to mine 2000 tons.',
      lastAnswer: 'Noted 100 trips left. Which shift are you working on?',
      lastParameters: {
        target: 2000,
        unit: 'ton',
        remaining_trips: 100
      },
      routeTaken: 'rag'
    });

    const chatHistory: ChatMessage[] = [
      {
        id: '1',
        user_id: userId,
        question: 'I have 100 trips left to mine 2000 tons.',
        answer: 'Noted 100 trips left. Which shift are you working on?',
        route_taken: 'rag',
        created_at: new Date().toISOString()
      } as any
    ];

    const decision = await routeQuestion('B', undefined, undefined, chatHistory, userId);
    expect(decision.task).toBe('optimize');
    expect(decision.parameters?.remaining_trips).toBe(100);
    expect(decision.parameters?.shift).toBe('B');
  });
});
