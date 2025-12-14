import { describe, it, expect, beforeEach } from 'vitest';

import { routeQuestion } from './src/router/index';
import { quickContextCache } from './src/router/services/quickContextCache';
import type { ChatMessage } from './src/types';

describe('optimizer context recovery', () => {
  beforeEach(() => {
    quickContextCache.clearAll();
  });

  it('inherits duration from quickContextCache when chatHistory lacks parameters', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';

    // Simulate DB-loaded history: has text but no structured `parameters`.
    const chatHistory: ChatMessage[] = [
      {
        id: '1',
        user_id: userId,
        question: 'Optimize equipment for Shift A to mine 5000 tons in 3 days',
        answer: 'ok',
        route_taken: 'rag',
        created_at: new Date().toISOString()
      } as any
    ];

    // In-memory context from the actual optimize run (what App.tsx stores).
    quickContextCache.set(userId, {
      lastIntent: 'TARGET_OPTIMIZATION',
      lastQuestion: chatHistory[0].question,
      lastAnswer: 'ok',
      lastParameters: {
        target: 5000,
        unit: 'ton',
        duration: { value: 3, unit: 'days' },
        shift: 'A'
      },
      routeTaken: 'rag'
    });

    const decision = await routeQuestion(
      'Do it without EX-141, BB-56',
      undefined,
      undefined,
      chatHistory,
      userId
    );

    expect(decision.task).toBe('optimize');
    expect(decision.parameters?.target).toBe(5000);
    expect(decision.parameters?.duration).toEqual({ value: 3, unit: 'days' });
  });
});
