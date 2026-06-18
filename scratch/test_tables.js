import { createClient } from "@supabase/supabase-js";
const supabaseUrl = "https://tdwcenpafrpwhnzswlou.supabase.co";
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0";
const supabase = createClient(supabaseUrl, serviceKey);
async function check() {
  const { data: recs, error: recsErr } = await supabase.from("report_recipients").select("*").limit(1);
  console.log("report_recipients:", { count: recs?.length, error: recsErr?.message });
  const { data: logs, error: logsErr } = await supabase.from("audit_logs").select("*").limit(1);
  console.log("audit_logs:", { count: logs?.length, error: logsErr?.message });
}
check();
