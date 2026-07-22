import { getSupabaseClient } from './supabaseClient.js';

async function probe() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("Supabase client not initialized");
    return;
  }
  const { data, error } = await supabase.from('scheduled_reports').select('*').limit(1);
  if (error) {
    console.error("Error querying scheduled_reports:", error);
    return;
  }
  console.log("Columns in scheduled_reports:", data.length > 0 ? Object.keys(data[0]) : "No rows");
}

probe();
