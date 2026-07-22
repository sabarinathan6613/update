// src/utils/querySyncLogs.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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
  console.error("Missing Supabase credentials in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data, error } = await supabase
      .from('synchronization_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    console.log("Recent Synchronization Logs:");
    data.forEach(row => {
      console.log(`- ID: ${row.id}, Timestamp: ${row.timestamp}, Status: ${row.status_type}, Msg: ${row.log_message}`);
    });
  } catch (err) {
    console.error("Failed to query synchronization logs:", err);
  }
}

run();
