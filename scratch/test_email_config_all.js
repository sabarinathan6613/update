const url = "https://tdwcenpafrpwhnzswlou.supabase.co/rest/v1/email_configuration";
const headers = {
  "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0",
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0"
};

fetch(url, { headers })
  .then(res => res.json())
  .then(data => console.log("All rows in email_configuration:", data))
  .catch(err => console.error(err));
