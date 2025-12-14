// Lightweight TypeScript port of intent normalizer (from intent.py)
import { parseDate } from '../helpers/dateParser';
import { CONFIDENCE_THRESHOLDS } from '../constants';
import { fuzzyKeywordMatch, feedbackLogger, FUZZY_SHORT_TERMS } from '../helpers/fuzzyMatch';
 

export interface IntentResult {
  intent: string;
  confidence: number;
  matched_keywords: string[];
  parameters: Record<string, any>;
  fuzzy_matches?: string[]; // Track which keywords matched via fuzzy logic
   
}

// Intent tier classification for hierarchy-based matching
enum IntentTier {
  TIER_1_SPECIFIC = 1,    // Very specific intents (equipment optimization, forecasting, ordinal row)
  TIER_2_MODERATE = 2,    // Moderately specific (monthly summary, shift-specific queries)
  TIER_3_GENERIC = 3      // Generic fallback intents (data retrieval, aggregation query)
}

const INTENTS: Array<{ intent: string; keywords: string[]; tier: IntentTier }> = [
   // TIER 1: Highly specific intents (highest priority)
  

    // Statistical Query (mean, median, mode, stddev - must be before aggregation)
    { intent: 'STATISTICAL_QUERY', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
      'mean', 'median', 'mode', 'standard deviation', 'stddev', 'std dev', 'deviation',
      'statistical analysis','statistical measure','statistical','analysis',
      'calculate mean', 'calculate median', 'calculate mode', 'calculate deviation',
      'compute mean', 'compute median', 'compute mode', 'compute deviation',
      'find mean', 'find median', 'find mode', 'find deviation',
      'show mean', 'show median', 'show mode', 'show deviation',
      'find the mean', 'find the median', 'find the mode'
    ]},
  
  // Target Optimization (planning to achieve production targets)
  { intent: 'TARGET_OPTIMIZATION', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'mine', 'target', 'production target', 'need to mine', 'want to mine',
    'plan to mine', 'achieve', 'reach', 'goal of', 'to produce',
    'produce', 'output of', 'need to produce', 'how to mine', 'how to achieve',
    'optimize for', 'plan for target', 'meet target', 'reach target'
  ]},
  
  // Equipment Optimization & Selection
  { intent: 'EQUIPMENT_OPTIMIZATION', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'best combination', 'optimal combination', 'recommend equipment', 'equipment selection',
    'choose equipment', 'select equipment', 'should i pick', 'should i take',
    'i have to pick', 'i need to pick', 'i have to select', 'i need to select',
    'i have to choose', 'i need to choose', 'i want to pick', 'i want to select',
    'i want to choose', 'help me pick', 'help me select', 'help me choose',
    'optimal', 'optimal equipment', 'best equipment', 'best setup', 'optimal setup',
    'optimisation', 'optimisatio', 'optimization', 'optimize', 'optimise',
    'optimize equipment', 'optimise equipment', 'optimize for', 'optimise for'
  ]},

  // Forecasting
  { intent: 'FORECASTING', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'forecast', 'predict', 'predict next', 'forecast next',
    'future production', 'next month', 'next quarter', 'next year',
    'expected production', 'anticipated production',
    'forecast production', 'predict production'
  ]},

  // Equipment Combinations (historical pairing)
  { intent: 'EQUIPMENT_COMBINATION', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'combination', 'combinations', 'pairing', 'match', 'matches', 
    'tipper and excavator', 'excavator and tipper',
    'working together', 'paired with', 'worked with', 'work with',
    'each worked', 'how many tippers', 'how many excavators',
    'which tippers', 'which tipper', 'which excavators', 'which excavator', 
    'which dumpers', 'which dumper', 'which equipment',
    'tippers contributed', 'tipper contributed', 'excavators contributed', 
    'excavator contributed', 'equipment contributed',
    'equipment combination', 'equipment combinations'
  ]},

  // Equipment-specific queries
  { intent: 'EQUIPMENT_SPECIFIC_PRODUCTION', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'performance of',
    'data for tipper', 'data for excavator', 'data for equipment',
    'show for tipper', 'show for excavator', 'show for equipment',
    'get for tipper', 'get for excavator', 'get for equipment',
    'bb-', 'ex-', 'tip-', 'doz-',
    'excavator ex-', 'tipper bb-', 'excavator bb-', 'tipper ex-',
    'has ex-', 'has bb-', 'did ex-', 'did bb-'
  ]},

  // Routes and faces
  { intent: 'ROUTES_FACES_ANALYSIS', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'route', 'routes', 'haul route', 'haulage route', 'most used route',
    'face', 'faces', 'mining face', 'active face', 'working face',
    'most used face', 'pit face', 'bench face', 'route analysis',
    'face analysis', 'route performance', 'face performance',
    'route utilization', 'face utilization', 'route efficiency',
    'which route', 'which face', 'top route', 'top face'
  ]},

  // Advisory
  { intent: 'ADVISORY_QUERY', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'how to', 'how do', 'how can', 'how should', 'best practice', 'best practices',
    'guideline', 'guidelines', 'procedure', 'procedures', 'safety', 'policy', 'policies',
    'recommendation', 'recommendations', 'what are the best', 'what is the best',
    'improve', 'reduce', 'optimize process', 'standard operating procedure', 'sop'
  ]},

  // Visualization
  { intent: 'CHART_VISUALIZATION', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'chart', 'graph', 'plot', 'visualize', 'line chart', 'bar chart',
    'pie chart', 'histogram', 'trend', 'visualisation', 'visualization',
    'draw', 'overlay', 'different color', 'different colors', 'color coded', 'separate by',
    'heatmap', 'heat map', 'pareto', 'radar', 'scatter', 'area chart'
  ]},

  // Comparison queries
  { intent: 'COMPARISON_QUERY', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'higher than', 'lower than', 'more than', 'less than', 'greater than',
    'better than', 'worse than', 'more productive', 'less productive',
    'compare', 'comparison', 'versus', 'vs', 'vs.', 'compared to',
    'which is higher', 'which is lower', 'which is better',
    'which had higher', 'which had lower', 'which had more',
    'have higher', 'have lower', 'have more', 'make more', 'make higher',
    'did', 'higher production or', 'lower production or', 'more trips or',
    'higher trips or', 'lower trips or', 'better or', 'worse or'
  ]},

  // Month comparison
  { intent: 'MONTH_COMPARISON', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'which month', 'what month', 'which months', 'what months',
    'month with the highest', 'month with the lowest', 'month with the most',
    'month with the best', 'month with the worst', 'month had the highest',
    'month had the lowest', 'month had the most'
  ]},

  // Ordinal row queries
  { intent: 'ORDINAL_ROW_QUERY', tier: IntentTier.TIER_1_SPECIFIC, keywords: [
    'row', 'nth row', 'first row', 'last row', 
    '1st row', '2nd row', '3rd row', 'th row', 'select row',
    'row from', 'row in',
    'top 5', 'top 10', 'top 3', 'top n', 'select top',
    'bottom 5', 'bottom 10', 'first 5', 'last 5',
    'highest tonnage', 'lowest tonnage', 'highest production', 'lowest production',
    'highest trips', 'lowest trips', 'top days', 'bottom days',
    'which had the highest', 'which had the lowest', 'had the highest', 'had the lowest',
    'the best tipper', 'the best excavator', 'the worst tipper', 'the worst excavator',
    'best tipper from', 'best excavator from', 'worst tipper from', 'worst excavator from'
  ]},

  // TIER 2: Moderately specific intents
  { intent: 'MONTHLY_SUMMARY', tier: IntentTier.TIER_2_MODERATE, keywords: [
    'monthly', 'month summary', 'month report', 'monthly report',
    'monthly breakdown', 'month breakdown', 'monthly overview', 'month overview',
    'summary for the month', 'report for the month',
    'yearly', 'annual', 'year report', 'yearly summary', 'annual summary','summary'
  ]},

  // TIER 3: Generic intents
  { intent: 'AGGREGATION_QUERY', tier: IntentTier.TIER_3_GENERIC, keywords: [
    'sum', 'total', 'count',
    'aggregate', 'aggregation',
    'complete summary', 'aggregate summary', 'summary of', 'overall', 'entire'
  ]},

  { intent: 'DATA_RETRIEVAL', tier: IntentTier.TIER_3_GENERIC, keywords: [
    'show', 'list', 'display', 'find', 'get', 'fetch',
    'view', 'see', 'look up', 'retrieve', 'data'
  ]},
];

// Pre-compile regex cache
const KEYWORD_REGEXES = new Map<string, RegExp>();
for (const intentObj of INTENTS) {
  for (const kw of intentObj.keywords) {
    if (!KEYWORD_REGEXES.has(kw)) {
      KEYWORD_REGEXES.set(kw, new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
    }
  }
}

function keywordFound(text: string, kw: string): boolean {
  const regex = KEYWORD_REGEXES.get(kw);
  if (regex && regex.test(text)) {
    return true;
  }
  
  const kwLower = kw.toLowerCase();
  const shouldFuzzy =
    kw.split(/\s+/).length > 1 ||
    kw.length > 5 ||
    FUZZY_SHORT_TERMS.has(kwLower);

  if (shouldFuzzy) {
    return fuzzyKeywordMatch(text, kw);
  }
  return false;
}

function extractParameters(textRaw: string): Record<string, any> {
  const text = textRaw.toLowerCase();
  const params: Record<string, any> = {};

  const parsedDate = parseDate(textRaw);
  if (parsedDate) {
    params['parsed_date'] = parsedDate;
    if (parsedDate.year) params['year'] = parsedDate.year;
    if (parsedDate.quarter) params['quarter'] = parsedDate.quarter;
    if (parsedDate.month) {
      params['month'] = parsedDate.month;
      params['month_name'] = parsedDate.monthName;
    }
    if (parsedDate.startDate) {
      params['date_start'] = parsedDate.startDate;
      if (parsedDate.type === 'single') params['date'] = parsedDate.startDate;
    }
    if (parsedDate.endDate) params['date_end'] = parsedDate.endDate;
    if (parsedDate.relativePeriod) params['date_range'] = parsedDate.relativePeriod;
    if (parsedDate.type === 'range' && parsedDate.startDate && parsedDate.endDate) {
      params['date_range_start'] = parsedDate.startDate;
      params['date_range_end'] = parsedDate.endDate;
      params['date_range_type'] = 'custom';
    }
  }

  // Multi-month detection: "january, february, march and july"
  const monthNameToNumber: Record<string, number> = {
    'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
    'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6,
    'july': 7, 'jul': 7, 'august': 8, 'aug': 8, 'september': 9, 'sep': 9,
    'october': 10, 'oct': 10, 'november': 11, 'nov': 11, 'december': 12, 'dec': 12
  };
  
  const allMonthMatches = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi);
  
  if (allMonthMatches && allMonthMatches.length > 1) {
    const monthNumbers = [...new Set(allMonthMatches.map(m => monthNameToNumber[m.toLowerCase()]))];
    params['months'] = monthNumbers; // Array of month numbers [1, 2, 3, 7]
    params['is_multi_month'] = true;
  }

  // Detect "by month" grouping (for charts and full month analysis)
  if (/\bby\s+month\b/i.test(text)) {
    params['group_by_month'] = true;
  }

  // Detect "which month" ranking queries
  if (/\bwhich\s+month\b/i.test(text)) {
    params['month_ranking'] = true;
  }

  // Detect "all months" pattern
  if (/\ball\s+months?\b/i.test(text)) {
    params['all_months'] = true;
    params['group_by_month'] = true;
  }

  const hasComplexPatterns =
    /\b(shift|top|bottom|\d+(st|nd|rd|th)\s+row|tipper|truck|excavator|dozer|vehicle|bb-|ex-|tip-|doz-|between|to|from|greater|less|above|below|more than|less than)\b/i.test(text);

  if (!hasComplexPatterns && Object.keys(params).length > 0) return params;

  if (text.includes('shift')) {
    const isByShift = /\bby\s+shift\b/i.test(text);
    if (!isByShift) {
      const normalizeShiftToken = (s: string): string => {
        const t = String(s).trim().toUpperCase();
        if (t === '1') return 'A';
        if (t === '2') return 'B';
        if (t === '3') return 'C';
        return t;
      };

      // Handle "shift A", "shift B", "shift C" patterns (captures explicit "shift X" or "shifts X" mentions)
      let shifts = Array.from(text.matchAll(/shifts?\s*([abc123])\b/gi), m => normalizeShiftToken(m[1]));
      
      // Special handling for comma-separated patterns: "shift A, B, C" or "shifts A, B, and C"
      // Only apply comma pattern if we already found shifts to avoid false positives
      if (shifts.length > 0) {
        // Match pattern: "shift(s) A, B, C" or "shift(s) A, B and C"
        // Use word boundaries \b to ensure we match standalone letters, not parts of words like "and"
        const commaShiftMatch = text.match(/shifts?\s+([abc123])\b(?:\s*,\s*([abc123])\b)?(?:\s*,?\s*(?:and\s+)?([abc123])\b)?/i);
        if (commaShiftMatch) {
          // Extract all captured shift letters from the comma pattern
          const extracted = [commaShiftMatch[1], commaShiftMatch[2], commaShiftMatch[3]]
            .filter(Boolean)
            .map(s => normalizeShiftToken(s!));
          shifts = [...new Set([...shifts, ...extracted])];
        }
      }
      
      if (shifts.length > 0) {
        params['shift'] = [...new Set(shifts)];
        params['shift_count'] = shifts.length;
      }
    } else {
      params['group_by_shift'] = true;
    }
  }

  if (text.includes('top') || text.includes('bottom')) {
    const nMatch = text.match(/\b(top|bottom)\s*(\d+)\b/i);
    if (nMatch) {
      params['n'] = parseInt(nMatch[2], 10);
      params['rank_type'] = nMatch[1].toLowerCase();
    }
  }

  if (text.includes('row')) {
    const rowMatch = text.match(/\b(\d+)(st|nd|rd|th)\s+row\b/i);
    if (rowMatch) params['row_number'] = parseInt(rowMatch[1], 10);
  }

  // Match equipment IDs like BB-53, EX-189, DT-12, etc. (must have hyphen and numbers)
  const equipmentIdPattern = /\b([A-Z]{2,4})-(\d{1,4})\b/gi;
  const equipmentIds = Array.from(textRaw.matchAll(equipmentIdPattern), m => m[0]);
  
  // Filter out generic words that might match pattern but aren't equipment IDs
  const genericWords = ['tipper', 'tippers', 'excavator', 'excavators', 'dumper', 'dumpers', 'dozer', 'dozers', 'truck', 'trucks'];
  const validEquipmentIds = equipmentIds.filter(id => !genericWords.includes(id.toLowerCase()));
  
  if (validEquipmentIds.length > 0) {
    params['equipment_ids'] = [...new Set(validEquipmentIds)];
    
    // Detect equipment replacement queries
    const isReplacement = /\b(replace|replacement|alternative|substitute|went down|broke down|broken|unavailable|not available|backup|instead of)\b/i.test(text);
    if (isReplacement) {
      params['equipment_replacement'] = true;
      params['exclude_equipment'] = params['equipment_ids'][0]; // Equipment to exclude
      
      // Determine equipment type from the ID prefix
      const firstId = params['equipment_ids'][0];
      if (/^(BB|DT)-/i.test(firstId)) {
        params['replacement_type'] = 'tipper';
      } else if (/^EX-/i.test(firstId)) {
        params['replacement_type'] = 'excavator';
      }
    }
  }

  if (/\b(route|face|haul|pit|bench)\b/i.test(text)) {
    const routeFaceMatch = text.match(/\b(?:route|face|pit|bench)\s*([a-z0-9]+(?:-[a-z0-9]+)?)\b/i);
    
    let isValidMatch = false;
    if (routeFaceMatch) {
      const captured = routeFaceMatch[1].toLowerCase();
      // Filter out common verbs/nouns that might follow "route" or "face" in a sentence
      const invalidWords = [
        'made', 'did', 'was', 'is', 'has', 'have', 'performed', 'produced', 
        'yielded', 'generated', 'analysis', 'performance', 'utilization', 
        'efficiency', 'summary', 'report', 'check', 'list', 'show'
      ];
      
      if (!invalidWords.includes(captured)) {
        params['route_or_face'] = routeFaceMatch[1].toUpperCase();
        isValidMatch = true;
      }
    }
    
    if (!isValidMatch) {
      params['query_type'] = 'route_face_analysis';
    }
  }

  if (/tipper|truck|excavator|dozer|vehicle/.test(text)) {
    const machines = Array.from(text.matchAll(/\b(tippers?|trucks?|excavators?|dozers?|vehicles?)\b/gi), 
      m => m[1].toLowerCase().replace(/s$/, ''));
    if (machines.length > 0) params['machine_types'] = [...new Set(machines)];
  }

  const comparisonPatterns = [
    { pattern: /(?:greater than|more than|above|over|exceeds?)\s+(\d+(?:,\d+)?(?:\.\d+)?)/i, operator: '>' },
    { pattern: /(?:less than|fewer than|below|under)\s+(\d+(?:,\d+)?(?:\.\d+)?)/i, operator: '<' },
    { pattern: /(?:at least|minimum of?)\s+(\d+(?:,\d+)?(?:\.\d+)?)/i, operator: '>=' },
    { pattern: /(?:at most|maximum of?)\s+(\d+(?:,\d+)?(?:\.\d+)?)/i, operator: '<=' },
    { pattern: /(?:equals?|exactly)\s+(\d+(?:,\d+)?(?:\.\d+)?)/i, operator: '=' },
    { pattern: /(?:between)\s+(\d+(?:,\d+)?(?:\.\d+)?)\s+and\s+(\d+(?:,\d+)?(?:\.\d+)?)/i, operator: 'between' }
  ];

  for (const { pattern, operator } of comparisonPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (operator === 'between' && match[2]) {
        params['numeric_filter'] = {
          operator: 'between',
          min: parseFloat(match[1].replace(/,/g, '')),
          max: parseFloat(match[2].replace(/,/g, ''))
        };
      } else if (match[1]) {
        params['numeric_filter'] = {
          operator,
          value: parseFloat(match[1].replace(/,/g, ''))
        };
      }
      break;
    }
  }

  const unitMatch = text.match(/\b(\d+(?:,\d+)?(?:\.\d+)?)\s+(tons?|tonnes?|trips?|meters?|kilometres?|km|hours?|hrs?)/i);
  if (unitMatch) {
    params['measurement'] = {
      value: parseFloat(unitMatch[1].replace(/,/g, '')),
      unit: unitMatch[2].toLowerCase()
    };
  }

  const entityComparisonPatterns = [
    /did\s+([A-Z]{2,3}-\d+)\s+\w+\s+(?:higher|lower|more|less|better|worse)\s+\w+\s+or\s+([A-Z]{2,3}-\d+)/i,
    /([A-Z]{2,3}-\d+)\s+(?:vs\.?|versus)\s+([A-Z]{2,3}-\d+)/i,
    /(?:did\s+)?(\w+)\s+(?:have\s+)?(?:higher|lower|more|less|better|worse|greater)\s+\w+\s+(?:than|or)\s+(\w+)/i,
    /(?:shift\s+)?([a-z])\s+(?:or|more productive.*?or|better.*?or)\s+(?:shift\s+)?([a-z])/i,
    /compare\s+(\w+(?:\s+\w+)?)\s+(?:and|to|with)\s+(\w+(?:\s+\w+)?)/i,
    /(\w+(?:-\d+)?)\s+or\s+(\w+(?:-\d+)?)/i
  ];

  for (const pattern of entityComparisonPatterns) {
    const match = text.match(pattern);
    if (match) {
      const entity1 = match[1].trim();
      const entity2 = match[2].trim();

      params['comparison'] = { entity1, entity2 };

      if (/^[A-Z]{2,3}-\d+$/i.test(entity1) || /^[A-Z]{2,3}-\d+$/i.test(entity2))
        params['comparison_type'] = 'equipment';
      else if (/^(may|june|july|august|january|february|march|april|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)$/i.test(entity1) ||
               /^(may|june|july|august|january|february|march|april|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)$/i.test(entity2))
        params['comparison_type'] = 'month';
      else if (/^[a-c]$/i.test(entity1) || /^[a-c]$/i.test(entity2))
        params['comparison_type'] = 'shift';
      else if (/^\d{4}-\d{2}-\d{2}$/.test(entity1) || /^\d{4}-\d{2}-\d{2}$/.test(entity2))
        params['comparison_type'] = 'date';

      break;
    }
  }

  return params;
}

function exactPhraseMatch(text: string, phrase: string): boolean {
  const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(text);
}

function getKeywordWeight(keyword: string, text: string): number {
  const wordCount = keyword.split(/\s+/).length;
  let weight = wordCount * 3;

  if (wordCount > 1 && exactPhraseMatch(text, keyword)) weight += 5;

  const generic = ['show', 'list', 'display', 'find', 'get', 'fetch', 'view', 'see', 'data'];
  if (wordCount === 1 && generic.includes(keyword)) weight = 1;

  const discriminators = [
    'total tonnage', 'total trips', 'average production', 'monthly report',
    'shift rank', 'equipment breakdown', 'production summary'
  ];
  if (discriminators.includes(keyword)) weight += 4;

  return weight;
}

export function normalizeUserQuery(userInput: string): IntentResult {
  const text = userInput.toLowerCase();

  let candidateIntents: Array<{
    intent: string;
    score: number;
    matchedKeywords: string[];
    fuzzyMatches: string[];
    tier: IntentTier;
  }> = [];

  for (const intentObj of INTENTS) {
    let score = 0;
    const matches: string[] = [];
    const fuzzyMatches: string[] = [];

    for (const kw of intentObj.keywords) {
      const exactMatch = KEYWORD_REGEXES.get(kw)?.test(text);
      const fuzzyMatch = !exactMatch && keywordFound(text, kw);

      if (exactMatch || fuzzyMatch) {
        const weight = getKeywordWeight(kw, text);
        const adjustedWeight = fuzzyMatch ? weight * 0.95 : weight;
        score += adjustedWeight;
        matches.push(kw);
        if (fuzzyMatch) fuzzyMatches.push(kw);
      }
    }

    if (score > 0) {
      candidateIntents.push({
        intent: intentObj.intent,
        score,
        matchedKeywords: matches,
        fuzzyMatches,
        tier: intentObj.tier
      });
    }
  }

  // ----------------------------------------------------------------------
  // ⭐ PATCH (SOFT OVERRIDE FOR STATISTICAL_QUERY – Option B)
  // ----------------------------------------------------------------------

  const hasStatisticalWords = /\b(mean|median|mode|stddev|standard deviation|deviation)\b/i.test(userInput);

  if (hasStatisticalWords) {
    const statIntent = candidateIntents.find(c => c.intent === 'STATISTICAL_QUERY');

    if (statIntent) {
      // Strong boost to ensure statistical queries win over aggregation
      statIntent.score *= 2.5;

      // Remove AGGREGATION and DATA_RETRIEVAL to avoid conflicts
      candidateIntents = candidateIntents.filter(c => 
        c.intent !== 'AGGREGATION_QUERY' && c.intent !== 'DATA_RETRIEVAL'
      );
    } else {
      // If statistical words present but no STATISTICAL_QUERY intent, force add it
      candidateIntents.push({
        intent: 'STATISTICAL_QUERY',
        score: 100,
        matchedKeywords: ['<statistical words detected>'],
        fuzzyMatches: [],
        tier: IntentTier.TIER_1_SPECIFIC
      });
      candidateIntents = candidateIntents.filter(c => 
        c.intent !== 'AGGREGATION_QUERY' && c.intent !== 'DATA_RETRIEVAL'
      );
    }
  }

  // ----------------------------------------------------------------------
  // END PATCH
  // ----------------------------------------------------------------------


  // CONTEXT-AWARE FILTERING
  const hasSpecificDate =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(st|nd|rd|th)?\b/i.test(userInput);

  if (hasSpecificDate) {
    candidateIntents = candidateIntents.filter(c => c.intent !== 'MONTHLY_SUMMARY');
  }

  const hasMonthlySummaryIntent = candidateIntents.some(c => c.intent === 'MONTHLY_SUMMARY');
  if (hasMonthlySummaryIntent) {
    const hasSummaryKeywords =
      /\b(monthly|month summary|month report|monthly report|summary of|report for|overview of|breakdown by month)\b/i.test(
        userInput
      );

    const hasStrongEquipmentFocus =
      /\b(which|what)\s+\w*\s*(tippers?|trucks?|excavators?|equipment|vehicles?|machines?)\b/i.test(userInput) ||
      /\b(top|best|worst)\s+\d*\s*(tippers?|trucks?|excavators?|equipment|vehicles?)\b/i.test(userInput) ||
      /\b(tippers?|trucks?|excavators?|equipment|vehicles?)\s+(made|performed|worked|did)\b/i.test(userInput);

    if (!hasSummaryKeywords && hasStrongEquipmentFocus) {
      candidateIntents = candidateIntents.filter(c => c.intent !== 'MONTHLY_SUMMARY');
    }
  }

  // FORECASTING filters
  const hasForecastingIntent = candidateIntents.some(c => c.intent === 'FORECASTING');
  if (hasForecastingIntent) {
    const hasExplicitSummaryIntent = /\b(complete summary|total|sum|aggregate|aggregation|overall|entire|summary of|summary including)\b/i.test(
      userInput
    );
    const hasNoForecastingKeywords = !/\b(forecast|predict|future|next month|next quarter|next year)\b/i.test(userInput);

    if (hasExplicitSummaryIntent && hasNoForecastingKeywords) {
      candidateIntents = candidateIntents.filter(c => c.intent !== 'FORECASTING');
    }
  }

  const hasForecastingIntent2 = candidateIntents.some(c => c.intent === 'FORECASTING');
  if (hasForecastingIntent2) {
    const hasDataRetrievalVerbs = /^(show|list|display|get|fetch|give|provide|view|see)\b/i.test(userInput.trim());
    const hasDateFilter =
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|last week|yesterday|today)\b/i.test(
        userInput
      );
    const hasNoForecastKeywords = !/\b(forecast|predict|future|next|expected|anticipated)\b/i.test(userInput);

    if (hasDataRetrievalVerbs && hasDateFilter && hasNoForecastKeywords) {
      candidateIntents = candidateIntents.filter(c => c.intent !== 'FORECASTING');
    }
  }

  const hasForecastingIntent3 = candidateIntents.some(c => c.intent === 'FORECASTING');
  if (hasForecastingIntent3) {
    const hasFaceKeywords =
      /\b(face|faces|mining face|pit face|bench face|by face|for face|production by face)\b/i.test(userInput);
    const hasNoForecastKeywords = !/\b(forecast|predict|future|next)\b/i.test(userInput);

    if (hasFaceKeywords && hasNoForecastKeywords) {
      candidateIntents = candidateIntents.filter(c => c.intent !== 'FORECASTING');

      const hasRoutesFaces = candidateIntents.some(c => c.intent === 'ROUTES_FACES_ANALYSIS');
      if (!hasRoutesFaces) {
        candidateIntents.push({
          intent: 'ROUTES_FACES_ANALYSIS',
          score: 10,
          matchedKeywords: ['<inferred from face keyword>'],
          fuzzyMatches: [],
          tier: IntentTier.TIER_1_SPECIFIC
        });
      }
    }
  }

  if (candidateIntents.length === 0) {
    const params = extractParameters(userInput);
    const hasDateParam = params.parsed_date || params.month || params.year || params.quarter;
    const hasShiftParam = params.shift && params.shift.length > 0;
    const hasEquipmentParam = params.equipment_ids && params.equipment_ids.length > 0;

    if (hasDateParam || hasShiftParam) {
      return {
        intent: 'DATA_RETRIEVAL',
        confidence: 0.5,
        matched_keywords: ['<inferred from parameters>'],
        parameters: params
      };
    }

    if (hasEquipmentParam) {
      return {
        intent: 'EQUIPMENT_SPECIFIC_PRODUCTION',
        confidence: 0.6,
        matched_keywords: ['<inferred from equipment ID>'],
        parameters: params
      };
    }

    return {
      intent: 'UNKNOWN',
      confidence: 0,
      matched_keywords: [],
      parameters: params
    };
  }

  for (const candidate of candidateIntents) {
    const totalKeywordsForIntent = INTENTS.find(i => i.intent === candidate.intent)?.keywords.length || 1;
    const matchRatio = candidate.matchedKeywords.length / totalKeywordsForIntent;

    if (candidate.matchedKeywords.length >= 2 && matchRatio >= 0.3) {
      candidate.score *= 1.2;
    }
  }

  const hasSpecificMatches = candidateIntents.some(c => c.tier === IntentTier.TIER_1_SPECIFIC);
  const hasModerateMatches = candidateIntents.some(c => c.tier === IntentTier.TIER_2_MODERATE);

  let filteredCandidates = candidateIntents;

  // CRITICAL: Filter statistical intent FIRST before tier filtering
  // This ensures STATISTICAL_QUERY always wins over AGGREGATION_QUERY
  const hasStatisticalIntent = filteredCandidates.some(c => c.intent === 'STATISTICAL_QUERY');
  if (hasStatisticalIntent) {
    filteredCandidates = filteredCandidates.filter(c => c.intent !== 'AGGREGATION_QUERY');
  }

  if (hasSpecificMatches) filteredCandidates = filteredCandidates.filter(c => c.tier !== IntentTier.TIER_3_GENERIC);
  else if (hasModerateMatches) filteredCandidates = filteredCandidates.filter(c => c.tier !== IntentTier.TIER_3_GENERIC);

  const params = extractParameters(userInput);

  const hasMonthlyIntent = filteredCandidates.some(c => c.intent === 'MONTHLY_SUMMARY');
  if (hasMonthlyIntent) {
    filteredCandidates = filteredCandidates.filter(c => c.intent !== 'AGGREGATION_QUERY');
  }

  const hasRoutesIntent = filteredCandidates.some(c => c.intent === 'ROUTES_FACES_ANALYSIS');
  if (hasRoutesIntent) {
    filteredCandidates = filteredCandidates.filter(c => c.intent !== 'MONTHLY_SUMMARY');
  }

  const hasOrdinalIntent = filteredCandidates.some(c => c.intent === 'ORDINAL_ROW_QUERY');
  const hasHighestLowest =
    /\b(highest|lowest|maximum|minimum|top\s+\d*\s*(tipper|excavator|equipment|day)|had\s+the\s+(highest|lowest|most|least))\b/i.test(
      userInput
    );

  if (hasOrdinalIntent && hasHighestLowest) {
    filteredCandidates = filteredCandidates.filter(c => c.intent !== 'EQUIPMENT_COMBINATION');
  }

  const hasEquipmentSpecificIntent = filteredCandidates.some(c => c.intent === 'EQUIPMENT_SPECIFIC_PRODUCTION');
  const hasEquipmentIds =
    (params.equipment_ids && params.equipment_ids.length > 0) ||
    /\b([A-Z]{2,4})-?(\d{1,4})\b/i.test(userInput);

  if (hasEquipmentSpecificIntent && hasEquipmentIds) {
    filteredCandidates = filteredCandidates.filter(c => c.intent !== 'EQUIPMENT_COMBINATION');
  }

  const hasEquipmentCombinationIntent = filteredCandidates.some(c => c.intent === 'EQUIPMENT_COMBINATION');
  if (hasEquipmentIds && hasEquipmentCombinationIntent && !hasEquipmentSpecificIntent) {
    filteredCandidates = filteredCandidates.filter(c => c.intent !== 'EQUIPMENT_COMBINATION');
    filteredCandidates.push({
      intent: 'EQUIPMENT_SPECIFIC_PRODUCTION',
      tier: IntentTier.TIER_1_SPECIFIC,
      score: 15,
      matchedKeywords: ['<equipment ID detected>'],
      fuzzyMatches: []
    });
  }

  filteredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (b.matchedKeywords.length !== a.matchedKeywords.length)
      return b.matchedKeywords.length - a.matchedKeywords.length;

    const aLen = a.matchedKeywords.join('').length;
    const bLen = b.matchedKeywords.join('').length;
    if (bLen !== aLen) return bLen - aLen;

    return a.intent.localeCompare(b.intent);
  });

  let bestMatch = filteredCandidates[0];
  const runnerUp = filteredCandidates[1];

  if (bestMatch.intent === 'EQUIPMENT_COMBINATION') {
    const hasExactOptSignals = /\b(best|optimal|should i|recommend|choose|pick|select|which.*should|help me choose|help me pick|help me select)\b/i.test(
      text
    );
    const hasFuzzyOptSignals = /\b(bst|bset|bet|optmal|optiml|shoud i|recomend|choos|pik|slect)\b/i.test(text);
    const hasActionVerb = /\b(worked|paired|contributed|used|working)\b/i.test(text);

    if ((hasExactOptSignals || hasFuzzyOptSignals) && !hasActionVerb) {
      let optIntent = filteredCandidates.find(c => c.intent === 'EQUIPMENT_OPTIMIZATION');

      if (!optIntent && (hasExactOptSignals || hasFuzzyOptSignals)) {
        optIntent = {
          intent: 'EQUIPMENT_OPTIMIZATION',
          score: 0.15,
          matchedKeywords: ['<inferred from optimization signals>'],
          fuzzyMatches: [],
          tier: IntentTier.TIER_1_SPECIFIC
        };
      }

      if (optIntent && (optIntent.score >= bestMatch.score * 0.2 || hasExactOptSignals || hasFuzzyOptSignals)) {
        bestMatch = optIntent;
      }
    }
  }

  if (bestMatch.intent === 'FORECASTING') {
    const hasVizSignals = /\b(chart|graph|plot|visuali[sz]|histogram|line|bar|pie|draw)\b/i.test(text);
    const hasForecastSignals = /\b(forecast|predict|future|next|expected|projection|anticipated)\b/i.test(text);

    if (hasVizSignals && !hasForecastSignals) {
      const vizIntent = filteredCandidates.find(c => c.intent === 'CHART_VISUALIZATION');
      if (vizIntent && vizIntent.score >= bestMatch.score * 0.3) {
        bestMatch = vizIntent;
      }
    }
  }

  let maxScore = 20;
  if (bestMatch.tier === IntentTier.TIER_1_SPECIFIC) maxScore = 18;
  else if (bestMatch.tier === IntentTier.TIER_2_MODERATE) maxScore = 20;
  else maxScore = 25;

  let confidence = Math.min(1.0, bestMatch.score / maxScore);

  if (runnerUp) {
    const scoreRatio = runnerUp.score / bestMatch.score;

    if (scoreRatio > CONFIDENCE_THRESHOLDS.AMBIGUITY_RATIO) {
      const ambiguityPenalty =
        CONFIDENCE_THRESHOLDS.AMBIGUITY_PENALTY_BASE +
        (1 - scoreRatio) * CONFIDENCE_THRESHOLDS.AMBIGUITY_PENALTY_SCALE;

      confidence *= ambiguityPenalty;
      confidence = Math.min(CONFIDENCE_THRESHOLDS.AMBIGUOUS_MAX, confidence);
    }
  }

  const result: IntentResult = {
    intent: bestMatch.intent,
    confidence: Math.round(confidence * 100) / 100,
    matched_keywords: bestMatch.matchedKeywords,
    parameters: params
  };

  if (bestMatch.fuzzyMatches && bestMatch.fuzzyMatches.length > 0) {
    result.fuzzy_matches = bestMatch.fuzzyMatches;
  }

  feedbackLogger.log({
    query: userInput,
    detectedIntent: result.intent,
    confidence: result.confidence,
    notes: result.fuzzy_matches ? `Fuzzy matched: ${result.fuzzy_matches.join(', ')}` : undefined
  });

  return result;
}

export default normalizeUserQuery;
