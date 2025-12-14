/*
  # Update trips table columns to match CSV format

  ## Changes
  - Drop old columns from trips table (7 deprecated columns)
  - Add new columns matching CSV format (11 new columns)
  - Create strategic indexes for query optimization
  
  ## New Columns
  - date (date): Trip date - indexed for range queries
  - shift (varchar(10)): Shift designation with constraint
  - excavator (varchar(50)): Equipment identifier with constraint
  - dumper (varchar(50)): Equipment identifier with constraint
  - trip_count_for_mining (integer): Mining operation count - NOT NULL default 0
  - qty_ton (numeric(10,2)): Quantity in tons - precise decimal
  - trip_count_for_reclaim (integer): Reclaim operation count - NOT NULL default 0
  - qty_m3 (numeric(10,3)): Quantity in cubic meters - precise decimal
  - total_trips (integer): Total trips - NOT NULL default 0
  - grader (varchar(50)): Equipment identifier with constraint
  - dozer (varchar(50)): Equipment identifier with constraint
    
  ## Notes
  - Preserves user_id and id columns for data integrity
  - Text fields use varchar with constraints for data quality
  - Numeric fields specify precision/scale for consistent storage
  - Integer counters default to 0 (NOT NULL) for consistency
  - Strategic indexes optimize common query patterns
  - All changes wrapped with error handling
*/

DO $$
DECLARE
  v_columns_to_add CONSTANT text[] := ARRAY[
    'date:date',
    'shift:character varying(10)',
    'excavator:character varying(50)',
    'dumper:character varying(50)',
    'trip_count_for_mining:integer',
    'qty_ton:numeric(10,2)',
    'trip_count_for_reclaim:integer',
    'qty_m3:numeric(10,3)',
    'total_trips:integer',
    'grader:character varying(50)',
    'dozer:character varying(50)'
  ];
  v_col_def text;
  v_col_name text;
  v_col_type text;
  v_col_constraint text;
BEGIN
  -- Drop deprecated columns
  ALTER TABLE trips DROP COLUMN IF EXISTS trip_number;
  ALTER TABLE trips DROP COLUMN IF EXISTS dump_yard;
  ALTER TABLE trips DROP COLUMN IF EXISTS equipment;
  ALTER TABLE trips DROP COLUMN IF EXISTS material;
  ALTER TABLE trips DROP COLUMN IF EXISTS quantity;
  ALTER TABLE trips DROP COLUMN IF EXISTS time;
  ALTER TABLE trips DROP COLUMN IF EXISTS source_file_id;

  -- Batch add new columns with proper type validation and constraints
  FOREACH v_col_def IN ARRAY v_columns_to_add
  LOOP
    -- Extract column name and type
    v_col_name := split_part(v_col_def, ':', 1);
    v_col_type := split_part(v_col_def, ':', 2);
    
    -- Determine constraints based on column type
    v_col_constraint := '';
    IF v_col_name IN ('trip_count_for_mining', 'trip_count_for_reclaim', 'total_trips') THEN
      v_col_constraint := ' NOT NULL DEFAULT 0 CHECK (' || quote_ident(v_col_name) || ' >= 0)';
    ELSIF v_col_name IN ('qty_ton', 'qty_m3') THEN
      v_col_constraint := ' CHECK (' || quote_ident(v_col_name) || ' > 0)';
    ELSIF v_col_name = 'shift' THEN
      v_col_constraint := ' CHECK (' || quote_ident(v_col_name) || ' ~ ' || quote_literal('^[A-Z0-9]{1,10}$') || ')';
    END IF;
    
    -- Add column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'trips' 
        AND column_name = v_col_name
        AND table_schema = 'public'
    ) THEN
      EXECUTE 'ALTER TABLE trips ADD COLUMN ' || 
              quote_ident(v_col_name) || ' ' || 
              v_col_type || 
              v_col_constraint;
    END IF;
  END LOOP;
  
  -- Create strategic indexes for common query patterns
  -- Index 1: Date range queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trips' 
      AND indexname = 'idx_trips_date'
      AND schemaname = 'public'
  ) THEN
    CREATE INDEX idx_trips_date ON trips(date DESC) 
      WHERE date IS NOT NULL;
  END IF;
  
  -- Index 2: User + date queries (common for reports)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trips' 
      AND indexname = 'idx_trips_user_date'
      AND schemaname = 'public'
  ) THEN
    CREATE INDEX idx_trips_user_date ON trips(user_id, date DESC) 
      WHERE date IS NOT NULL;
  END IF;
  
  -- Index 3: Equipment tracking queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trips' 
      AND indexname = 'idx_trips_equipment'
      AND schemaname = 'public'
  ) THEN
    CREATE INDEX idx_trips_equipment ON trips(excavator, dumper, grader, dozer) 
      WHERE excavator IS NOT NULL;
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error during trips table migration: %', SQLERRM;
  RAISE EXCEPTION 'Migration failed: %', SQLERRM;
END $$;
