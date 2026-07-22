// src/utils/probeDatabase.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

async function probe() {
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    return;
  }

  console.log("Supabase URL:", supabaseUrl);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Probe 'Database' table
  try {
    const { data, error } = await supabase.from('Database').select('*').limit(1);
    if (error) {
      console.error("Error querying 'Database' table:", error.message, error);
    } else {
      console.log("Success! 'Database' columns:", data && data.length > 0 ? Object.keys(data[0]) : "No rows");
    }
  } catch (err) {
    console.error("Exception querying 'Database':", err);
  }

  // 2. Probe 'tag_configurations' table
  try {
    const { data, error } = await supabase.from('tag_configurations').select('*').limit(1);
    if (error) {
      console.error("Error querying 'tag_configurations' table:", error.message, error);
    } else {
      console.log("Success! 'tag_configurations' columns:", data && data.length > 0 ? Object.keys(data[0]) : "No rows");
    }
  } catch (err) {
    console.error("Exception querying 'tag_configurations':", err);
  }
}

probe();
