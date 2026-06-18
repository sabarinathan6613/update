-- =========================================================================
-- SKADOMATION HISTORIAN — UNIFIED DATABASE UPGRADE MIGRATION
-- Run this script in your Supabase Project's SQL Editor.
-- =========================================================================

-- 1. Create Report Recipients table (for multiple recipients and groups)
CREATE TABLE IF NOT EXISTS public.report_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    active BOOLEAN DEFAULT true NOT NULL,
    groups TEXT DEFAULT ' NOT NULL,           -- Comma-separated groups
    report_types TEXT DEFAULT ' NOT NULL,     -- Comma-separated report types
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Create Audit Logs table (for role-based session auditing)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    performed_by TEXT NOT NULL,
    role TEXT NOT NULL,
    plant_id TEXT,
    action TEXT NOT NULL,
    details TEXT DEFAULT ' NOT NULL
);

-- 3. Upgrade Report History table to support email delivery tracking columns
ALTER TABLE public.report_history 
ADD COLUMN IF NOT EXISTS recipients TEXT,
ADD COLUMN IF NOT EXISTS delivery_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_status TEXT,
ADD COLUMN IF NOT EXISTS attachments_sent TEXT;

-- 4. Ensure plant_id default constraints
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'report_history' AND column_name = 'plant_id'
    ) THEN
        ALTER TABLE public.report_history ALTER COLUMN plant_id SET DEFAULT 'all';
    ELSE
        ALTER TABLE public.report_history ADD COLUMN plant_id TEXT DEFAULT 'all';
    END IF;
END $$;

-- 5. Enable Row Level Security (RLS) on both new tables
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Setup RLS Policies for report_recipients
DROP POLICY IF EXISTS "Allow read access to report_recipients" ON public.report_recipients;
CREATE POLICY "Allow read access to report_recipients" ON public.report_recipients 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to report_recipients" ON public.report_recipients;
CREATE POLICY "Allow all access to report_recipients" ON public.report_recipients 
FOR ALL USING (true) WITH CHECK (true);

-- 7. Setup RLS Policies for audit_logs
DROP POLICY IF EXISTS "Allow read audit_logs" ON public.audit_logs;
CREATE POLICY "Allow read audit_logs" ON public.audit_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (
            profiles.role = 'Super Admin' OR 
            (profiles.role = 'Plant Admin' AND audit_logs.plant_id = profiles.plant_id AND audit_logs.role != 'Super Admin')
        )
    )
);

DROP POLICY IF EXISTS "Allow insert audit_logs" ON public.audit_logs;
CREATE POLICY "Allow insert audit_logs" ON public.audit_logs
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete audit_logs" ON public.audit_logs;
CREATE POLICY "Allow delete audit_logs" ON public.audit_logs
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'Super Admin'
    )
);

-- 8. Seed initial test recipients if empty
INSERT INTO public.report_recipients (email, name, role, active, groups, report_types)
VALUES 
('executive-team@industrialcloud.com', 'Board Executives', 'Executive', true, 'Management', 'Daily Reports, Weekly Reports, Monthly Reports'),
('plantadmin@plant.com', 'Detroit Site Manager', 'Plant Admin', true, 'Plant Admins, Management', 'Daily Reports, Shift Reports, Weekly Reports, Alarm Reports'),
('ops-lead@plant.com', 'Operations Control Lead', 'Operator', true, 'Operations Team', 'Daily Reports, Shift Reports, Alarm Reports'),
('maintenance-tech@plant.com', 'Senior Maintenance Tech', 'Maintenance', true, 'Maintenance Team', 'Shift Reports, Alarm Reports'),
('quality-engineer@plant.com', 'Quality Assurance Specialist', 'Engineer', true, 'Quality Team', 'Daily Reports, Weekly Reports')
ON CONFLICT (email) DO NOTHING;

-- 9. Seed initial audit log if empty
INSERT INTO public.audit_logs (performed_by, role, plant_id, action, details)
SELECT 'system', 'system', 'all', 'Database Setup', 'Audit Trail table initialized and seeded.'
WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs LIMIT 1);
