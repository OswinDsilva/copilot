/**
 * Table Router
 * Determines which database table(s) to query based on question analysis
 */

export type TableSelection = {
  primary: string;
  secondary?: string;
  requiresJoin: boolean;
  reason: string;
};

export function determineTable(question: string, _params?: Record<string, any>): TableSelection {
  const q = question.toLowerCase();
  
  // Equipment/vehicle specific → trip_summary_by_date
  if (/\b(tipper|truck|dumper|vehicle|excavator|shovel|loader|equipment.*id|bb-\d+|ex-\d+)\b/i.test(q)) {
    if (/\b(production|tonnage|qty.*ton)\b/i.test(q)) {
      // Needs both production totals AND equipment details
      return {
        primary: 'production_summary',
        secondary: 'trip_summary_by_date',
        requiresJoin: true,
        reason: 'Query requires production totals with equipment breakdown'
      };
    }
    return {
      primary: 'trip_summary_by_date',
      requiresJoin: false,
      reason: 'Query mentions specific equipment/vehicles'
    };
  }
  
  // Route/location specific → trip_summary_by_date
  if (/\b(route|face|bench|haul|path|from.*to)\b/i.test(q)) {
    return {
      primary: 'trip_summary_by_date',
      requiresJoin: false,
      reason: 'Query mentions routes or locations'
    };
  }
  
  // Production metrics without equipment → production_summary
  if (/\b(production|tonnage|qty|volume|target|actual|m3|ton)\b/i.test(q)) {
    return {
      primary: 'production_summary',
      requiresJoin: false,
      reason: 'Query focuses on production metrics'
    };
  }
  
  // Shift/date aggregations → production_summary
  if (/\b(shift|daily|monthly|summary|total|average|trend)\b/i.test(q)) {
    return {
      primary: 'production_summary',
      requiresJoin: false,
      reason: 'Query requires aggregated production data'
    };
  }
  
  // File management → uploaded_files
  if (/\b(file|upload|document|pdf|csv)\b/i.test(q)) {
    return {
      primary: 'uploaded_files',
      requiresJoin: false,
      reason: 'Query about file management'
    };
  }
  
  // Equipment tracking → equipment table
  if (/\b(equipment.*list|machine.*list|available.*equipment)\b/i.test(q)) {
    return {
      primary: 'equipment',
      requiresJoin: false,
      reason: 'Query about equipment inventory'
    };
  }
  
  // Default: production_summary (most common)
  return {
    primary: 'production_summary',
    requiresJoin: false,
    reason: 'Default to production_summary for general queries'
  };
}
