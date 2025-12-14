import { columnDictionary } from "./columnDictionary";

export function validateColumns(table: string, columns: string[]): void {
  if (!columnDictionary[table]) {
    console.warn(`[Column Validator] Unknown table: ${table}`);
    return;
  }

  for (const col of columns) {
    // Skip aliases and functions
    if (col.includes('(') || col.includes(' AS ') || col === '*') continue;
    
    const cleanCol = col.trim().toLowerCase();
    const validCols = columnDictionary[table].map(c => c.toLowerCase());
    
    if (!validCols.includes(cleanCol)) {
      throw new Error(`Invalid column "${col}" for table "${table}". Valid columns: ${columnDictionary[table].join(', ')}`);
    }
  }
}

export function extractColumnsFromSQL(sql: string): { table: string; columns: string[] }[] {
  const result: { table: string; columns: string[] }[] = [];
  const lowerSQL = sql.toLowerCase();
  
  // Extract table names
  const fromMatch = lowerSQL.match(/from\s+(\w+)/);
  const joinMatch = lowerSQL.match(/join\s+(\w+)/);
  
  const tables = [];
  if (fromMatch) tables.push(fromMatch[1]);
  if (joinMatch) tables.push(joinMatch[1]);
  
  // Extract columns from SELECT clause
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/is);
  if (selectMatch) {
    const columnsPart = selectMatch[1];
    const columns = columnsPart
      .split(',')
      .map(c => c.trim())
      .filter(c => c !== '*' && !c.includes('('));
    
    tables.forEach(table => {
      result.push({ table, columns });
    });
  }
  
  return result;
}
