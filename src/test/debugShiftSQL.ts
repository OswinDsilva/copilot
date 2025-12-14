/**
 * Debug why shift aggregation SQL isn't being generated
 */

import { normalizeUserQuery } from '../router/services/intent';
import { buildDateFilter } from '../router/helpers/dateUtils';

const query = 'Compare total and average production by shift for January 2025';
const intentInfo = normalizeUserQuery(query);

console.log('Query:', query);
console.log('\nIntent:', intentInfo.intent);
console.log('Parameters:', JSON.stringify(intentInfo.parameters, null, 2));

const dateFilter = buildDateFilter(intentInfo.parameters);
console.log('\nDate filter:', dateFilter);
console.log('Date filter is empty:', dateFilter === '');

const isShiftComparison = /compare.*shift|by\s+shift|shift\s+comparison|per\s+shift/i.test(query);
console.log('\nMatches shift comparison:', isShiftComparison);

console.log('\nShould generate SQL:', isShiftComparison && dateFilter !== '');
