/* global process */
import { createClient } from '@supabase/supabase-js';

function getPlantTimeZone(plantId) {
  if (!plantId) return 'UTC';
  const cleanId = String(plantId).trim();
  switch (cleanId) {
    case 'plant-1': return 'America/New_York';
    case 'plant-2': return 'Europe/Berlin';
    case 'plant-3': return 'Asia/Tokyo';
    case 'plant-4':
    case 'plant':
    case 'Mettur':
    case 'mettur':
      return 'Asia/Kolkata';
    default: return 'UTC';
  }
}

function getTimeZoneOffsetMs(timeZone, date = new Date()) {
  try {
    const tzString = date.toLocaleString('en-US', { timeZone });
    const localDate = new Date(tzString);
    const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const utcDate = new Date(utcString);
    return localDate.getTime() - utcDate.getTime();
  } catch (e) {
    console.error("getTimeZoneOffsetMs error:", e);
    return 0;
  }
}

function getShiftDateRange(tz, shiftNumber) {
  const plantNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const todayStr = plantNow.getFullYear() + '-' + String(plantNow.getMonth() + 1).padStart(2, '0') + '-' + String(plantNow.getDate()).padStart(2, '0');
  
  const offsetMs = getTimeZoneOffsetMs(tz);
  
  let startLocalStr, endLocalStr;
  
  if (shiftNumber === 1) {
    // Shift 1: 06:00 to 18:00 today
    startLocalStr = `${todayStr}T06:00:00`;
    endLocalStr = `${todayStr}T18:00:00`;
  } else {
    // Shift 2: 18:00 yesterday to 06:00 today
    const curHourLocal = plantNow.getHours();
    if (curHourLocal < 12) {
      const yesterday = new Date(plantNow.getTime() - 24 * 60 * 60 * 1000);
      const yestStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
      startLocalStr = `${yestStr}T18:00:00`;
      endLocalStr = `${todayStr}T06:00:00`;
    } else {
      const tomorrow = new Date(plantNow.getTime() + 24 * 60 * 60 * 1000);
      const tomStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
      startLocalStr = `${todayStr}T18:00:00`;
      endLocalStr = `${tomStr}T06:00:00`;
    }
  }
  
  const startDate = new Date(new Date(startLocalStr).getTime() - offsetMs).toISOString();
  const endDate = new Date(new Date(endLocalStr).getTime() - offsetMs).toISOString();
  
  return { startDate, endDate };
}

function calculateNextRunTime(utcTimeStr, frequency) {
  const [hours, minutes] = utcTimeStr.split(':').map(Number);
  const next = new Date();
  next.setUTCHours(hours, minutes, 0, 0);
  
  if (next.getTime() <= Date.now()) {
    if (frequency === 'Daily') {
      next.setUTCDate(next.getUTCDate() + 1);
    } else if (frequency === 'Weekly') {
      const daysUntilSunday = (7 - next.getUTCDay()) % 7;
      const addDays = daysUntilSunday === 0 ? 7 : daysUntilSunday;
      next.setUTCDate(next.getUTCDate() + addDays);
    } else if (frequency === 'Monthly') {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(1);
    }
  } else {
    if (frequency === 'Weekly' && next.getUTCDay() !== 0) {
      const daysUntilSunday = (7 - next.getUTCDay()) % 7;
      next.setUTCDate(next.getUTCDate() + daysUntilSunday);
    } else if (frequency === 'Monthly' && next.getUTCDate() !== 1) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(1);
    }
  }
  return next.toISOString();
}

function formatIsoToPlantTime(isoStr, plantId) {
  const tz = getPlantTimeZone(plantId);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date(isoStr));
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    let hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    
    if (hour === '24') hour = '00';
    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch (e) {
    console.error("formatIsoToPlantTime error:", e);
    return isoStr.replace('T', ' ').substring(0, 16);
  }
}

function formatTemplateString(str, report, sched, plantName) {
  if (!str) return '';
  const tz = getPlantTimeZone(sched?.plant_id);
  const formattedGenDate = new Date(report.generatedAt || Date.now()).toLocaleString('en-US', {
    timeZone: tz,
    timeZoneName: 'short'
  });
  return str
    .replace(/\{\{reportName\}\}/g, report.name || '')
    .replace(/\{\{reportType\}\}/g, report.type || '')
    .replace(/\{\{shift\}\}/g, report.shift || 'Email Delivery Log')
    .replace(/\{\{dateRange\}\}/g, report.dateInfo || '')
    .replace(/\{\{generatedAt\}\}/g, formattedGenDate)
    .replace(/\{\{plantName\}\}/g, plantName || '');
}

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
    const curDate = now.getUTCDate(); // 1-31
    const curDay = now.getUTCDay(); // 0-6 (0 is Sunday)
    const curHour = now.getUTCHours();
    const curMinute = now.getUTCMinutes();
    const todayString = now.toISOString().split('T')[0];

    // Fetch settings, plants, tag configs, and recipients in parallel
    const [smtpRes, templateRes, plantsRes, tagsRes, recRes] = await Promise.all([
      supabase.from('smtp_configurations').select('*').eq('is_active', true).maybeSingle(),
      supabase.from('report_templates').select('*'),
      supabase.from('plants').select('*'),
      supabase.from('tag_configurations').select('*'),
      supabase.from('report_recipients').select('*').eq('active', true)
    ]);

    if (plantsRes.error) throw plantsRes.error;
    if (tagsRes.error) throw tagsRes.error;

    const smtpData = smtpRes.data || {};
    const templatesList = templateRes.data || [];
    const plantsList = plantsRes.data || [];
    const tagConfigsList = tagsRes.data || [];
    const activeRecipientsList = recRes.data || [];

    const executedSchedules = [];

    for (const sched of schedules) {
      if (!sched.time) continue;
      const [schedHour, schedMin] = sched.time.split(':').map(x => parseInt(x) || 0);
      
      // Only trigger within a ±2 minute window of the scheduled time.
      // This prevents schedules from firing all day long just because the
      // current hour has already passed the scheduled hour.
      const schedTotalMinutes = schedHour * 60 + schedMin;
      const curTotalMinutes = curHour * 60 + curMinute;
      const diffMinutes = curTotalMinutes - schedTotalMinutes;
      const timeReached = diffMinutes >= 0 && diffMinutes <= 2;

      let shouldRun = false;
      if (timeReached) {
        const lastRunDate = sched.last_run ? new Date(sched.last_run).toISOString().split('T')[0] : null;
        if (sched.frequency === 'Daily') {
          shouldRun = lastRunDate !== todayString;
        } else if (sched.frequency === 'Weekly') {
          // Weekly run: Sunday
          shouldRun = curDay === 0 && lastRunDate !== todayString;
        } else if (sched.frequency === 'Monthly') {
          // Monthly run: 1st day of month
          shouldRun = curDate === 1 && lastRunDate !== todayString;
        }
      }

      if (!shouldRun) continue;

      // Try to acquire lock to prevent duplicate execution triggers
      const { data: lockRows, error: lockErr } = await supabase
        .from('scheduled_reports')
        .update({
          last_execution_status: 'running',
          last_run_time: now.toISOString()
        })
        .eq('id', sched.id)
        .or(`last_run.is.null,last_run.lt.${todayString}T00:00:00.000Z`)
        .select();

      if (lockErr) {
        console.error(`[Scheduler] Failed to acquire lock for schedule ${sched.id}:`, lockErr);
        continue;
      }
      if (!lockRows || lockRows.length === 0) {
        console.log(`[Scheduler] Schedule ${sched.id} was already executed/claimed today by another process.`);
        continue;
      }

      console.log(`[Scheduler] Executing schedule: ${sched.id} (${sched.report_type})`);
      const activePlant = plantsList.find(p => p.id === sched.plant_id) || {};
      const activePlantName = activePlant.name || sched.plant_id || 'Unknown Plant';

      const tz = getPlantTimeZone(sched.plant_id);
      let startDate, endDate;
      if (sched.report_mode === 'Shift') {
        const shiftNum = parseInt(sched.shift_number) || 1;
        const range = getShiftDateRange(tz, shiftNum);
        startDate = range.startDate;
        endDate = range.endDate;
      } else {
        const durationDays = sched.frequency === 'Monthly' ? 30 : (sched.frequency === 'Weekly' ? 7 : 1);
        startDate = new Date(Date.now() - durationDays * 24 * 60 * 60 * 1000).toISOString();
        endDate = now.toISOString();
      }
      
      const formattedStart = formatIsoToPlantTime(startDate, sched.plant_id);
      const formattedEnd = formatIsoToPlantTime(endDate, sched.plant_id);
      const dateInfo = `${formattedStart} to ${formattedEnd}`;

      try {
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
          throw new Error(`Database query failed: ${dbError.message}`);
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
        const manualRecs = (sched.email_recipients || '').split(',').map(x => x.trim()).filter(Boolean);
        const toList = [];

        if (manualRecs.length > 0) {
          toList.push(...manualRecs);
        } else {
          const subs = activeRecipientsList
            .filter(r => {
              const subbedTypes = (r.report_types || '').split(',').map(x => x.trim()).filter(Boolean);
              return subbedTypes.includes(category);
            })
            .map(r => r.email);
          toList.push(...subs);
        }

        if (toList.length === 0) {
          throw new Error(`No active recipients subscribed to report category: ${category}`);
        }

        // Compile report meta info
        const tempReport = {
          id: 'sched-run-' + Date.now(),
          name: `Automated ${sched.report_type} - ${activePlantName}`,
          type: sched.report_type,
          plantId: sched.plant_id,
          dateInfo,
          startDate,
          endDate,
          tags: queryTags,
          generatedAt: now.toISOString(),
          createdBy: 'System Scheduler',
          triggerTime: sched.time,
          recordsProcessed: reportPayloadData.totalRowsCount
        };

        const hostHeader = req.headers.host || 'localhost:3000';
        const protocol = hostHeader.includes('localhost') ? 'http' : 'https';
        const sendEmailUrl = `${protocol}://${hostHeader}/api/send-email`;

        const formatsMsg = [];
        if (sched.format_pdf !== false) formatsMsg.push('PDF');
        if (sched.format_excel !== false) formatsMsg.push('Excel');
        const attachmentInfo = formatsMsg.length > 0 ? `[Attachments: ${formatsMsg.join(', ')}]` : '[No Attachments]';

        // Find default template for this report type
        const defaultTemplate = templatesList.find(t => t.report_type === sched.report_type && t.is_default);

        let formattedSubject = defaultTemplate
          ? formatTemplateString(defaultTemplate.subject, tempReport, sched, activePlantName)
          : `Automated ${sched.report_type} - ${activePlantName} - ${todayString}`;

        if (!formattedSubject.toLowerCase().includes('automated report schedule')) {
          formattedSubject = `Automated Report Schedule: ${formattedSubject}`;
        }

        const formattedMessage = defaultTemplate
          ? formatTemplateString(defaultTemplate.email_body, tempReport, sched, activePlantName)
          : `This is an automated dispatch of your production report.\n\nReport Type: ${sched.report_type}\nPlant Assigned: ${activePlantName}\nTrigger Time: ${sched.time}\nFormat(s): ${formatsMsg.join(', ')}\n\n${attachmentInfo}\n\nReport compilation completed successfully. Telemetry data attached.`;

        console.log(`[Scheduler] Fetching send-email endpoint at ${sendEmailUrl} for ${toList.length} recipients...`);

        const emailResponse = await fetch(sendEmailUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            smtpConfig: smtpData.host ? {
              host: smtpData.host,
              port: parseInt(smtpData.port) || 587,
              username: smtpData.username,
              password: smtpData.password,
              secure: smtpData.secure
            } : null,
            templateConfig: {
              logoText: defaultTemplate ? defaultTemplate.logo_text : '',
              headerColor: defaultTemplate ? defaultTemplate.header_color : '#0A0F1E',
              footerText: defaultTemplate ? defaultTemplate.footer_text : ''
            },
            to: toList,
            subject: formattedSubject,
            message: formattedMessage,
            reportData: {
              meta: tempReport,
              data: reportPayloadData,
              formatPdf: sched.format_pdf !== false,
              formatExcel: sched.format_excel !== false
            }
          })
        });

        const emailResult = await emailResponse.json();
        console.log(`[Scheduler] Email dispatch response:`, emailResult);

        if (emailResponse.ok) {
          const nextRun = calculateNextRunTime(sched.time, sched.frequency);
          await supabase
            .from('scheduled_reports')
            .update({ 
              last_run: todayString,
              last_run_time: now.toISOString(),
              next_run_time: nextRun,
              last_execution_status: 'success',
              records_included: reportPayloadData.totalRowsCount,
              last_email_sent_to: toList.join(', ')
            })
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
          throw new Error(emailResult.error || 'Email sending endpoint returned error status.');
        }
      } catch (innerErr) {
        console.error(`[Scheduler] Failed to execute schedule ${sched.id}:`, innerErr);
        
        // Log failure to scheduled_reports table
        try {
          await supabase
            .from('scheduled_reports')
            .update({
              last_execution_status: `failed: ${innerErr.message.substring(0, 100)}`
            })
            .eq('id', sched.id);
        } catch (dbSchedEx) {
          console.error('[Scheduler] Exception logging failure status:', dbSchedEx);
        }

        // Log failure to report_history
        try {
          await supabase.from('report_history').insert({
            id: 'rep-' + Date.now(),
            name: `Automated ${sched.report_type} - ${activePlantName}`,
            type: `FAILED: ${innerErr.message.substring(0, 100)}`,
            date_range: dateInfo,
            shift: sched.report_type,
            plant_id: sched.plant_id || 'all',
            created_by: 'System Scheduler',
            recipients: sched.email_recipients || '',
            delivery_time: new Date().toISOString(),
            delivery_status: 'FAILED',
            attachments_sent: 'None',
            trigger_time: sched.time,
            records_processed: 0
          });
        } catch (dbHistEx) {
          console.error('[Scheduler] Exception logging failure history:', dbHistEx);
        }

        // Add failure audit log
        try {
          await supabase.from('audit_logs').insert({
            performed_by: 'system_scheduler',
            role: 'system',
            plant_id: sched.plant_id || 'all',
            action: 'Scheduled Report Failure',
            details: `Schedule ${sched.id} failed: ${innerErr.message}`
          });
        } catch (dbAuditEx) {
          console.error('[Scheduler] Exception logging failure audit:', dbAuditEx);
        }

        executedSchedules.push({ id: sched.id, status: 'failed', error: innerErr.message });
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
