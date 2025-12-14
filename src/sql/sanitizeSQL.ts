export function sanitizeSQL(sql: string): string {
  let s = sql.trim();

  // Remove semicolons
  s = s.replace(/;+$/g, '');

  // Remove markdown code blocks if present
  s = s.replace(/```sql\n?/g, '').replace(/```\n?/g, '');

  // Add table prefixes for JOIN queries (only if not already prefixed)
  if (s.match(/JOIN/i)) {
    // Check if aliases are already used
    const hasAliases = s.match(/production_summary\s+(?:AS\s+)?[pt]\b/i) || 
                       s.match(/trip_summary_by_date\s+(?:AS\s+)?[pt]\b/i);
    
    if (!hasAliases && !s.match(/\b[pt]\./)) {
      // Add aliases to table names
      s = s.replace(/\bproduction_summary\b(?!\s+(?:AS\s+)?[pt]\b)/gi, 'production_summary AS p');
      s = s.replace(/\btrip_summary_by_date\b(?!\s+(?:AS\s+)?[pt]\b)/gi, 'trip_summary_by_date AS t');
      
      // Prefix ambiguous columns
      const ambiguousColumns = ['date', 'shift', 'id'];
      ambiguousColumns.forEach(col => {
        // Only prefix if not already prefixed and not in a function
        const pattern = new RegExp(`(?<![\\.\\w])\\b${col}\\b(?!\\s*\\()`, 'gi');
        s = s.replace(pattern, (match) => {
          // Determine which table based on context
          if (s.toLowerCase().includes('production_summary')) {
            return `p.${match}`;
          }
          return match;
        });
      });
    }
  }

  // Ensure proper spacing
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
