/*
  # Update production_summary table structure

  1. Changes
    - Drop existing production_summary table
    - Create new production_summary table with exact columns for CSV import:
      - date (date)
      - shift (varchar)
      - excavator (double precision)
      - dumper (double precision)
      - trip_count_for_mining (double precision)
      - qty_ton (double precision)
      - trip_count_for_reclaim (double precision)
      - qty_m3 (double precision)
      - total_trips (double precision)
      - grader (double precision)
      - dozer (double precision)

  2. Security
    - Enable RLS on production_summary table
    - Add policies for authenticated users
*/

-- Drop existing table
DROP TABLE IF EXISTS production_summary CASCADE;

-- Create new table with exact CSV structure
CREATE TABLE IF NOT EXISTS production_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "date" date NOT NULL,
  "shift" varchar(64) CHECK ("shift" IS NULL OR "shift" IN ('A', 'B', 'C', 'Day', 'Night')),
  "excavator" double precision CHECK ("excavator" IS NULL OR "excavator" >= 0),
  "dumper" double precision CHECK ("dumper" IS NULL OR "dumper" >= 0),
  "trip_count_for_mining" double precision CHECK ("trip_count_for_mining" IS NULL OR "trip_count_for_mining" >= 0),
  "qty_ton" double precision CHECK ("qty_ton" IS NULL OR "qty_ton" >= 0),
  "trip_count_for_reclaim" double precision CHECK ("trip_count_for_reclaim" IS NULL OR "trip_count_for_reclaim" >= 0),
  "qty_m3" double precision CHECK ("qty_m3" IS NULL OR "qty_m3" >= 0),
  "total_trips" double precision CHECK ("total_trips" IS NULL OR "total_trips" >= 0),
  "grader" double precision CHECK ("grader" IS NULL OR "grader" >= 0),
  "dozer" double precision CHECK ("dozer" IS NULL OR "dozer" >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE production_summary ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Users can view production summary"
  ON production_summary
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert production summary"
  ON production_summary
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update production summary"
  ON production_summary
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete production summary"
  ON production_summary
  FOR DELETE
  TO authenticated
  USING (true);

-- Policies for anonymous users (for testing)
CREATE POLICY "Anonymous can view production summary"
  ON production_summary
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anonymous can insert production summary"
  ON production_summary
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_production_summary_date ON production_summary("date" DESC);
CREATE INDEX IF NOT EXISTS idx_production_summary_shift ON production_summary("shift") WHERE "shift" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_summary_date_shift ON production_summary("date" DESC, "shift");
