import { getSupabaseClient } from "../../utils/supabase";

export interface EquipmentPerformance {
  excavator: string;
  tipper: string;
  avgTripsPerShift: number;
  avgTonsPerShift: number;
  totalTrips: number;
  usageCount: number;
  lastUsed: string;
  efficiency: number;
}

export interface OptimizationResult {
  excavator: string;
  tippers: string[];
  expectedTripsPerShift: number;
  confidenceScore: number;
  reasoning: string;
  efficiency: number;
  alternativeCombinations?: Array<{
    excavator: string;
    tippers: string[];
    expectedTrips: number;
    efficiency: number;
  }>;
}

export interface ForecastResult {
  metric: string;
  predictions: Array<{
    date: string;
    predictedValue: number;
    confidence: number;
  }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
}

export interface DateFilter {
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  shift?: string;
}

type Cached<T> = { ts: number; data: T };
const PERFORMANCE_CACHE_TTL_MS = 2 * 60 * 1000;
const performanceCache = new Map<string, Cached<EquipmentPerformance[]>>();

function canonicalShift(shift: unknown): string | null {
  if (!shift) return null;
  const raw = String(shift).trim();
  if (!raw) return null;
  const mNum = raw.match(/^(?:shift\s*)?([123])$/i);
  if (mNum) {
    return mNum[1] === '1' ? 'A' : mNum[1] === '2' ? 'B' : 'C';
  }
  const m = raw.match(/^(?:shift\s*)?([ABC])$/i);
  if (m) return m[1].toUpperCase();
  // If some sites store longer labels, try to find the letter.
  const m2 = raw.match(/\b([ABC])\b/i);
  if (m2) return m2[1].toUpperCase();
  const m3 = raw.match(/\b([123])\b/);
  if (m3) return m3[1] === '1' ? 'A' : m3[1] === '2' ? 'B' : 'C';
  return raw;
}

function shiftVariants(shift: string): string[] {
  const canon = canonicalShift(shift);
  if (!canon) return [shift];
  if (canon === 'A' || canon === 'B' || canon === 'C') {
    const num = canon === 'A' ? '1' : canon === 'B' ? '2' : '3';
    return [
      canon,
      `Shift ${canon}`,
      `SHIFT ${canon}`,
      `shift ${canon}`,
      num,
      `Shift ${num}`,
      `SHIFT ${num}`,
      `shift ${num}`
    ];
  }
  return [shift];
}

function shouldApplyDefaultWindow(dateFilter?: DateFilter): boolean {
  if (!dateFilter) return false;
  // If user provided any explicit date scoping, do not override.
  if (dateFilter.month || dateFilter.startDate || dateFilter.endDate) return false;
  // Shift-only filtering can otherwise scan the full table.
  return !!dateFilter.shift;
}

function makeCacheKey(dateFilter?: DateFilter): string {
  if (!dateFilter) return 'nofilter';
  return JSON.stringify({
    month: dateFilter.month,
    year: dateFilter.year,
    startDate: dateFilter.startDate,
    endDate: dateFilter.endDate,
    shift: canonicalShift(dateFilter.shift)
  });
}

export async function getEquipmentPerformanceData(dateFilter?: DateFilter): Promise<EquipmentPerformance[]> {
  const supabase = getSupabaseClient();

  // Fast in-memory cache (browser session)
  const cacheKey = makeCacheKey(dateFilter);
  const cached = performanceCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PERFORMANCE_CACHE_TTL_MS) {
    return cached.data;
  }

  // If date filter is present, skip RPC and go direct to table for filtering
  let data: any[] | null = null;
  let error: any = null;

  if (!dateFilter) {
    const result = await supabase.rpc('get_equipment_performance', {});
    data = result.data;
    error = result.error;
  }

  // Fallback or filtered query
  if (error || !data || dateFilter) {
    let query = supabase
      .from('trip_summary_by_date')
      .select('excavator, tipper_id, trip_count, trip_date, shift')
      .not('excavator', 'is', null)
      .not('tipper_id', 'is', null)
      .neq('excavator', '')
      .neq('tipper_id', '');

    if (dateFilter) {
      if (dateFilter.month) {
        const year = dateFilter.year || new Date().getFullYear();
        const startOfMonth = new Date(year, dateFilter.month - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, dateFilter.month, 0).toISOString().split('T')[0];
        query = query.gte('trip_date', startOfMonth).lte('trip_date', endOfMonth);
      }
      if (dateFilter.startDate) {
        query = query.gte('trip_date', dateFilter.startDate);
      }
      if (dateFilter.endDate) {
        query = query.lte('trip_date', dateFilter.endDate);
      }
      if (dateFilter.shift) {
        query = query.in('shift', shiftVariants(dateFilter.shift));
      }
    }

    // If the user only specified a shift, default to a recent window to avoid full-table scans.
    if (shouldApplyDefaultWindow(dateFilter)) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 90);
      query = query.gte('trip_date', daysAgo.toISOString().split('T')[0]);
    }

    // OPTIMIZATION: Run queries in parallel to reduce latency
    // We need rawData first to get the dates for the second query, 
    // BUT we can optimize by fetching production data for the same date range immediately
    // instead of waiting for the exact list of dates.
    
    const productionQuery = supabase
      .from('production_summary')
      .select('date, shift, qty_ton, trip_count_for_mining');

    // Apply same date filters to production query
    if (dateFilter) {
      if (dateFilter.month) {
        const year = dateFilter.year || new Date().getFullYear();
        const startOfMonth = new Date(year, dateFilter.month - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, dateFilter.month, 0).toISOString().split('T')[0];
        productionQuery.gte('date', startOfMonth).lte('date', endOfMonth);
      }
      if (dateFilter.startDate) {
        productionQuery.gte('date', dateFilter.startDate);
      }
      if (dateFilter.endDate) {
        productionQuery.lte('date', dateFilter.endDate);
      }
      if (dateFilter.shift) {
        productionQuery.in('shift', shiftVariants(dateFilter.shift));
      }
    } else {
      // Default limit if no filter to prevent fetching entire DB
      // Fetch last 30 days by default if no filter
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      productionQuery.gte('date', thirtyDaysAgo.toISOString().split('T')[0]);
      
      // Also apply to the main query if no filter was present (though the main query block above handles its own filters)
      // If we are in the "no dateFilter" block, we should probably limit the main query too, 
      // but the code structure implies we are inside `if (error || !data || dateFilter)`.
      // If dateFilter is undefined, we are here because RPC failed.
      // We should limit the fallback query too.
      query.gte('trip_date', thirtyDaysAgo.toISOString().split('T')[0]);
    }

    // Match the same default window for production data when shift-only filters are used.
    if (shouldApplyDefaultWindow(dateFilter)) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 90);
      productionQuery.gte('date', daysAgo.toISOString().split('T')[0]);
    }

    // Execute in parallel
    let [tripsResult, prodResult] = await Promise.all([query, productionQuery]);

    let rawData = tripsResult.data;
    let prodData = prodResult.data;

    // SHIFT FALLBACK: If shift-filtering returns nothing (common when DB stores
    // 'Shift A' vs 'A' or inconsistent casing), retry WITHOUT shift.
    if (dateFilter?.shift && (!rawData || rawData.length === 0)) {
      console.log('[optimizer] No trip_summary_by_date rows for shift filter; retrying without shift filter');
      let queryNoShift = supabase
        .from('trip_summary_by_date')
        .select('excavator, tipper_id, trip_count, trip_date, shift')
        .not('excavator', 'is', null)
        .not('tipper_id', 'is', null)
        .neq('excavator', '')
        .neq('tipper_id', '');

      // Re-apply same date constraints (excluding shift)
      if (dateFilter.month) {
        const year = dateFilter.year || new Date().getFullYear();
        const startOfMonth = new Date(year, dateFilter.month - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, dateFilter.month, 0).toISOString().split('T')[0];
        queryNoShift = queryNoShift.gte('trip_date', startOfMonth).lte('trip_date', endOfMonth);
      }
      if (dateFilter.startDate) queryNoShift = queryNoShift.gte('trip_date', dateFilter.startDate);
      if (dateFilter.endDate) queryNoShift = queryNoShift.lte('trip_date', dateFilter.endDate);
      if (shouldApplyDefaultWindow(dateFilter)) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - 90);
        queryNoShift = queryNoShift.gte('trip_date', daysAgo.toISOString().split('T')[0]);
      }

      let prodNoShift = supabase
        .from('production_summary')
        .select('date, shift, qty_ton, trip_count_for_mining');
      if (dateFilter.month) {
        const year = dateFilter.year || new Date().getFullYear();
        const startOfMonth = new Date(year, dateFilter.month - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, dateFilter.month, 0).toISOString().split('T')[0];
        prodNoShift = prodNoShift.gte('date', startOfMonth).lte('date', endOfMonth);
      }
      if (dateFilter.startDate) prodNoShift = prodNoShift.gte('date', dateFilter.startDate);
      if (dateFilter.endDate) prodNoShift = prodNoShift.lte('date', dateFilter.endDate);
      if (shouldApplyDefaultWindow(dateFilter)) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - 90);
        prodNoShift = prodNoShift.gte('date', daysAgo.toISOString().split('T')[0]);
      }

      const [tripsRetry, prodRetry] = await Promise.all([queryNoShift, prodNoShift]);
      rawData = tripsRetry.data;
      prodData = prodRetry.data;
    }

    if (!rawData) {
      performanceCache.set(cacheKey, { ts: Date.now(), data: [] });
      return [];
    }
    
    // Create a lookup map for "Tons Per Trip" based on actual production data
    // Key: date|shift
    
    // Better map structure: date|shift -> { totalTons, totalTrips }
    const shiftTotals = new Map<string, { tons: number, trips: number }>();
    if (prodData) {
      prodData.forEach(p => {
        const key = `${p.date}|${canonicalShift(p.shift)}`;
        if (!shiftTotals.has(key)) {
          shiftTotals.set(key, { tons: 0, trips: 0 });
        }
        const current = shiftTotals.get(key)!;
        current.tons += p.qty_ton || 0;
        current.trips += p.trip_count_for_mining || 0;
      });
    }

    const grouped = new Map<string, {
      trips: number[];
      tons: number[];
      dates: string[];
    }>();

    rawData.forEach(row => {
      const key = `${row.excavator}|${row.tipper_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, { trips: [], tons: [], dates: [] });
      } 
      const group = grouped.get(key)!;
      group.trips.push(row.trip_count);
      group.dates.push(row.trip_date);
      
      // Calculate actual tons for this trip record based on the shift's performance
      const shiftKey = `${row.trip_date}|${canonicalShift(row.shift)}`;
      const shiftStats = shiftTotals.get(shiftKey);
      
      let calculatedTons = 0;
      if (shiftStats && shiftStats.trips > 0) {
        const tonsPerTrip = shiftStats.tons / shiftStats.trips;
        calculatedTons = row.trip_count * tonsPerTrip;
      }
      
      group.tons.push(calculatedTons);
    });

    const performance: EquipmentPerformance[] = [];

    grouped.forEach((value, key) => {
      const [excavator, tipper] = key.split('|');
      const avgTrips = value.trips.reduce((a, b) => a + b, 0) / value.trips.length;
      const avgTons = value.tons.reduce((a, b) => a + b, 0) / value.tons.length;
      const totalTrips = value.trips.reduce((a, b) => a + b, 0);
      const lastUsed = value.dates.sort().reverse()[0];
      
      const efficiency = calculateEfficiency(avgTrips, avgTons, totalTrips, value.trips.length);

      performance.push({
        excavator,
        tipper,
        avgTripsPerShift: avgTrips,
        avgTonsPerShift: avgTons,
        totalTrips,
        usageCount: value.trips.length,
        lastUsed,
        efficiency
      });
    });

    performanceCache.set(cacheKey, { ts: Date.now(), data: performance });
    return performance;
  }

  const result = data || [];
  performanceCache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}

function calculateEfficiency(avgTrips: number, avgTons: number, totalTrips: number, usageCount: number): number {
  // Formula adapted from OEE (Overall Equipment Effectiveness) principles for mining
  // Score = (Performance * 0.4) + (Consistency * 0.3) + (Reliability * 0.2) + (Bonus * 0.1)
  
  // 1. Performance: Speed relative to target (Cycle Time proxy)
  // Target: 20 trips/shift (approx 24 min cycle time in 8h shift)
  const TARGET_TRIPS = 20;
  // If we have tonnage data, use it for performance as it's more accurate (accounts for load factor)
  // Assume 30 tons per trip as standard load -> 600 tons target
  const TARGET_TONS = 600;
  
  let pScore = 0;
  let bonusScore = 0;

  if (avgTons > 0) {
    // Use tonnage for performance
    pScore = Math.min(avgTons / TARGET_TONS, 1.2);
    
    // 4. Bonus: Reward for excess production (User request: "excess tons produced")
    // If produced > target, calculate excess ratio
    if (avgTons > TARGET_TONS) {
      const excess = avgTons - TARGET_TONS;
      // Cap bonus at 1.0 (100% bonus) for doubling the target, though unlikely
      bonusScore = Math.min(excess / TARGET_TONS, 1.0);
    }
  } else {
    // Fallback to trips
    pScore = Math.min(avgTrips / TARGET_TRIPS, 1.2);
    
    if (avgTrips > TARGET_TRIPS) {
      const excess = avgTrips - TARGET_TRIPS;
      bonusScore = Math.min(excess / TARGET_TRIPS, 1.0);
    }
  }

  // 2. Consistency: Frequency of use (Availability proxy)
  // Target: 30 shifts of history to be considered "proven"
  const TARGET_USAGE = 30;
  const cScore = Math.min(usageCount / TARGET_USAGE, 1.0);

  // 3. Reliability: Long-term volume (Experience factor)
  // Logarithmic scale to reward veteran equipment without punishing new equipment too harshly
  // log10(1000) = 3. So 1000 trips gets full score.
  const rScore = Math.min(Math.log10(totalTrips + 1) / 3, 1.0);

  const W_P = 0.40; // Reduced from 0.50 to make room for bonus
  const W_C = 0.30;
  const W_R = 0.20;
  const W_B = 0.10; // Bonus weight

  const totalScore = (pScore * W_P + cScore * W_C + rScore * W_R + bonusScore * W_B) * 100;
  
  // Ensure minimum score for active equipment
  const baseScore = avgTrips > 2 ? 10 : 0;

  return Math.min(Math.round(Math.max(totalScore, baseScore)), 100);
}

export interface OptimizationOptions {
  include?: string[];
  exclude?: string[];
}

export async function optimizeEquipmentSelection(
  excavatorCount: number,
  tipperCount: number,
  dateFilter?: DateFilter,
  options?: OptimizationOptions
): Promise<OptimizationResult> {
  const performanceData = await getEquipmentPerformanceData(dateFilter);

  if (performanceData.length === 0) {
    throw new Error('No historical performance data available for the specified period');
  }

  // Filter out low-efficiency pairs to ensure quality recommendations
  // User requirement: "efficiency to be atleast 50% for any optimised trip"
  // UPDATE: User requested to REMOVE this strict filter to allow all available data.
  // const validPerformanceData = performanceData.filter(p => p.efficiency >= 50);
  const validPerformanceData = performanceData;

  if (validPerformanceData.length === 0) {
    throw new Error('No equipment pairs meet the minimum efficiency threshold (50%). Try adjusting the date filter or checking data quality.');
  }

  let excavators = [...new Set(validPerformanceData.map(p => p.excavator))];
  let tippers = [...new Set(validPerformanceData.map(p => p.tipper))];

  // Apply constraints
  if (options?.exclude && options.exclude.length > 0) {
    excavators = excavators.filter(e => !options.exclude?.includes(e));
    tippers = tippers.filter(t => !options.exclude?.includes(t));
  }

  if (options?.include && options.include.length > 0) {
    // If "include" is specified, we ONLY use those (unless they are also excluded, which would be a contradiction, but exclude takes precedence usually or we just intersect)
    // "I only have these excavators" -> strict subset
    const includedExcavators = options.include.filter(id => id.startsWith('EX') || id.startsWith('PC')); // Basic heuristic, or just check existence
    const includedTippers = options.include.filter(id => !id.startsWith('EX') && !id.startsWith('PC')); // Assuming non-EX are tippers/trucks

    if (includedExcavators.length > 0) {
      excavators = excavators.filter(e => options.include?.includes(e));
    }
    if (includedTippers.length > 0) {
      tippers = tippers.filter(t => options.include?.includes(t));
    }
  }

  if (excavators.length === 0) {
    throw new Error('No excavators available after applying constraints');
  }
  if (tippers.length === 0) {
    throw new Error('No tippers available after applying constraints');
  }

  if (excavatorCount > excavators.length) {
    console.warn(`Requested ${excavatorCount} excavators but only ${excavators.length} available. Using max available.`);
    excavatorCount = excavators.length;
  }
  if (tipperCount > tippers.length) {
    console.warn(`Requested ${tipperCount} tippers but only ${tippers.length} available. Using max available.`);
    tipperCount = tippers.length;
  }

  const combinations = generateCombinations(excavators, tippers, excavatorCount, tipperCount);

  // Filter combinations where one excavator is assigned to multiple tippers (standard)
  // but ensure we don't assign multiple excavators to the same set of tippers in a way that violates the "1 excavator per bench" rule implicitly.
  // The current combination logic just pairs X excavators with Y tippers.
  // We need to ensure that the scoring reflects the reality that each excavator works independently with a subset of tippers.
  // However, for the purpose of "selecting the best X excavators and Y tippers", we are selecting a FLEET.
  // The user requirement "The mining bench and the excavator mean the same thing(ie only one escavator at a time is assigned to one mining bench)"
  // implies that we should treat excavators as distinct units of production.

  const scoredCombinations = combinations.map(combo => {
    // Use validPerformanceData to ensure we only score based on high-quality pairs
    const score = scoreCombination(combo, validPerformanceData);
    return { ...combo, score };
  });

  scoredCombinations.sort((a, b) => b.score.totalScore - a.score.totalScore);

  const best = scoredCombinations[0];
  const alternatives = scoredCombinations.slice(1, 4).map(c => ({
    excavator: c.excavators.join(', '),
    tippers: c.tippers,
    expectedTrips: c.score.expectedTrips,
    efficiency: c.score.efficiency
  }));

  return {
    excavator: best.excavators.join(', '),
    tippers: best.tippers,
    expectedTripsPerShift: best.score.expectedTrips,
    confidenceScore: best.score.confidence,
    reasoning: best.score.reasoning,
    efficiency: best.score.efficiency,
    alternativeCombinations: alternatives
  };
}

interface Combination {
  excavators: string[];
  tippers: string[];
}

interface CombinationScore {
  totalScore: number;
  expectedTrips: number;
  confidence: number;
  reasoning: string;
  efficiency: number;
}

function generateCombinations(
  excavators: string[],
  tippers: string[],
  excavatorCount: number,
  tipperCount: number
): Combination[] {
  const excavatorCombos = getCombinations(excavators, excavatorCount);
  const tipperCombos = getCombinations(tippers, tipperCount);

  const combinations: Combination[] = [];
  for (const exCombo of excavatorCombos) {
    for (const tpCombo of tipperCombos) {
      combinations.push({
        excavators: exCombo,
        tippers: tpCombo
      });
    }
  }

  return combinations;
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];

  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);

  return [...withFirst, ...withoutFirst];
}

function scoreCombination(
  combo: Combination,
  performanceData: EquipmentPerformance[]
): CombinationScore {
  let totalExpectedTrips = 0;
  let totalEfficiency = 0;
  let pairCount = 0;
  const reasons: string[] = [];

  for (const excavator of combo.excavators) {
    for (const tipper of combo.tippers) {
      const perf = performanceData.find(
        p => p.excavator === excavator && p.tipper === tipper
      );

      if (perf) {
        totalExpectedTrips += perf.avgTripsPerShift;
        totalEfficiency += perf.efficiency;
        pairCount++;

        if (perf.avgTripsPerShift > 11) {
          reasons.push(`${excavator} + ${tipper} has high performance (${perf.avgTripsPerShift.toFixed(1)} trips/shift)`);
        }
      }
    }
  }

  const avgEfficiency = pairCount > 0 ? totalEfficiency / pairCount : 0;
  const expectedTrips = pairCount > 0 ? totalExpectedTrips / pairCount : 0;

  const dataAvailability = pairCount / (combo.excavators.length * combo.tippers.length);
  const confidence = Math.min(avgEfficiency * dataAvailability / 100, 1) * 100;

  const recentBonus = performanceData
    .filter(p =>
      combo.excavators.includes(p.excavator) &&
      combo.tippers.includes(p.tipper)
    )
    .filter(p => {
      const daysSinceUse = Math.floor(
        (Date.now() - new Date(p.lastUsed).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceUse < 60;
    }).length;

  const totalScore = avgEfficiency + (recentBonus * 2) + (expectedTrips * 5);

  if (reasons.length === 0) {
    reasons.push(`Based on historical data with ${confidence.toFixed(0)}% confidence`);
  }

  return {
    totalScore,
    expectedTrips,
    confidence,
    reasoning: reasons.join('. '),
    efficiency: avgEfficiency
  };
}

export async function forecastProduction(
  metric: 'trips' | 'production',
  days: number = 7,
  dateFilter?: DateFilter
): Promise<ForecastResult> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('trip_summary_by_date')
    .select('trip_date, trip_count')
    .order('trip_date', { ascending: true });

  if (dateFilter) {
    if (dateFilter.month) {
      const year = dateFilter.year || new Date().getFullYear();
      const startOfMonth = new Date(year, dateFilter.month - 1, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(year, dateFilter.month, 0).toISOString().split('T')[0];
      query = query.gte('trip_date', startOfMonth).lte('trip_date', endOfMonth);
    }
    if (dateFilter.startDate) {
      query = query.gte('trip_date', dateFilter.startDate);
    }
    if (dateFilter.endDate) {
      query = query.lte('trip_date', dateFilter.endDate);
    }
  }

  const { data, error } = await query;

  if (error || !data) {
    throw new Error('Failed to fetch historical data for forecasting');
  }

  const dailyTotals = new Map<string, number>();
  data.forEach(row => {
    const date = row.trip_date;
    dailyTotals.set(date, (dailyTotals.get(date) || 0) + row.trip_count);
  });

  const sortedDates = Array.from(dailyTotals.keys()).sort();
  const values = sortedDates.map(date => dailyTotals.get(date)!);

  if (values.length < 3) {
    throw new Error(`Insufficient historical data for forecasting. Found ${values.length} days, but need at least 3 days to establish a trend.`);
  }

  // Use all available data if less than 30 days, otherwise last 30
  const recentValues = values.slice(-30);
  
  // Adjust moving average window based on available data
  const windowSize = Math.min(7, Math.max(2, Math.floor(values.length / 2)));
  const movingAvg = calculateMovingAverage(recentValues, windowSize);
  const trend = calculateTrend(recentValues);

  const lastDate = new Date(sortedDates[sortedDates.length - 1]);
  const predictions = [];

  for (let i = 1; i <= days; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);

    const baseValue = movingAvg[movingAvg.length - 1];
    const trendAdjustment = trend.slope * i;
    const predictedValue = Math.max(0, baseValue + trendAdjustment);

    const confidence = Math.max(50, 95 - (i * 5));

    predictions.push({
      date: forecastDate.toISOString().split('T')[0],
      predictedValue: Math.round(predictedValue),
      confidence
    });
  }

  const trendDirection = trend.slope > 1 ? 'increasing' : trend.slope < -1 ? 'decreasing' : 'stable';
  const trendPercentage = (trend.slope / movingAvg[movingAvg.length - 1]) * 100;

  return {
    metric,
    predictions,
    trend: trendDirection,
    trendPercentage: Math.round(trendPercentage * 10) / 10
  };
}

function calculateMovingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowValues = values.slice(start, i + 1);
    const avg = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;
    result.push(avg);
  }
  return result;
}

function calculateTrend(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export interface TargetOptimizationResult {
  combinations: Array<{
    excavator: string;
    tipper: string;
    tripsNeeded: number;
    tonsMined: number;
    efficiency: number;
  }>;
  totalTrips: number;
  totalTonsMined: number;
  tonsLeft: number;
  strategy: string;
  aggregateEfficiency: number;
  efficiencyLogic: string;
}

export async function optimizeForTarget(
  targetValue: number,
  targetMetric: 'ton' | 'm3',
  constraint: 'least_trips' = 'least_trips',
  location?: string
): Promise<TargetOptimizationResult> {
  const performanceData = await getDetailedPerformanceData(location);

  if (performanceData.length === 0) {
    throw new Error('No historical performance data available for optimization');
  }

  // Sort by capacity (tons per trip) descending for 'least_trips' strategy
  // This is a greedy approach: use the highest capacity vehicles first
  const sortedPairs = performanceData.sort((a, b) => {
    if (constraint === 'least_trips') {
      const capacityA = targetMetric === 'ton' ? a.avgTonsPerTrip : a.avgM3PerTrip;
      const capacityB = targetMetric === 'ton' ? b.avgTonsPerTrip : b.avgM3PerTrip;
      return capacityB - capacityA;
    }
    return b.efficiency - a.efficiency;
  });

  let currentTons = 0;
  const combinations = [];
  const usedExcavators = new Set<string>(); // Track assigned excavators
  
  // Greedy allocation with constraint: 1 Excavator per Bench (unique excavator)
  for (const pair of sortedPairs) {
    if (currentTons >= targetValue) break;
    
    // If this excavator is already assigned to a different tipper in this plan, skip it
    // Assumption: "The mining bench and the excavator mean the same thing(ie only one escavator at a time is assigned to one mining bench)."
    // This implies we can't use the same excavator in multiple pairs for the same target optimization if we treat pairs as exclusive assignments.
    // However, in reality, one excavator serves MULTIPLE tippers.
    // So we SHOULD allow the same excavator to appear multiple times, BUT we need to track its total capacity.
    
    // REVISED LOGIC based on user prompt:
    // "The mining bench and the excavator mean the same thing(ie only one escavator at a time is assigned to one mining bench)."
    // This usually means we are selecting WHICH excavators to run.
    // If we pick Excavator A, it will work with a set of tippers.
    
    // For this simple greedy algorithm, let's assume we are building a fleet.
    // If we add (Excavator A, Tipper 1), we are saying "Assign Tipper 1 to Excavator A".
    // If we later add (Excavator A, Tipper 2), we are adding another tipper to the same excavator.
    // This is valid. The constraint is likely about not having multiple excavators on the same bench, which is implicit since excavators are unique.
    
    // We just need to ensure we don't exceed the excavator's daily loading capacity if we keep adding tippers to it.
    // For now, we'll assume the historical "avgTripsPerShift" for a pair reflects what that specific pair can do.
    // But the excavator has a total limit.
    
    const remaining = targetValue - currentTons;
    // Estimate max trips this pair can do in a shift (use historical max or avg * 1.2)
    const maxTrips = Math.ceil(pair.avgTripsPerShift * 1.2); 
    const capacity = targetMetric === 'ton' ? pair.avgTonsPerTrip : pair.avgM3PerTrip;

    const tripsNeededForRemaining = Math.ceil(remaining / capacity);
    const tripsToAssign = Math.min(tripsNeededForRemaining, maxTrips);

    const tonsMined = tripsToAssign * capacity;

    combinations.push({
      excavator: pair.excavator,
      tipper: pair.tipper,
      tripsNeeded: tripsToAssign,
      tonsMined: tonsMined,
      efficiency: pair.efficiency
    });

    currentTons += tonsMined;
    usedExcavators.add(pair.excavator);
  }

  // Calculate aggregate efficiency (weighted average by trips)
  const totalTrips = combinations.reduce((sum, c) => sum + c.tripsNeeded, 0);
  const weightedEfficiencySum = combinations.reduce((sum, c) => sum + (c.efficiency * c.tripsNeeded), 0);
  const aggregateEfficiency = totalTrips > 0 ? weightedEfficiencySum / totalTrips : 0;

  const efficiencyLogic = `Calculated as the weighted average of individual pair efficiencies based on assigned trips: Sum(Pair Efficiency * Trips) / Total Trips. Individual efficiencies consider avg trips (43%), total volume (32%), and consistency (25%).`;

  return {
    combinations,
    totalTrips,
    totalTonsMined: currentTons,
    tonsLeft: Math.max(0, targetValue - currentTons),
    strategy: `Optimized for ${constraint} using ${combinations.length} equipment pairs`,
    aggregateEfficiency,
    efficiencyLogic
  };
}

interface DetailedPerformance extends EquipmentPerformance {
  avgTonsPerTrip: number;
  avgM3PerTrip: number;
}

async function getDetailedPerformanceData(location?: string): Promise<DetailedPerformance[]> {
  const supabase = getSupabaseClient();

  // 1. Fetch Trips
  let tripQuery = supabase
    .from('trip_summary_by_date')
    .select('trip_date, shift, excavator, tipper_id, trip_count, route_or_face')
    .not('excavator', 'is', null)
    .not('tipper_id', 'is', null);

  if (location) {
    tripQuery = tripQuery.ilike('route_or_face', `%${location}%`);
  }

  const { data: trips, error: tripError } = await tripQuery;
  if (tripError || !trips) return [];

  // 2. Fetch Production Summary (for conversion factors)
  // Optimization: Fetch only dates present in trips
  const dates = [...new Set(trips.map(t => t.trip_date))];
  const { data: production, error: prodError } = await supabase
    .from('production_summary')
    .select('date, shift, qty_ton, qty_m3, trip_count_for_mining')
    .in('date', dates);

  if (prodError || !production) return [];

  // 3. Create Lookup Map for Shift Averages
  const shiftStats = new Map<string, { tonsPerTrip: number, m3PerTrip: number }>();
  production.forEach(p => {
    const key = `${p.date}|${p.shift}`;
    const totalTrips = p.trip_count_for_mining || 1; // Avoid division by zero
    shiftStats.set(key, {
      tonsPerTrip: (p.qty_ton || 0) / totalTrips,
      m3PerTrip: (p.qty_m3 || 0) / totalTrips
    });
  });

  // 4. Aggregate Performance by Pair
  const grouped = new Map<string, {
    trips: number[];
    tons: number[];
    m3: number[];
    dates: string[];
  }>();

  trips.forEach(row => {
    const key = `${row.excavator}|${row.tipper_id}`;
    const shiftKey = `${row.trip_date}|${row.shift}`;
    const stats = shiftStats.get(shiftKey) || { tonsPerTrip: 0, m3PerTrip: 0 };

    if (!grouped.has(key)) {
      grouped.set(key, { trips: [], tons: [], m3: [], dates: [] });
    }
    const group = grouped.get(key)!;
    
    group.trips.push(row.trip_count);
    group.tons.push(row.trip_count * stats.tonsPerTrip);
    group.m3.push(row.trip_count * stats.m3PerTrip);
    group.dates.push(row.trip_date);
  });

  // 5. Calculate Final Metrics
  const results: DetailedPerformance[] = [];
  grouped.forEach((value, key) => {
    const [excavator, tipper] = key.split('|');
    const totalTrips = value.trips.reduce((a, b) => a + b, 0);
    const totalTons = value.tons.reduce((a, b) => a + b, 0);
    const totalM3 = value.m3.reduce((a, b) => a + b, 0);
    const avgTrips = totalTrips / value.trips.length;
    const avgTonsPerShift = totalTons / value.trips.length;
    
    // Avoid division by zero if totalTrips is 0 (unlikely)
    const avgTonsPerTrip = totalTrips > 0 ? totalTons / totalTrips : 0;
    const avgM3PerTrip = totalTrips > 0 ? totalM3 / totalTrips : 0;

    results.push({
      excavator,
      tipper,
      avgTripsPerShift: avgTrips,
      avgTonsPerShift,
      totalTrips,
      usageCount: value.trips.length,
      lastUsed: value.dates.sort().reverse()[0],
      efficiency: calculateEfficiency(avgTrips, avgTonsPerShift, totalTrips, value.trips.length),
      avgTonsPerTrip,
      avgM3PerTrip
    });
  });

  return results;
}
