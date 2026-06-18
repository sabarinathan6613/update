const url = "https://tdwcenpafrpwhnzswlou.supabase.co/rest/v1/report_recipients?limit=1";
const headers = {
  "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0",
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0"
};

fetch(url, { headers })
  .then(res => {
    console.log("report_recipients status:", res.status);
    return res.text();
  })
  .then(text => console.log("report_recipients body:", text))
  .catch(err => console.error(err));

const url2 = "https://tdwcenpafrpwhnzswlou.supabase.co/rest/v1/audit_logs?limit=1";
fetch(url2, { headers })
  .then(res => {
    console.log("audit_logs status:", res.status);
    return res.text();
  })
  .then(text => console.log("audit_logs body:", text))
  .catch(err => console.error(err));
