-- Skadomation SCADA & Historian — Recipients & Delivery History Migration
-- Run this in your Supabase project's SQL Editor to apply these changes.

-- 1. Create Report Recipients table
CREATE TABLE IF NOT EXISTS public.report_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    active BOOLEAN DEFAULT true NOT NULL,
    groups TEXT DEFAULT '' NOT NULL,           -- Comma-separated groups
    report_types TEXT DEFAULT '' NOT NULL,     -- Comma-separated report types
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Alter Report History table to support email delivery tracking columns
ALTER TABLE public.report_history 
ADD COLUMN IF NOT EXISTS recipients TEXT,
ADD COLUMN IF NOT EXISTS delivery_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_status TEXT,
ADD COLUMN IF NOT EXISTS attachments_sent TEXT;

-- 3. Enable Row Level Security (RLS) on report_recipients
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for report_recipients
DROP POLICY IF EXISTS "Allow read access to report_recipients" ON public.report_recipients;
CREATE POLICY "Allow read access to report_recipients" ON public.report_recipients 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to report_recipients" ON public.report_recipients;
CREATE POLICY "Allow all access to report_recipients" ON public.report_recipients 
FOR ALL USING (true) WITH CHECK (true);

-- Seed initial test recipients if table is empty
INSERT INTO public.report_recipients (email, name, role, active, groups, report_types)
VALUES 
('executive-team@industrialcloud.com', 'Board Executives', 'Executive', true, 'Management', 'Daily Reports, Weekly Reports, Monthly Reports'),
('plantadmin@plant.com', 'Detroit Site Manager', 'Plant Admin', true, 'Plant Admins, Management', 'Daily Reports, Shift Reports, Weekly Reports, Alarm Reports'),
('ops-lead@plant.com', 'Operations Control Lead', 'Operator', true, 'Operations Team', 'Daily Reports, Shift Reports, Alarm Reports'),
('maintenance-tech@plant.com', 'Senior Maintenance Tech', 'Maintenance', true, 'Maintenance Team', 'Shift Reports, Alarm Reports'),
('quality-engineer@plant.com', 'Quality Assurance Specialist', 'Engineer', true, 'Quality Team', 'Daily Reports, Weekly Reports')
ON CONFLICT (email) DO NOTHING;
