-- supabase_tag_configs_datalog_upgrade.sql
-- Run this script in your Supabase project's SQL Editor to update the database for dynamic datalogs.

-- 1. Create enum type for Sample Station columns if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sample_station_column_type') THEN
        CREATE TYPE sample_station_column_type AS ENUM (
            'datetime',
            'shift_id',
            'shift_cumulative_tonnes',
            'stockpile_tonnes',
            'finger_id',
            'cut_id',
            'material'
        );
    END IF;
END$$;

-- 2. Alter table public.tag_configurations to add the new datalog columns
ALTER TABLE public.tag_configurations
ADD COLUMN IF NOT EXISTS dashboard_kpi_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sample_datalog_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sample_station_column text CHECK (sample_station_column IN ('datetime', 'shift_id', 'shift_cumulative_tonnes', 'stockpile_tonnes', 'finger_id', 'cut_id', 'material') OR sample_station_column IS NULL),
ADD COLUMN IF NOT EXISTS downtime_datalog_enabled boolean DEFAULT false;

-- 3. Sync existing legacy column values if they exist
UPDATE public.tag_configurations
SET
  dashboard_kpi_enabled = COALESCE(dashboard_kpi_enabled, dashboard_kpi, dashboard_visibility, false),
  sample_datalog_enabled = COALESCE(sample_datalog_enabled, sample_station_datalog, false),
  downtime_datalog_enabled = COALESCE(downtime_datalog_enabled, downtime_datalog, false),
  sample_station_column = COALESCE(sample_station_column, sample_column, NULL);
