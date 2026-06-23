-- =========================================================================
-- SKADOMATION SCADA - SETTINGS MODULE REDESIGN DATABASE MIGRATION
-- Run this script in your Supabase Project's SQL Editor.
-- =========================================================================

-- 1. Create SMTP Configurations table
CREATE TABLE IF NOT EXISTS public.smtp_configurations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    secure BOOLEAN DEFAULT true NOT NULL,
    security_type TEXT DEFAULT 'SSL/TLS' NOT NULL, -- 'SSL/TLS', 'STARTTLS', 'None'
    is_active BOOLEAN DEFAULT false NOT NULL,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Create Report Templates table
CREATE TABLE IF NOT EXISTS public.report_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false NOT NULL,
    logo_text TEXT DEFAULT '' NOT NULL,
    header_color TEXT DEFAULT '#0A0F1E' NOT NULL,
    footer_text TEXT DEFAULT '' NOT NULL,
    email_body TEXT DEFAULT '' NOT NULL,
    summary_layout TEXT DEFAULT 'standard' NOT NULL, -- 'standard', 'detailed', 'compact'
    pdf_layout TEXT DEFAULT 'standard' NOT NULL,     -- 'standard', 'minimal', 'industrial'
    excel_layout TEXT DEFAULT 'standard' NOT NULL,   -- 'standard', 'flat_log', 'multi_sheet'
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.smtp_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies allowing full access to authenticated users
DROP POLICY IF EXISTS "Allow all users full access to smtp_configurations" ON public.smtp_configurations;
CREATE POLICY "Allow all users full access to smtp_configurations" ON public.smtp_configurations 
FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users full access to report_templates" ON public.report_templates;
CREATE POLICY "Allow all users full access to report_templates" ON public.report_templates 
FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed default SMTP Configuration (Using current active Gmail credentials)
INSERT INTO public.smtp_configurations (name, host, port, username, password, secure, security_type, is_active)
VALUES (
    'Gmail Corporate Gateway',
    'smtp.gmail.com',
    465,
    'sabarinev@gmail.com',
    'mjcl noyw vwsl hxcf',
    true,
    'SSL/TLS',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 6. Seed default Report Templates for all major report categories
INSERT INTO public.report_templates (name, report_type, subject, is_default, logo_text, header_color, footer_text, email_body, summary_layout, pdf_layout, excel_layout)
VALUES 
(
    'Standard Shift Summary Template',
    'Historian Shift Summary',
    'Shift Summary Report: {{reportName}}',
    true,
    'SKADOMATION HISTORIAN',
    '#2352d1',
    'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.',
    'Dear Team,\n\nPlease find the compiled production report details attached below:\n\nReport Name: {{reportName}}\nReport Type: {{reportType}}\nShift Reference: {{shift}}\nDate Period: {{dateRange}}\nGenerated At: {{generatedAt}}\n\nReport compilation completed successfully. Attached formats: PDF, Excel.',
    'standard',
    'standard',
    'standard'
),
(
    'Standard Daily Report Template',
    'Daily Production Report',
    'Daily Production Summary: {{reportName}}',
    true,
    'SKADOMATION OPERATIONS',
    '#10B981',
    'CONFIDENTIAL — DAILY AUTOMATED REPORT DISPATCHED BY OPERATIONS CENTRE.',
    'Dear Operations Team,\n\nThe daily historian report summary has been compiled and is ready for review:\n\nReport Name: {{reportName}}\nPeriod Covered: {{dateRange}}\nGenerated At: {{generatedAt}}\n\nPlease inspect the attached PDF and Excel files for detailed tag statistics.',
    'standard',
    'standard',
    'standard'
),
(
    'Standard Weekly Review Template',
    'Weekly Performance Review',
    'Weekly Performance Audit: {{reportName}}',
    true,
    'SKADOMATION PERFORMANCE DEPT',
    '#F59E0B',
    'CONFIDENTIAL — WEEKLY AUDIT DOCUMENT. AUTHORISED RECIPIENTS ONLY.',
    'Dear Managers,\n\nPlease find the weekly performance review report attached below:\n\nReport Name: {{reportName}}\nPeriod Covered: {{dateRange}}\nGenerated At: {{generatedAt}}\n\nThis report compiles uptime stats, capacity yields, and tag incidents.',
    'standard',
    'standard',
    'standard'
),
(
    'Standard Monthly Operations Template',
    'Monthly Operations Summary',
    'Monthly Operations Digest: {{reportName}}',
    true,
    'SKADOMATION MANAGEMENT',
    '#8B5CF6',
    'CONFIDENTIAL — EXECUTIVE OPERATIONS SUMMARY REPORT.',
    'Dear Executives,\n\nThe monthly operations summary report has been generated successfully:\n\nReport Name: {{reportName}}\nPeriod Covered: {{dateRange}}\nGenerated At: {{generatedAt}}\n\nStats are aggregated across all plants and visible historian tags.',
    'standard',
    'standard',
    'standard'
),
(
    'Standard Alarm Incident Template',
    'Alarm & Incident Report',
    'Critical Incident Summary: {{reportName}}',
    true,
    'SKADOMATION SECURITY & SAFETY',
    '#EF4444',
    'IMPORTANT — DISPATCHED AUTOMATICALLY BY ALARM MANAGEMENT ENGINE.',
    'Dear Maintenance Lead,\n\nA critical alarm report has been compiled:\n\nReport Name: {{reportName}}\nPeriod Covered: {{dateRange}}\nGenerated At: {{generatedAt}}\n\nAttached contains the full listing of high-severity tag violations and incident flags.',
    'standard',
    'standard',
    'standard'
)
ON CONFLICT (id) DO NOTHING;
