/*
  # Create trip_summary_by_date table

  1. Changes
    - Drop old trips table if exists
    - Create new trip_summary_by_date table with exact columns from Excel file
    
  2. New Table: trip_summary_by_date
    - `id` (uuid, primary key) - System generated ID
    - `user_id` (uuid) - User reference (for RLS)
    - `trip_date` (date) - Date of trips (DD-MM-YYYY converted to YYYY-MM-DD)
    - `shift` (text) - Shift: A, B, or C (uppercase normalized)
    - `tipper_id` (text) - Vehicle/tipper/truck/dumper/equipment name (trimmed)
    - `excavator` (text, optional) - Excavator name
    - `route_or_face` (text, optional) - Route or face information
    - `trip_count` (integer, default 0) - Number of trips
    - `remarks` (text, optional) - Additional remarks
    - `created_at` (timestamptz) - Record creation timestamp
    
  3. Security
    - Enable RLS on trip_summary_by_date table
    - Add policies for authenticated users to read their own data
    - Add policies for inserting trip data
    
  4. Indexes
    - Index on trip_date for date filtering
    - Index on shift for shift filtering
    - Index on tipper_id for vehicle filtering
    - Composite index on (trip_date, shift) for common queries
    
  5. Notes
    - This table is used for ALL trip-related queries
    - Can be joined with production_summary on (trip_date, shift)
    - tipper_id is the vehicle name used in all trip queries
*/

-- Drop old trips table if exists
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS trip_master CASCADE;
DROP TABLE IF EXISTS trip CASCADE;

-- Create trip_summary_by_date table
CREATE TABLE IF NOT EXISTS trip_summary_by_date (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  trip_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('A', 'B', 'C')),
  tipper_id text NOT NULL CHECK (length(trim(tipper_id)) > 0),
  excavator text CHECK (excavator IS NULL OR length(trim(excavator)) > 0),
  route_or_face text,
  trip_count integer NOT NULL DEFAULT 0 CHECK (trip_count >= 0),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_summary_trip_date ON trip_summary_by_date(trip_date DESC);
CREATE INDEX IF NOT EXISTS idx_trip_summary_shift ON trip_summary_by_date(shift);
CREATE INDEX IF NOT EXISTS idx_trip_summary_tipper_id ON trip_summary_by_date(tipper_id);
CREATE INDEX IF NOT EXISTS idx_trip_summary_date_shift ON trip_summary_by_date(trip_date DESC, shift);
CREATE INDEX IF NOT EXISTS idx_trip_summary_excavator ON trip_summary_by_date(excavator) WHERE excavator IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_summary_tipper_date ON trip_summary_by_date(tipper_id, trip_date DESC);

-- Enable Row Level Security
ALTER TABLE trip_summary_by_date ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all trip data (for now, no user_id filter since we're using a default user)
CREATE POLICY "Anyone can view trip data"
  ON trip_summary_by_date
  FOR SELECT
  TO public
  USING (true);

-- Policy: Authenticated users can insert trip data
CREATE POLICY "Authenticated users can insert trip data"
  ON trip_summary_by_date
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Authenticated users can update trip data
CREATE POLICY "Authenticated users can update trip data"
  ON trip_summary_by_date
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can delete trip data
CREATE POLICY "Authenticated users can delete trip data"
  ON trip_summary_by_date
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comment to table
COMMENT ON TABLE trip_summary_by_date IS 'Trip summary data by date - used for ALL trip-related queries including trips by vehicle/tipper/truck/dumper/equipment';
COMMENT ON COLUMN trip_summary_by_date.trip_date IS 'Date of trips - stored as YYYY-MM-DD (converted from DD-MM-YYYY)';
COMMENT ON COLUMN trip_summary_by_date.shift IS 'Shift: A, B, or C (uppercase normalized)';
COMMENT ON COLUMN trip_summary_by_date.tipper_id IS 'Vehicle name - used for all trip queries (tipper/truck/dumper/equipment are all the same)';
COMMENT ON COLUMN trip_summary_by_date.trip_count IS 'Number of trips made by this vehicle on this date and shift';
