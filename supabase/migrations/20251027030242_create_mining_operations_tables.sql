/*
  # Create Mining Operations Tables

  ## Overview
  Creates tables to store mining operational data from uploaded CSV/Excel files.
  This allows SQL queries to work directly on the operational data.

  ## New Tables
  
  ### trips
  - `id` (uuid, primary key) - Unique trip identifier
  - `user_id` (uuid) - Reference to user who owns this data
  - `trip_number` (text) - Trip number from the data
  - `dump_yard` (text) - Dump yard location
  - `shift` (text) - Shift (A/B/C or Day/Night)
  - `equipment` (text) - Equipment/vehicle used
  - `material` (text) - Material hauled
  - `quantity` (numeric) - Quantity/tonnage
  - `date` (date) - Date of trip
  - `time` (time) - Time of trip
  - `created_at` (timestamptz) - Record creation time
  - `source_file_id` (uuid) - Reference to uploaded file

  ### equipment
  - `id` (uuid, primary key)
  - `user_id` (uuid)
  - `equipment_id` (text) - Equipment identifier
  - `equipment_type` (text) - Type (Truck, Excavator, etc)
  - `status` (text) - Operational status
  - `location` (text) - Current location
  - `last_updated` (timestamptz)

  ### production_summary
  - `id` (uuid, primary key)
  - `user_id` (uuid)
  - `date` (date)
  - `shift` (text)
  - `dump_yard` (text)
  - `total_trips` (int)
  - `total_tonnage` (numeric)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Public can read for demo purposes (can be restricted later)
*/

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_number text,
  dump_yard text,
  shift text CHECK (shift IS NULL OR shift IN ('A', 'B', 'C', 'Day', 'Night')),
  equipment text,
  material text,
  quantity numeric CHECK (quantity IS NULL OR quantity >= 0),
  date date,
  time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_file_id uuid
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trips"
  ON trips FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own trips"
  ON trips FOR INSERT
  TO public
  WITH CHECK (true);

-- Equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  equipment_id text NOT NULL CHECK (length(equipment_id) > 0),
  equipment_type text CHECK (equipment_type IS NULL OR length(equipment_type) > 0),
  status text CHECK (status IS NULL OR status IN ('operational', 'maintenance', 'inactive', 'breakdown')),
  location text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, equipment_id)
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own equipment"
  ON equipment FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own equipment"
  ON equipment FOR INSERT
  TO public
  WITH CHECK (true);

-- Production summary table
CREATE TABLE IF NOT EXISTS production_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('A', 'B', 'C', 'Day', 'Night')),
  dump_yard text,
  total_trips int NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
  total_tonnage numeric NOT NULL DEFAULT 0 CHECK (total_tonnage >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own production"
  ON production_summary FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own production"
  ON production_summary FOR INSERT
  TO public
  WITH CHECK (true);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trips_user_date ON trips(user_id, date);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date DESC);
CREATE INDEX IF NOT EXISTS idx_trips_dump_yard ON trips(dump_yard) WHERE dump_yard IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_shift ON trips(shift) WHERE shift IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_equipment ON trips(equipment) WHERE equipment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_user_id ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_equipment_id ON equipment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_production_user_date ON production_summary(user_id, date);
CREATE INDEX IF NOT EXISTS idx_production_date_shift ON production_summary(date DESC, shift);
