-- ============================================================
-- Sample Station Mappings — Final Architecture
-- Run this ONCE in the Supabase SQL Editor
-- ============================================================

-- Create the dedicated configuration table
CREATE TABLE IF NOT EXISTS sample_station_mappings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id       integer     NOT NULL,
  equipment_name text      NOT NULL,
  circuit      text        NOT NULL CHECK (circuit IN ('lump', 'fines')),
  role         text        NOT NULL CHECK (role IN ('sample_tag', 'shift_id', 'stockpile_tonnes')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (tag_id)
);

-- Enable Row Level Security
ALTER TABLE sample_station_mappings ENABLE ROW LEVEL SECURITY;

-- Allow all operations
DROP POLICY IF EXISTS "allow_all_sample_station_mappings" ON sample_station_mappings;
CREATE POLICY "allow_all_sample_station_mappings"
  ON sample_station_mappings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_sample_station_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sample_station_mappings_updated_at ON sample_station_mappings;
CREATE TRIGGER trg_sample_station_mappings_updated_at
  BEFORE UPDATE ON sample_station_mappings
  FOR EACH ROW EXECUTE FUNCTION update_sample_station_mappings_updated_at();

-- Verify
SELECT 'sample_station_mappings table created successfully' AS status;
