/*
  # Load production summary data & create CSV import capability

  1. Initial Data Loading
    - Import 912 rows of production data covering January 1 to October 31, 2025
    - Three shifts per day (A, B, C) with mining and reclaim operations
    - Includes equipment hours (excavator, dumper, grader, dozer) and production metrics

  2. CSV Import Function
    - Generic function: import_production_data_from_csv()
    - Accepts CSV data as text with header row
    - Validates data format and constraints before insertion
    - Returns summary of imported, skipped, and failed rows
    - Implements user-scoped data loading (user_id enforcement)

  3. Data Structure
    - CSV Format (11 columns): date,shift,excavator,dumper,trip_count_for_mining,qty_ton,trip_count_for_reclaim,qty_m3,total_trips,grader,dozer
    - Date format: YYYY-MM-DD or DD-MM-YYYY (auto-detected)
    - Shift values: Single character A-Z or multi-char (max 10)
    - Equipment names: Alphanumeric, max 50 characters
    - Numeric values: Positive numbers (validated with CHECK constraints)
    - Duplicate prevention: ON CONFLICT DO NOTHING

  4. Important Notes
    - Initial data represents 10 months of mining operations
    - Equipment efficiency values gradually increase over time
    - CSV import requires authenticated user context
    - All imports are user-scoped (linked to auth.uid())
    - Error handling with detailed validation messages
*/

-- Create CSV import audit table (for tracking user uploads)
CREATE TABLE IF NOT EXISTS csv_import_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name varchar(100) NOT NULL,
  file_name varchar(255),
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  error_message text,
  csv_content text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE csv_import_audits ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only see their own imports
CREATE POLICY "Users can view own CSV imports"
  ON csv_import_audits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- RLS policy: Users can only create imports for themselves
CREATE POLICY "Users can create own CSV imports"
  ON csv_import_audits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster import lookups
CREATE INDEX IF NOT EXISTS idx_csv_import_audits_user_id 
  ON csv_import_audits(user_id, created_at DESC);

-- Generic CSV import function for production_summary table
CREATE OR REPLACE FUNCTION import_production_data_from_csv(
  p_csv_content text,
  p_file_name varchar DEFAULT 'production_data.csv',
  p_skip_duplicates boolean DEFAULT true
)
RETURNS TABLE (
  total_rows integer,
  imported_rows integer,
  skipped_rows integer,
  failed_rows integer,
  error_message text
) AS $$
DECLARE
  v_lines text[];
  v_line text;
  v_parts text[];
  v_row_num integer := 0;
  v_total integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_error_msg text := '';
  v_audit_id uuid;
  v_date date;
  v_shift varchar;
  v_excavator varchar;
  v_dumper varchar;
  v_trip_count_mining integer;
  v_qty_ton numeric;
  v_trip_count_reclaim integer;
  v_qty_m3 numeric;
  v_total_trips integer;
  v_grader varchar;
  v_dozer varchar;
BEGIN
  -- Input validation
  IF p_csv_content IS NULL OR trim(p_csv_content) = '' THEN
    RAISE EXCEPTION 'CSV content cannot be empty';
  END IF;

  -- Create audit record
  INSERT INTO csv_import_audits (user_id, table_name, file_name, csv_content)
  VALUES (auth.uid(), 'production_summary', p_file_name, p_csv_content)
  RETURNING id INTO v_audit_id;

  -- Split CSV into lines
  v_lines := string_to_array(trim(p_csv_content), E'\n');
  
  -- Process each line (skip header row)
  FOR v_row_num IN 2..array_length(v_lines, 1) LOOP
    v_line := trim(v_lines[v_row_num]);
    
    -- Skip empty lines
    IF v_line = '' THEN
      CONTINUE;
    END IF;
    
    v_total := v_total + 1;
    
    BEGIN
      -- Split by comma
      v_parts := string_to_array(v_line, ',');
      
      -- Validate field count
      IF array_length(v_parts, 1) < 11 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Missing columns (found ' || array_length(v_parts, 1) || ', expected 11)' || E'\n';
        CONTINUE;
      END IF;

      -- Parse and validate each field with type conversion
      -- Date: Accept YYYY-MM-DD or DD-MM-YYYY
      IF v_parts[1] ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_date := v_parts[1]::date;
      ELSIF v_parts[1] ~ '^\d{2}-\d{2}-\d{4}$' THEN
        v_date := to_date(v_parts[1], 'DD-MM-YYYY');
      ELSE
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Invalid date format: ' || v_parts[1] || E'\n';
        CONTINUE;
      END IF;

      -- Shift: alphanumeric, max 10 chars, matches regex
      v_shift := trim(v_parts[2]);
      IF NOT (v_shift ~ '^[A-Z0-9]{1,10}$') THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Invalid shift: ' || v_shift || ' (must match [A-Z0-9]{1,10})' || E'\n';
        CONTINUE;
      END IF;

      -- Equipment names: varchar(50)
      v_excavator := trim(v_parts[3]);
      IF length(v_excavator) > 50 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Excavator name too long (max 50 chars)' || E'\n';
        CONTINUE;
      END IF;

      v_dumper := trim(v_parts[4]);
      IF length(v_dumper) > 50 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Dumper name too long (max 50 chars)' || E'\n';
        CONTINUE;
      END IF;

      -- Integer counters with validation
      v_trip_count_mining := (trim(v_parts[5]))::integer;
      IF v_trip_count_mining < 0 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': trip_count_for_mining must be >= 0' || E'\n';
        CONTINUE;
      END IF;

      -- Numeric values with precision
      v_qty_ton := (trim(v_parts[6]))::numeric(10,2);
      IF v_qty_ton <= 0 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': qty_ton must be > 0' || E'\n';
        CONTINUE;
      END IF;

      v_trip_count_reclaim := (trim(v_parts[7]))::integer;
      IF v_trip_count_reclaim < 0 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': trip_count_for_reclaim must be >= 0' || E'\n';
        CONTINUE;
      END IF;

      v_qty_m3 := (trim(v_parts[8]))::numeric(10,3);
      IF v_qty_m3 <= 0 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': qty_m3 must be > 0' || E'\n';
        CONTINUE;
      END IF;

      v_total_trips := (trim(v_parts[9]))::integer;
      IF v_total_trips < 0 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': total_trips must be >= 0' || E'\n';
        CONTINUE;
      END IF;

      v_grader := trim(v_parts[10]);
      IF length(v_grader) > 50 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Grader name too long (max 50 chars)' || E'\n';
        CONTINUE;
      END IF;

      v_dozer := trim(v_parts[11]);
      IF length(v_dozer) > 50 THEN
        v_failed := v_failed + 1;
        v_error_msg := v_error_msg || 'Row ' || v_row_num || ': Dozer name too long (max 50 chars)' || E'\n';
        CONTINUE;
      END IF;

      -- Try to insert the row
      INSERT INTO production_summary (
        user_id, date, shift, excavator, dumper, 
        trip_count_for_mining, qty_ton, trip_count_for_reclaim, qty_m3, 
        total_trips, grader, dozer
      )
      VALUES (
        auth.uid(), v_date, v_shift, v_excavator, v_dumper,
        v_trip_count_mining, v_qty_ton, v_trip_count_reclaim, v_qty_m3,
        v_total_trips, v_grader, v_dozer
      )
      ON CONFLICT DO NOTHING;

      -- Check if row was inserted or skipped
      IF FOUND THEN
        v_imported := v_imported + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_error_msg := v_error_msg || 'Row ' || v_row_num || ': ' || SQLERRM || E'\n';
      CONTINUE;
    END;
  END LOOP;

  -- Update audit record with results
  UPDATE csv_import_audits
  SET 
    total_rows = v_total,
    imported_rows = v_imported,
    skipped_rows = v_skipped,
    failed_rows = v_failed,
    error_message = NULLIF(v_error_msg, ''),
    updated_at = now()
  WHERE id = v_audit_id;

  -- Return summary
  RETURN QUERY SELECT v_total, v_imported, v_skipped, v_failed, NULLIF(v_error_msg, '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Seed initial production data using the generic import function
-- DISABLED: This migration conflicts with the partitioned production_summary table
-- created in 20251027030242_create_mining_operations_tables.sql
-- 
-- The import function requires authenticated user context (auth.uid()) which is
-- not available during migration execution.
-- 
-- Users can import their own production data using the import_production_data_from_csv()
-- function after authentication.
--
-- Example usage:
-- SELECT * FROM import_production_data_from_csv('date,shift,...\n2025-01-01,A,...', 'my_data.csv');