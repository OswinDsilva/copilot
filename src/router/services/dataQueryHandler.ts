/**
 * Data Query Handler - Direct data processing without LLM
 * 
 * Handles queries that can be answered by direct data manipulation:
 * - Count/filter queries: "how many X have Y"
 * - Column value queries: "show all unique X"
 * - Simple aggregations: "sum of X where Y"
 * 
 * This avoids expensive LLM calls and token limits for simple data operations.
 */

import { getSupabaseClient } from '../../utils/supabase';

const supabase = getSupabaseClient();

interface DataQueryResult {
  answer: string;
  handled: boolean;
  data?: any;
  method: 'deterministic' | 'llm';
}

/**
 * Detect if query can be handled deterministically
 */
export function canHandleDeterministically(question: string): boolean {
  // Patterns that can be handled without LLM
  const patterns = [
    /how many.*(?:in|from|of|with|had|have|equals?|contains?|is)/i,
    /count.*(?:where|with|that|in|of)/i,
    /number of.*(?:where|with|that|in)/i,
    /show (?:all )?(?:unique|distinct).*(?:in|from)/i,
    /list (?:all )?(?:unique|distinct)/i,
    /what are (?:all )?the (?:unique|different)/i
  ];

  return patterns.some(p => p.test(question));
}

/**
 * Extract query intent and parameters
 */
function parseQuery(question: string): {
  operation: 'count' | 'list' | 'filter' | 'unknown';
  column?: string;
  value?: string;
  condition?: 'equals' | 'contains' | 'starts_with' | 'ends_with';
} {
  const lowerQ = question.toLowerCase();

  // Count queries: "how many X have/had Y"
  if (/how many|count|number of/.test(lowerQ)) {
    // Extract column and value
    // Pattern: "how many times did 'value' appear in 'column'"
    const matchAppear = lowerQ.match(/(?:how many times did|count).*['"](.+?)['"].*(?:appear in|in the).*['"]?([^'"]+?)(?:['"]| column| row)/i);
    if (matchAppear) {
      return {
        operation: 'count',
        value: matchAppear[1],
        column: matchAppear[2].trim(),
        condition: 'equals'
      };
    }

    // Pattern: "how many X have/had Y" (e.g., "how many payment methods had Venmo")
    const matchHave = lowerQ.match(/how many.*(?:have|had|with|equals?|is)\s+['"]?(\w+)['"]?/i);
    if (matchHave) {
      const value = matchHave[1];
      // Try to find column name
      const columnMatch = question.match(/(?:in|from|of)\s+(?:the\s+)?['"]?([^'"]+?)(?:['"]|\s+column|\s+field)/i);
      return {
        operation: 'count',
        value,
        column: columnMatch ? columnMatch[1].trim() : undefined,
        condition: 'contains'
      };
    }

    return { operation: 'count' };
  }

  // List/unique queries
  if (/show|list|what are/.test(lowerQ) && /unique|distinct|different|all/.test(lowerQ)) {
    const columnMatch = question.match(/(?:unique|distinct|all)\s+['"]?([^'"]+?)(?:['"]|\s+(?:in|from|values))/i);
    return {
      operation: 'list',
      column: columnMatch ? columnMatch[1].trim() : undefined
    };
  }

  return { operation: 'unknown' };
}

/**
 * Fetch all data chunks for a file namespace
 */
async function fetchAllChunks(namespace: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('rag_chunks')
    .select('content, metadata, chunk_index')
    .eq('namespace', namespace)
    .neq('metadata->>is_summary', 'true') // Exclude summary chunks
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('[DataQuery] Error fetching chunks:', error);
    return [];
  }

  return data || [];
}

/**
 * Parse CSV data from chunk content
 */
function parseChunkData(content: string): any[] {
  try {
    // Chunk content format is typically JSON array or CSV-like text
    // Try JSON first
    if (content.trim().startsWith('[')) {
      return JSON.parse(content);
    }

    // Otherwise parse as CSV text
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];

    // First line might be headers
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }

    return rows;
  } catch (error) {
    console.error('[DataQuery] Error parsing chunk:', error);
    return [];
  }
}

/**
 * Reconstruct full dataset from chunks
 */
async function reconstructDataset(namespace: string): Promise<{ rows: any[], headers: string[] }> {
  const chunks = await fetchAllChunks(namespace);
  console.log(`[DataQuery] Fetched ${chunks.length} chunks from namespace:`, namespace);

  let allRows: any[] = [];

  for (const chunk of chunks) {
    // Chunks are stored as JSON arrays of objects
    try {
      const chunkRows = typeof chunk.content === 'string' ? JSON.parse(chunk.content) : chunk.content;
      if (Array.isArray(chunkRows)) {
        allRows.push(...chunkRows);
      }
    } catch (error) {
      // Try parsing as raw data
      const parsed = parseChunkData(chunk.content);
      allRows.push(...parsed);
    }
  }

  const headers = allRows.length > 0 ? Object.keys(allRows[0]) : [];
  
  console.log(`[DataQuery] Reconstructed ${allRows.length} total rows with ${headers.length} columns`);
  console.log(`[DataQuery] Headers:`, headers);

  return { rows: allRows, headers };
}

/**
 * Execute count query
 */
async function executeCountQuery(
  namespace: string,
  column: string | undefined,
  value: string | undefined,
  condition: string
): Promise<DataQueryResult> {
  const { rows, headers } = await reconstructDataset(namespace);

  if (rows.length === 0) {
    return {
      answer: 'No data found in the specified file.',
      handled: true,
      method: 'deterministic'
    };
  }

  // If no column specified, try to infer from available headers
  let targetColumn = column;
  if (!targetColumn && headers.length > 0) {
    // Try to match column name from value/context
    console.log('[DataQuery] No column specified, available columns:', headers);
  }

  // If column specified, find matching column (case-insensitive)
  if (targetColumn) {
    const matchedColumn = headers.find(h => 
      h.toLowerCase().replace(/[_\s-]+/g, ' ') === (targetColumn || '').toLowerCase().replace(/[_\s-]+/g, ' ')
    );
    targetColumn = matchedColumn || targetColumn;
  }

  // Count matching rows
  let count = 0;

  if (!value) {
    // Just count all rows
    count = rows.length;
  } else {
    // Filter by condition
    count = rows.filter(row => {
      if (!targetColumn) {
        // Search across all columns
        return Object.values(row).some(v => 
          String(v).toLowerCase().includes(value.toLowerCase())
        );
      }

      const cellValue = String(row[targetColumn] || '').toLowerCase();
      const searchValue = value.toLowerCase();

      switch (condition) {
        case 'equals':
          return cellValue === searchValue;
        case 'contains':
          return cellValue.includes(searchValue);
        case 'starts_with':
          return cellValue.startsWith(searchValue);
        case 'ends_with':
          return cellValue.endsWith(searchValue);
        default:
          return cellValue.includes(searchValue);
      }
    }).length;
  }

  const answer = targetColumn
    ? `The value "${value}" appears ${count} times in the "${targetColumn}" column (out of ${rows.length} total rows).`
    : `Found ${count} occurrences matching "${value}" across all columns (out of ${rows.length} total rows).`;

  return {
    answer,
    handled: true,
    data: { count, total_rows: rows.length, column: targetColumn, value },
    method: 'deterministic'
  };
}

/**
 * Main handler function
 */
export async function handleDataQuery(
  question: string,
  namespace: string
): Promise<DataQueryResult> {
  console.log('[DataQuery] Processing query:', question);
  console.log('[DataQuery] Target namespace:', namespace);

  if (!canHandleDeterministically(question)) {
    return {
      answer: '',
      handled: false,
      method: 'llm'
    };
  }

  const intent = parseQuery(question);
  console.log('[DataQuery] Parsed intent:', intent);

  if (intent.operation === 'count') {
    return await executeCountQuery(
      namespace,
      intent.column,
      intent.value,
      intent.condition || 'contains'
    );
  }

  // Other operations can be added here (list, filter, etc.)

  return {
    answer: '',
    handled: false,
    method: 'llm'
  };
}
