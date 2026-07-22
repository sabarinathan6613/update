-- supabase_complete_toggle_columns_migration.sql
-- Run this in your Supabase SQL Editor to add ALL toggle columns needed by Tag Configuration.
-- All statements use IF NOT EXISTS so it is safe to run multiple times.

ALTER TABLE public.tag_configurations
  ADD COLUMN IF NOT EXISTS dashboard_kpi           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboard_kpi_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboard_visibility    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trends_visible          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reports_visible         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_category         text    DEFAULT 'Custom',
  ADD COLUMN IF NOT EXISTS calculation_type        text    DEFAULT 'Last Value',
  ADD COLUMN IF NOT EXISTS include_in_pdf          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_in_excel        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS active_status           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sample_datalog_enabled  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_station_column   text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS downtime_datalog_enabled boolean DEFAULT false;

-- Sync values from any legacy columns that may already have data
UPDATE public.tag_configurations SET
  dashboard_kpi_enabled    = COALESCE(dashboard_kpi_enabled, dashboard_kpi, dashboard_visibility, false),
  dashboard_visibility     = COALESCE(dashboard_visibility, dashboard_kpi, false),
  sample_datalog_enabled   = COALESCE(sample_datalog_enabled, false),
  downtime_datalog_enabled = COALESCE(downtime_datalog_enabled, false),
  trends_visible           = COALESCE(trends_visible, false),
  include_in_pdf           = COALESCE(include_in_pdf, true),
  include_in_excel         = COALESCE(include_in_excel, true),
  active_status            = COALESCE(active_status, true);
