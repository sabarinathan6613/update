-- supabase_rls_policies_upgrade.sql
-- Run this in your Supabase project's SQL Editor to set up secure RLS policies.

-- 1. Helper function to check the current authenticated user's role securely
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
DECLARE
  u_role text;
BEGIN
  SELECT role INTO u_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(u_role, 'Operator');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function to get the current authenticated user's plant ID
CREATE OR REPLACE FUNCTION public.get_user_plant_id()
RETURNS text AS $$
DECLARE
  u_plant_id text;
BEGIN
  SELECT plant_id INTO u_plant_id FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(u_plant_id, '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop all existing public full-access policies
DROP POLICY IF EXISTS "Allow all users full access to plants" ON public.plants;
DROP POLICY IF EXISTS "Allow all users full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow all users full access to production_data" ON public.production_data;
DROP POLICY IF EXISTS "Allow all users full access to report_history" ON public.report_history;
DROP POLICY IF EXISTS "Allow all users full access to scheduled_reports" ON public.scheduled_reports;
DROP POLICY IF EXISTS "Allow all users full access to email_configuration" ON public.email_configuration;
DROP POLICY IF EXISTS "Allow all users full access to synchronization_logs" ON public.synchronization_logs;
DROP POLICY IF EXISTS "Allow read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow delete audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow read access to report_recipients" ON public.report_recipients;
DROP POLICY IF EXISTS "Allow all access to report_recipients" ON public.report_recipients;
DROP POLICY IF EXISTS "Allow all users full access to smtp_configurations" ON public.smtp_configurations;
DROP POLICY IF EXISTS "Allow all users full access to report_templates" ON public.report_templates;

-- Enable RLS on all tables
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synchronization_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smtp_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;


-- ── 3. WRITE POLICIES ───────────────────────────────────────────────────

-- PLANTS policies
CREATE POLICY "Allow authenticated read plants" ON public.plants
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow Super Admin modify plants" ON public.plants
    FOR ALL TO authenticated USING (public.get_user_role() = 'Super Admin');

-- PROFILES policies
CREATE POLICY "Allow authenticated read profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write profiles" ON public.profiles
    FOR ALL TO authenticated 
    USING (
        public.get_user_role() = 'Super Admin' 
        OR (
            public.get_user_role() = 'Plant Admin' 
            AND plant_id = public.get_user_plant_id() 
            AND role <> 'Super Admin'
        )
    );

-- PRODUCTION DATA policies
CREATE POLICY "Allow authenticated read production_data" ON public.production_data
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow Super Admin modify production_data" ON public.production_data
    FOR ALL TO authenticated USING (public.get_user_role() = 'Super Admin');

-- REPORT HISTORY policies
CREATE POLICY "Allow authenticated read report_history" ON public.report_history
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert report_history" ON public.report_history
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow admin modify report_history" ON public.report_history
    FOR ALL TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));

-- SCHEDULED REPORTS policies
CREATE POLICY "Allow authenticated read scheduled_reports" ON public.scheduled_reports
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin modify scheduled_reports" ON public.scheduled_reports
    FOR ALL TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));

-- EMAIL CONFIGURATION policies
CREATE POLICY "Allow authenticated read email_configuration" ON public.email_configuration
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin modify email_configuration" ON public.email_configuration
    FOR ALL TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));

-- SYNCHRONIZATION LOGS policies
CREATE POLICY "Allow authenticated read synchronization_logs" ON public.synchronization_logs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow Super Admin modify synchronization_logs" ON public.synchronization_logs
    FOR ALL TO authenticated USING (public.get_user_role() = 'Super Admin');

-- AUDIT LOGS policies
CREATE POLICY "Allow admin read audit_logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));
CREATE POLICY "Allow any insert audit_logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true); -- Allow anonymous users (like login attempts) to write logs
CREATE POLICY "Allow Super Admin delete audit_logs" ON public.audit_logs
    FOR DELETE TO authenticated USING (public.get_user_role() = 'Super Admin');

-- REPORT RECIPIENTS policies
CREATE POLICY "Allow authenticated read report_recipients" ON public.report_recipients
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin modify report_recipients" ON public.report_recipients
    FOR ALL TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));

-- SMTP CONFIGURATIONS policies
CREATE POLICY "Allow authenticated read smtp_configurations" ON public.smtp_configurations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin modify smtp_configurations" ON public.smtp_configurations
    FOR ALL TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));

-- REPORT TEMPLATES policies
CREATE POLICY "Allow authenticated read report_templates" ON public.report_templates
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin modify report_templates" ON public.report_templates
    FOR ALL TO authenticated USING (public.get_user_role() IN ('Super Admin', 'Plant Admin'));
