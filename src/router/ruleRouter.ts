/**
 * Task-Based Deterministic Router
 * 
 * Routes queries to one of three tasks based on keywords and patterns:
 * - OPTIMIZE: Equipment selection, forecasting, planning (ML/AI features)
 * - SQL: Calculations, visualizations, data retrieval from database
 * - RAG: Advisory questions, procedures, best practices from documents
 */

import type { RouterDecision } from '../types';
import type { IntentResult } from './services/intent';
import { debugBranch } from './helpers/debug';
import { CONFIDENCE_THRESHOLDS } from './constants';
 

// Keyword patterns for task detection
const OPTIMIZE_KEYWORDS = /\b(which excavator|what equipment should|recommend equipment|optimal allocation|best combination|optimize equipment|predict|forecast|estimate future|project|next month production|how many excavators do i need|equipment requirement|i have to pick|i need to pick|i have to select|i need to select|i have to choose|i need to choose|i want to pick|i want to select|help me pick|help me select|help me choose|optimisation|optimisatio|optimization|optimize|optimise)\b/i;

const TARGET_OPTIMIZATION_KEYWORDS = /\b(mine \d+|target \d+|need to mine|production target|optimize for \d+|how to mine \d+)\b/i;

const VISUALIZATION_KEYWORDS = /\b(graph|chart|plot|visualize|visualization|visualisation|draw|overlay|bar chart|line graph|pie chart|histogram|show on graph|plot over time|chart by|graph by|average line|mean line|trend line|overlay average|add mean|with different colors|separate by|color coded|by shift|by equipment)\b/i;

const CALCULATION_KEYWORDS = /\b(average|mean|median|sum|total|count|max|min|highest|lowest|top|bottom|most|least|calculate|compute|what is the average|find the mean|compare|versus|vs|difference between)\b/i;

const ADVISORY_KEYWORDS = /\b(how to|how do i|how can i|how should i|best practice|best practices|best way|improve|reduce|increase|what is the process|what are the steps|what are the best|what is the best|guideline|guidelines|procedure|procedures|safety|policy|policies|standard operating procedure|sop|recommendation|recommendations)\b/i;

// Statistical keywords for advanced stats (distinct from aggregation)
const STATISTICAL_KEYWORDS = /\b(mean|median|mode|standard deviation|stddev|std dev|deviation)\b/i;

export function ruleRoute(
  question: string,
  intent: IntentResult
): RouterDecision | null {
  const { parameters: params, intent: intentName, confidence } = intent;
  const lowerQuestion = question.toLowerCase();

  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY 2.5 - SQL: STATISTICAL queries (mean, median, mode, stddev)
  // Must check BEFORE general aggregation to avoid misrouting
  // ═══════════════════════════════════════════════════════════════════
  if (intentName === 'STATISTICAL_QUERY' || STATISTICAL_KEYWORDS.test(lowerQuestion)) {
    debugBranch('statistical_query');
    
    // Determine query type based on patterns
    const isMonthRanking = /\bwhich\s+month\b/i.test(lowerQuestion);
    const isChartByMonth = /\b(chart|graph|plot|visualize).*by\s+month\b/i.test(lowerQuestion) || params.group_by_month;
    const isMultiMonth = params.is_multi_month || params.months;
    const isAllMonths = params.all_months;
    const hasHighestLowest = /\b(highest|lowest|maximum|minimum|biggest|smallest|greatest|least|most|top|bottom)\b/i.test(lowerQuestion);
    
    // Determine groupBy and selectMonthName
    let groupBy = undefined;
    let selectMonthName = false;
    let queryType: 'simple' | 'multi_month' | 'ranking' | 'chart' = 'simple';
    
    if (isMonthRanking) {
      groupBy = 'EXTRACT(MONTH FROM date)';
      selectMonthName = true;
      queryType = 'ranking';
    } else if (isChartByMonth || isAllMonths) {
      groupBy = 'EXTRACT(MONTH FROM date)';
      selectMonthName = true;
      queryType = 'chart';
    } else if (isMultiMonth) {
      groupBy = 'EXTRACT(MONTH FROM date)';
      selectMonthName = true;
      queryType = 'multi_month';
    }
    
    const statisticalTemplate = {
      operations: [
        ...(lowerQuestion.includes('mean') || /\baverage\b/i.test(lowerQuestion) ? ['mean' as const] : []),
        ...(lowerQuestion.includes('median') ? ['median' as const] : []),
        ...(lowerQuestion.includes('mode') ? ['mode' as const] : []),
        ...(lowerQuestion.includes('standard deviation') || lowerQuestion.includes('stddev') || lowerQuestion.includes('std dev') || lowerQuestion.includes('deviation') ? ['stddev' as const] : [])
      ],
      targetColumn: params.target_column || 'qty_ton',
      groupBy: groupBy,
      selectMonthName: selectMonthName,
      queryType: queryType,
      orderBy: (isMonthRanking && hasHighestLowest) ? 'detect_from_question' : undefined,
      filters: params.months ? { months: params.months } : params.month ? { month: params.month } : undefined
    };
    
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.HIGH,
      reason: 'Statistical query (mean, median, mode, stddev) detected',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'statistical_rule_template',
      intent: intentName || 'STATISTICAL_QUERY',
      parameters: {
        ...params,
        statisticalTemplate  // Add template to params so SQL builder can access it
      },
      statisticalTemplate  // Also keep it on decision for UI display
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY -1: Intent-based routing (trust intent detection over keywords)
  // Check specific intents FIRST before keyword patterns
  // ═══════════════════════════════════════════════════════════════════
  
  // TARGET_OPTIMIZATION: Planning to achieve production targets (e.g., "mine 700 tons using 2 pairs")
  if (intentName === 'TARGET_OPTIMIZATION') {
    debugBranch('target_optimization_intent');
    return {
      task: 'optimize',
      confidence: 0.95,
      reason: 'Target optimization query - planning equipment allocation for production goal',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'target_optimize_rule_template',
      intent: intentName,
      parameters: params
    };
  }
  
  // EQUIPMENT_OPTIMIZATION: Always route to optimize task (even if "best" triggers advisory)
  if (intentName === 'EQUIPMENT_OPTIMIZATION') {
    debugBranch('equipment_optimization_intent');
    return {
      task: 'optimize',
      confidence: 0.95,
      reason: 'Equipment optimization query - requires ML/AI model',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'optimize_rule_template',
      intent: intentName,
      parameters: params
    };
  }
  
  // EQUIPMENT_COMBINATION: Always route to SQL (historical data about which equipment worked together)
  if (intentName === 'EQUIPMENT_COMBINATION') {
    debugBranch('equipment_combination_intent');
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.HIGH,
      reason: 'Equipment combination query - analyzing equipment pairings',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'equipment_combination_override',
      intent: intentName,
      parameters: params
    };
  }
  
  // COMPARISON_QUERY: Only route deterministically if it's a shift or month comparison
  // Equipment comparisons should go to LLM for proper SQL generation
  if (intentName === 'COMPARISON_QUERY') {
    // Check if this is an equipment comparison (has equipment IDs)
    const hasEquipmentIds = params.equipment_ids && params.equipment_ids.length > 0;
    
    if (hasEquipmentIds) {
      // Let LLM handle equipment comparisons - don't use template
      debugBranch('comparison_query_equipment_to_llm');
      // Fall through to LLM routing
    } else {
      // Only route shift/month comparisons deterministically
      debugBranch('comparison_query_shift_month');
      return {
        task: 'sql',
        confidence: CONFIDENCE_THRESHOLDS.HIGH,
        reason: 'Comparison query - comparing shifts or months',
        route_source: 'deterministic',
        original_question: question,
        template_used: 'comparison_query_override',
        intent: intentName,
        parameters: params
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY 0 - RAG: Advisory queries, best practices, procedures
  // Must check ADVISORY first to avoid "optimize" keyword conflict
  // ═══════════════════════════════════════════════════════════════════
  
  // Check for advisory queries - both by intent and keyword pattern
  if (intentName === 'ADVISORY_QUERY' || ADVISORY_KEYWORDS.test(lowerQuestion)) {
    debugBranch('advisory_procedural');
    return {
      task: 'rag',
      confidence: CONFIDENCE_THRESHOLDS.GOOD,
      reason: 'Advisory/procedural query - retrieving guidelines from documents',
      route_source: 'deterministic',
      namespaces: ['combined'],
      original_question: question,
      template_used: 'advisory_rule_template',
      intent: intentName || 'ADVISORY_QUERY',
      parameters: params
    };
  }
  
  // Now check for actual optimization (equipment selection/forecasting)
  if (intentName === 'EQUIPMENT_OPTIMIZATION' || intentName === 'FORECASTING' || 
      OPTIMIZE_KEYWORDS.test(lowerQuestion) || TARGET_OPTIMIZATION_KEYWORDS.test(lowerQuestion)) {
    debugBranch('optimize');
    return {
      task: 'optimize',
      confidence: 0.95,
      reason: 'Equipment optimization/forecasting query - requires ML/AI model',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'optimize_rule_template',
      intent: intentName,
      parameters: params
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY 1 - SQL: VISUALIZATION/CHART questions
  // Charts ALWAYS need SQL for data aggregation and calculations
  // ═══════════════════════════════════════════════════════════════════
  if (intentName === 'CHART_VISUALIZATION' || VISUALIZATION_KEYWORDS.test(lowerQuestion)) {
    debugBranch('chart_visualization');
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.HIGH,
      reason: 'Visualization/chart query - needs SQL for data aggregation',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'visualization_rule_template',
      intent: intentName || 'CHART_VISUALIZATION',
      parameters: params
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY 3 - SQL: CALCULATION/AGGREGATION queries
  // All math operations require SQL aggregation functions
  // ═══════════════════════════════════════════════════════════════════
  
  // 3.1 - Route/Face analysis (must check BEFORE general calculations)
  // Questions about routes, faces, benches should use trip_summary_by_date
  if (/\b(route|face|bench|haul|path)\b/i.test(lowerQuestion)) {
    debugBranch('routes_faces_analysis');
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.GOOD,
      reason: 'Route/face analysis - requires trip_summary_by_date table',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'routes_faces_rule_template',
      intent: 'ROUTES_FACES_ANALYSIS',
      parameters: params
    };
  }
  
  // 3.2 - General calculations/aggregations
  if (intentName === 'AGGREGATION_QUERY' || CALCULATION_KEYWORDS.test(lowerQuestion)) {
    debugBranch('calculation_aggregation');
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.GOOD,
      reason: 'Calculation/aggregation query - needs SQL for database operations',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'aggregation_rule_template',
      intent: intentName || 'AGGREGATION_QUERY',
      parameters: params
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY 4 - SQL: DATA RETRIEVAL questions
  // All other data queries from database tables
  // ═══════════════════════════════════════════════════════════════════
  
  // 4.1 - Ordinal row selection (highest specificity)
  if (params.row_number) {
    debugBranch('ordinal_row', params.row_number);
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.VERY_HIGH,
      reason: `Ordinal row request (${params.row_number}) - direct database access`,
      route_source: 'deterministic',
      original_question: question,
      template_used: 'ordinal_row_override',
      intent: intentName || 'ORDINAL_ROW_QUERY',
      parameters: params
    };
  }

  // 4.2 - Specific equipment IDs (BB-001, EX-189, etc.)
  if (params.equipment_ids && params.equipment_ids.length > 0) {
    debugBranch('equipment_specific_production', params.equipment_ids);
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.HIGH,
      reason: `Equipment-specific query for: ${params.equipment_ids.join(', ')}`,
      route_source: 'deterministic',
      original_question: question,
      template_used: 'equipment_specific_production_override',
      intent: intentName || 'EQUIPMENT_SPECIFIC_PRODUCTION',
      parameters: params
    };
  }

  // 4.4 - Time-based queries (monthly/yearly summaries, date ranges, shifts)
  if (params.month || params.year || params.date_range || params.date_start || 
      (params.shift && params.shift.length > 0)) {
    const timeDesc = params.month ? `month ${params.month}` : 
                     params.year ? `year ${params.year}` :
                     params.date_range ? params.date_range :
                     params.shift ? `shift ${params.shift.join(', ')}` : 'time period';
    debugBranch('time_based_query', timeDesc);
    return {
      task: 'sql',
      confidence: CONFIDENCE_THRESHOLDS.GOOD,
      reason: `Time-based data retrieval for ${timeDesc}`,
      route_source: 'deterministic',
      original_question: question,
      template_used: 'data_retrieval_rule_template',
      intent: intentName || 'DATA_RETRIEVAL',
      parameters: params
    };
  }

  // 4.5 - Generic data retrieval (fallback for any remaining SQL intent)
  if (intentName === 'DATA_RETRIEVAL' || intentName === 'MONTHLY_SUMMARY' || 
      intentName === 'ROUTES_FACES_ANALYSIS' || confidence >= 0.3) {
    debugBranch('generic_data_retrieval');
    return {
      task: 'sql',
      confidence: 0.75,
      reason: 'Generic data retrieval from database',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'data_retrieval_rule_template',
      intent: intentName || 'DATA_RETRIEVAL',
      parameters: params
    };
  }

  return null;
}
