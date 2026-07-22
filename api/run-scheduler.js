/* global process */
import { createClient } from '@supabase/supabase-js';
import { sendEmailLocal } from './send-email.js';
import { 
  formatToDbTimestamp,
  loadSystemSettings,
  fetchRecordsForTag,
  getRecordShift,
  calculateAggregate
} from './generate-report.js';

// Inlined from src/utils/timeService.js — API functions cannot import frontend source paths
function getPlantTimeZone(plantId) {
  const cleanId = plantId ? String(plantId).trim() : 'Mettur';
  switch (cleanId) {
    case 'plant-1': return 'America/New_York';
    case 'plant-2': return 'Europe/Berlin';
    case 'plant-3': return 'Asia/Tokyo';
    case 'plant-4':
    case 'plant':
    case 'Mettur':
    case 'mettur':
      return 'Asia/Kolkata';
    default:
      return 'Asia/Kolkata';
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
    console.error('getTimeZoneOffsetMs error:', e);
    return 0;
  }
}

function getPlantLocalTime(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  let hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  if (hour === 24) hour = 0;
  return { hour, minute };
}

function getPlantLocalDateInfo(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  const localDateObj = new Date(date.toLocaleString('en-US', { timeZone }));
  
  return {
    todayString: `${year}-${month}-${day}`,
    curDate: localDateObj.getDate(),
    curDay: localDateObj.getDay()
  };
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

/**
 * Convert a plant-local HH:MM on a given local date string to a UTC ISO timestamp.
 * E.g. buildScheduledFireISO('2026-07-02', 15, 0, 'Asia/Kolkata') → '2026-07-02T09:30:00.000Z'
 */
function buildScheduledFireISO(todayLocalStr, schedHour, schedMin, tz) {
  const HH = String(schedHour).padStart(2, '0');
  const MM = String(schedMin).padStart(2, '0');
  // Temporarily parse local HH:MM as if it were UTC to get an approximate Date
  const approxDate = new Date(`${todayLocalStr}T${HH}:${MM}:00Z`);
  // Compute the real plant-timezone offset at that approximate moment
  const offsetMs = getTimeZoneOffsetMs(tz, approxDate);
  // UTC = local - offset  (for IST UTC+5:30: UTC = local - 5:30)
  return new Date(approxDate.getTime() - offsetMs).toISOString();
}

/**
 * Calculate the next run time (UTC ISO) for a schedule, fully timezone-aware.
 * Always returns the NEXT future occurrence — never the same moment or a past moment.
 *
 * @param {number} schedHour  - Trigger hour in plant local time
 * @param {number} schedMin   - Trigger minute in plant local time
 * @param {string} frequency  - 'Daily' | 'Weekly' | 'Monthly'
 * @param {string} tz         - IANA timezone string e.g. 'Asia/Kolkata'
 */
function calculateNextRunTime(schedHour, schedMin, frequency, tz) {
  const now = new Date();
  const { todayString, curDay } = getPlantLocalDateInfo(now, tz);

  // Helper: advance a 'YYYY-MM-DD' string by N days (using noon UTC to avoid DST edge cases)
  const advanceDays = (dateStr, n) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
  };

  let nextDateStr;

  if (frequency === 'Daily') {
    // Always the next calendar day in plant timezone
    nextDateStr = advanceDays(todayString, 1);
  } else if (frequency === 'Weekly') {
    // Next Sunday in plant timezone
    const daysUntilSunday = (7 - curDay) % 7;
    const addDays = daysUntilSunday === 0 ? 7 : daysUntilSunday;
    nextDateStr = advanceDays(todayString, addDays);
  } else if (frequency === 'Monthly') {
    // 1st day of next month in plant timezone
    const [yr, mo] = todayString.split('-').map(Number);
    const nextMo = mo === 12 ? 1 : mo + 1;
    const nextYr = mo === 12 ? yr + 1 : yr;
    nextDateStr = `${nextYr}-${String(nextMo).padStart(2, '0')}-01`;
  } else {
    nextDateStr = advanceDays(todayString, 1);
  }

  return buildScheduledFireISO(nextDateStr, schedHour, schedMin, tz);
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

  // Validate request is either from Vercel system cron or has a valid authenticated session token
  const isCron = req.headers['x-vercel-cron'] === 'true' || req.headers['user-agent'] === 'vercel-cron';
  if (!isCron) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Missing verification token' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || !['Super Admin', 'Admin', 'Operator', 'User'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden: Unauthorized role' });
    }
  }

  try {
    console.log('[Scheduler Started]');
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
      console.log(`[Schedule Found] ID: ${sched.id}, Type: ${sched.report_type}, Trigger Time: ${sched.time}`);
      if (!sched.time) continue;
      const [schedHour, schedMin] = sched.time.split(':').map(x => parseInt(x) || 0);

      const tz = getPlantTimeZone(sched.plant_id);
      const { hour: curHourLocal, minute: curMinuteLocal } = getPlantLocalTime(now, tz);
      const { todayString, curDate, curDay } = getPlantLocalDateInfo(now, tz);

      // Convert stored UTC schedule time to plant local time for comparison
      const targetUtcDate = new Date(now);
      targetUtcDate.setUTCHours(schedHour, schedMin, 0, 0);
      const { hour: localSchedHour, minute: localSchedMin } = getPlantLocalTime(targetUtcDate, tz);

      // ── Requirement 3: Exact minute match only ────────────────────────────────
      // Never fire on "time >= scheduled"; fire ONLY at the precise HH:MM minute.
      const timeMatches = curHourLocal === localSchedHour && curMinuteLocal === localSchedMin;

      if (!timeMatches) {
        console.log(`[Scheduler] Schedule ${sched.id}: DB time ${sched.time} (Local: ${String(localSchedHour).padStart(2,'0')}:${String(localSchedMin).padStart(2,'0')}) does not match current local ${String(curHourLocal).padStart(2,'0')}:${String(curMinuteLocal).padStart(2,'0')} ${tz} — skipping.`);
        continue;
      }

      console.log(`[Current Time Matched] ID: ${sched.id}, Local Time: ${String(curHourLocal).padStart(2,'0')}:${String(curMinuteLocal).padStart(2,'0')}`);

      // ── Requirement 8: Dedup via last_run_time ISO timestamp ──────────────────
      // Compute the UTC ISO for the scheduled firing moment this occurrence.
      const scheduledFireISO = buildScheduledFireISO(todayString, schedHour, schedMin, tz);

      // Has the schedule already executed for this occurrence?
      const alreadyRan = sched.last_run_time &&
        new Date(sched.last_run_time) >= new Date(scheduledFireISO);

      // ── Requirements 4, 6: Frequency + dedup guard ───────────────────────────
      let shouldRun = false;
      if (!alreadyRan) {
        if (sched.frequency === 'Daily') {
          shouldRun = true;
        } else if (sched.frequency === 'Weekly') {
          shouldRun = curDay === 0; // Sunday in plant timezone
        } else if (sched.frequency === 'Monthly') {
          shouldRun = curDate === 1; // 1st of month in plant timezone
        }
      } else {
        console.log(`[Scheduler] Schedule ${sched.id}: already ran at ${sched.last_run_time} for this occurrence (${scheduledFireISO}) — skipping.`);
      }

      if (!shouldRun) continue;

      // ── Requirement 7: Optimistic lock to prevent race-condition duplicates ───
      // Claim the schedule only if last_run_time is null OR older than this occurrence.
      const { data: lockRows, error: lockErr } = await supabase
        .from('scheduled_reports')
        .update({
          last_execution_status: 'running',
          last_run_time: now.toISOString()
        })
        .eq('id', sched.id)
        .or(`last_run_time.is.null,last_run_time.lt.${scheduledFireISO}`)
        .select();

      if (lockErr) {
        console.error(`[Scheduler] Failed to acquire lock for schedule ${sched.id}:`, lockErr);
        continue;
      }
      if (!lockRows || lockRows.length === 0) {
        console.log(`[Scheduler] Schedule ${sched.id} was already claimed for this occurrence by another process — skipping.`);
        continue;
      }

      console.log(`[Scheduler] Executing schedule: ${sched.id} (${sched.report_type})`);
      const activePlant = plantsList.find(p => p.id === sched.plant_id) || {};
      const activePlantName = activePlant.name || sched.plant_id || 'Unknown Plant';

      let startDate, endDate;
      if (sched.report_mode === 'Shift') {
        const shiftNum = parseInt(sched.shift_number) || 1;
        const range = getShiftDateRange(tz, shiftNum);
        startDate = range.startDate;
        endDate = range.endDate;
      } else {
        // Frequency-based automatic reports (Daily, Weekly, Monthly)
        // Let's use the scheduled trigger time (e.g. "09:00") to construct precise boundaries
        const schedTime = sched.time || "09:00";
        const [h, m] = schedTime.split(':').map(Number);
        
        // End local datetime on the current calendar day
        const { todayString } = getPlantLocalDateInfo(now, tz);
        const endLocalStr = `${todayString}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        const offsetMs = getTimeZoneOffsetMs(tz, new Date(endLocalStr + 'Z'));
        
        // Convert to UTC ISO
        const endUtcMs = new Date(endLocalStr + 'Z').getTime() - offsetMs;
        
        const durationDays = sched.frequency === 'Monthly' ? 30 : (sched.frequency === 'Weekly' ? 7 : 1);
        const startUtcMs = endUtcMs - durationDays * 24 * 60 * 60 * 1000;
        
        startDate = new Date(startUtcMs).toISOString();
        endDate = new Date(endUtcMs).toISOString();
      }
      
      const formattedStart = formatIsoToPlantTime(startDate, sched.plant_id);
      const formattedEnd = formatIsoToPlantTime(endDate, sched.plant_id);
      const dateInfo = `${formattedStart} to ${formattedEnd}`;

      try {
        console.log('[Generating Report]');
        
        // 1. Load System Settings dynamically
        const settings = await loadSystemSettings(supabase);
        const tableName = settings?.selectedTable || 'Database';
        const mappings = settings?.columnMappings || {};
        
        const tagCol = mappings.tagCol || 'TagIndex';
        const tsCol = mappings.timestampCol || 'DateAndTime';
        const valCol = mappings.valueCol || 'Val';
        const statusCol = mappings.statusCol || 'Status';
        const alarmCol = mappings.alarmCol || 'Marker';

        // 2. Query Tag Configurations list
        const { data: dbTags } = await supabase.from('tag_configurations').select('*');
        const tagMap = {};
        const dashboardTagIndexes = [];
        if (dbTags && Array.isArray(dbTags)) {
          dbTags.forEach(t => {
            if (!t) return;
            const isDbVisible = t.dashboard_enabled !== undefined ? t.dashboard_enabled : (t.dashboard_visibility !== undefined ? t.dashboard_visibility : false);
            tagMap[t.tag_index] = {
              TagName: t.display_name || t.tag_name || `Tag Index ${t.tag_index}`,
              Unit: t.unit || '',
              DecimalPlaces: t.decimal_places ?? 2,
              ReportCategory: t.report_category || 'Custom',
              CalculationType: t.calculation_type || 'Last Value',
              DashboardKPI: isDbVisible,
              DashboardVisible: isDbVisible,
              IncludeInPDF: t.pdf_enabled !== undefined ? t.pdf_enabled : (t.include_in_pdf ?? true),
              IncludeInExcel: t.excel_enabled !== undefined ? t.excel_enabled : (t.include_in_excel ?? true),
              ActiveStatus: t.active_status ?? true
            };
            if (isDbVisible && t.active_status !== false) {
              dashboardTagIndexes.push(t.tag_index);
            }
          });
        }

        // 3. Filter tags visible in reports
        const reportTags = tagConfigsList
          .filter(t => t.reports_visible !== false && t.reports_visible !== null)
          .map(t => t.tag_index);

        const combinedTags = [...new Set([...reportTags, ...dashboardTagIndexes])];
        const activeTagsToQuery = combinedTags.filter(tagIdx => {
          const config = tagMap[tagIdx];
          if (config) return config.ActiveStatus;
          return true;
        });

        const selectCols = [tsCol, tagCol, valCol, statusCol, alarmCol].filter(Boolean).join(',');

        // 4. Batch query tag data using formatToDbTimestamp
        const results = await Promise.all(
          activeTagsToQuery.map(tagIdx =>
            fetchRecordsForTag(supabase, tableName, tagIdx, startDate, endDate, selectCols, tsCol, tagCol, () => {}, tz)
          )
        );

        let chronRows = [];
        results.forEach(tagRows => {
          if (tagRows && Array.isArray(tagRows)) {
            chronRows = chronRows.concat(tagRows);
          }
        });

        // Map database columns to standardized shape
        chronRows = chronRows.map(row => {
          if (!row) return {};
          return {
            DateAndTime: row[tsCol],
            TagIndex: row[tagCol],
            Val: row[valCol],
            Status: row[statusCol],
            Marker: row[alarmCol] || '',
            TagName: (tagMap[row[tagCol]] || {}).TagName || `Tag ${row[tagCol]}`,
            Unit: (tagMap[row[tagCol]] || {}).Unit || ''
          };
        });

        // 5. Compile tag summaries statistics (dayVal, nightVal, dailyTotal, etc.)
        const summaries = activeTagsToQuery.map(tagIdx => {
          const records = chronRows.filter(r => r.TagIndex === tagIdx);
          const config = tagMap[tagIdx] || { 
            TagName: `Tag ${tagIdx}`, 
            Unit: '', 
            DecimalPlaces: 2, 
            ReportCategory: 'Custom', 
            CalculationType: 'Last Value',
            ActiveStatus: true 
          };

          const cleanRecords = records.filter(r => r.Val !== null && r.Val !== undefined && !isNaN(Number(r.Val)));
          const dayShiftRecs = cleanRecords.filter(r => getRecordShift(r.DateAndTime, tz, settings?.shiftConfig) === 'Day Shift');
          const nightShiftRecs = cleanRecords.filter(r => getRecordShift(r.DateAndTime, tz, settings?.shiftConfig) === 'Night Shift');

          const calcType = config.CalculationType || 'Last Value';

          const dayVal = calculateAggregate(dayShiftRecs, calcType);
          const nightVal = calculateAggregate(nightShiftRecs, calcType);
          const dailyTotal = calculateAggregate(cleanRecords, calcType);
          const avgVal = calculateAggregate(cleanRecords, 'Average');
          const maxVal = calculateAggregate(cleanRecords, 'Maximum');
          const minVal = calculateAggregate(cleanRecords, 'Minimum');
          const lastVal = calculateAggregate(cleanRecords, 'Last Value');

          return {
            tagIndex: tagIdx,
            tagName: config.TagName,
            unit: config.Unit,
            description: config.description || `Telemetry channel for Tag Index ${tagIdx}`,
            category: config.ReportCategory || 'Custom',
            calcType: calcType,
            isReportTag: reportTags.includes(tagIdx),
            includeInPdf: config.IncludeInPDF ?? true,
            includeInExcel: config.IncludeInExcel ?? true,
            activeStatus: config.ActiveStatus ?? true,
            decimalPlaces: config.DecimalPlaces ?? 2,
            count: records.length,
            goodPct: records.length > 0 ? (records.filter(r => r.Status === 192).length / records.length) * 100 : 100,
            firstSampleTime: records.length > 0 ? records[0].DateAndTime : null,
            lastSampleTime: records.length > 0 ? records[records.length - 1].DateAndTime : null,
            dayVal,
            nightVal,
            dailyTotal,
            avgVal,
            maxVal,
            minVal,
            lastVal
          };
        });

        // Incidents summary
        const incidents = chronRows
          .filter(r => r.Marker)
          .map(r => {
            const config = tagMap[r.TagIndex] || { TagName: `Tag Index ${r.TagIndex}` };
            return {
              timestamp: r.DateAndTime,
              tagIndex: r.TagIndex,
              tagName: config.TagName || `Tag Index ${r.TagIndex}`,
              val: r.Val,
              marker: r.Marker
            };
          });

        const reportPayloadData = {
          rows: chronRows,
          totalRowsCount: chronRows.length,
          summaries: summaries,
          incidents: incidents
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
        const parts = (sched.email_recipients || '').split(';');
        const toPart = parts[0] || '';
        let ccPart = '';
        let bccPart = '';

        parts.forEach(p => {
          if (p.startsWith('cc:')) {
            ccPart = p.substring(3);
          } else if (p.startsWith('bcc:')) {
            bccPart = p.substring(4);
          }
        });

        const demoEmails = [
          'plantadmin@plant.com',
          'ops-lead@plant.com',
          'maintenance-tech@plant.com',
          'engineer@plant.com',
          'archive@plant.com'
        ];

        const cleanEmailList = (list) => {
          return (list || []).filter(email => {
            if (!email) return false;
            const clean = email.toLowerCase().trim();
            return !demoEmails.includes(clean);
          });
        };

        const manualRecs = toPart.split(',').map(x => x.trim()).filter(Boolean);
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

        const ccList = ccPart.split(',').map(x => x.trim()).filter(Boolean);
        const bccList = bccPart.split(',').map(x => x.trim()).filter(Boolean);

        const finalToList = cleanEmailList(toList);
        const finalCcList = cleanEmailList(ccList);
        const finalBccList = cleanEmailList(bccList);

        if (finalToList.length === 0) {
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

        console.log('[Calling send-email API]');
        let emailResult;
        let isSendOk = false;
        try {
          emailResult = await sendEmailLocal({
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
            to: finalToList,
            cc: finalCcList,
            bcc: finalBccList,
            subject: formattedSubject,
            message: formattedMessage,
            reportData: {
              meta: tempReport,
              data: reportPayloadData,
              formatPdf: true,
              formatExcel: true
            }
          });
          isSendOk = true;
          console.log(`[Scheduler] Email dispatch success:`, emailResult);
        } catch (sendErr) {
          console.error(`[Scheduler] sendEmailLocal thrown error:`, sendErr.message);
          emailResult = { error: sendErr.message };
        }

        if (isSendOk) {
          // ── Requirement 5: Update last_run + calculate correct next occurrence ──
          const nextRun = calculateNextRunTime(localSchedHour, localSchedMin, sched.frequency, tz);
          const recipientSummaryString = [
            toList.length > 0 ? `To: ${toList.join(', ')}` : '',
            ccList.length > 0 ? `Cc: ${ccList.join(', ')}` : '',
            bccList.length > 0 ? `Bcc: ${bccList.join(', ')}` : ''
          ].filter(Boolean).join(' | ');
          console.log('[Updating Database]');
          await supabase
            .from('scheduled_reports')
            .update({ 
              last_run: todayString,
              last_run_time: now.toISOString(),
              next_run_time: nextRun,
              last_execution_status: 'success',
              records_included: reportPayloadData.totalRowsCount,
              last_email_sent_to: recipientSummaryString
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

          console.log('[Execution Complete]');
          executedSchedules.push({ id: sched.id, status: 'success', recipients: toList });
        } else {
          throw new Error(emailResult.error || `Email sending endpoint returned error status code: ${emailResponse.status}. Body: ${JSON.stringify(emailResult)}`);
        }
      } catch (innerErr) {
        console.error(`[Scheduler] Failed to execute schedule ${sched.id}. Step failed exact reason:`, innerErr.message);
        
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
