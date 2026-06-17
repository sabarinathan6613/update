// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

export function getSupabaseConfig() {
  try {
    const settings = JSON.parse(localStorage.getItem('prod_settings'));
    if (settings && settings.supabaseUrl && settings.supabaseAnonKey) {
      // Filter out clean trimmed values
      const url = settings.supabaseUrl.trim();
      const anonKey = settings.supabaseAnonKey.trim();
      
      if (url && anonKey && url !== 'your-supabase-url' && anonKey !== 'your-anon-key') {
        return { url, anonKey };
      }
    }
  } catch (e) {
    console.error("Failed to parse settings for Supabase configuration:", e);
  }

  // Fallback to Vite environment variables if local storage is empty
  try {
    const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
    const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (envUrl && envKey && envUrl !== 'your-supabase-url' && envKey !== 'your-anon-key') {
      return { url: envUrl, anonKey: envKey };
    }
  } catch { /* ignored */ }

  return null;
}

let supabaseInstance = null;

export function getSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) {
    supabaseInstance = null;
    return null;
  }

  // Reinitialize if url changed or instance is null
  if (!supabaseInstance || supabaseInstance.supabaseUrl !== config.url) {
    try {
      supabaseInstance = createClient(config.url, config.anonKey);
      supabaseInstance.supabaseUrl = config.url; // cache url on the instance
    } catch (err) {
      console.error("Error creating Supabase client:", err);
      return null;
    }
  }
  return supabaseInstance;
}
