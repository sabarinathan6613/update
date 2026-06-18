import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only allow GET or POST (Vercel Cron makes GET requests by default)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing on server environment' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[Scheduler] Fetching schedules...');
    const { data: schedules, error: schedError } = await supabase
      .from('scheduled_reports')
      .select('*')
      .eq('enabled', true);

    if (schedError) throw schedError;
    if (!schedules || schedules.length === 0) {
      return res.status(200).json({ message: 'No enabled schedules found.' });
    }

    console.log(`[Scheduler] Found ${schedules.length} enabled schedules. Checking execution times...`);

    // Get current UTC date/time details
    const now = new Date();
    const curYear = now.getUTCFullYear();
    const curMonth = now.getUTCMonth(); // 0-11
    const curDate = now.getUTCDate(); // 1-31
    const curDay = now.getUTCDay(); // 0-6 (0 is Sunday)
    const curHour = now.getUTCHours();
    const todayString = now.toISOString().split('T')[0];

    // Fetch settings, plants, tag configs, and recipients in parallel
    const [configRes, plantsRes, tagsRes, recRes] = await Promise.all([
      supabase.from('email_configuration').select('*').in('id', ['default', 'system_settings']),
      supabase.from('plants').select('*'),
      supabase.from('tag_configurations').select('*'),
      supabase.from('report_recipients').select('*').eq('active', true)
    ]);

    if (configRes.error) throw configRes.error;
    if (plantsRes.error) throw plantsRes.error;
    if (tagsRes.error) throw tagsRes.error;

    const emailConfigs = configRes.data || [];
    const smtpData = emailConfigs.find(c => c.id === 'default') || {};
    const sysData = emailConfigs.find(c => c.id === 'system_settings') || {};

    const plantsList = plantsRes.data || [];
    const tagConfigsList = tagsRes.data || [];
    const activeRecipientsList = recRes.data || [];

    const executedSchedules = [];

    for (const sched of schedules) {
      if (!sched.time) continue;
      const schedHour = parseInt(sched.time.split(':')[0]) || 0;
      
      let shouldRun = false;
      if (curHour === schedHour) {
        if (sched.frequency === 'Daily') {
          shouldRun = sched.last_run !== todayString;
        } else if (sched.frequency === 'Weekly') {
          // Weekly run: Sunday
          shouldRun = curDay === 0 && sched.last_run !== todayString;
        } else if (sched.frequency === 'Monthly') {
          // Monthly run: 1st day of month
          shouldRun = curDate === 1 && sched.last_run !== todayString;
        }
      }

      if (!shouldRun) continue;

      console.log(`[Scheduler] Executing schedule: ${sched.id} (${sched.report_type})`);

      // Determine date range
      const endDate = now.toISOString();
      const durationDays = sched.frequency === 'Monthly' ? 30 : (sched.frequency === 'Weekly' ? 7 : 1);
      const startDate = new Date(Date.now() - durationDays * 24 * 60 * 60 * 1000).toISOString();
      const dateInfo = `${startDate.replace('T', ' ').substring(0, 16)} to ${endDate.replace('T', ' ').substring(0, 16)}`;

      // Filter tags visible in reports
      const activeTags = tagConfigsList
        .filter(t => t.reports_visible !== false && t.reports_visible !== null)
        .map(t => t.tag_index);

      // Fetch historian telemetry data for these tags
      const queryTags = activeTags.length > 0 ? activeTags : [1];
      const { data: dbData, error: dbError } = await supabase
        .from('Database')
        .select('*')
        .in('TagIndex', queryTags)
        .gte('DateAndTime', startDate)
        .lte('DateAndTime', endDate)
        .order('DateAndTime', { ascending: true });

      if (dbError) {
        console.error(`[Scheduler] Database query failed for schedule ${sched.id}:`, dbError);
        continue;
      }

      // Compile reportData (frontend equivalence)
      const chronRows = dbData || [];
      const tagMap = {};
      tagConfigsList.forEach(c => {
        tagMap[c.tag_index] = c;
      });

      const tagSummaries = queryTags.map(tagIdx => {
        const records = chronRows.filter(r => r.TagIndex === tagIdx);
        const config = tagMap[tagIdx] || { tag_name: `Tag ${tagIdx}`, unit: '', decimal_places: 2 };

        if (records.length === 0) {
          return {
            tagIndex: tagIdx,
            tagName: config.tag_name || `Tag ${tagIdx}`,
            unit: config.unit || '',
            decimalPlaces: config.decimal_places ?? 2,
            min: 0, max: 0, avg: 0, current: 0, count: 0, goodPct: 100, sparkPoints: []
          };
        }

        let min = Infinity, max = -Infinity, sum = 0, goodCount = 0;
        records.forEach(r => {
          if (r.Val < min) min = r.Val;
          if (r.Val > max) max = r.Val;
          sum += r.Val;
          if (r.Status === 192 || String(r.Status).toLowerCase() === 'good' || r.Status === '192') goodCount++;
        });

        const sparkPoints = records.slice(-20).map(r => r.Val);

        return {
          tagIndex: tagIdx,
          tagName: config.tag_name || `Tag ${tagIdx}`,
          unit: config.unit || '',
          decimalPlaces: config.decimal_places ?? 2,
          min, max,
          avg: sum / records.length,
          current: records[records.length - 1].Val,
          count: records.length,
          goodPct: (goodCount / records.length) * 100,
          sparkPoints
        };
      });

      const incidents = chronRows
        .filter(r => (r.Status !== 192 && String(r.Status).toLowerCase() !== 'good' && r.Status !== '192') || r.Marker)
        .map(r => {
          const config = tagMap[r.TagIndex] || { tag_name: `Tag Index ${r.TagIndex}` };
          return {
            timestamp: r.DateAndTime,
            tagIndex: r.TagIndex,
            tagName: config.tag_name || `Tag Index ${r.TagIndex}`,
            val: r.Val,
            status: r.Status,
            marker: r.Marker || 'ANOMALY'
          };
        });

      const reportPayloadData = {
        rows: chronRows.slice(-300),
        totalRowsCount: chronRows.length,
        summaries: tagSummaries,
        incidents: incidents.slice(0, 50)
      };

      // Determine recipients
      const activePlant = plantsList.find(p => p.id === sched.plant_id) || {};
      const activePlantName = activePlant.name || 'Unknown Plant';

      const getReportCategory = (type) => {
        const t = (type || '').toLowerCase();
        if (t.includes('daily')) return 'Daily Reports';
        if (t.includes('shift')) return 'Shift Reports';
        if (t.includes('weekly')) return 'Weekly Reports';
        if (t.includes('monthly')) return 'Monthly Reports';
        if (t.includes('alarm') || t.includes('incident')) return 'Alarm Reports';
        if (t.includes('historian') || t.includes('audit') || t.includes('process')) return 'Historian Reports';
        return 'Historian Reports';
      };

      const category = getReportCategory(sched.report_type);
      const toList = activeRecipientsList
        .filter(r => {
          const subbedTypes = (r.report_types || '').split(',').map(x => x.trim()).filter(Boolean);
          return subbedTypes.includes(category);
        })
        .map(r => r.email);

      // Add manual recipients from schedule
      const manualRecs = (sched.email_recipients || '').split(',').map(x => x.trim()).filter(Boolean);
      manualRecs.forEach(email => {
        if (!toList.includes(email)) {
          toList.push(email);
        }
      });

      if (toList.length === 0) {
        console.warn(`[Scheduler] Skipping schedule ${sched.id} - no active recipients subscribed to ${category}.`);
        continue;
      }

      // Compile report meta info
      const tempReport = {
        id: 'sched-run-' + Date.now(),
        name: `Automated ${sched.report_type} - ${activePlantName}`,
        type: sched.report_type,
        dateInfo,
        startDate,
        endDate,
        tags: queryTags,
        generatedAt: now.toISOString(),
        createdBy: 'System Scheduler'
      };

      // Invoke the send-email API
      // Since it's on the same deployment, let's use process.env.VERCEL_URL if available,
      // or fall back to req.headers.host, or local endpoint.
      const hostHeader = req.headers.host || 'localhost:3000';
      const protocol = hostHeader.includes('localhost') ? 'http' : 'https';
      const sendEmailUrl = `${protocol}://${hostHeader}/api/send-email`;

      const formatsMsg = [];
      if (sched.format_pdf !== false) formatsMsg.push('PDF');
      if (sched.format_excel !== false) formatsMsg.push('Excel');
      const attachmentInfo = formatsMsg.length > 0 ? `[Attachments: ${formatsMsg.join(', ')}]` : '[No Attachments]';

      console.log(`[Scheduler] Fetching send-email endpoint at ${sendEmailUrl} for ${toList.length} recipients...`);

      const emailResponse = await fetch(sendEmailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            host: smtpData.host || smtpData.smtpHost || '',
            port: parseInt(smtpData.port || smtpData.smtpPort) || 587,
            username: smtpData.username || smtpData.smtpUser || '',
            password: smtpData.password || smtpData.smtpPass || '',
            secure: smtpData.secure || smtpData.smtpSecure || false,
            logoText: sysData.logo_text || sysData.templateLogoText || 'Skadomation System',
            headerColor: sysData.header_color || sysData.templateHeaderColor || '#0A0F1E',
            footerText: sysData.footer_text || sysData.templateFooterText || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.'
          },
          to: toList,
          subject: `Automated ${sched.report_type} - ${activePlantName} - ${todayString}`,
          message: `This is an automated dispatch of your production report.\n\nReport Type: ${sched.report_type}\nPlant Assigned: ${activePlantName}\nTrigger Time: ${sched.time}\nFormat(s): ${formatsMsg.join(', ')}\n\n${attachmentInfo}\n\nReport compilation completed successfully. Telemetry data attached.`,
          reportData: {
            meta: tempReport,
            data: reportPayloadData
          }
        })
      });

      const emailResult = await emailResponse.json();
      console.log(`[Scheduler] Email dispatch response:`, emailResult);

      if (emailResponse.ok) {
        // Update last_run date in Supabase
        await supabase
          .from('scheduled_reports')
          .update({ last_run: todayString })
          .eq('id', sched.id);

        // Add audit log
        await supabase.from('audit_logs').insert({
          performed_by: 'system_scheduler',
          role: 'system',
          plant_id: sched.plant_id || 'all',
          action: 'Scheduled Report Dispatch',
          details: `Sent ${sched.report_type} report to: ${toList.join(', ')}`
        });

        executedSchedules.push({ id: sched.id, status: 'success', recipients: toList });
      } else {
        console.error(`[Scheduler] Failed to dispatch report for schedule ${sched.id}:`, emailResult);
        executedSchedules.push({ id: sched.id, status: 'failed', error: emailResult.error });
      }
    }

    return res.status(200).json({
      status: 'success',
      timestamp: now.toISOString(),
      executedCount: executedSchedules.length,
      runs: executedSchedules
    });
  } catch (err) {
    console.error('[Scheduler] Critical failure:', err);
    return res.status(500).json({ error: `Scheduler failed: ${err.message}` });
  }
}
