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
