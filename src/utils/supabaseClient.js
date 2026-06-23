// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

export function getSupabaseConfig() {
  try {
    const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
    const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (
      envUrl && envKey &&
      envUrl !== 'your-supabase-url' &&
      envKey !== 'your-anon-key'
    ) {
      return { url: envUrl, anonKey: envKey };
    }
  } catch { /* ignored */ }
  return null;
}

let supabaseInstance = null;
let instanceUrl = null;

export function getSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) {
    supabaseInstance = null;
    instanceUrl = null;
    return null;
  }

  // Only recreate if URL changed or no instance exists
  if (!supabaseInstance || instanceUrl !== config.url) {
    try {
      console.log('[Supabase] Initializing client for:', config.url);
      supabaseInstance = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,        // Keep session in localStorage across tabs/refreshes
          autoRefreshToken: true,       // Auto-renew JWT before it expires
          detectSessionInUrl: true,     // Handle OAuth/magic-link callbacks
          storageKey: 'skadomation-auth', // Stable, app-specific key
        }
      });
      instanceUrl = config.url;
      console.log('[Supabase] Client initialized successfully.');
    } catch (err) {
      console.error('[Supabase] Error creating client:', err);
      return null;
    }
  }
  return supabaseInstance;
}

let adminInstance = null;

export function getSupabaseAdminClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  // Read service role key from env
  const serviceKey = (
    import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
  ).trim();

  if (!serviceKey) return null;

  if (!adminInstance || instanceUrl !== config.url) {
    try {
      console.log('[Supabase] Initializing admin client...');
      adminInstance = createClient(config.url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    } catch (err) {
      console.error('[Supabase] Error creating admin client:', err);
      return null;
    }
  }
  return adminInstance;
}
