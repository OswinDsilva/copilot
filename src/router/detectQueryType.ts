export type QueryType = 
  | 'time_series' 
  | 'distribution' 
  | 'comparison' 
  | 'summary' 
  | 'equipment_combo'
  | 'shift_grouping'
  | 'generic';

export function detectQueryType(q: string): QueryType {
  const text = q.toLowerCase();

  // Time series patterns
  if (text.match(/\b(over time|trend|timeline|daily|weekly|monthly)\b/)) {
    return 'time_series';
  }

  // Distribution patterns
  if (text.match(/\b(distribution|spread|breakdown|histogram)\b/)) {
    return 'distribution';
  }

  // Comparison patterns
  if (text.match(/\b(compare|comparison|versus|vs\.?|difference between)\b/)) {
    return 'comparison';
  }

  // Equipment combination patterns
  if (text.match(/\b(tipper.*excavator|excavator.*tipper|combination|pairing)\b/)) {
    return 'equipment_combo';
  }

  // Shift grouping patterns
  if (text.match(/\b(by shift|per shift|shift [abc123]|each shift)\b/)) {
    return 'shift_grouping';
  }

  // Summary patterns
  if (text.match(/\b(summary|total|sum|aggregate|overall)\b/)) {
    return 'summary';
  }

  return 'generic';
}
