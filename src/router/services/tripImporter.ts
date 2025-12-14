import { getSupabaseClient } from '../../utils/supabase';

const supabase = getSupabaseClient();

interface TripRow {
  trip_date: string;
  shift: string;
  tipper_id: string;
  excavator?: string;
  route_or_face?: string;
  trip_count: number;
  remarks?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: TripRow;
}

/**
 * Parse date from DD-MM-YYYY format to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // Try DD-MM-YYYY format
  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    const paddedDay = day.padStart(2, '0');
    const paddedMonth = month.padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  // Try DD/MM/YYYY format
  const ddmmyyyySlashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyySlashMatch) {
    const [, day, month, year] = ddmmyyyySlashMatch;
    const paddedDay = day.padStart(2, '0');
    const paddedMonth = month.padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  return null;
}

/**
 * Normalize shift value to A, B, or C
 */
function normalizeShift(shift: string): string | null {
  if (!shift) return null;

  const trimmed = shift.trim().toUpperCase();

  // Support numeric aliases: 1->A, 2->B, 3->C
  if (trimmed.match(/\b1\b/) || trimmed === 'SHIFT 1' || trimmed === 'SHIFT1') return 'A';
  if (trimmed.match(/\b2\b/) || trimmed === 'SHIFT 2' || trimmed === 'SHIFT2') return 'B';
  if (trimmed.match(/\b3\b/) || trimmed === 'SHIFT 3' || trimmed === 'SHIFT3') return 'C';

  // Extract just the letter
  if (trimmed.match(/A/)) return 'A';
  if (trimmed.match(/B/)) return 'B';
  if (trimmed.match(/C/)) return 'C';

  return null;
}

/**
 * Validate and transform a single row
 */
function validateRow(row: any, rowIndex: number): ValidationResult {
  const errors: string[] = [];

  // Parse date
  const tripDate = parseDate(row.trip_date || row['Trip Date'] || row.date);
  if (!tripDate) {
    errors.push(`Row ${rowIndex}: Invalid or missing trip_date`);
  }

  // Normalize shift
  const shift = normalizeShift(row.shift || row['Shift'] || row.SHIFT);
  if (!shift) {
    errors.push(`Row ${rowIndex}: Invalid or missing shift (must be A, B, or C)`);
  }

  // Get tipper_id
  const tipperId = (row.tipper_id || row['Tipper ID'] || row.tipper || row.vehicle || '').trim();
  if (!tipperId) {
    errors.push(`Row ${rowIndex}: Missing tipper_id/vehicle name`);
  }

  // Get trip_count
  const tripCount = parseInt(row.trip_count || row['Trip Count'] || row.trips || '0');
  if (isNaN(tripCount) || tripCount < 0) {
    errors.push(`Row ${rowIndex}: Invalid trip_count (must be >= 0)`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      trip_date: tripDate!,
      shift: shift!,
      tipper_id: tipperId,
      excavator: (row.excavator || row['Excavator'] || '').trim() || undefined,
      route_or_face: (row.route_or_face || row['Route or Face'] || row.route || '').trim() || undefined,
      trip_count: tripCount,
      remarks: (row.remarks || row['Remarks'] || '').trim() || undefined,
    },
  };
}

/**
 * Import trip data from parsed Excel/CSV data
 */
export async function importTripData(rows: any[]): Promise<{
  success: boolean;
  inserted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const validRows: TripRow[] = [];

  // Validate all rows
  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i], i + 2); // +2 for 1-based index + header row

    if (result.valid && result.data) {
      validRows.push(result.data);
    } else {
      errors.push(...result.errors);
    }
  }

  if (validRows.length === 0) {
    return {
      success: false,
      inserted: 0,
      errors: ['No valid rows to import', ...errors],
    };
  }

  // Delete existing data (optional - comment out if you want to append)
  const { error: deleteError } = await supabase
    .from('trip_summary_by_date')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (deleteError) {
    console.warn('Warning: Could not clear existing trip data:', deleteError);
  }

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < validRows.length; i += batchSize) {
    const batch = validRows.slice(i, i + batchSize);

    const { error: insertError } = await supabase
      .from('trip_summary_by_date')
      .insert(batch)
      .select();

    if (insertError) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return {
    success: errors.length === 0 || inserted > 0,
    inserted,
    errors,
  };
}

/**
 * Parse Excel file using a library (placeholder - you'll need to implement with xlsx library)
 */
export async function parseExcelFile(_file: File): Promise<any[]> {
  // This is a placeholder - you'd need to use a library like 'xlsx' to parse Excel files
  // For now, return empty array
  console.error('Excel parsing not implemented - please convert to CSV or implement xlsx library');
  return [];
}

/**
 * Parse CSV file
 */
export async function parseCSVFile(file: File): Promise<any[]> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  // Parse rows
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Get trip summary statistics
 */
export async function getTripStatistics(): Promise<{
  totalTrips: number;
  uniqueVehicles: number;
  dateRange: { start: string; end: string } | null;
  byShift: { shift: string; count: number }[];
}> {
  // Get total trips
  const { data: tripData } = await supabase
    .from('trip_summary_by_date')
    .select('trip_count');

  const totalTrips = tripData?.reduce((sum: number, row: any) => sum + (row.trip_count || 0), 0) || 0;

  // Get unique vehicles
  const { data: vehicleData } = await supabase
    .from('trip_summary_by_date')
    .select('tipper_id')
    .limit(1000);

  const uniqueVehicles = new Set(vehicleData?.map((row: any) => row.tipper_id)).size;

  // Get date range
  const { data: dateData } = await supabase
    .from('trip_summary_by_date')
    .select('trip_date')
    .order('trip_date', { ascending: true })
    .limit(1);

  const { data: maxDateData } = await supabase
    .from('trip_summary_by_date')
    .select('trip_date')
    .order('trip_date', { ascending: false })
    .limit(1);

  const dateRange = dateData?.[0] && maxDateData?.[0]
    ? { start: dateData[0].trip_date, end: maxDateData[0].trip_date }
    : null;

  // Get trips by shift
  const { data: shiftData } = await supabase
    .from('trip_summary_by_date')
    .select('shift, trip_count');

  const byShift = ['A', 'B', 'C'].map(shift => ({
    shift,
    count: shiftData
      ?.filter((row: any) => row.shift === shift)
      .reduce((sum: number, row: any) => sum + (row.trip_count || 0), 0) || 0,
  }));

  return {
    totalTrips,
    uniqueVehicles,
    dateRange,
    byShift,
  };
}
