-- supabase_sample_station_complete_migration.sql
-- Run this ONCE in your Supabase SQL Editor.
-- Safe to re-run.

-- Clear any old structures from previous attempts
DROP TABLE IF EXISTS public.sample_station_assignments CASCADE;
DROP TABLE IF EXISTS public.sample_station_datalog CASCADE;

-- 1. Single-row config table: which tag feeds which production column
CREATE TABLE public.sample_station_assignments (
  id              integer PRIMARY KEY DEFAULT 1,
  shift_id_tag    integer DEFAULT NULL,
  cumulative_tag  integer DEFAULT NULL,
  stockpile_tag   integer DEFAULT NULL,
  fingerid_tag    integer DEFAULT NULL,
  cutid_tag       integer DEFAULT NULL,
  material_tag    integer DEFAULT NULL,
  updated_at      timestamp with time zone DEFAULT now()
);

-- Seed with an empty row so UPSERT always finds one
INSERT INTO public.sample_station_assignments (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sample_station_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ssa" ON public.sample_station_assignments;
CREATE POLICY "allow_all_ssa" ON public.sample_station_assignments
  FOR ALL USING (true) WITH CHECK (true);



-- 2. Persisted production log rows
CREATE TABLE IF NOT EXISTS public.sample_station_datalog (
  id                       bigserial PRIMARY KEY,
  timestamp                timestamp with time zone NOT NULL,
  shift_id                 numeric,
  shift_cumulative_tonnes  numeric,
  stockpile_tonnes         numeric,
  fingerid                 numeric,
  cutid                    numeric,
  material                 numeric,
  created_at               timestamp with time zone DEFAULT now()
);

-- Unique on timestamp so we never duplicate the same moment
CREATE UNIQUE INDEX IF NOT EXISTS idx_sdl_timestamp
  ON public.sample_station_datalog(timestamp);

ALTER TABLE public.sample_station_datalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sdl" ON public.sample_station_datalog;
CREATE POLICY "allow_all_sdl" ON public.sample_station_datalog
  FOR ALL USING (true) WITH CHECK (true);

-- Reset auto-incrementing serial sequence for the Database table ID column.
-- This resolves the "duplicate key value violates unique constraint Database_pkey"
-- error which blocks synchronization when the sequence falls out of sync.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Database' AND column_name = 'ID') THEN
    PERFORM setval(pg_get_serial_sequence('public."Database"', 'ID'), COALESCE(max("ID"), 1)) FROM public."Database";
  END IF;
END$$;

