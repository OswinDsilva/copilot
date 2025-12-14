import { describe, it, expect, vi, beforeEach } from 'vitest';
import { optimizeWithLLM } from '../llmOptimizer';
import * as optimizerModule from '../optimizer';

// Mock OpenAI
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    OpenAI: class {
      chat = {
        completions: {
          create: mockCreate
        }
      };
    }
  };
});

// Mock Optimizer Data Fetching
vi.mock('../optimizer', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getEquipmentPerformanceData: vi.fn(),
  };
});

describe('LLM Optimizer Math Verification', () => {
  const mockPerformanceData = [
    { excavator: 'EX-01', tipper: 'TIP-01', avgTripsPerShift: 10, avgTonsPerShift: 300, efficiency: 90, totalTrips: 100, usageCount: 10, lastUsed: '2023-01-01' },
    { excavator: 'EX-02', tipper: 'TIP-02', avgTripsPerShift: 10, avgTonsPerShift: 300, efficiency: 80, totalTrips: 100, usageCount: 10, lastUsed: '2023-01-01' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(optimizerModule.getEquipmentPerformanceData).mockResolvedValue(mockPerformanceData);
    
    // Mock environment variable for API key
    import.meta.env.VITE_OPENAI_API_KEY = 'test-key';
  });

  it('should correct hallucinated math from LLM', async () => {
    // LLM returns a plan with WRONG efficiency calculation
    // Real Data: EX-01+TIP-01 (90 eff), EX-02+TIP-02 (80 eff)
    // Plan: 10 trips each.
    // Correct Math: (90*10 + 80*10) / 20 = 1700 / 20 = 85%
    // Hallucinated Math: 99%
    
    const hallucinatedResponse = {
      recommendation: "Use these",
      overall_efficiency_percentage: 99, // WRONG
      plan: [
        { excavator: 'EX-01', tipper: 'TIP-01', assigned_trips: 10, expected_tons: 100, expected_volume: 100, confidence: 90 },
        { excavator: 'EX-02', tipper: 'TIP-02', assigned_trips: 10, expected_tons: 100, expected_volume: 100, confidence: 80 }
      ],
      reasoning: "Because I said so",
      efficiency_explanation: "90 + 80 = 99", // WRONG
      summary: "Good plan"
    };

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(hallucinatedResponse) } }]
    });

    const result = await optimizeWithLLM({ question: "optimize" });

    // Verify the math was corrected
    expect(result.overall_efficiency_percentage).toBe(85);
    expect(result.efficiency_explanation).toContain('85%');
    expect(result.efficiency_explanation).toContain('90 × 10');
    expect(result.efficiency_explanation).toContain('80 × 10');
  });
});
