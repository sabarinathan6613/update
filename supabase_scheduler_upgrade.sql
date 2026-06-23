-- supabase_scheduler_upgrade.sql
-- Run this script in your Supabase Project's SQL Editor to support the enhanced scheduler features.

-- 1. Upgrade scheduled_reports table with shift details and run statistics
ALTER TABLE public.scheduled_reports 
ADD COLUMN IF NOT EXISTS report_mode TEXT DEFAULT 'Daily' NOT NULL,
ADD COLUMN IF NOT EXISTS shift_number INTEGER,
ADD COLUMN IF NOT EXISTS last_run_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_run_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_execution_status TEXT,
ADD COLUMN IF NOT EXISTS records_included INTEGER,
ADD COLUMN IF NOT EXISTS last_email_sent_to TEXT;

-- 2. Upgrade report_history table to support execution logs
ALTER TABLE public.report_history
ADD COLUMN IF NOT EXISTS trigger_time TEXT,
ADD COLUMN IF NOT EXISTS records_processed INTEGER;
