-- supabase_add_admin_role_migration.sql
-- Run this script in your Supabase project's SQL Editor to update the profiles table check constraint.

-- Drop the old constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the updated constraint including 'Admin' and 'Viewer' roles
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Super Admin', 'Plant Admin', 'User', 'Admin', 'Viewer'));
