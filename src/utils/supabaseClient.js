// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    return import.meta.env[name];
  }
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  return '';
};

const DEFAULT_SUPABASE_URL = 'https://tdwcenpafrpwhnzswlou.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0';

const rawUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const rawKey = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_KEY;

const supabaseUrl = String(rawUrl).trim() || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = String(rawKey).trim() || DEFAULT_SUPABASE_KEY;

console.log('[Supabase] Initializing singleton client instance for:', supabaseUrl);
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});


export function getSupabaseClient() {
  return supabase;
}

export function getSupabaseConfig() {
  if (supabaseUrl && supabaseAnonKey) {
    return { url: supabaseUrl, anonKey: supabaseAnonKey };
  }
  return null;
}

export function getSupabaseAdminClient() {
  return null; // Excluded from frontend for security
}
