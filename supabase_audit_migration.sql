-- Skadomation Audit Logs & Configuration System Fixes Migration

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    performed_by TEXT NOT NULL,
    role TEXT NOT NULL,
    plant_id TEXT,
    action TEXT NOT NULL,
    details TEXT DEFAULT '' NOT NULL
);

-- 2. Alter report_history to ensure missing columns and plant_id default
ALTER TABLE public.report_history 
ADD COLUMN IF NOT EXISTS recipients TEXT,
ADD COLUMN IF NOT EXISTS delivery_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_status TEXT,
ADD COLUMN IF NOT EXISTS attachments_sent TEXT;

-- If plant_id doesn't exist, we can add it or make it default 'all'
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

-- 3. Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. Policies for audit_logs
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

-- 5. Seed initial audit logs if empty
INSERT INTO public.audit_logs (performed_by, role, plant_id, action, details)
SELECT 'system', 'system', 'all', 'Database Setup', 'Audit Trail table initialized and seeded.'
WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs LIMIT 1);
