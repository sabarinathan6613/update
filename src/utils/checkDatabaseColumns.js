// src/utils/checkDatabaseColumns.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables from .env.local
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    // Let's fetch one record from the Database table to see what columns exist in the row!
    const { data, error } = await supabase
      .from('Database')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error("Error querying Database table:", error);
    } else if (data && data.length > 0) {
      console.log("Database table first row:", data[0]);
      console.log("Columns:", Object.keys(data[0]));
    } else {
      console.log("Database table is empty!");
    }
  } catch (err) {
    console.error("Failed to check Database columns:", err);
  }
}

run();
