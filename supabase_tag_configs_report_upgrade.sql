-- supabase_tag_configs_report_upgrade.sql
-- Run this script in your Supabase project's SQL Editor to update the database for dynamic production reports.

ALTER TABLE public.tag_configurations
ADD COLUMN IF NOT EXISTS report_category text DEFAULT 'Custom',
ADD COLUMN IF NOT EXISTS calculation_type text DEFAULT 'Last Value',
ADD COLUMN IF NOT EXISTS dashboard_kpi boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS include_in_pdf boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS include_in_excel boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS active_status boolean DEFAULT true;

-- Update existing records to have sane defaults if needed
UPDATE public.tag_configurations
SET 
  report_category = COALESCE(report_category, 'Custom'),
  calculation_type = COALESCE(calculation_type, 'Last Value'),
  dashboard_kpi = COALESCE(dashboard_kpi, false),
  include_in_pdf = COALESCE(include_in_pdf, true),
  include_in_excel = COALESCE(include_in_excel, true),
  active_status = COALESCE(active_status, true);
