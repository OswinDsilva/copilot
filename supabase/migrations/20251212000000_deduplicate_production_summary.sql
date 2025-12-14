/*
  # Deduplicate production_summary table
  
  Remove duplicate rows from production_summary table where the same
  (user_id, date, shift) combination exists multiple times.
  
  Keep only one row per unique (user_id, date, shift) combination.
*/

-- Step 1: Remove duplicates, keeping the oldest record (by created_at)
DELETE FROM production_summary a
USING production_summary b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.date = b.date
  AND a.shift = b.shift;

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE production_summary
ADD CONSTRAINT production_summary_unique_date_shift 
UNIQUE (user_id, date, shift);

-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_production_summary_date_shift 
ON production_summary(date, shift);
