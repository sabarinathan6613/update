-- supabase_sample_station_multitag_migration.sql
-- Run this ONCE in your Supabase SQL Editor.
-- Safe to re-run.

-- 1. Create a temporary backup of old assignments if the old table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'sample_station_assignments'
      AND EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'sample_station_assignments' 
          AND column_name = 'shift_id_tag'
      )
  ) THEN
    CREATE TEMP TABLE temp_old_assignments AS 
    SELECT * FROM public.sample_station_assignments WHERE id = 1;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore temp table creation errors
END $$;

-- 2. Drop the old table structure
DROP TABLE IF EXISTS public.sample_station_assignments CASCADE;

-- 3. Create the new multi-tag assignment table
CREATE TABLE public.sample_station_assignments (
  id              bigserial PRIMARY KEY,
  column_key      text NOT NULL,
  tag_index       integer NOT NULL,
  tag_name        text NOT NULL,
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_column_tag UNIQUE (column_key, tag_index)
);

-- 4. Enable RLS and add allow-all policy
ALTER TABLE public.sample_station_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ssa" ON public.sample_station_assignments;
CREATE POLICY "allow_all_ssa" ON public.sample_station_assignments
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Restore backup data into the new structure
DO $$
DECLARE
  v_shift_id_tag integer;
  v_cumulative_tag integer;
  v_stockpile_tag integer;
  v_fingerid_tag integer;
  v_cutid_tag integer;
  v_material_tag integer;
  v_name text;
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'temp_old_assignments'
  ) THEN
    -- Extract values from backup
    EXECUTE 'SELECT shift_id_tag, cumulative_tag, stockpile_tag, fingerid_tag, cutid_tag, material_tag FROM temp_old_assignments LIMIT 1'
    INTO v_shift_id_tag, v_cumulative_tag, v_stockpile_tag, v_fingerid_tag, v_cutid_tag, v_material_tag;

    -- Shift ID
    IF v_shift_id_tag IS NOT NULL THEN
      SELECT COALESCE(display_name, 'Shift ID') INTO v_name FROM public.tag_configurations WHERE tag_index = v_shift_id_tag;
      INSERT INTO public.sample_station_assignments (column_key, tag_index, tag_name)
      VALUES ('shift_id_tag', v_shift_id_tag, COALESCE(v_name, 'Shift ID'))
      ON CONFLICT (column_key, tag_index) DO NOTHING;
    END IF;

    -- Cumulative
    IF v_cumulative_tag IS NOT NULL THEN
      SELECT COALESCE(display_name, 'Shift Cumulative Tonnes') INTO v_name FROM public.tag_configurations WHERE tag_index = v_cumulative_tag;
      INSERT INTO public.sample_station_assignments (column_key, tag_index, tag_name)
      VALUES ('cumulative_tag', v_cumulative_tag, COALESCE(v_name, 'Shift Cumulative Tonnes'))
      ON CONFLICT (column_key, tag_index) DO NOTHING;
    END IF;

    -- Stockpile
    IF v_stockpile_tag IS NOT NULL THEN
      SELECT COALESCE(display_name, 'Stockpile Tonnes') INTO v_name FROM public.tag_configurations WHERE tag_index = v_stockpile_tag;
      INSERT INTO public.sample_station_assignments (column_key, tag_index, tag_name)
      VALUES ('stockpile_tag', v_stockpile_tag, COALESCE(v_name, 'Stockpile Tonnes'))
      ON CONFLICT (column_key, tag_index) DO NOTHING;
    END IF;

    -- FingerID
    IF v_fingerid_tag IS NOT NULL THEN
      SELECT COALESCE(display_name, 'FingerID') INTO v_name FROM public.tag_configurations WHERE tag_index = v_fingerid_tag;
      INSERT INTO public.sample_station_assignments (column_key, tag_index, tag_name)
      VALUES ('fingerid_tag', v_fingerid_tag, COALESCE(v_name, 'FingerID'))
      ON CONFLICT (column_key, tag_index) DO NOTHING;
    END IF;

    -- CutID
    IF v_cutid_tag IS NOT NULL THEN
      SELECT COALESCE(display_name, 'CutID') INTO v_name FROM public.tag_configurations WHERE tag_index = v_cutid_tag;
      INSERT INTO public.sample_station_assignments (column_key, tag_index, tag_name)
      VALUES ('cutid_tag', v_cutid_tag, COALESCE(v_name, 'CutID'))
      ON CONFLICT (column_key, tag_index) DO NOTHING;
    END IF;

    -- Material
    IF v_material_tag IS NOT NULL THEN
      SELECT COALESCE(display_name, 'Material') INTO v_name FROM public.tag_configurations WHERE tag_index = v_material_tag;
      INSERT INTO public.sample_station_assignments (column_key, tag_index, tag_name)
      VALUES ('material_tag', v_material_tag, COALESCE(v_name, 'Material'))
      ON CONFLICT (column_key, tag_index) DO NOTHING;
    END IF;
  END IF;
END $$;
