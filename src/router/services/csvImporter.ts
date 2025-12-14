import { getSupabaseClient } from '../../utils/supabase';

const supabase = getSupabaseClient();

interface ImportResult {
  success: boolean;
  tableName?: string;
  rowsImported?: number;
  error?: string;
  skipped?: boolean;
}

export async function detectTableFromCSV(headers: string[], filename: string): Promise<string | null> {
  const headerSet = new Set(headers.map(h => h.toLowerCase().trim()));

  const productionSummaryHeaders = ['date', 'shift', 'excavator', 'dumper', 'trip_count_for_mining', 'qty_ton', 'total_trips', 'grader', 'dozer'];
  const tripHeaders = ['trip_number', 'date', 'time', 'dump_yard', 'equipment', 'material', 'quantity'];
  const equipmentHeaders = ['equipment_id', 'equipment_type', 'status', 'location'];

  const matchScore = (required: string[]) => {
    return required.filter(h => headerSet.has(h)).length / required.length;
  };

  const productionScore = matchScore(productionSummaryHeaders);
  const tripScore = matchScore(tripHeaders);
  const equipmentScore = matchScore(equipmentHeaders);

  console.log('CSV Detection:', { filename, headers, productionScore, tripScore, equipmentScore });

  if (productionScore > 0.4) return 'production_summary';
  if (tripScore > 0.4) return 'trips';
  if (equipmentScore > 0.5) return 'equipment';

  if (filename.toLowerCase().includes('production')) return 'production_summary';
  if (filename.toLowerCase().includes('trip') || filename.toLowerCase().includes('export')) return 'trips';
  if (filename.toLowerCase().includes('equipment')) return 'equipment';

  return null;
}

export async function importCSVToTable(
  rows: any[],
  headers: string[],
  filename: string,
  userId: string
): Promise<ImportResult> {
  try {
    if (!rows || rows.length === 0) {
      return { success: false, error: 'No data to import' };
    }

    if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
      console.warn('CSV has no valid headers, skipping database import');
      return {
        success: true,
        skipped: true,
        error: 'CSV format not suitable for database import (no headers detected)'
      };
    }

    const tableName = await detectTableFromCSV(headers, filename);

    if (!tableName) {
      console.warn('Could not detect table type from headers:', headers);
      return {
        success: true,
        skipped: true,
        error: 'Could not detect table type. Supported: trips, equipment, production_summary'
      };
    }

    const columnMapping: Record<string, string> = {
      'date': 'date',
      'shift': 'shift',
      'excavator': 'excavator',
      'dumper': 'dumper',
      'trip_count_for_mining': 'trip_count_for_mining',
      'qty_(ton)': 'qty_ton',
      'qty_ton': 'qty_ton',
      'trip_count_for_reclaim': 'trip_count_for_reclaim',
      'qty_(m3)': 'qty_m3',
      'qty_m3': 'qty_m3',
      'total_trips': 'total_trips',
      'grader': 'grader',
      'dozer': 'dozer',
      'trip_number': 'trip_number',
      'time': 'time',
      'dump_yard': 'dump_yard',
      'equipment': 'equipment',
      'material': 'material',
      'quantity': 'quantity'
    };

    console.log('Importing to table:', tableName);
    console.log('Sample row before mapping:', rows[0]);

    const mappedRows = rows.map(row => {
      const mapped: any = { user_id: userId };

      for (const key in row) {
        let normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
        const value = row[key];

        if (columnMapping[normalizedKey]) {
          normalizedKey = columnMapping[normalizedKey];
        }

        if (value !== null && value !== undefined && value !== '') {
          if (typeof value === 'number' || !isNaN(parseFloat(value))) {
            mapped[normalizedKey] = value;
          } else if (typeof value === 'string') {
            mapped[normalizedKey] = value.trim();
          } else {
            mapped[normalizedKey] = value;
          }
        }
      }

      return mapped;
    });

    const validRows = mappedRows.filter(row => {
      if (Object.keys(row).length <= 1) return false;

      const dateValue = row.date ? String(row.date).toLowerCase() : '';
      if (dateValue === 'date' || dateValue === 'start_date' || dateValue.includes('date')) {
        return false;
      }

      return true;
    });

    console.log('Sample mapped row:', mappedRows[0]);
    console.log('Total rows to import:', validRows.length);

    if (validRows.length === 0) {
      return {
        success: true,
        skipped: true,
        error: 'No valid rows to import'
      };
    }

    if (tableName === 'trips' || tableName === 'production_summary') {
      const dateShiftPairs = validRows
        .filter(r => r.date && r.shift)
        .map(r => ({ date: r.date, shift: r.shift }));

      if (dateShiftPairs.length > 0) {
        const { data: existing } = await supabase
          .from(tableName)
          .select('date, shift')
          .eq('user_id', userId);

        if (existing && existing.length > 0) {
          const existingSet = new Set(
            existing.map(e => `${e.date}|${e.shift}`)
          );

          const filtered = validRows.filter(row => {
            if (!row.date || !row.shift) return true;
            const key = `${row.date}|${row.shift}`;
            return !existingSet.has(key);
          });

          if (filtered.length === 0) {
            console.log('All rows are duplicates, skipping import');
            return {
              success: true,
              tableName,
              rowsImported: 0,
              error: 'All rows already exist (duplicates skipped)'
            };
          }

          console.log(`Filtered out ${validRows.length - filtered.length} duplicates`);
          validRows.length = 0;
          validRows.push(...filtered);
        }
      }
    }

    const batchSize = 100;
    let totalImported = 0;
    let errors = [];

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);

      // Use upsert to handle duplicates gracefully
      const { data, error } = await supabase
        .from(tableName)
        .upsert(batch, {
          onConflict: tableName === 'production_summary' ? 'user_id,date,shift' : undefined,
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error(`Import error for ${tableName} batch ${i}:`, error);
        errors.push(error.message);
        continue;
      }

      totalImported += data?.length || 0;
    }

    if (totalImported === 0 && errors.length > 0) {
      return {
        success: false,
        tableName,
        error: `Failed to import: ${errors[0]}`
      };
    }

    return {
      success: true,
      tableName,
      rowsImported: totalImported
    };
  } catch (err: any) {
    console.error('CSV import exception:', err);
    return {
      success: true,
      skipped: true,
      error: err.message
    };
  }
}
