import { describe, expect, it } from 'vitest';
import { routeQuestion } from './src/router';

// Minimal settings object; we avoid any LLM network calls in tests.
const settings: any = { openai_api_key: '' };

function msg(question: string, detected_intent: string, parameters: Record<string, any> = {}) {
  return {
    id: `t-${Math.random().toString(16).slice(2)}`,
    user_id: '00000000-0000-0000-0000-000000000001',
    question,
    answer: 'ok',
    detected_intent,
    parameters,
    created_at: new Date().toISOString(),
  };
}

describe('Optimizer follow-up routing', () => {
  it('routes numeric-led mined+breakdown update to optimize (follow-up)', async () => {
    const chatHistory: any[] = [
      msg(
        'Optimize equipment for Shift A to mine 5000 tons in 3 days',
        'TARGET_OPTIMIZATION',
        {
          shift: 'A',
          target: 5000,
          unit: 'ton',
          duration: { value: 3, unit: 'days' },
        }
      ),
    ];

    const decision = await routeQuestion(
      '2500 tons already mined but EX-139 broke down',
      {},
      settings,
      chatHistory,
      '00000000-0000-0000-0000-000000000001'
    );

    expect(decision.task).toBe('optimize');
    expect(decision.intent).toBe('TARGET_OPTIMIZATION');
    expect(decision.parameters).toBeTruthy();
    expect(decision.parameters.exclude_equipment || []).toContain('EX-139');
    expect(decision.parameters.mined_amount).toBe(2500);
  });

  it('routes equipment-breakdown-only update to optimize (follow-up)', async () => {
    const chatHistory: any[] = [
      msg(
        'Optimize equipment for Shift A to mine 5000 tons in 3 days',
        'TARGET_OPTIMIZATION',
        {
          shift: 'A',
          target: 5000,
          unit: 'ton',
          duration: { value: 3, unit: 'days' },
        }
      ),
    ];

    const decision = await routeQuestion(
      'EX-141 broke down',
      {},
      settings,
      chatHistory,
      '00000000-0000-0000-0000-000000000001'
    );

    expect(decision.task).toBe('optimize');
    expect(decision.intent).toBe('TARGET_OPTIMIZATION');
    expect(decision.parameters.exclude_equipment || []).toContain('EX-141');
  });

  it('treats shift-only reply as follow-up and keeps optimize routing', async () => {
    const chatHistory: any[] = [
      msg(
        'I have 100 trips left to mine 2000 tons',
        'TARGET_OPTIMIZATION',
        {
          target: 2000,
          unit: 'ton',
          remaining_trips: 100,
        }
      ),
    ];

    const decision = await routeQuestion(
      'A',
      {},
      settings,
      chatHistory,
      '00000000-0000-0000-0000-000000000001'
    );

    expect(decision.task).toBe('optimize');
    expect(decision.intent).toBe('TARGET_OPTIMIZATION');
    expect(decision.parameters.shift).toBe('A');
  });

  it('extracts remaining trips in follow-up constraint text', async () => {
    const chatHistory: any[] = [
      msg(
        'Optimize equipment for Shift B to mine 2000 tons in 2 days',
        'TARGET_OPTIMIZATION',
        {
          shift: 'B',
          target: 2000,
          unit: 'ton',
          duration: { value: 2, unit: 'days' },
        }
      ),
    ];

    const decision = await routeQuestion(
      '100 trips left',
      {},
      settings,
      chatHistory,
      '00000000-0000-0000-0000-000000000001'
    );

    expect(decision.task).toBe('optimize');
    expect(decision.parameters.remaining_trips).toBe(100);
  });
});
