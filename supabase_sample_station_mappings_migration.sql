-- ============================================================
-- Sample Station Mappings — Final Architecture
-- Run this ONCE in the Supabase SQL Editor
-- ============================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS sample_station_mappings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id         integer     NOT NULL,
  equipment_name text        NOT NULL,
  circuit        text        NOT NULL CHECK (circuit IN ('lump', 'fines')),
  role           text        NOT NULL CHECK (role IN ('sample_tag', 'shift_id', 'shift_cumulative_tonnes', 'stockpile_tonnes')),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (tag_id)
);

-- ============================================================
-- Step 2: GRANT object-level privileges  ← THE CRITICAL STEP
-- Without this GRANT, INSERT/UPDATE/DELETE are SILENTLY BLOCKED
-- by PostgreSQL BEFORE RLS is even evaluated.
-- This is why the table stayed empty even though RLS said USING(true).
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.sample_station_mappings
  TO anon, authenticated, service_role;

-- Step 3: Enable Row Level Security
ALTER TABLE sample_station_mappings ENABLE ROW LEVEL SECURITY;

-- Step 4: Create permissive RLS policy
DROP POLICY IF EXISTS "allow_all_sample_station_mappings" ON sample_station_mappings;
CREATE POLICY "allow_all_sample_station_mappings"
  ON sample_station_mappings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Step 5: Auto-update updated_at trigger
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

-- Step 6: Fix role constraint (adds shift_cumulative_tonnes if table pre-existed)
ALTER TABLE sample_station_mappings
  DROP CONSTRAINT IF EXISTS sample_station_mappings_role_check;
ALTER TABLE sample_station_mappings
  ADD CONSTRAINT sample_station_mappings_role_check
    CHECK (role IN ('sample_tag', 'shift_id', 'shift_cumulative_tonnes', 'stockpile_tonnes'));

-- Step 7: Verify grants are applied
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'sample_station_mappings'
ORDER BY grantee, privilege_type;

SELECT 'sample_station_mappings ready — check grants above' AS status;
