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

const supabaseUrl = (getEnvVar('NEXT_PUBLIC_SUPABASE_URL')).trim();
const supabaseAnonKey = (getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
}

console.log('[Supabase] Initializing singleton client instance...');
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
