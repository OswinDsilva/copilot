import { OpenAI } from 'openai';
import { EquipmentPerformance, DateFilter, getEquipmentPerformanceData } from './optimizer';

// Initialize OpenAI client
// Note: In a real app, this should be handled via a backend proxy to protect the key
// For this demo, we'll use the key from env or settings if available
const getOpenAIClient = () => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not found');
  }
  return new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true // Only for demo purposes
  });
};

export interface LLMOptimizationRequest {
  question: string;
  target?: {
    value: number;
    unit: 'ton' | 'm3';
  };
  remaining_trips?: number;
  shift?: string;
  constraints?: string[];
  dateFilter?: DateFilter;
  duration?: {
    value: number;
    unit: 'days' | 'months' | 'weeks' | 'hours';
  };
}

export interface LLMOptimizationResponse {
  recommendation: string;
  overall_efficiency_percentage: number;
  plan: {
    excavator: string;
    tipper: string;
    assigned_trips: number;
    expected_tons: number;
    expected_volume: number;
    confidence: number;
    efficiency: number;
  }[];
  reasoning: string;
  efficiency_explanation: string;
  summary: string;
  statistics?: {
    target_duration: string;
    estimated_completion_time: string;
    daily_production: number;
    required_daily_rate: number;
  };
}

export async function optimizeWithLLM(request: LLMOptimizationRequest): Promise<LLMOptimizationResponse> {
  try {
    // Cheap in-memory cache for repeated optimizer calls (browser session)
    // Keyed by the inputs that impact plan generation.
    const cacheKey = JSON.stringify({
      q: request.question,
      target: request.target,
      remaining_trips: request.remaining_trips,
      shift: request.shift,
      constraints: request.constraints,
      dateFilter: request.dateFilter,
      duration: request.duration
    });
    (globalThis as any).__optimizerCache ??= new Map<string, { ts: number; data: LLMOptimizationResponse }>();
    const optimizerCache: Map<string, { ts: number; data: LLMOptimizationResponse }> = (globalThis as any).__optimizerCache;
    const cached = optimizerCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < 2 * 60 * 1000) {
      return cached.data;
    }

    // 1. Fetch relevant historical data
    const performanceData = await getEquipmentPerformanceData(request.dateFilter);
    
    // 2. Summarize data for the LLM (to avoid token limits)
    const dataSummary = summarizePerformanceData(performanceData);
    
    // 3. Construct the prompt
    const prompt = constructOptimizationPrompt(request, dataSummary);
    
    // 4. Call LLM
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Use a capable model for reasoning
      messages: [
        {
          role: 'system',
          content: `You are an expert Mining Operations Manager. Your goal is to optimize equipment allocation to meet production targets efficiently.
          
          You have access to historical performance data for Excavators and Tippers.
          
          RULES:
          1. One Excavator is assigned to one Mining Bench.
          2. Multiple Tippers can be assigned to one Excavator.
          3. You must select the best combination of equipment to meet the user's target.
          4. Prioritize high efficiency (trips per shift) and consistency.
          5. MULTI-VARIABLE OPTIMIZATION: If the user provides multiple constraints (e.g., Target AND Shift AND Location), you must optimize for ALL of them simultaneously. Do not ignore any variable unless explicitly told to.
          6. CRITICAL: You MUST meet the target if at all possible. If a single pair is not enough, assign MULTIPLE excavators and tippers. Keep adding equipment until the target is met, even if it lowers the overall efficiency score.
          7. Output your answer in valid JSON format ONLY.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2, // Low temperature for consistent, logical outputs
      response_format: { type: 'json_object' },
      max_tokens: 1400
    });

    const responseContent = completion.choices[0].message.content;
    if (!responseContent) {
      throw new Error('Empty response from LLM');
    }

    // Clean up response content (remove markdown code blocks if present)
    const cleanContent = responseContent.replace(/```json\n?|\n?```/g, '').trim();

    const parsedResponse = JSON.parse(cleanContent);

    // If the model returns an empty plan, avoid rendering nonsense.
    if (!Array.isArray(parsedResponse.plan)) {
      parsedResponse.plan = [];
    }

    // ---------------------------------------------------------
    // POST-PROCESSING: Deterministic Math Verification
    // The LLM often hallucinates the arithmetic in "efficiency_explanation".
    // We will recalculate the weighted efficiency using real data and overwrite it.
    // ---------------------------------------------------------
    
    let totalWeightedEfficiency = 0;
    let totalTrips = 0;
    let totalExpectedTons = 0;
    const calculationSteps: string[] = [];

    parsedResponse.plan.forEach((item: any) => {
      // Find the real historical efficiency for this pair
      const realPerf = performanceData.find(p => 
        p.excavator === item.excavator && p.tipper === item.tipper
      );
      
      // Use real efficiency if found, otherwise fallback to LLM's confidence or default
      const efficiency = realPerf ? realPerf.efficiency : (item.confidence || 0);
      const trips = item.assigned_trips || 0;
      
      // Add efficiency to the plan item for UI display
      item.efficiency = Math.round(efficiency);

      if (trips > 0) {
        totalWeightedEfficiency += efficiency * trips;
        totalTrips += trips;
        calculationSteps.push(`${Math.round(efficiency)} × ${trips}`);
        totalExpectedTons += item.expected_tons || 0;
      }
    });

    const calculatedOverallEfficiency = totalTrips > 0 
      ? Math.round(totalWeightedEfficiency / totalTrips) 
      : 0;

    // Overwrite the LLM's hallucinated values
    parsedResponse.overall_efficiency_percentage = calculatedOverallEfficiency;
    
    // REGENERATE SUMMARY: The LLM often hallucinates the efficiency in the text summary (e.g. "75%").
    // We must overwrite it with the calculated value to ensure consistency.
    let summaryText = '';
    if (request.duration) {
      let durationInDays = 0;
      switch (request.duration.unit) {
        case 'hours': durationInDays = request.duration.value / 24; break;
        case 'days': durationInDays = request.duration.value; break;
        case 'weeks': durationInDays = request.duration.value * 7; break;
        case 'months': durationInDays = request.duration.value * 30; break;
      }
      const totalOverDuration = totalExpectedTons * durationInDays;
      summaryText = `The plan is expected to produce approximately ${Math.round(totalOverDuration)} tons over ${request.duration.value} ${request.duration.unit} with a calculated overall efficiency of ${calculatedOverallEfficiency}%.`;
    } else {
      summaryText = `The plan is expected to produce approximately ${Math.round(totalExpectedTons)} tons with a calculated overall efficiency of ${calculatedOverallEfficiency}%.`;
    }
    parsedResponse.summary = summaryText;
    
    if (totalTrips === 0) {
      parsedResponse.efficiency_explanation =
        `**Formula:** 'Weighted Efficiency = Σ(Pair Efficiency × Trips) / Total Trips'\n\n` +
        `**Calculation:** No trips were allocated in the plan, so efficiency cannot be computed from historical pair performance.\n\n` +
        `**Meaning:** This usually means there was insufficient historical equipment-pair data under the chosen filters (e.g., shift/date).`;
    } else {
      parsedResponse.efficiency_explanation = `**Formula:** 'Weighted Efficiency = Σ(Pair Efficiency × Trips) / Total Trips'\n\n` +
        `**Calculation:** (${calculationSteps.join(' + ')}) / ${totalTrips} = ${calculatedOverallEfficiency}%\n\n` +
        `**Meaning:** This score represents the historical reliability and performance of these specific equipment pairs. A score of ${calculatedOverallEfficiency}% suggests ${calculatedOverallEfficiency > 80 ? 'high' : 'moderate'} confidence in meeting the target.`;
    }

    // Add statistics if duration was requested
    if (request.duration && request.target) {
      const totalProduction = parsedResponse.plan.reduce((sum: number, p: any) => sum + (request.target?.unit === 'm3' ? p.expected_volume : p.expected_tons), 0);
      
      // Calculate precise completion time
      const targetTotal = request.target.value;
      
      // Normalize daily production based on duration unit
      // If user asks for "hours", we assume the plan is for a standard shift (e.g. 12 hours) or hourly?
      // To keep it simple and consistent with the prompt (which asks for a "Single Day/Shift" plan),
      // we assume the plan output is "Production per Day".
      
      const dailyProduction = totalProduction;
      const daysToComplete = targetTotal / dailyProduction;
      
      // Format precise duration (Months, Days, Hours)
      // Assuming 1 Day = 24 Hours for calculation simplicity, or we can just say "Days and Hours"
      const months = Math.floor(daysToComplete / 30);
      const remainingDaysAfterMonths = daysToComplete % 30;
      const days = Math.floor(remainingDaysAfterMonths);
      const hours = Math.round((remainingDaysAfterMonths % 1) * 24);
      
      let completionTimeStr = '';
      if (months > 0) completionTimeStr += `${months} month${months > 1 ? 's' : ''} `;
      if (days > 0) completionTimeStr += `${days} day${days > 1 ? 's' : ''} `;
      if (hours > 0) completionTimeStr += `${hours} hour${hours > 1 ? 's' : ''}`;
      if (completionTimeStr === '') completionTimeStr = 'Less than 1 hour';

      // Calculate required rate based on days (normalized)
      let durationInDays = 0;
      switch (request.duration.unit) {
        case 'hours': durationInDays = request.duration.value / 24; break;
        case 'days': durationInDays = request.duration.value; break;
        case 'weeks': durationInDays = request.duration.value * 7; break;
        case 'months': durationInDays = request.duration.value * 30; break;
      }

      const requiredDailyRate = Math.round(targetTotal / durationInDays);

      parsedResponse.statistics = {
        target_duration: `${request.duration.value} ${request.duration.unit}`,
        estimated_completion_time: completionTimeStr.trim(),
        daily_production: Math.round(dailyProduction),
        required_daily_rate: requiredDailyRate
      };
    }

    const finalResponse = parsedResponse as LLMOptimizationResponse;
    optimizerCache.set(cacheKey, { ts: Date.now(), data: finalResponse });
    return finalResponse;

  } catch (error) {
    console.error('LLM Optimization failed:', error);
    throw error;
  }
}

function summarizePerformanceData(data: EquipmentPerformance[]): string {
  // Group by excavator to show available fleet
  const excavators = new Set(data.map(d => d.excavator));
  const tippers = new Set(data.map(d => d.tipper));
  
  // Calculate average performance for each pair
  const pairPerformance = data.map(d => ({
    pair: `${d.excavator} + ${d.tipper}`,
    avg_trips: Math.round(d.avgTripsPerShift),
    efficiency: Math.round(d.efficiency)
  })).sort((a, b) => b.efficiency - a.efficiency).slice(0, 30); // Top 30 pairs

  const excavatorList = Array.from(excavators);
  const tipperList = Array.from(tippers);

  return JSON.stringify({
    excavators_count: excavators.size,
    tippers_count: tippers.size,
    available_excavators_sample: excavatorList.slice(0, 30),
    available_tippers_sample: tipperList.slice(0, 30),
    top_performing_pairs: pairPerformance,
    total_records: data.length
  }, null, 2);
}

function constructOptimizationPrompt(request: LLMOptimizationRequest, dataContext: string): string {
  const constraints = request.constraints && request.constraints.length > 0 
    ? request.constraints.join(', ') 
    : 'None';

  const durationText = request.duration 
    ? `${request.duration.value} ${request.duration.unit}` 
    : 'Single Shift (Default)';

  return `
    User Request: "${request.question}"
    
    Optimization Variables:
    - Target: ${request.target ? `${request.target.value} ${request.target.unit}` : 'Not specified'}
    - Remaining Trips Constraint: ${request.remaining_trips || 'Not specified'}
    - Duration: ${durationText}
    - Shift: ${request.shift || 'Any'}
    - Additional Constraints: ${constraints}
    
    Historical Performance Data Summary:
    ${dataContext}
    
    Task:
    Based on the historical data, recommend an equipment allocation plan that satisfies ALL the above variables.
    
    CRITICAL INSTRUCTIONS:
    1. TARGET FULFILLMENT: You MUST meet the target. If the top performing pairs are not enough, add more pairs (even lower efficiency ones) until the target is met.
    2. DURATION HANDLING: 
       - If a Duration is specified (e.g., "in 3 days"), calculate the REQUIRED DAILY RATE (Target / Duration).
       - The "plan" you generate should be for a SINGLE DAY/SHIFT that achieves this required daily rate.
       - Do NOT try to output a plan for all 3 days. Output the standard daily configuration needed to hit the goal over time.
    3. MULTI-VARIABLE: If multiple variables are present (e.g. Target + Shift), find the global optimum that respects both.
    4. IMPOSSIBLE CONSTRAINTS (FALLBACK):
       - If the user specifies a "Remaining Trips Constraint" (e.g., "10 trips") AND a Target (e.g., "2000 tons").
       - CHECK if it is physically possible to meet the Target within the Remaining Trips using the available equipment (e.g. Max Tons per Trip * Remaining Trips).
       - IF IMPOSSIBLE:
         a. IGNORE the "Remaining Trips" constraint.
         b. Optimize for the MINIMUM number of trips required to meet the Target.
         c. In the "recommendation" and "reasoning", explicitly state that the constraint could not be met and you are providing the minimum trips plan instead.
    
    Required Output JSON Structure:
    {
      "recommendation": "Short headline recommendation",
      "overall_efficiency_percentage": number (0-100),
      "plan": [
        {
          "excavator": "ID",
          "tipper": "ID",
          "assigned_trips": number,
          "expected_tons": number,
          "expected_volume": number,
          "confidence": number (0-100)
        }
      ],
      "reasoning": "Structure into 3 distinct paragraphs separated by double newlines:\\n\\n**1. Fleet Analysis:** Why these specific excavators were chosen (e.g. 'High reliability in Shift A'). Do not list every single truck's stats.\\n\\n**2. Production Logic:** High-level math summary (e.g. '3 high-capacity excavators × ~15 trips each').\\n\\n**3. Operational Constraints:** How the plan meets Shift/Location requirements.\\n\\nKeep it concise. Do not duplicate the full data table.",
      "efficiency_explanation": "Show the calculation clearly. Format as:\\n\\n**Formula:** 'Weighted Efficiency = Σ(Pair Efficiency × Trips) / Total Trips'\\n\\n**Calculation:** Show the numbers used.\\n\\n**Meaning:** Brief explanation.",
      "summary": "Brief summary of total expected production and efficiency"
    }
  `;
}
