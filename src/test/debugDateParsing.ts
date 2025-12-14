/**
 * Debug date parsing for "January 15, 2025"
 */

import { parseDate } from '../router/helpers/dateParser.js';

function debugDateParsing() {
  const queries = [
    "Show production on January 15, 2025 shift A",
    "January 15 2025",
    "15 January 2025",
    "2025-01-15"
  ];
  
  for (const query of queries) {
    console.log('Query:', query);
    const result = parseDate(query);
    console.log('Parsed:', JSON.stringify(result, null, 2));
    console.log('');
  }
}

debugDateParsing();
