# Hybrid Intent Routing System - Detailed Design

## Overview
Combine keyword matching (fast path) with LLM-based routing (fallback) to get the best of both worlds:
- 80-90% of queries use instant keyword matching
- Complex/ambiguous queries fall back to LLM
- Significantly lower cost and latency than pure LLM

## Architecture

```
User Query
    ↓
┌─────────────────────────────────────┐
│ 1. KEYWORD ROUTER (Fast Path)      │
│    - Instant (~1-5ms)               │
│    - Free                           │
│    - Returns: intent + confidence   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 2. CONFIDENCE GATE                  │
│    - High (>0.7): Use keyword result│
│    - Medium (0.4-0.7): LLM fallback │
│    - Low (<0.4): LLM fallback       │
└─────────────────────────────────────┘
    ↓
   / \
  /   \
 ↓     ↓
HIGH   MEDIUM/LOW
 |      |
 |      ↓
 |   ┌─────────────────────────────────────┐
 |   │ 3. LLM ROUTER (Smart Fallback)      │
 |   │    - Slower (~300-800ms)            │
 |   │    - Costs ~$0.001-0.003/query      │
 |   │    - Returns: intent + reasoning    │
 |   └─────────────────────────────────────┘
 |      |
 ↓      ↓
┌─────────────────────────────────────┐
│ 4. FINAL INTENT                     │
│    - Route to appropriate handler   │
│    - Execute SQL generation         │
└─────────────────────────────────────┘
```

## Implementation Details

### Step 1: Keyword Router (Existing System)
```typescript
function keywordRouter(query: string): {
  intent: string;
  confidence: number;
  matched_keywords: string[];
  source: 'keyword' | 'llm';
} {
  // Your existing normalizeUserQuery logic
  const result = normalizeUserQuery(query);
  
  return {
    intent: result.intent,
    confidence: result.confidence,
    matched_keywords: result.matched_keywords,
    source: 'keyword'
  };
}
```

### Step 2: Confidence Thresholds

**Threshold Selection Strategy:**
```typescript
const CONFIDENCE_THRESHOLDS = {
  // High confidence: Trust keyword matching completely
  HIGH: 0.7,
  
  // Medium confidence: Keyword matched but uncertain
  // Examples: multiple intents matched, fuzzy matches only
  MEDIUM: 0.4,
  
  // Low confidence: No clear match or UNKNOWN intent
  // Always use LLM for these
  LOW: 0.4
};
```

**Decision Logic:**
```typescript
function shouldUseLLM(confidence: number, intent: string): boolean {
  // Always use LLM for UNKNOWN intent
  if (intent === 'UNKNOWN') return true;
  
  // High confidence: trust keyword result
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return false;
  
  // Medium/Low confidence: use LLM
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) return true;
  
  // Optional: Use LLM for specific intents that are often ambiguous
  const ambiguousIntents = ['EQUIPMENT_OPTIMIZATION', 'ADVISORY_QUERY'];
  if (ambiguousIntents.includes(intent) && confidence < 0.6) return true;
  
  return false;
}
```

### Step 3: LLM Router Implementation

**LLM Prompt Design:**
```typescript
function buildLLMRouterPrompt(query: string, keywordResult: any): string {
  return `You are an intent classification system for a mining production database chatbot.

Available Intents:
1. EQUIPMENT_OPTIMIZATION - Recommend best equipment/combination for a task
   Examples: "which excavator should I use?", "best tipper for this job"

2. EQUIPMENT_COMBINATION - Show which equipment worked together (data retrieval)
   Examples: "which tippers worked with EX-001?", "show equipment pairs"

3. FORECASTING - Predict future production/trends
   Examples: "forecast next month production", "predict tonnage trends"

4. MONTHLY_SUMMARY - Aggregate monthly production data
   Examples: "show January 2025 summary", "total production for Q1"

5. AGGREGATION_QUERY - Calculate totals, averages, sums
   Examples: "total tonnage", "average trips per day"

6. ORDINAL_ROW_QUERY - Top/bottom N records
   Examples: "top 5 production days", "worst performing shift"

7. EQUIPMENT_SPECIFIC_PRODUCTION - Production for specific equipment ID
   Examples: "show BB-001 production", "EX-189 trips"

8. CHART_VISUALIZATION - Request for charts/graphs
   Examples: "chart production trends", "visualize tonnage"

9. RAG_QUERY - Questions about documents/procedures
   Examples: "what is the safety procedure?", "explain maintenance process"

10. DATA_RETRIEVAL - General data queries not covered above
    Examples: "show all trips", "get production records"

Context from keyword matching:
- Detected intent: ${keywordResult.intent}
- Confidence: ${keywordResult.confidence}
- Matched keywords: ${keywordResult.matched_keywords.join(', ')}

User Query: "${query}"

Task: Determine the SINGLE most appropriate intent for this query.

Response format (JSON):
{
  "intent": "INTENT_NAME",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this intent was chosen"
}`;
}
```

**LLM Call Implementation:**
```typescript
async function llmRouter(
  query: string, 
  keywordResult: any
): Promise<{
  intent: string;
  confidence: number;
  reasoning: string;
  source: 'llm';
}> {
  const prompt = buildLLMRouterPrompt(query, keywordResult);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cheaper, faster model for classification
      messages: [
        { role: 'system', content: 'You are an intent classification expert.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 150, // Small response, just JSON
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      intent: result.intent,
      confidence: result.confidence,
      reasoning: result.reasoning,
      source: 'llm'
    };
  } catch (error) {
    console.error('[LLM Router] Error:', error);
    // Fallback to keyword result on error
    return {
      intent: keywordResult.intent,
      confidence: keywordResult.confidence,
      reasoning: 'LLM error, using keyword result',
      source: 'llm'
    };
  }
}
```

### Step 4: Hybrid Router Orchestration

```typescript
async function hybridRouter(query: string): Promise<{
  intent: string;
  confidence: number;
  parameters: any;
  source: 'keyword' | 'llm';
  reasoning?: string;
  fallback?: boolean;
}> {
  console.log('[Hybrid Router] Processing query:', query);
  
  // Step 1: Always try keyword matching first
  const keywordResult = keywordRouter(query);
  console.log('[Hybrid Router] Keyword result:', {
    intent: keywordResult.intent,
    confidence: keywordResult.confidence,
    matched: keywordResult.matched_keywords
  });
  
  // Step 2: Check if we should use LLM
  const useLLM = shouldUseLLM(keywordResult.confidence, keywordResult.intent);
  
  if (!useLLM) {
    console.log('[Hybrid Router] High confidence, using keyword result');
    return {
      ...keywordResult,
      parameters: extractParameters(query, keywordResult.intent),
      fallback: false
    };
  }
  
  // Step 3: Use LLM for low-confidence queries
  console.log('[Hybrid Router] Low confidence, using LLM fallback');
  const llmResult = await llmRouter(query, keywordResult);
  
  console.log('[Hybrid Router] LLM result:', {
    intent: llmResult.intent,
    confidence: llmResult.confidence,
    reasoning: llmResult.reasoning
  });
  
  // Step 4: Combine LLM intent with keyword parameter extraction
  return {
    intent: llmResult.intent,
    confidence: llmResult.confidence,
    parameters: extractParameters(query, llmResult.intent),
    source: llmResult.source,
    reasoning: llmResult.reasoning,
    fallback: true
  };
}
```

## Performance Characteristics

### Latency Breakdown

**High Confidence Queries (70-80% of traffic):**
```
Keyword matching: 1-5ms
Total latency: 1-5ms ✅
```

**Medium Confidence Queries (15-20% of traffic):**
```
Keyword matching: 1-5ms
LLM call: 300-800ms
Total latency: 301-805ms
```

**Low Confidence/Unknown Queries (5-10% of traffic):**
```
Keyword matching: 1-5ms
LLM call: 300-800ms
Total latency: 301-805ms
```

**Average Latency (weighted):**
```
(0.75 × 5ms) + (0.25 × 500ms) = 128ms average
```

Compare to:
- Pure keyword: 5ms average
- Pure LLM: 500ms average

### Cost Analysis

**Assumptions:**
- 10,000 queries/month
- 25% use LLM (2,500 queries)
- GPT-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
- Average prompt: 500 tokens input, 50 tokens output

**Monthly Cost:**
```
Input cost:  2,500 queries × 500 tokens × $0.150/1M = $0.19
Output cost: 2,500 queries × 50 tokens  × $0.600/1M = $0.08
Total: $0.27/month for 10k queries
```

Compare to:
- Pure keyword: $0/month
- Pure LLM: $1.08/month (4× more expensive)

At scale (1M queries/month):
- Hybrid: $27/month
- Pure LLM: $108/month

## Monitoring & Analytics

**Track These Metrics:**
```typescript
interface RouterMetrics {
  totalQueries: number;
  keywordRouted: number;      // High confidence, no LLM
  llmFallback: number;         // Low confidence, used LLM
  avgKeywordConfidence: number;
  avgLLMConfidence: number;
  llmAgreementRate: number;    // % where LLM agrees with keyword
  avgLatency: number;
}
```

**Example Monitoring:**
```typescript
async function hybridRouterWithMetrics(query: string) {
  const startTime = Date.now();
  const result = await hybridRouter(query);
  const latency = Date.now() - startTime;
  
  // Log to analytics
  analytics.track('intent_routing', {
    query,
    intent: result.intent,
    confidence: result.confidence,
    source: result.source,
    usedLLM: result.fallback,
    latency,
    timestamp: new Date()
  });
  
  return result;
}
```

## Gradual Rollout Strategy

### Phase 1: Shadow Mode (Week 1-2)
```typescript
async function shadowModeRouter(query: string) {
  const keywordResult = keywordRouter(query);
  
  // Run LLM in background, don't use result
  if (Math.random() < 0.1) { // Sample 10% of queries
    llmRouter(query, keywordResult).then(llmResult => {
      // Log comparison for analysis
      analytics.track('shadow_mode_comparison', {
        query,
        keywordIntent: keywordResult.intent,
        llmIntent: llmResult.intent,
        agreement: keywordResult.intent === llmResult.intent
      });
    });
  }
  
  // Always return keyword result
  return keywordResult;
}
```

**Goal**: Measure LLM agreement rate without affecting users

### Phase 2: Canary (Week 3-4)
```typescript
async function canaryRouter(query: string) {
  const keywordResult = keywordRouter(query);
  
  // Use hybrid for 5% of users
  const userId = getUserId();
  if (isInCanaryGroup(userId, 0.05)) {
    return await hybridRouter(query);
  }
  
  return keywordResult;
}
```

**Goal**: Test hybrid with small user group, monitor for issues

### Phase 3: Full Rollout (Week 5+)
```typescript
async function productionRouter(query: string) {
  return await hybridRouter(query);
}
```

**Goal**: All users get hybrid routing

## Edge Cases & Considerations

### 1. LLM Failures
```typescript
async function hybridRouterWithRetry(query: string) {
  const keywordResult = keywordRouter(query);
  
  if (!shouldUseLLM(keywordResult.confidence, keywordResult.intent)) {
    return keywordResult;
  }
  
  try {
    // Try LLM with timeout
    const llmResult = await Promise.race([
      llmRouter(query, keywordResult),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('LLM timeout')), 3000)
      )
    ]);
    return llmResult;
  } catch (error) {
    console.warn('[Hybrid Router] LLM failed, using keyword fallback:', error);
    return {
      ...keywordResult,
      fallback: true,
      reasoning: 'LLM unavailable, used keyword matching'
    };
  }
}
```

### 2. Intent Validation
```typescript
function validateLLMIntent(intent: string): boolean {
  const validIntents = [
    'EQUIPMENT_OPTIMIZATION',
    'EQUIPMENT_COMBINATION',
    'FORECASTING',
    // ... all valid intents
  ];
  return validIntents.includes(intent);
}

async function llmRouter(query: string, keywordResult: any) {
  const result = await callLLM(query, keywordResult);
  
  if (!validateLLMIntent(result.intent)) {
    console.warn('[LLM Router] Invalid intent returned:', result.intent);
    return keywordResult; // Fallback to keyword
  }
  
  return result;
}
```

### 3. Cost Control
```typescript
const DAILY_LLM_LIMIT = 1000; // Max LLM calls per day
let dailyLLMCount = 0;

async function costControlledRouter(query: string) {
  const keywordResult = keywordRouter(query);
  
  if (shouldUseLLM(keywordResult.confidence, keywordResult.intent)) {
    if (dailyLLMCount >= DAILY_LLM_LIMIT) {
      console.warn('[Hybrid Router] Daily LLM limit reached, using keyword');
      return keywordResult;
    }
    dailyLLMCount++;
    return await llmRouter(query, keywordResult);
  }
  
  return keywordResult;
}
```

## When NOT to Use Hybrid

**Stick with pure keyword if:**
- Budget is extremely tight (every penny counts)
- Latency must be <10ms (real-time systems)
- Queries are very structured/predictable
- Current accuracy is >95%

**Consider pure LLM if:**
- Natural language queries are highly varied
- Accuracy is more important than cost/speed
- You're getting <80% accuracy with keywords
- Budget allows for ~$100+/month on routing

## Summary

**Hybrid Approach Best For:**
- ✅ Production systems with diverse queries
- ✅ Balancing cost, speed, and accuracy
- ✅ Systems where 20-30% of queries are ambiguous
- ✅ Gradual improvement over pure keyword matching

**Your Current System:**
Looking at your tests, you have ~0.15-0.19 confidence for some queries but they're still routing correctly. This suggests keyword matching is working well overall.

**Recommendation:**
1. Start with **shadow mode** for 2 weeks
2. Measure LLM agreement rate (should be >85%)
3. If agreement is high and LLM catches edge cases keyword missed, do gradual rollout
4. If agreement is low, improve keyword matching instead

Would you like me to implement the shadow mode version so you can start collecting data?
