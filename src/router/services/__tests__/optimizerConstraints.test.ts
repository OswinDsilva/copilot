import { describe, it, expect, vi, beforeEach } from 'vitest';
import { optimizeEquipmentSelection } from '../optimizer';
import { getSupabaseClient } from '../../../utils/supabase';

// Mock the Supabase client
vi.mock('../../../utils/supabase', () => ({
  getSupabaseClient: vi.fn()
}));

describe('Optimizer Constraints', () => {
  const mockRawData = [
    { excavator: 'EX-01', tipper_id: 'TIP-01', trip_count: 10, trip_date: '2023-01-01', shift: 'A' },
    { excavator: 'EX-01', tipper_id: 'TIP-02', trip_count: 12, trip_date: '2023-01-01', shift: 'A' },
    { excavator: 'EX-02', tipper_id: 'TIP-01', trip_count: 8, trip_date: '2023-01-01', shift: 'A' },
    { excavator: 'EX-02', tipper_id: 'TIP-03', trip_count: 15, trip_date: '2023-01-01', shift: 'A' },
    { excavator: 'EX-03', tipper_id: 'TIP-04', trip_count: 10, trip_date: '2023-01-01', shift: 'A' }, // Increased from 5 to 10 to pass 50% efficiency threshold
  ];

  beforeEach(() => {
    // Setup mock chain for supabase.rpc().data or supabase.from().select()...
    const mockSelect = vi.fn().mockReturnThis();
    const mockNot = vi.fn().mockReturnThis();
    const mockNeq = vi.fn().mockReturnThis();
    const mockGte = vi.fn().mockReturnThis();
    const mockLte = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockIn = vi.fn().mockReturnThis(); // Added mock for .in()
    
    // Mock the final promise resolution
    const mockQueryBuilder = {
      select: mockSelect,
      not: mockNot,
      neq: mockNeq,
      gte: mockGte,
      lte: mockLte,
      eq: mockEq,
      in: mockIn, // Added .in() to the mock object
      then: (resolve: any) => resolve({ data: mockRawData, error: null })
    };

    vi.mocked(getSupabaseClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: 'Use fallback' }), // Force fallback to table query
      from: vi.fn().mockReturnValue(mockQueryBuilder)
    } as any);
  });

  it('should exclude broken equipment', async () => {
    // Exclude EX-02 (which has the highest performing pair EX-02 + TIP-03)
    const result = await optimizeEquipmentSelection(1, 1, undefined, { exclude: ['EX-02'] });
    
    // Should pick EX-01 because EX-02 is excluded
    expect(result.excavator).toContain('EX-01');
    expect(result.excavator).not.toContain('EX-02');
  });

  it('should only use included equipment', async () => {
    // Only allow EX-03 (the worst one)
    const result = await optimizeEquipmentSelection(1, 1, undefined, { include: ['EX-03'] });
    
    expect(result.excavator).toContain('EX-03');
    expect(result.excavator).not.toContain('EX-01');
    expect(result.excavator).not.toContain('EX-02');
  });

  it('should handle tipper exclusion', async () => {
    // Exclude TIP-02 (EX-01's best match)
    const result = await optimizeEquipmentSelection(1, 1, undefined, { exclude: ['TIP-02'] });
    
    // Should likely pick EX-02 + TIP-03 as it's the next best global max
    expect(result.excavator).toContain('EX-02');
    expect(result.tippers).toContain('TIP-03');
    expect(result.tippers).not.toContain('TIP-02');
  });

  it('should throw error if all equipment is excluded', async () => {
    await expect(optimizeEquipmentSelection(1, 1, undefined, { exclude: ['EX-01', 'EX-02', 'EX-03'] }))
      .rejects.toThrow('No excavators available');
  });

  it('should NOT filter out low efficiency pairs (allow < 50%)', async () => {
    // Mock data with some low efficiency pairs
    const lowEffData = [
      { excavator: 'EX-BAD', tipper_id: 'TIP-BAD', trip_count: 2, trip_date: '2023-01-01', shift: 'A' }, // Low efficiency
      { excavator: 'EX-GOOD', tipper_id: 'TIP-GOOD', trip_count: 15, trip_date: '2023-01-01', shift: 'A' }
    ];

    // Override the mock for this specific test
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), // Added .in()
      then: (resolve: any) => resolve({ data: lowEffData, error: null })
    };
    vi.mocked(getSupabaseClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: 'Use fallback' }),
      from: vi.fn().mockReturnValue(mockQueryBuilder)
    } as any);

    // Exclude the good one, forcing the optimizer to consider the bad one
    // If the 50% filter was active, this would throw "No equipment pairs meet the minimum efficiency threshold"
    const result = await optimizeEquipmentSelection(1, 1, undefined, { exclude: ['EX-GOOD'] });
    
    expect(result.excavator).toContain('EX-BAD');
  });
});
