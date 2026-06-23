-- supabase_scheduler_complete_migration.sql
-- Run this script in the Supabase SQL Editor to ensure the database matches the Scheduled Reports UI requirements.

-- =========================================================================
-- 1. Create or Upgrade public.scheduled_reports table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
    id TEXT PRIMARY KEY,
    plant_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    frequency TEXT NOT NULL,
    time TEXT NOT NULL,
    email_recipients TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run TIMESTAMP WITH TIME ZONE,
    format_pdf BOOLEAN NOT NULL DEFAULT true,
    format_excel BOOLEAN NOT NULL DEFAULT true,
    report_mode TEXT DEFAULT 'Daily' NOT NULL,
    shift_number INTEGER,
    last_run_time TIMESTAMP WITH TIME ZONE,
    next_run_time TIMESTAMP WITH TIME ZONE,
    last_execution_status TEXT,
    records_included INTEGER,
    last_email_sent_to TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Alter table to add any columns if the table already existed but lacked them
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS report_mode TEXT DEFAULT 'Daily' NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS shift_number INTEGER;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS last_run_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS next_run_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS last_execution_status TEXT;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS records_included INTEGER;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS last_email_sent_to TEXT;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Seed default schedules if the table is empty
INSERT INTO public.scheduled_reports (id, plant_id, report_type, frequency, time, email_recipients, enabled, format_pdf, format_excel, report_mode, shift_number)
SELECT 'sched-1', 'plant-1', 'Daily Production Report', 'Daily', '01:30', 'plantadmin@plant.com, exec-alerts@plant.com', true, true, true, 'Daily', null
WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_reports);

INSERT INTO public.scheduled_reports (id, plant_id, report_type, frequency, time, email_recipients, enabled, format_pdf, format_excel, report_mode, shift_number)
SELECT 'sched-2', 'plant-4', 'Historian Shift Summary', 'Daily', '13:00', 'shiftadmin@plant.com', true, true, true, 'Shift', 1
WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_reports WHERE id = 'sched-2');

INSERT INTO public.scheduled_reports (id, plant_id, report_type, frequency, time, email_recipients, enabled, format_pdf, format_excel, report_mode, shift_number)
SELECT 'sched-3', 'plant-2', 'Weekly Performance Review', 'Weekly', '02:30', 'munichadmin@plant.com', false, true, true, 'Daily', null
WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_reports WHERE id = 'sched-3');


-- =========================================================================
-- 2. Create or Upgrade public.report_history table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.report_history (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    date_range TEXT NOT NULL,
    shift TEXT NOT NULL,
    plant_id TEXT NOT NULL DEFAULT 'all',
    created_by TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    recipients TEXT,
    delivery_time TIMESTAMP WITH TIME ZONE,
    delivery_status TEXT,
    attachments_sent TEXT,
    trigger_time TEXT,
    records_processed INTEGER
);

-- Alter table to add any columns if the table already existed but lacked them
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS plant_id TEXT NOT NULL DEFAULT 'all';
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS recipients TEXT;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS delivery_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS delivery_status TEXT;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS attachments_sent TEXT;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS trigger_time TEXT;
ALTER TABLE public.report_history ADD COLUMN IF NOT EXISTS records_processed INTEGER;


-- =========================================================================
-- 3. Row Level Security (RLS) & Publications
-- =========================================================================
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all users full access to scheduled_reports" ON public.scheduled_reports;
CREATE POLICY "Allow all users full access to scheduled_reports" 
ON public.scheduled_reports FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users full access to report_history" ON public.report_history;
CREATE POLICY "Allow all users full access to report_history" 
ON public.report_history FOR ALL USING (true) WITH CHECK (true);
