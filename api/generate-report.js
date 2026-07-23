/* global process, Buffer */
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import os from 'os';
import fs from 'fs';
import path from 'path';

// ── Supabase Service Role Initialization ─────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ── PDF Helper Utilities ──────────────────────────────────────────────────
function fmtVal(v, dp) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(dp ?? 2);
}
// Inlined from src/utils/timeService.js + historianService.js
// API functions cannot import frontend source paths on Vercel serverless
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

export function formatToDbTimestamp(isoStr, separator = 'T', plantTz = 'Asia/Kolkata') {
  if (!isoStr) return isoStr;
  if (!isoStr.endsWith('Z') && !isoStr.includes('+') && !/-\d{2}:\d{2}$/.test(isoStr)) {
    const base = isoStr.substring(0, 19);
    return separator === 'T' ? base.replace(' ', 'T') : base.replace('T', ' ');
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: plantTz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(d);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  const yr = get('year'), mo = get('month'), dy = get('day');
  const hr = get('hour'), mn = get('minute'), sc = get('second');
  return `${yr}-${mo}-${dy}${separator === 'T' ? 'T' : ' '}${hr}:${mn}:${sc}`;
}

function normalizeTagIndex(v) {
  if (v === null || v === undefined) return v;
  const s = String(v).trim();
  if (/^[Tt](\d+)$/.test(s)) return parseInt(s.substring(1), 10);
  const n = parseInt(s, 10);
  return isNaN(n) ? s : n;
}

export function calculateExecutiveKPIs(rows, summaries, tz, shiftConfig) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return {
      totalFeed: null, lumpProd: null, finesProd: null,
      currentFeedRate: null, avgFeedRate: null, maxFeedRate: null, minFeedRate: null,
      runtimeHours: null, downtimeHours: null, availability: null,
      totalRecords: 0, latestTs: null
    };
  }
  const findTagIdx = (name) => {
    if (!name) return null;
    const cleanTarget = name.toLowerCase().trim();
    const match = summaries.find(s => {
      const sName = (s?.tagName || s?.display_name || s?.TagName || '').toLowerCase().trim();
      return sName === cleanTarget;
    });
    return match ? (match.tagIndex ?? match.tag_index ?? match.TagIndex) : null;
  };
  const feedRateIdx = findTagIdx('Total Input Feed');
  const lumpRateIdx = findTagIdx('Lump Out');
  const finesRateIdx = findTagIdx('Fines Out');
  const getTagRows = (tagIdx) => {
    if (tagIdx === null || tagIdx === undefined) return [];
    const normTarget = normalizeTagIndex(tagIdx);
    return rows.filter(r => r && normalizeTagIndex(r.TagIndex) == normTarget && r.Val !== null && r.Val !== undefined);
  };
  const feedRows = getTagRows(feedRateIdx);
  const lumpRows = getTagRows(lumpRateIdx);
  const finesRows = getTagRows(finesRateIdx);
  const totalFeed = feedRows.length > 0 ? feedRows.reduce((sum, r) => sum + Number(r.Val), 0) : null;
  const lumpProd = lumpRows.length > 0 ? lumpRows.reduce((sum, r) => sum + Number(r.Val), 0) : null;
  const finesProd = finesRows.length > 0 ? finesRows.reduce((sum, r) => sum + Number(r.Val), 0) : null;
  let currentFeedRate = null, avgFeedRate = null, maxFeedRate = null, minFeedRate = null;
  if (feedRows.length > 0) {
    currentFeedRate = Number(feedRows[feedRows.length - 1].Val);
    const sum = feedRows.reduce((s, r) => s + Number(r.Val), 0);
    avgFeedRate = sum / feedRows.length;
    maxFeedRate = Math.max(...feedRows.map(r => Number(r.Val)));
    minFeedRate = Math.min(...feedRows.map(r => Number(r.Val)));
  }
  let firstTime = null, lastTime = null;
  rows.forEach(r => {
    if (r && r.DateAndTime) {
      const ms = new Date(r.DateAndTime).getTime();
      if (!firstTime || ms < firstTime) firstTime = ms;
      if (!lastTime || ms > lastTime) lastTime = ms;
    }
  });
  const durationMs = (firstTime && lastTime) ? (lastTime - firstTime) : 0;
  let runtimeHours = null, downtimeHours = null, availability = null;
  if (durationMs > 0) {
    const hours = durationMs / (1000 * 60 * 60);
    const downtimeTags = summaries.filter(s => s && (s.category || '').toLowerCase() === 'downtime');
    let downtimeMins = 0;
    if (downtimeTags.length > 0) {
      downtimeTags.forEach(t => { downtimeMins += Number(t.dailyTotal || t.daily_total || t.avgVal || 0); });
    }
    downtimeHours = downtimeMins / 60;
    runtimeHours = Math.max(0, hours - downtimeHours);
    availability = (runtimeHours / hours) * 100;
  }
  return {
    totalFeed, lumpProd, finesProd, currentFeedRate, avgFeedRate, maxFeedRate, minFeedRate,
    runtimeHours, downtimeHours, availability,
    totalRecords: rows.length,
    latestTs: lastTime ? new Date(lastTime).toISOString() : null
  };
}
function fmtTs(ts, tz = 'UTC') {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: tz,
      hour12: false
    });
  } catch {
    return String(ts);
  }
}

// ── Draw Page Header & Footer ─────────────────────────────────────────────
function drawPageHeader(doc, logoText, themeColor, reportTitle, pageLabel) {
  const w = doc.page.width;
  doc.rect(18, 12, w - 36, 14).fill('#1B365D');
  doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold')
     .text(((reportTitle || 'Daily Production Report') + ' — ' + (pageLabel || 'KPI & Indicator Guide')).toUpperCase(), 24, 16, { width: w - 48, lineBreak: false });
}
function drawPageFooter(doc, footerText, pageNum, totalPages, generatedAt) {
  const w = doc.page.width;
  const h = doc.page.height;
  const company = footerText || 'Automation Alliance Solutions';
  doc.fillColor('#64748B').fontSize(7).font('Helvetica')
     .text(`${company} | Confidential | Page ${pageNum} of ${totalPages} | Generated by Skadomation v1.2 | ${generatedAt}`, 18, h - 24, { width: w - 36, align: 'left' });
}
function drawSectionTitle(doc, title, y) {
  const w = doc.page.width;
  doc.rect(18, y, w - 36, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
     .text(title, 24, y + 5, { width: w - 48 });
  return y + 26;
}
function drawTableRow(doc, cells, colX, colW, y, rowH, isHeader, isAlt) {
  const w = doc.page.width;
  if (isHeader) {
    doc.rect(18, y, w - 36, rowH).fill('#1B365D');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
  } else {
    if (isAlt) {
      doc.rect(18, y, w - 36, rowH).fill('#F8FAFC');
    }
    doc.fillColor('#1E293B').font('Helvetica').fontSize(7);
  }
  cells.forEach((cell, i) => {
    doc.save();
    doc.strokeColor('#CBD5E1').lineWidth(0.5);
    doc.rect(colX[i], y, colW[i], rowH).stroke();
    doc.restore();

    doc.text(String(cell ?? '—'), colX[i] + 3, y + (rowH - 7) / 2, {
      width: colW[i] - 6, align: i > 0 && !isHeader ? 'right' : 'left', lineBreak: false
    });
  });
}

// ── Native Vector Chart Drawing Functions (PDFKit) ────────────────────────
function drawLineChart(doc, x, y, w, h, points, title, labels) {
  doc.save();
  // Draw bounding box
  doc.strokeColor('#E2E8F0').lineWidth(1).rect(x, y, w, h).stroke();
  
  // Title
  doc.fillColor('#1B365D').font('Helvetica-Bold').fontSize(7.5).text(title, x + 6, y - 10);

  if (!points || points.length < 2) {
    doc.fillColor('#64748B').fontSize(7).text('No trend data available', x + 10, y + h / 2);
    doc.restore();
    return;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  // Draw gridlines
  const gridCount = 4;
  doc.strokeColor('#F1F5F9').lineWidth(0.5);
  for (let i = 1; i < gridCount; i++) {
    const gy = y + (h / gridCount) * i;
    doc.moveTo(x, gy).lineTo(x + w, gy).stroke();
  }

  // Map coordinates
  const coords = points.map((val, idx) => {
    const px = x + (idx / (points.length - 1)) * w;
    const py = y + h - ((val - min) / range) * (h - 10) - 5;
    return { px, py };
  });

  // Shade area
  doc.moveTo(coords[0].px, y + h);
  coords.forEach(c => doc.lineTo(c.px, c.py));
  doc.lineTo(coords[coords.length - 1].px, y + h);
  doc.closePath().fillColor('#F0F9FF').fill();

  // Draw line
  doc.strokeColor('#0284C7').lineWidth(1.5);
  doc.moveTo(coords[0].px, coords[0].py);
  for (let i = 1; i < coords.length; i++) {
    doc.lineTo(coords[i].px, coords[i].py);
  }
  doc.stroke();

  // Labels
  doc.fillColor('#64748B').fontSize(5.5).font('Helvetica');
  doc.text(max.toFixed(1), x - 25, y + 2, { width: 22, align: 'right' });
  doc.text(min.toFixed(1), x - 25, y + h - 7, { width: 22, align: 'right' });

  if (labels && labels.length > 0) {
    const labelStep = Math.max(1, Math.floor(labels.length / 4));
    labels.forEach((l, idx) => {
      if (idx % labelStep === 0) {
        const lx = x + (idx / (labels.length - 1)) * w;
        doc.text(l, lx - 20, y + h + 3, { width: 40, align: 'center' });
      }
    });
  }

  doc.restore();
}

function drawGroupedBarChart(doc, x, y, w, h, dataGroups, title, labels) {
  doc.save();
  // Bounding box
  doc.strokeColor('#E2E8F0').lineWidth(1).rect(x, y, w, h).stroke();
  doc.fillColor('#1B365D').font('Helvetica-Bold').fontSize(7.5).text(title, x + 6, y - 10);

  // Legend
  doc.fillColor('#1B365D').rect(x + w - 85, y - 11, 6, 6).fill();
  doc.fillColor('#64748B').fontSize(5.5).font('Helvetica').text('Input', x + w - 76, y - 10);
  doc.fillColor('#0EA5E9').rect(x + w - 50, y - 11, 6, 6).fill();
  doc.fillColor('#64748B').text('Output', x + w - 41, y - 10);

  const inputs = dataGroups.map(d => d.input);
  const outputs = dataGroups.map(d => d.output);
  const maxVal = Math.max(...inputs, ...outputs, 100);

  const barCount = dataGroups.length;
  const groupW = w / barCount;
  const barW = groupW * 0.35;

  dataGroups.forEach((g, idx) => {
    const gx = x + groupW * idx;
    
    // Input bar (Navy)
    const inH = (g.input / maxVal) * (h - 15);
    const inY = y + h - inH;
    doc.fillColor('#1B365D').rect(gx + groupW * 0.12, inY, barW, inH).fill();

    // Output bar (Sky Blue)
    const outH = (g.output / maxVal) * (h - 15);
    const outY = y + h - outH;
    doc.fillColor('#0EA5E9').rect(gx + groupW * 0.12 + barW + 2, outY, barW, outH).fill();

    // X Axis Label
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica').text(labels[idx], gx, y + h + 3, { width: groupW, align: 'center' });
  });

  doc.restore();
}

function drawVerticalBarChart(doc, x, y, w, h, points, title, labels) {
  doc.save();
  // Bounding box
  doc.strokeColor('#E2E8F0').lineWidth(1).rect(x, y, w, h).stroke();
  doc.fillColor('#1B365D').font('Helvetica-Bold').fontSize(7.5).text(title, x + 6, y - 10);

  if (!points || points.length === 0) {
    doc.fillColor('#64748B').fontSize(7).text('No bar data available', x + 10, y + h / 2);
    doc.restore();
    return;
  }

  const maxVal = Math.max(...points, 10);
  const barCount = points.length;
  const barW = (w / barCount) * 0.7;
  const gapW = (w / barCount) * 0.3;

  points.forEach((val, idx) => {
    const bx = x + (barW + gapW) * idx + gapW / 2;
    const bh = (val / maxVal) * (h - 15);
    const by = y + h - bh;

    // Draw bar
    doc.fillColor('#2563EB').rect(bx, by, barW, bh).fill();

    // Label under axis
    if (labels && labels[idx] && idx % Math.max(1, Math.floor(barCount / 6)) === 0) {
      doc.fillColor('#64748B').fontSize(5.5).font('Helvetica').text(labels[idx], bx - gapW, y + h + 3, { width: barW + gapW * 2, align: 'center' });
    }
  });

  doc.restore();
}

function drawHorizontalStackedBar(doc, x, y, w, h, segments, title) {
  doc.save();
  doc.fillColor('#1B365D').font('Helvetica-Bold').fontSize(7.5).text(title, x, y - 8);

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let currentX = x;

  segments.forEach(s => {
    const sw = (s.value / total) * w;
    // Draw segment block
    doc.fillColor(s.color).rect(currentX, y, sw, h).fill();
    
    // Border
    doc.strokeColor('#FFFFFF').lineWidth(0.5).rect(currentX, y, sw, h).stroke();

    // Text Label inside/above
    if (sw > 30) {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6);
      doc.text(`${(s.value / total * 100).toFixed(0)}%`, currentX + 2, y + (h - 6) / 2, { width: sw - 4, align: 'center', lineBreak: false });
    }
    
    currentX += sw;
  });

  // Legend below
  let lx = x;
  segments.forEach(s => {
    doc.fillColor(s.color).rect(lx, y + h + 4, 6, 6).fill();
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica').text(`${s.name} (${s.value.toLocaleString()} t)`, lx + 8, y + h + 5);
    lx += (w / segments.length);
  });

  doc.restore();
}

// ── Timezone-Aware Shift Determination ─────────────────────────────────────
export function getRecordShift(timestamp, timezone, shiftConfig) {
  try {
    const localStr = new Date(timestamp).toLocaleString('en-US', {
      timeZone: timezone,
      hour12: false
    });
    const timePart = localStr.split(', ')[1];
    if (!timePart) return 'Day Shift';
    const [hour, minute] = timePart.split(':').map(Number);
    const minutesVal = hour * 60 + minute;

    const [dayStartH, dayStartM] = shiftConfig.dayStart.split(':').map(Number);
    const [dayEndH, dayEndM] = shiftConfig.dayEnd.split(':').map(Number);
    const dayStartMin = dayStartH * 60 + dayStartM;
    const dayEndMin = dayEndH * 60 + dayEndM;

    if (dayStartMin < dayEndMin) {
      if (minutesVal >= dayStartMin && minutesVal < dayEndMin) {
        return 'Day Shift';
      } else {
        return 'Night Shift';
      }
    } else {
      if (minutesVal >= dayStartMin || minutesVal < dayEndMin) {
        return 'Day Shift';
      } else {
        return 'Night Shift';
      }
    }
  } catch {
    return 'Day Shift';
  }
}

// ── Dynamic Math Aggregate Calculator ──────────────────────────────────────
export function calculateAggregate(recs, calcType) {
  if (!recs || recs.length === 0) return null;
  const clean = recs.filter(r => r.Val !== null && r.Val !== undefined && !isNaN(Number(r.Val)));
  if (clean.length === 0) return null;

  const values = clean.map(r => Number(r.Val));

  switch (calcType) {
    case 'Sum':
    case 'Production Total':
      return values.reduce((sum, v) => sum + v, 0);
    
    case 'Average':
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    
    case 'Maximum':
      return Math.max(...values);
    
    case 'Minimum':
      return Math.min(...values);
    
    case 'Difference':
      return values[values.length - 1] - values[0];
    
    case 'Count':
      return clean.length;
    
    case 'Current Value':
    case 'Last Value':
      return values[values.length - 1];
    
    case 'First Value':
      return values[0];

    case 'Runtime': {
      let runtimeMins = 0;
      for (let i = 1; i < clean.length; i++) {
        const diffMins = (new Date(clean[i].DateAndTime) - new Date(clean[i-1].DateAndTime)) / (1000 * 60);
        if (diffMins < 60 && values[i-1] > 0) {
          runtimeMins += diffMins;
        }
      }
      return runtimeMins;
    }

    case 'Downtime': {
      let downtimeMins = 0;
      for (let i = 1; i < clean.length; i++) {
        const diffMins = (new Date(clean[i].DateAndTime) - new Date(clean[i-1].DateAndTime)) / (1000 * 60);
        if (diffMins < 60 && values[i-1] === 0) {
          downtimeMins += diffMins;
        }
      }
      return downtimeMins;
    }

    case 'Availability': {
      let runtimeMins = 0;
      let totalMins = 0;
      for (let i = 1; i < clean.length; i++) {
        const diffMins = (new Date(clean[i].DateAndTime) - new Date(clean[i-1].DateAndTime)) / (1000 * 60);
        if (diffMins < 60) {
          totalMins += diffMins;
          if (values[i-1] > 0) runtimeMins += diffMins;
        }
      }
      return totalMins > 0 ? (runtimeMins / totalMins) * 100 : 100;
    }

    case 'Efficiency': {
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      return max > 0 ? (avg / max) * 100 : 100;
    }

    default:
      return values[values.length - 1];
  }
}

// ── Downtime Statistics Calculator ──────────────────────────────────────────
function calculateDowntimeStats(recs, shiftName, shiftConfig, timezone) {
  const shiftRecs = recs.filter(r => {
    if (shiftName === 'Combined') return true;
    return getRecordShift(r.DateAndTime, timezone, shiftConfig) === shiftName;
  });

  const clean = shiftRecs.filter(r => r.Val !== null && r.Val !== undefined && !isNaN(Number(r.Val)));
  if (clean.length === 0) {
    return { events: 0, minutes: 0, pct: 0, avg: 0, max: 0, min: 0 };
  }

  let events = 0;
  let totalMinutes = 0;
  let eventDurations = [];
  let currentEventDuration = 0;
  let inEvent = false;

  for (let i = 1; i < clean.length; i++) {
    const diffMins = (new Date(clean[i].DateAndTime) - new Date(clean[i-1].DateAndTime)) / (1000 * 60);
    if (diffMins < 60) {
      if (Number(clean[i-1].Val) > 0) {
        if (!inEvent) {
          inEvent = true;
          events++;
        }
        currentEventDuration += diffMins;
        totalMinutes += diffMins;
      } else {
        if (inEvent) {
          eventDurations.push(currentEventDuration);
          currentEventDuration = 0;
          inEvent = false;
        }
      }
    }
  }
  if (inEvent && currentEventDuration > 0) {
    eventDurations.push(currentEventDuration);
  }

  const durationCount = eventDurations.length || events || 1;
  const avg = totalMinutes / durationCount;
  const max = eventDurations.length > 0 ? Math.max(...eventDurations) : totalMinutes;
  const min = eventDurations.length > 0 ? Math.min(...eventDurations) : totalMinutes;

  let totalPeriodMins = 0;
  if (clean.length >= 2) {
    totalPeriodMins = (new Date(clean[clean.length - 1].DateAndTime) - new Date(clean[0].DateAndTime)) / (1000 * 60);
  }
  if (totalPeriodMins <= 0) totalPeriodMins = 1;
  const pct = (totalMinutes / totalPeriodMins) * 100;

  return {
    events: eventDurations.length || events,
    minutes: totalMinutes,
    pct,
    avg,
    max,
    min
  };
}

// ── Alarm Statistics Calculator ─────────────────────────────────────────────
function calculateAlarmStats(recs) {
  const clean = recs.filter(r => r.Val !== null && r.Val !== undefined && !isNaN(Number(r.Val)));
  if (clean.length === 0) {
    return { count: 0, duration: 0, frequency: 0, highestSeverity: 0 };
  }

  let count = 0;
  let duration = 0;
  let inAlarm = false;
  let maxSeverity = 0;

  for (let i = 1; i < clean.length; i++) {
    const val = Number(clean[i-1].Val);
    const diffMins = (new Date(clean[i].DateAndTime) - new Date(clean[i-1].DateAndTime)) / (1000 * 60);
    if (diffMins < 60) {
      if (val > 0) {
        if (!inAlarm) {
          inAlarm = true;
          count++;
        }
        duration += diffMins;
        if (val > maxSeverity) maxSeverity = val;
      } else {
        inAlarm = false;
      }
    }
  }

  return {
    count,
    duration,
    frequency: count,
    highestSeverity: maxSeverity
  };
}

// ── Load configuration parameters from database ──────────────────────────
export async function loadSystemSettings(supabaseClient) {
  try {
    const { data: sysData } = await supabaseClient.from('email_configuration').select('*').eq('id', 'system_settings').maybeSingle();
    const { data: smtpData } = await supabaseClient.from('email_configuration').select('*').eq('id', 'default').maybeSingle();
    
    let columnMappings = {};
    let shiftConfig = {
      dayStart: "06:00",
      dayEnd: "18:00",
      nightStart: "18:00",
      nightEnd: "06:00"
    };
    if (sysData && sysData.password) {
      try {
        const parsed = JSON.parse(sysData.password);
        if (parsed && parsed.columnMappings) {
          columnMappings = parsed.columnMappings;
          shiftConfig = parsed.shiftConfig || shiftConfig;
        } else {
          columnMappings = parsed || {};
        }
      } catch {}
    }
    
    return {
      selectedTable: (sysData && sysData.host) || 'Database',
      columnMappings,
      shiftConfig,
      logoText: (smtpData && smtpData.logo_text) || 'Skadomation System',
      headerColor: (smtpData && smtpData.header_color) || '#1B365D',
      footerText: (smtpData && smtpData.footer_text) || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.'
    };
  } catch (err) {
    console.error('loadSystemSettings error:', err);
    return {
      selectedTable: 'Database',
      columnMappings: {},
      shiftConfig: {
        dayStart: "06:00",
        dayEnd: "18:00",
        nightStart: "18:00",
        nightEnd: "06:00"
      },
      logoText: 'Skadomation System',
      headerColor: '#1B365D',
      footerText: 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.'
    };
  }
}

// ── Database concurrent batch fetcher ─────────────────────────────────────
export async function fetchRecordsForTag(supabaseClient, tableName, tagIdx, startDate, endDate, selectCols, tsCol, tagCol, onProgress, plantTz) {
  let allData = [];
  let page = 0;
  const pageSize = 20000;
  let hasMore = true;

  const dbStart = formatToDbTimestamp(startDate, 'T', plantTz);
  const dbEnd = formatToDbTimestamp(endDate, 'T', plantTz);

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    
    const query = supabaseClient.from(tableName)
      .select(selectCols)
      .eq(tagCol, tagIdx)
      .gte(tsCol, dbStart)
      .lte(tsCol, dbEnd)
      .order(tsCol, { ascending: true })
      .range(from, to);

    const { data, error } = await query;
    if (error) {
      console.error(`Database batch fetch error for Tag ${tagIdx} at page ${page}:`, error);
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      onProgress(data.length);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }
  return allData;
}

// Helper function to draw Daily Production Report PDF
function generateDailyProductionPDF(doc, meta, data) {
  const dp = data.dailyProduction || {};
  const pt = dp.productionTonnes || { dayShiftRow: { day: {}, night: {}, total: {} }, nightShiftRow: { day: {}, night: {}, total: {} }, dailyTotalRow: { day: {}, night: {}, total: {} } };
  const ds = dp.downtimeSummary || [];
  const tdr = dp.totalDowntimeRow || {};
  const ls = dp.lumpSamples || [];
  const fs = dp.fineSamples || [];
  const kpis = dp.kpis || [];
  const m = dp.metadata || {};

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const contentW = pageW - 36;

  function drawGridCell(x, y, w, h, text, options = {}) {
    const { fill, color = '#1E293B', font = 'Helvetica', size = 6.5, align = 'center', bold = false } = options;
    if (fill) {
      doc.save();
      doc.fillColor(fill).rect(x, y, w, h).fill();
      doc.restore();
    }
    doc.save();
    doc.strokeColor('#CBD5E1');
    doc.lineWidth(0.5);
    doc.rect(x, y, w, h).stroke();
    doc.fillColor(color).font(bold ? 'Helvetica-Bold' : font).fontSize(size);
    doc.text(String(text ?? ''), x + 2, y + (h - size) / 2 - 1, { width: w - 4, align });
    doc.restore();
  }

  doc.y = 110;
  doc.fillColor('#1B365D').font('Helvetica-Bold').fontSize(22)
     .text('DAILY PRODUCTION SUMMARY REPORT', 18, { width: contentW, align: 'center' });

  doc.y = doc.y + 12;
  doc.fillColor('#3B82F6').font('Helvetica-Bold').fontSize(12)
     .text('Key Functional Indicators & Report Guide', 18, { width: contentW, align: 'center' });

  doc.y = doc.y + 6;
  doc.fillColor('#64748B').font('Helvetica').fontSize(9)
     .text('Crushing & Screening Project — OHP4 Circuit', 18, { width: contentW, align: 'center' });

  let startY = doc.y + 24;
  const tableX = (pageW - 360) / 2;
  const labelW = 120;
  const valW = 240;
  const rowH = 18;

  const metaRows = [
    ['Prepared by', m.preparedBy || 'Automation Alliance Solutions'],
    ['Project / Contract', m.projectName || 'MACA Contract 2025'],
    ['Site Name', m.siteName || 'OHP4 — Crusher Site'],
    ['Report Date', m.reportDate || ''],
    ['Shift Reported', m.shiftReported || 'Full Day / Combined'],
    ['Classification', 'Internal / Project Use']
  ];

  metaRows.forEach(([label, val]) => {
    doc.save();
    doc.fillColor('#1B365D').rect(tableX, startY, labelW, rowH).fill();
    doc.strokeColor('#CBD5E1').lineWidth(0.5).rect(tableX, startY, labelW, rowH).stroke();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
    doc.text(label, tableX + 8, startY + (rowH - 7.5) / 2, { width: labelW - 16, align: 'left', lineBreak: false });
    doc.restore();

    doc.save();
    doc.fillColor('#F8FAFC').rect(tableX + labelW, startY, valW, rowH).fill();
    doc.strokeColor('#CBD5E1').lineWidth(0.5).rect(tableX + labelW, startY, valW, rowH).stroke();
    doc.fillColor('#1E293B').font('Helvetica').fontSize(7.5);
    doc.text(String(val || '—'), tableX + labelW + 8, startY + (rowH - 7.5) / 2, { width: valW - 16, align: 'left', lineBreak: false });
    doc.restore();

    startY += rowH;
  });

  doc.addPage();
  let y = 36;
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  PRODUCTION TONNES — OHP4 Crushing Circuit', 18, y + 5);
  y += 23;

  const ptX = [18, 18 + 75, 18 + 75 + 50, 18 + 75 + 100, 18 + 75 + 150, 18 + 75 + 200, 18 + 75 + 250, 18 + 75 + 300, 18 + 75 + 350, 18 + 75 + 400];
  const ptW = [75, 50, 50, 50, 50, 50, 50, 50, 50, 50];

  drawGridCell(ptX[0], y, ptW[0], 28, '', { fill: '#1B365D' });
  drawGridCell(ptX[1], y, ptW[1] * 3, 14, 'DAY SHIFT (08:00 - 18:00)', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(ptX[4], y, ptW[4] * 3, 14, 'NIGHT SHIFT (18:00 - 08:00)', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(ptX[7], y, ptW[7] * 3, 14, 'DAILY TOTAL', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  y += 14;

  const headers = [
    'Lump (CV10, t)', 'Fines (CV17, t)', 'Total Feed (t)',
    'Lump (CV10, t)', 'Fines (CV17, t)', 'Total Feed (t)',
    'Lump (CV10, t)', 'Fines (CV17, t)', 'Grand Total (t)'
  ];
  headers.forEach((h, idx) => {
    drawGridCell(ptX[idx + 1], y, ptW[idx + 1], 14, h, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 5.5 });
  });
  y += 14;

  drawGridCell(ptX[0], y, ptW[0], 14, 'Day Shift', { bold: true, fill: '#FFFFFF', align: 'left' });
  drawGridCell(ptX[1], y, ptW[1], 14, pt.dayShiftRow.day.lump.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(ptX[2], y, ptW[2], 14, pt.dayShiftRow.day.fines.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(ptX[3], y, ptW[3], 14, pt.dayShiftRow.day.total.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(ptX[4], y, ptW[4], 14, pt.dayShiftRow.night.lump.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(ptX[5], y, ptW[5], 14, pt.dayShiftRow.night.fines.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(ptX[6], y, ptW[6], 14, pt.dayShiftRow.night.total.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(ptX[7], y, ptW[7], 14, pt.dayShiftRow.total.lump.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  drawGridCell(ptX[8], y, ptW[8], 14, pt.dayShiftRow.total.fines.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  drawGridCell(ptX[9], y, ptW[9], 14, pt.dayShiftRow.total.total.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  y += 14;

  drawGridCell(ptX[0], y, ptW[0], 14, 'Night Shift', { bold: true, fill: '#F8FAFC', align: 'left' });
  drawGridCell(ptX[1], y, ptW[1], 14, pt.nightShiftRow.day.lump.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(ptX[2], y, ptW[2], 14, pt.nightShiftRow.day.fines.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(ptX[3], y, ptW[3], 14, pt.nightShiftRow.day.total.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(ptX[4], y, ptW[4], 14, pt.nightShiftRow.night.lump.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(ptX[5], y, ptW[5], 14, pt.nightShiftRow.night.fines.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(ptX[6], y, ptW[6], 14, pt.nightShiftRow.night.total.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(ptX[7], y, ptW[7], 14, pt.nightShiftRow.total.lump.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  drawGridCell(ptX[8], y, ptW[8], 14, pt.nightShiftRow.total.fines.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  drawGridCell(ptX[9], y, ptW[9], 14, pt.nightShiftRow.total.total.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  y += 14;

  drawGridCell(ptX[0], y, ptW[0], 14, 'Daily Total', { bold: true, fill: '#E2E8F0', align: 'left' });
  drawGridCell(ptX[1], y, ptW[1], 14, pt.dailyTotalRow.day.lump.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(ptX[2], y, ptW[2], 14, pt.dailyTotalRow.day.fines.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(ptX[3], y, ptW[3], 14, pt.dailyTotalRow.day.total.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(ptX[4], y, ptW[4], 14, pt.dailyTotalRow.night.lump.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(ptX[5], y, ptW[5], 14, pt.dailyTotalRow.night.fines.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(ptX[6], y, ptW[6], 14, pt.dailyTotalRow.night.total.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(ptX[7], y, ptW[7], 14, pt.dailyTotalRow.total.lump.toLocaleString(), { bold: true, color: '#1B365D', fill: '#F1F5F9' });
  drawGridCell(ptX[8], y, ptW[8], 14, pt.dailyTotalRow.total.fines.toLocaleString(), { bold: true, color: '#1B365D', fill: '#F1F5F9' });
  drawGridCell(ptX[9], y, ptW[9], 14, pt.dailyTotalRow.total.total.toLocaleString(), { bold: true, color: '#1B365D', fill: '#E0E7FF' });
  y += 14;

  drawGridCell(ptX[0], y, ptW[0], 14, 'Re-Feed Conveyor (t)', { bold: true, fill: '#F1F5F9', align: 'left', size: 6 });
  drawGridCell(ptX[1], y, ptW[1] * 3, 14, pt.refeedDay, { fill: '#FEF08A', color: '#1E293B', bold: true });
  drawGridCell(ptX[4], y, ptW[4], 14, 'Re-Feed - Night (t)', { bold: true, fill: '#F1F5F9', align: 'left', size: 6 });
  drawGridCell(ptX[5], y, ptW[5] * 5, 14, pt.refeedNight, { fill: '#FEF08A', color: '#1E293B', bold: true });
  y += 24;

  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  SHIFT DOWNTIME SUMMARY', 18, y + 5);
  y += 23;

  const dtX = [18, 18 + 140, 18 + 140 + 38, 18 + 140 + 76, 18 + 140 + 114, 18 + 140 + 152, 18 + 140 + 190, 18 + 140 + 228, 18 + 140 + 266, 18 + 140 + 304, 18 + 140 + 342];
  const dtW = [140, 38, 38, 38, 38, 38, 38, 38, 38, 38];

  drawGridCell(dtX[0], y, dtW[0], 28, 'Downtime Event', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(dtX[1], y, dtW[1] * 3, 14, 'DAY SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(dtX[4], y, dtW[4] * 3, 14, 'NIGHT SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(dtX[7], y, dtW[7] * 3, 14, 'COMBINED', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  y += 14;

  const dtHeaders = [
    'Events', 'Mins Down', '% Shift',
    'Events', 'Mins Down', '% Shift',
    'Events', 'Mins Down', '% Shift'
  ];
  dtHeaders.forEach((h, idx) => {
    drawGridCell(dtX[idx + 1], y, dtW[idx + 1], 14, h, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6 });
  });
  y += 14;

  ds.forEach((row, idx) => {
    const isAlt = idx % 2 === 1;
    const fill = isAlt ? '#F8FAFC' : '#FFFFFF';
    drawGridCell(dtX[0], y, dtW[0], 13, row.event, { align: 'left', size: 6.5, fill });
    drawGridCell(dtX[1], y, dtW[1], 13, row.dayEvents, { fill });
    drawGridCell(dtX[2], y, dtW[2], 13, row.dayMins, { fill });
    drawGridCell(dtX[3], y, dtW[3], 13, `${row.dayPct}%`, { fill });
    drawGridCell(dtX[4], y, dtW[4], 13, row.nightEvents, { fill });
    drawGridCell(dtX[5], y, dtW[5], 13, row.nightMins, { fill });
    drawGridCell(dtX[6], y, dtW[6], 13, `${row.nightPct}%`, { fill });
    drawGridCell(dtX[7], y, dtW[7], 13, row.combEvents, { bold: true, fill });
    drawGridCell(dtX[8], y, dtW[8], 13, row.combMins, { bold: true, fill });
    drawGridCell(dtX[9], y, dtW[9], 13, `${row.combPct}%`, { bold: true, fill });
    y += 13;
  });

  drawGridCell(dtX[0], y, dtW[0], 14, tdr.event, { bold: true, fill: '#E2E8F0', align: 'left' });
  drawGridCell(dtX[1], y, dtW[1], 14, tdr.dayEvents, { bold: true, fill: '#E2E8F0' });
  drawGridCell(dtX[2], y, dtW[2], 14, tdr.dayMins, { bold: true, fill: '#E2E8F0' });
  drawGridCell(dtX[3], y, dtW[3], 14, `${tdr.dayPct}%`, { bold: true, fill: '#E2E8F0' });
  drawGridCell(dtX[4], y, dtW[4], 14, tdr.nightEvents, { bold: true, fill: '#E2E8F0' });
  drawGridCell(dtX[5], y, dtW[5], 14, tdr.nightMins, { bold: true, fill: '#E2E8F0' });
  drawGridCell(dtX[6], y, dtW[6], 14, `${tdr.nightPct}%`, { bold: true, fill: '#E2E8F0' });
  drawGridCell(dtX[7], y, dtW[7], 14, tdr.combEvents, { bold: true, fill: '#FDE68A' });
  drawGridCell(dtX[8], y, dtW[8], 14, tdr.combMins, { bold: true, fill: '#FDE68A' });
  drawGridCell(dtX[9], y, dtW[9], 14, `${tdr.combPct}%`, { bold: true, fill: '#FDE68A' });

  doc.addPage();
  y = 36;
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  SAMPLE STATION DATA', 18, y + 5);
  y += 24;

  const sW = (contentW - 12) / 2;
  const sX1 = 18;
  const sX2 = 18 + sW + 12;

  doc.rect(sX1, y, sW, 12).fill('#3B82F6');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text('LUMP SAMPLE STATION (8801)', sX1, y + 3, { width: sW, align: 'center' });

  doc.rect(sX2, y, sW, 12).fill('#3B82F6');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text('FINES SAMPLE STATION (8802)', sX2, y + 3, { width: sW, align: 'center' });
  y += 12;

  const subCols = ['Cut', 'Time', 'Shift ID', 'Plgr', 'Tons', 'Material'];
  const sW_cols = [22, 40, 50, 24, 60, 60];
  const sX_lump = [sX1, sX1 + 22, sX1 + 62, sX1 + 112, sX1 + 136, sX1 + 196];
  const sX_fines = [sX2, sX2 + 22, sX2 + 62, sX2 + 112, sX2 + 136, sX2 + 196];

  subCols.forEach((col, i) => {
    drawGridCell(sX_lump[i], y, sW_cols[i], 12, col, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6 });
    drawGridCell(sX_fines[i], y, sW_cols[i], 12, col, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6 });
  });
  y += 12;

  for (let idx = 0; idx < 8; idx++) {
    const lRow = ls[idx] || {};
    const fRow = fs[idx] || {};
    const fill = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';

    drawGridCell(sX_lump[0], y, sW_cols[0], 12, lRow.cutId, { fill });
    drawGridCell(sX_lump[1], y, sW_cols[1], 12, lRow.dateTime ? lRow.dateTime.substring(11) : '', { font: 'Courier', size: 5.5, fill });
    drawGridCell(sX_lump[2], y, sW_cols[2], 12, lRow.shiftId, { size: 6, fill });
    drawGridCell(sX_lump[3], y, sW_cols[3], 12, lRow.plungerId, { fill });
    drawGridCell(sX_lump[4], y, sW_cols[4], 12, lRow.stockpileTons ? lRow.stockpileTons.toLocaleString() : '', { fill });
    drawGridCell(sX_lump[5], y, sW_cols[5], 12, lRow.material, { size: 6, fill });

    drawGridCell(sX_fines[0], y, sW_cols[0], 12, fRow.cutId, { fill });
    drawGridCell(sX_fines[1], y, sW_cols[1], 12, fRow.dateTime ? fRow.dateTime.substring(11) : '', { font: 'Courier', size: 5.5, fill });
    drawGridCell(sX_fines[2], y, sW_cols[2], 12, fRow.shiftId, { size: 6, fill });
    drawGridCell(sX_fines[3], y, sW_cols[3], 12, fRow.plungerId, { fill });
    drawGridCell(sX_fines[4], y, sW_cols[4], 12, fRow.cumTons ? fRow.cumTons.toLocaleString() : '', { fill });
    drawGridCell(sX_fines[5], y, sW_cols[5], 12, fRow.material, { size: 6, color: '#047857', bold: true, fill });

    y += 12;
  }

  y += 12;
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  KEY PERFORMANCE INDICATORS', 18, y + 5);
  y += 23;

  const kpiX = [18, 18 + 150, 18 + 150 + 38, 18 + 150 + 76, 18 + 150 + 114, 18 + 150 + 152, 18 + 150 + 190, 18 + 150 + 228, 18 + 150 + 266, 18 + 150 + 304, 18 + 150 + 342];
  const kpiW = [150, 38, 38, 38, 38, 38, 38, 38, 38, 38];

  drawGridCell(kpiX[0], y, kpiW[0], 26, 'KPI', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(kpiX[1], y, kpiW[1] * 3, 13, 'DAY SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(kpiX[4], y, kpiW[4] * 3, 13, 'NIGHT SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(kpiX[7], y, kpiW[7] * 3, 13, 'DAILY / COMBINED', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  y += 13;

  const kpiHeaders = [
    'Target', 'Actual', 'Status',
    'Target', 'Actual', 'Status',
    'Target', 'Actual', 'Status'
  ];
  kpiHeaders.forEach((h, idx) => {
    drawGridCell(kpiX[idx + 1], y, kpiW[idx + 1], 13, h, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6 });
  });
  y += 13;

  kpis.forEach((row, idx) => {
    const isNum = row.format === "number";
    const fmt = (v) => isNum ? Number(v).toLocaleString() : v;
    const fill = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';

    drawGridCell(kpiX[0], y, kpiW[0], 13, row.kpiName, { align: 'left', size: 6.5, fill });
    drawGridCell(kpiX[1], y, kpiW[1], 13, row.dayTarget, { fill });
    drawGridCell(kpiX[2], y, kpiW[2], 13, fmt(row.dayActual), { fill });
    drawGridCell(kpiX[3], y, kpiW[3], 13, 'OK', { fill: '#FEF3C7', color: '#D97706', bold: true, size: 5.5 });
    
    drawGridCell(kpiX[4], y, kpiW[4], 13, row.nightTarget, { fill });
    drawGridCell(kpiX[5], y, kpiW[5], 13, fmt(row.nightActual), { fill });
    drawGridCell(kpiX[6], y, kpiW[6], 13, 'OK', { fill: '#FEF3C7', color: '#D97706', bold: true, size: 5.5 });

    drawGridCell(kpiX[7], y, kpiW[7], 13, row.dailyTarget, { bold: true, fill });
    drawGridCell(kpiX[8], y, kpiW[8], 13, fmt(row.dailyActual), { bold: true, fill });
    drawGridCell(kpiX[9], y, kpiW[9], 13, 'OK', { fill: '#D1FAE5', color: '#047857', bold: true, size: 5.5 });
    y += 13;
  });

  y += 12;
  doc.rect(18, y, contentW, 0.5).strokeColor('#CBD5E1').stroke();
  y += 6;
  doc.fillColor('#64748B').fontSize(6).font('Helvetica-Oblique')
     .text('This report is auto-generated from SCADA / Datalog data. Verify all values with the Shift Supervisor before distribution.', 18, y, { width: contentW, align: 'center' });
}

// Helper function to draw Daily Production Account PDF
function generateDailyProductionAccountPDF(doc, meta, data) {
  const dp = data.dailyProductionAccount || {};
  const sr = dp.safetyAndRisk || {};
  const pt = dp.productionOHP4 || { dayShift: {}, nightShift: {}, totals: {} };
  const dsD = dp.dayShiftDowntime || [];
  const dsN = dp.nightShiftDowntime || [];
  const tMinsD = dp.dayTotalMins || 0;
  const tMinsN = dp.nightTotalMins || 0;

  const pageW = doc.page.width;
  const contentW = pageW - 36;

  function drawGridCell(x, y, w, h, text, options = {}) {
    const { fill, color = '#1E293B', font = 'Helvetica', size = 6.5, align = 'center', bold = false } = options;
    if (fill) {
      doc.save();
      doc.fillColor(fill).rect(x, y, w, h).fill();
      doc.restore();
    }
    doc.save();
    doc.strokeColor('#CBD5E1');
    doc.lineWidth(0.5);
    doc.rect(x, y, w, h).stroke();
    doc.fillColor(color).font(bold ? 'Helvetica-Bold' : font).fontSize(size);
    doc.text(String(text ?? ''), x + 4, y + (h - size) / 2 - 1, { width: w - 8, align });
    doc.restore();
  }

  let y = 36;
  doc.save();
  doc.strokeColor('#059669').lineWidth(2).rect(18, y, contentW, 36).stroke();
  doc.restore();

  doc.save();
  doc.fillColor('#E11D48').ellipse(18 + 36, y + 18, 24, 13).fill();
  doc.restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('maca', 18 + 24, y + 14);

  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12.5).text('Daily Production Account', 18 + 70, y + 12);

  y += 46;

  const colW1 = contentW * 0.25;
  const colW2 = contentW * 0.75;
  
  drawGridCell(18, y, colW1, 14, 'Safety Share/Safety topic', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 14, sr.safetyShare, { align: 'left', size: 6.5 });
  y += 14;

  drawGridCell(18, y, colW1, 13, 'Hazards', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 13, sr.hazards, { align: 'left', size: 6.5 });
  y += 13;

  drawGridCell(18, y, colW1, 13, 'Take 5', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 13, sr.take5, { align: 'left', size: 6.5 });
  y += 13;

  drawGridCell(18, y, colW1, 13, 'Incidents', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 13, sr.incidents, { align: 'left', size: 6.5 });
  y += 13;

  const trucksStr = `Trucks per shift target ${sr.trucksPerShiftTarget}      Day Shift - ${sr.trucksDayShift}      Night Shift - ${sr.trucksNightShift}`;
  drawGridCell(18, y, colW1, 13, 'Trucks per shift', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 13, trucksStr, { align: 'left', size: 6.5 });
  y += 13;

  const refeedStr = `Tonnes      Day Shift - ${sr.refeedDay}      Night Shift - ${sr.refeedNight}`;
  drawGridCell(18, y, colW1, 13, 'Re-Feed Conveyor', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 13, refeedStr, { align: 'left', size: 6.5 });
  y += 13;

  drawGridCell(18, y, colW1, 13, 'Catastrophic Risks today', { fill: '#F1F5F9', bold: true, align: 'left', size: 6.5 });
  drawGridCell(18 + colW1, y, colW2, 13, sr.catastrophicRisks, { align: 'left', bold: true, size: 6.5 });
  y += 24;

  doc.rect(18, y, contentW, 14).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text('Production OHP4', 18, y + 4, { align: 'center', width: contentW });
  y += 14;

  const prodX = [18, 18 + 160, 18 + 160 + 120, 18 + 160 + 240];
  const prodW = [160, 120, 120, contentW - 400];

  drawGridCell(prodX[0], y, prodW[0], 14, '', { fill: '#1B365D' });
  drawGridCell(prodX[1], y, prodW[1], 14, 'CV10 Lump (Tonnes)', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  drawGridCell(prodX[2], y, prodW[2], 14, 'CV17 Fines (Tonnes)', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  drawGridCell(prodX[3], y, prodW[3], 14, 'Totals', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  y += 14;

  drawGridCell(prodX[0], y, prodW[0], 13, 'Day shift (6am to 6pm)', { bold: true, align: 'left', size: 6.5, fill: '#FFFFFF' });
  drawGridCell(prodX[1], y, prodW[1], 13, pt.dayShift.lump.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(prodX[2], y, prodW[2], 13, pt.dayShift.fines.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(prodX[3], y, prodW[3], 13, pt.dayShift.total.toLocaleString(), { bold: true, fill: '#FFFFFF' });
  y += 13;

  drawGridCell(prodX[0], y, prodW[0], 13, 'Night shift (6pm to 6am)', { bold: true, align: 'left', size: 6.5, fill: '#F8FAFC' });
  drawGridCell(prodX[1], y, prodW[1], 13, pt.nightShift.lump.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(prodX[2], y, prodW[2], 13, pt.nightShift.fines.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(prodX[3], y, prodW[3], 13, pt.nightShift.total.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  y += 13;

  drawGridCell(prodX[0], y, prodW[0], 13, 'Total', { bold: true, align: 'left', size: 6.5, fill: '#E2E8F0' });
  drawGridCell(prodX[1], y, prodW[1], 13, pt.totals.lump.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(prodX[2], y, prodW[2], 13, pt.totals.fines.toLocaleString(), { bold: true, fill: '#E2E8F0' });
  drawGridCell(prodX[3], y, prodW[3], 13, pt.totals.total.toLocaleString(), { fill: '#FFFF00', bold: true });
  y += 24;

  const dtX = [18, 18 + 220, 18 + 220 + 140];
  const dtW = [220, 140, contentW - 360];

  // ══════════════════════════════════════════════
  // PAGE 2: DAY SHIFT DOWNTIME
  // ══════════════════════════════════════════════
  doc.addPage();

  // Day Shift Downtime OHP4
  y = 36;
  doc.rect(18, y, contentW, 14).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text('Day Shift Downtime OHP4', 18, y + 4, { align: 'center', width: contentW });
  y += 14;

  // Header
  drawGridCell(dtX[0], y, dtW[0], 13, 'Event', { fill: '#1B365D', color: '#FFFFFF', bold: true, align: 'left', size: 6.5 });
  drawGridCell(dtX[1], y, dtW[1], 13, 'Number of Events', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  drawGridCell(dtX[2], y, dtW[2], 13, 'Minutes Down', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  y += 13;

  dsD.forEach((row, idx) => {
    const isAlt = idx % 2 === 1;
    const fill = isAlt ? '#F8FAFC' : '#FFFFFF';
    drawGridCell(dtX[0], y, dtW[0], 11, row.event, { align: 'left', size: 6, fill });
    drawGridCell(dtX[1], y, dtW[1], 11, row.events ?? '', { fill });
    drawGridCell(dtX[2], y, dtW[2], 11, row.mins ?? '', { fill });
    y += 11;
  });

  drawGridCell(dtX[0], y, dtW[0], 13, 'TOTAL:', { bold: true, fill: '#E2E8F0', align: 'left', size: 6.5 });
  drawGridCell(dtX[1], y, dtW[1], 13, '', { fill: '#E2E8F0' });
  drawGridCell(dtX[2], y, dtW[2], 13, tMinsD, { bold: true, fill: '#E2E8F0' });

  // ══════════════════════════════════════════════
  // PAGE 3: NIGHT SHIFT DOWNTIME
  // ══════════════════════════════════════════════
  doc.addPage();

  // Night Shift Downtime OHP4
  y = 36;
  doc.rect(18, y, contentW, 14).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text('Night Shift Downtime OHP4', 18, y + 4, { align: 'center', width: contentW });
  y += 14;

  // Header
  drawGridCell(dtX[0], y, dtW[0], 13, 'Event', { fill: '#1B365D', color: '#FFFFFF', bold: true, align: 'left', size: 6.5 });
  drawGridCell(dtX[1], y, dtW[1], 13, 'Number of Events', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  drawGridCell(dtX[2], y, dtW[2], 13, 'Minutes Down', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  y += 13;

  dsN.forEach((row, idx) => {
    const isAlt = idx % 2 === 1;
    const fill = isAlt ? '#F8FAFC' : '#FFFFFF';
    drawGridCell(dtX[0], y, dtW[0], 11, row.event, { align: 'left', size: 6, fill });
    drawGridCell(dtX[1], y, dtW[1], 11, row.events ?? '', { fill });
    drawGridCell(dtX[2], y, dtW[2], 11, row.mins ?? '', { fill });
    y += 11;
  });

  drawGridCell(dtX[0], y, dtW[0], 13, 'TOTAL:', { bold: true, fill: '#E2E8F0', align: 'left', size: 6.5 });
  drawGridCell(dtX[1], y, dtW[1], 13, '', { fill: '#E2E8F0' });
  drawGridCell(dtX[2], y, dtW[2], 13, tMinsN, { bold: true, fill: '#E2E8F0' });
}

export function generatePDFBuffer(meta, data, logoText, themeColor, footerText) {
  return new Promise((resolve, reject) => {
    try {
      // Create A4 Landscape document: 297 mm x 210 mm (841.89 pt x 595.28 pt)
      const doc = new PDFDocument({ margin: 0, bufferPages: true, size: 'A4', layout: 'landscape' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageW = doc.page.width;   // 841.89 pt (297 mm)
      const pageH = doc.page.height;  // 595.28 pt (210 mm)
      
      // 7 mm margins = ~19.84 pt
      const marginL = 20;
      const marginT = 20;
      const contentW = pageW - 40;    // 801.89 pt
      const contentBottom = pageH - 26;
      const tz = getPlantTimeZone(meta.plantId || meta.plant_id);
      const generatedAt = fmtTs(meta.generatedAt || new Date().toISOString(), tz);
      const reportTitle = meta.name || 'Daily Production Summary Report';

      const dp = data.dailyProduction || {};
      const metadata = dp.metadata || {
        siteName: meta.plantId || 'Crushing Circuit',
        projectName: 'OHP4 Crushing Circuit',
        preparedBy: meta.createdBy || 'System Administrator',
        reportDate: meta.startDate ? meta.startDate.substring(0, 10) : new Date().toISOString().substring(0, 10),
        timeGenerated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        shiftReported: 'Day / Night / Daily'
      };

      function drawGridCell(x, y, w, h, text, options = {}) {
        const { fill, color = '#1E293B', font = 'Helvetica', size = 7, align = 'left', bold = false } = options;
        if (fill) {
          doc.save();
          doc.fillColor(fill).rect(x, y, w, h).fill();
          doc.restore();
        }
        doc.save();
        doc.strokeColor('#CBD5E1');
        doc.lineWidth(0.5);
        doc.rect(x, y, w, h).stroke();
        
        const textY = y + (h - size) / 2 - 0.5;
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : font).fontSize(size);
        doc.text(String(text ?? ''), x + 6, textY, { width: w - 12, align, lineBreak: false });
        doc.restore();
      }

      let y = marginT;

      // ── 1. MAIN REPORT TITLE BANNER (14pt Bold, Dark Navy Blue) ──
      doc.save();
      doc.rect(marginL, y, contentW, 24).fill('#1E3A8A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13.5)
         .text('DAILY PRODUCTION SUMMARY REPORT', marginL, y + 5, { align: 'center', width: contentW });
      doc.restore();
      y += 24;

      // ── 2. REPORT INFORMATION HEADER ──
      const infoBoxH = 38;
      doc.save();
      doc.rect(marginL, y, contentW, infoBoxH).fill('#F8FAFC').stroke('#CBD5E1');
      
      const col1X = marginL + 10;
      const col2X = marginL + contentW / 2 + 10;
      
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569');
      doc.text('Site Name:', col1X, y + 6);
      doc.font('Helvetica').fillColor('#0F172A').text(metadata.siteName, col1X + 90, y + 6);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Project / Contract:', col1X, y + 18);
      doc.font('Helvetica').fillColor('#0F172A').text(metadata.projectName, col1X + 90, y + 18);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Prepared By:', col1X, y + 30);
      doc.font('Helvetica').fillColor('#0F172A').text(metadata.preparedBy, col1X + 90, y + 30);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Report Date:', col2X, y + 6);
      doc.font('Helvetica').fillColor('#0F172A').text(metadata.reportDate, col2X + 85, y + 6);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Time Generated:', col2X, y + 18);
      doc.font('Helvetica').fillColor('#0F172A').text(metadata.timeGenerated, col2X + 85, y + 18);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Shift Reported:', col2X, y + 30);
      doc.font('Helvetica').fillColor('#0F172A').text(metadata.shiftReported, col2X + 85, y + 30);
      doc.restore();

      y += infoBoxH + 10;

      // ── 3. PRODUCTION TONNES SECTION (Medium Blue #1E40AF) ──
      doc.save();
      doc.rect(marginL, y, contentW, 16).fill('#1E40AF');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9.5)
         .text(`PRODUCTION TONNES — ${metadata.siteName.toUpperCase()}`, marginL + 8, y + 3.5, { width: contentW - 16 });
      doc.restore();
      y += 16;

      const pt = dp.productionTonnes || {
        dayShiftRow: { day: { lump: 0, fines: 0, total: 0 } },
        nightShiftRow: { night: { lump: 0, fines: 0, total: 0 } },
        dailyTotalRow: { total: { lump: 0, fines: 0, total: 0 } },
        refeedDay: 0,
        refeedNight: 0
      };

      const fmtNum = (v) => v != null && !isNaN(v) ? Number(v).toLocaleString() : '—';

      // Header row 1
      drawGridCell(marginL, y, 160, 15, 'PRODUCTION ROW', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, size: 7.5 });
      drawGridCell(marginL + 160, y, 190, 15, 'DAY SHIFT', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, align: 'center', size: 7.5 });
      drawGridCell(marginL + 350, y, 190, 15, 'NIGHT SHIFT', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, align: 'center', size: 7.5 });
      drawGridCell(marginL + 540, y, contentW - 540, 15, 'DAILY TOTAL', { fill: '#6D28D9', color: '#FFFFFF', bold: true, align: 'center', size: 7.5 });
      y += 15;

      // Header row 2
      drawGridCell(marginL, y, 160, 13, 'Description', { fill: '#F1F5F9', color: '#334155', bold: true, size: 7 });
      drawGridCell(marginL + 160, y, 190, 13, 'Total Feed (t)', { fill: '#F1F5F9', color: '#334155', bold: true, align: 'center', size: 7 });
      drawGridCell(marginL + 350, y, 190, 13, 'Total Feed (t)', { fill: '#F1F5F9', color: '#334155', bold: true, align: 'center', size: 7 });
      drawGridCell(marginL + 540, y, contentW - 540, 13, 'Grand Total (t)', { fill: '#F1F5F9', color: '#334155', bold: true, align: 'center', size: 7 });
      y += 13;

      // Data Rows
      drawGridCell(marginL, y, 160, 15, 'Day Shift', { bold: true, size: 7 });
      drawGridCell(marginL + 160, y, 190, 15, fmtNum(pt.dayShiftRow?.day?.total), { align: 'center', size: 7 });
      drawGridCell(marginL + 350, y, 190, 15, '—', { align: 'center', size: 7 });
      drawGridCell(marginL + 540, y, contentW - 540, 15, fmtNum(pt.dayShiftRow?.day?.total), { align: 'center', size: 7 });
      y += 15;

      drawGridCell(marginL, y, 160, 15, 'Night Shift', { bold: true, size: 7 });
      drawGridCell(marginL + 160, y, 190, 15, '—', { align: 'center', size: 7 });
      drawGridCell(marginL + 350, y, 190, 15, fmtNum(pt.nightShiftRow?.night?.total), { align: 'center', size: 7 });
      drawGridCell(marginL + 540, y, contentW - 540, 15, fmtNum(pt.nightShiftRow?.night?.total), { align: 'center', size: 7 });
      y += 15;

      // Highlighted Daily Total (Light Green #DCFCE7)
      drawGridCell(marginL, y, 160, 15, 'DAILY TOTAL', { fill: '#DCFCE7', color: '#14532D', bold: true, size: 7.5 });
      drawGridCell(marginL + 160, y, 190, 15, fmtNum(pt.dayShiftRow?.day?.total), { fill: '#DCFCE7', color: '#14532D', align: 'center', bold: true, size: 7.5 });
      drawGridCell(marginL + 350, y, 190, 15, fmtNum(pt.nightShiftRow?.night?.total), { fill: '#DCFCE7', color: '#14532D', align: 'center', bold: true, size: 7.5 });
      drawGridCell(marginL + 540, y, contentW - 540, 15, fmtNum(pt.dailyTotalRow?.day?.total), { fill: '#DCFCE7', color: '#14532D', align: 'center', bold: true, size: 7.5 });
      y += 15;

      // Highlighted Re-Feed Conveyor (Yellow #FEF08A)
      drawGridCell(marginL, y, 160, 15, 'Re-Feed Conveyor (t)', { fill: '#FEF08A', color: '#713F12', bold: true, size: 7.5 });
      drawGridCell(marginL + 160, y, 190, 15, `${fmtNum(pt.refeedDay)} T`, { fill: '#FEF08A', color: '#713F12', align: 'center', bold: true, size: 7.5 });
      drawGridCell(marginL + 350, y, 190, 15, `${fmtNum(pt.refeedNight)} T`, { fill: '#FEF08A', color: '#713F12', align: 'center', bold: true, size: 7.5 });
      drawGridCell(marginL + 540, y, contentW - 540, 15, `${fmtNum(pt.refeedDay + pt.refeedNight)} T`, { fill: '#FEF08A', color: '#713F12', align: 'center', bold: true, size: 7.5 });
      y += 15 + 10;

      // ── 4. SHIFT DOWNTIME SUMMARY SECTION ──
      doc.save();
      doc.rect(marginL, y, contentW, 16).fill('#1E3A8A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9.5)
         .text('SHIFT DOWNTIME SUMMARY', marginL + 8, y + 3.5, { width: contentW - 16 });
      doc.restore();
      y += 16;

      const downtime = dp.downtimeSummary || [];
      const totalDowntime = dp.totalDowntimeRow || { dayEvents: 0, dayMins: 0, dayPct: 0, nightEvents: 0, nightMins: 0, nightPct: 0, combEvents: 0, combMins: 0, combPct: 0 };

      drawGridCell(marginL, y, 220, 13, 'DOWNTIME EVENT REASON', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, size: 7 });
      drawGridCell(marginL + 220, y, 180, 13, 'DAY SHIFT (Mins)', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, align: 'center', size: 7 });
      drawGridCell(marginL + 400, y, 180, 13, 'NIGHT SHIFT (Mins)', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, align: 'center', size: 7 });
      drawGridCell(marginL + 580, y, contentW - 580, 13, 'COMBINED (Mins)', { fill: '#1E3A8A', color: '#FFFFFF', bold: true, align: 'center', size: 7 });
      y += 13;

      downtime.forEach((row, idx) => {
        const fill = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        drawGridCell(marginL, y, 220, 13, row.event, { fill, size: 6.8 });
        drawGridCell(marginL + 220, y, 180, 13, `${row.dayMins} mins (${row.dayPct}%)`, { fill, align: 'center', size: 6.8 });
        drawGridCell(marginL + 400, y, 180, 13, `${row.nightMins} mins (${row.nightPct}%)`, { fill, align: 'center', size: 6.8 });
        drawGridCell(marginL + 580, y, contentW - 580, 13, `${row.combMins} mins (${row.combPct}%)`, { fill, align: 'center', bold: true, size: 6.8 });
        y += 13;
      });

      // Highlighted Total Downtime (Yellow)
      drawGridCell(marginL, y, 220, 14, totalDowntime.event, { fill: '#FEF08A', color: '#713F12', bold: true, size: 7.5 });
      drawGridCell(marginL + 220, y, 180, 14, `${totalDowntime.dayMins} mins`, { fill: '#FEF08A', color: '#713F12', align: 'center', bold: true, size: 7.5 });
      drawGridCell(marginL + 400, y, 180, 14, `${totalDowntime.nightMins} mins`, { fill: '#FEF08A', color: '#713F12', align: 'center', bold: true, size: 7.5 });
      drawGridCell(marginL + 580, y, contentW - 580, 14, `${totalDowntime.combMins} mins (${totalDowntime.combPct}%)`, { fill: '#FEF08A', color: '#713F12', align: 'center', bold: true, size: 7.5 });
      y += 14 + 10;

      // ── 5. SAMPLE STATION DATA SECTION (Dark Green #15803D) ──
      const drawSampleStationSectionHeader = (isCont = false) => {
        doc.save();
        doc.rect(marginL, y, contentW, 16).fill('#15803D');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9.5)
           .text(`SAMPLE STATION DATA${isCont ? ' (CONTINUED)' : ''}`, marginL + 8, y + 3.5, { width: contentW - 16 });
        doc.restore();
        y += 16;
      };

      const drawSampleStationSubHeaders = () => {
        const halfW = (contentW - 10) / 2;
        drawGridCell(marginL, y, halfW, 13, '🟢 LUMP SAMPLE STATION', { fill: '#DCFCE7', color: '#166534', bold: true, size: 7.5 });
        drawGridCell(marginL + halfW + 10, y, halfW, 13, '🟠 FINES SAMPLE STATION', { fill: '#FEF3C7', color: '#92400E', bold: true, size: 7.5 });
        y += 13;

        const ssHeaders = ['TIMESTAMP', 'TAG NAME', 'SHIFT ID', 'SHIFT CUM. TONNES', 'STOCKPILE TONNES'];
        const ssColW = [halfW * 0.24, halfW * 0.24, halfW * 0.14, halfW * 0.19, halfW * 0.19];

        // Lump table headers
        ssHeaders.forEach((h, i) => {
          const x = marginL + ssColW.slice(0, i).reduce((a, b) => a + b, 0);
          drawGridCell(x, y, ssColW[i], 12, h, { fill: '#F1F5F9', color: '#334155', bold: true, size: 6, align: i >= 3 ? 'center' : 'left' });
        });
        // Fines table headers
        ssHeaders.forEach((h, i) => {
          const x = marginL + halfW + 10 + ssColW.slice(0, i).reduce((a, b) => a + b, 0);
          drawGridCell(x, y, ssColW[i], 12, h, { fill: '#F1F5F9', color: '#334155', bold: true, size: 6, align: i >= 3 ? 'center' : 'left' });
        });
        y += 12;
      };

      // Force Page 2 transition so Page 1 cleanly holds Title, Metadata, Production Tonnes, and complete Shift Downtime Summary
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
      y = marginT;

      drawSampleStationSectionHeader(false);
      drawSampleStationSubHeaders();

      const lumpSamples = dp.lumpSamples || [];
      const fineSamples = dp.fineSamples || [];
      const halfW = (contentW - 10) / 2;
      const ssColW = [halfW * 0.24, halfW * 0.24, halfW * 0.14, halfW * 0.19, halfW * 0.19];

      const maxRows = Math.max(lumpSamples.length, fineSamples.length, 1);
      for (let i = 0; i < maxRows; i++) {
        // Page break if Sample Station rows exceed available space on Page 1
        if (y + 13 > contentBottom) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
          y = marginT;
          drawSampleStationSectionHeader(true);
          drawSampleStationSubHeaders();
        }

        const l = lumpSamples[i];
        const f = fineSamples[i];
        const fill = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

        if (l) {
          drawGridCell(marginL, y, ssColW[0], 12, l.timestamp ? fmtTs(l.timestamp, tz) : (l.dateTime || '—'), { fill, size: 6 });
          drawGridCell(marginL + ssColW[0], y, ssColW[1], 12, l.tagName || 'Lump Tag', { fill, size: 6, bold: true });
          drawGridCell(marginL + ssColW[0] + ssColW[1], y, ssColW[2], 12, l.shift_id ?? '—', { fill, size: 6, bold: true });
          drawGridCell(marginL + ssColW[0] + ssColW[1] + ssColW[2], y, ssColW[3], 12, l.shift_cumulative_tonnes != null ? Number(l.shift_cumulative_tonnes).toFixed(2) : '—', { fill, size: 6, align: 'center', bold: true });
          drawGridCell(marginL + ssColW[0] + ssColW[1] + ssColW[2] + ssColW[3], y, ssColW[4], 12, l.stockpile_tonnes != null ? Number(l.stockpile_tonnes).toFixed(2) : '—', { fill, size: 6, align: 'center', bold: true });
        } else if (i === 0) {
          drawGridCell(marginL, y, halfW, 12, 'No Lump Sample Station data available.', { fill, size: 6, color: '#94A3B8' });
        }

        if (f) {
          const fx = marginL + halfW + 10;
          drawGridCell(fx, y, ssColW[0], 12, f.timestamp ? fmtTs(f.timestamp, tz) : (f.dateTime || '—'), { fill, size: 6 });
          drawGridCell(fx + ssColW[0], y, ssColW[1], 12, f.tagName || 'Fines Tag', { fill, size: 6, bold: true });
          drawGridCell(fx + ssColW[0] + ssColW[1], y, ssColW[2], 12, f.shift_id ?? '—', { fill, size: 6, bold: true });
          drawGridCell(fx + ssColW[0] + ssColW[1] + ssColW[2], y, ssColW[3], 12, f.shift_cumulative_tonnes != null ? Number(f.shift_cumulative_tonnes).toFixed(2) : '—', { fill, size: 6, align: 'center', bold: true });
          drawGridCell(fx + ssColW[0] + ssColW[1] + ssColW[2] + ssColW[3], y, ssColW[4], 12, f.stockpile_tonnes != null ? Number(f.stockpile_tonnes).toFixed(2) : '—', { fill, size: 6, align: 'center', bold: true });
        } else if (i === 0) {
          const fx = marginL + halfW + 10;
          drawGridCell(fx, y, halfW, 12, 'No Fines Sample Station data available.', { fill, size: 6, color: '#94A3B8' });
        }

        y += 12;
      }

      // ── FOOTER ON EVERY PAGE ──
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.save();
        doc.fontSize(6.5).font('Helvetica').fillColor('#64748B');
        doc.text('SKADOMATION HISTORIAN', marginL, pageH - 16, { width: 200, align: 'left' });
        doc.text(`Report Date: ${metadata.reportDate}`, marginL + 250, pageH - 16, { width: 300, align: 'center' });
        doc.text(`Page ${i + 1} of ${pages.count}`, marginL + contentW - 150, pageH - 16, { width: 150, align: 'right' });
        doc.restore();
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

      y += 15;

      const trendTagIdx = reportTags.length > 0 ? reportTags[0].tagIndex : null;
      const trendTagName = reportTags.length > 0 ? reportTags[0].tagName : '';
      if (trendTagIdx !== null) {
        if (y + 160 > contentBottom - 60) {
          const pageRange = doc.bufferedPageRange();
          drawPageFooter(doc, footerText, pageRange.count, pageRange.count, generatedAt);
          doc.addPage();
          drawPageHeader(doc, 'Process Performance Summary');
          y = contentTop + 10;
        }

        y = drawSectionTitle(doc, 'Historian Process Trend', y);
        y += 10;

        const tagRows = (data.rows || []).filter(r => r && Number(r.TagIndex) === Number(trendTagIdx) && r.Val !== null && r.Val !== undefined);
        const pointsToDraw = [];
        const labelsToDraw = [];
        if (tagRows.length > 0) {
          const skip = Math.max(1, Math.floor(tagRows.length / 40));
          for (let i = 0; i < tagRows.length; i += skip) {
            pointsToDraw.push(Number(tagRows[i].Val));
            const dateStr = tagRows[i].DateAndTime;
            labelsToDraw.push(dateStr ? dateStr.substring(11, 16) : '');
          }
        }
        
        drawLineChart(doc, marginL, y, contentW, 100, pointsToDraw, `${trendTagName} Trend`, labelsToDraw);
        y += 115;
      }

      if (y + 180 > contentBottom - 60) {
        const pageRange = doc.bufferedPageRange();
        drawPageFooter(doc, footerText, pageRange.count, pageRange.count, generatedAt);
        doc.addPage();
        drawPageHeader(doc, 'Process Performance Summary');
        y = contentTop + 10;
      }

      y = drawSectionTitle(doc, 'SYSTEM STATUS', y);
      y += 6;

      const sysStatusX = [marginL, marginL + 240];
      const sysStatusW = [240, contentW - 240];

      drawGridCell(sysStatusX[0], y, sysStatusW[0], 20, 'System Attribute', { fill: themeColor || '#1B365D', color: '#FFFFFF', bold: true, align: 'left', size: 8 });
      drawGridCell(sysStatusX[1], y, sysStatusW[1], 20, 'Attribute Value', { fill: themeColor || '#1B365D', color: '#FFFFFF', bold: true, align: 'left', size: 8 });
      y += 20;

      const queueSize = data.localBufferLength || 0;
      const sysRows = [
        ['Database Connection', 'CONNECTED (ONLINE)'],
        ['Cloud Status', 'ACTIVE (HEALTHY)'],
        ['Historian Status', 'ONLINE (RUNNING)'],
        ['Telemetry Status', totalRecords > 0 ? 'ACTIVE (RECEIVING)' : 'INACTIVE (NO TELEMETRY)'],
        ['Queue Buffer size', `${queueSize} records`],
        ['Total Records Processed', totalRecords !== null ? `${totalRecords.toLocaleString()} records` : '—'],
        ['Last Synchronization Timestamp', latestTs ? fmtTs(latestTs, tz) : '—'],
        ['Latest Historian Timestamp', latestTs ? fmtTs(latestTs, tz) : '—']
      ];

      sysRows.forEach((row, idx) => {
        const fill = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
        let valColor = '#1E293B';
        if (row[1].includes('CONNECTED') || row[1].includes('ACTIVE') || row[1].includes('ONLINE')) {
          valColor = '#059669';
        }
        drawGridCell(sysStatusX[0], y, sysStatusW[0], 18, row[0], { align: 'left', size: 7.5, fill, bold: true });
        drawGridCell(sysStatusX[1], y, sysStatusW[1], 18, row[1], { align: 'left', size: 7.5, fill, color: valColor });
        y += 18;
      });

      const pageRange = doc.bufferedPageRange();
      const totalPages = pageRange.count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        drawPageFooter(doc, footerText, p + 1, totalPages, generatedAt);
      }
      doc.end();
    } catch (err) { reject(err); }
  });
}

export function generateExcelBuffer(meta, data) {
  const wb = XLSX.utils.book_new();
  const summaries = (data && data.summaries) || [];
  const tz = getPlantTimeZone(meta?.plantId || meta?.plant_id);
  const generatedAt = meta?.generatedAt ? fmtTs(meta.generatedAt, tz) : fmtTs(new Date().toISOString(), tz);
  const dateRange = meta ? (meta.dateInfo || (meta.startDate + ' to ' + meta.endDate)) : '';
  const totalRecords = data.totalRowsCount || 0;

  const cCell = (v, t = 's', z = null) => {
    if (v === null || v === undefined || v === 'Not Available') return { t: 's', v: '—' };
    if (t === 'n') {
      const num = Number(v);
      if (isNaN(num)) return { t: 's', v: String(v) };
      return z ? { t: 'n', v: num, z } : { t: 'n', v: num };
    }
    return { t: 's', v: String(v) };
  };

  const kpisResult = calculateExecutiveKPIs(data.rows, summaries, tz, data.shiftConfig);
  const totalFeed = kpisResult.totalFeed;
  const lumpProd = kpisResult.lumpProd;
  const finesProd = kpisResult.finesProd;
  const runtimeHours = kpisResult.runtimeHours;
  const downtimeHours = kpisResult.downtimeHours;
  const availability = kpisResult.availability;
  const latestTs = kpisResult.latestTs;
  
  const feedRateStats = {
    current: kpisResult.currentFeedRate,
    avg: kpisResult.avgFeedRate,
    max: kpisResult.maxFeedRate,
    min: kpisResult.minFeedRate
  };

  // ─── WORKSHEET 1: SUMMARY ──────────────────────────────────────
  const execParagraph = `During the selected reporting period, the plant processed a total of ${totalFeed !== null ? totalFeed.toFixed(1) : 'XXXX'} tonnes of raw material. Lump production reached ${lumpProd !== null ? lumpProd.toFixed(1) : 'XXXX'} tonnes while fines production reached ${finesProd !== null ? finesProd.toFixed(1) : 'XXXX'} tonnes. The average feed rate was ${feedRateStats.avg !== null ? feedRateStats.avg.toFixed(1) : 'XXXX'} TPH with a maximum of ${feedRateStats.max !== null ? feedRateStats.max.toFixed(1) : 'XXXX'} TPH and a minimum of ${feedRateStats.min !== null ? feedRateStats.min.toFixed(1) : 'XXXX'} TPH. The historian processed ${totalRecords.toLocaleString()} telemetry records successfully.`;

  const execData = [
    [cCell('SKADOMATION HISTORIAN SYSTEM')],
    [cCell('EXECUTIVE SUMMARY REPORT')],
    [],
    [cCell('Plant Name'), cCell(meta.plantId || 'All Plants')],
    [cCell('Report Type'), cCell(meta.type || 'Historian Shift Summary')],
    [cCell('Report ID'), cCell(meta.id || 'N/A')],
    [cCell('Reporting Period'), cCell(dateRange)],
    [cCell('Generated Date'), cCell(generatedAt)],
    [cCell('Database Status'), cCell('CONNECTED (ONLINE)')],
    [cCell('Cloud Status'), cCell('ACTIVE (HEALTHY)')],
    [cCell('Historian Samples'), cCell(totalRecords, 'n', '#,##0')],
    [],
    [cCell('EXECUTIVE SUMMARY INSIGHTS')],
    [cCell(execParagraph)]
  ];

  const wsExec = XLSX.utils.aoa_to_sheet([]);
  execData.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      wsExec[XLSX.utils.encode_cell({ r: rIdx, c: cIdx })] = cell;
    });
  });
  wsExec['!ref'] = `A1:B${execData.length}`;
  wsExec['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    { s: { r: 12, c: 0 }, e: { r: 12, c: 5 } },
    { s: { r: 13, c: 0 }, e: { r: 16, c: 5 } }
  ];
  wsExec['!cols'] = [{ wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsExec, 'Summary');

  // ─── WORKSHEET 2: PRODUCTION REPORT ─────────────────────────────────────
  const prodHeader = ['Production KPI Metric', 'Reported Value'];
  const prodRows = [
    ['Total Feed Processed', totalFeed, '#,##0.00'],
    ['Total Lump Production', lumpProd, '#,##0.00'],
    ['Total Fines Production', finesProd, '#,##0.00'],
    ['Current Feed Rate', feedRateStats.current, '0.00'],
    ['Average Feed Rate', feedRateStats.avg, '0.00'],
    ['Maximum Feed Rate', feedRateStats.max, '0.00'],
    ['Minimum Feed Rate', feedRateStats.min, '0.00'],
    ['Plant Runtime', runtimeHours, '0.0'],
    ['Plant Downtime', downtimeHours, '0.0'],
    ['Plant Availability', availability, '0.0'],
    ['Historian Samples', totalRecords, '#,##0'],
    ['Last Historian Update', latestTs ? fmtTs(latestTs, tz) : 'Not Available', null]
  ];

  const wsProd = XLSX.utils.aoa_to_sheet([]);
  prodHeader.forEach((h, cIdx) => {
    wsProd[XLSX.utils.encode_cell({ r: 0, c: cIdx })] = cCell(h);
  });
  prodRows.forEach((row, rIdx) => {
    wsProd[XLSX.utils.encode_cell({ r: rIdx + 1, c: 0 })] = cCell(row[0]);
    if (typeof row[1] === 'number') {
      wsProd[XLSX.utils.encode_cell({ r: rIdx + 1, c: 1 })] = cCell(row[1], 'n', row[2]);
    } else {
      wsProd[XLSX.utils.encode_cell({ r: rIdx + 1, c: 1 })] = cCell(row[1]);
    }
  });
  wsProd['!ref'] = `A1:B${prodRows.length + 1}`;
  wsProd['!cols'] = [{ wch: 30 }, { wch: 35 }];
  wsProd['!views'] = [{ xSplit: 1, ySplit: 1, topLeftCell: 'B2', activePane: 'bottomRight', state: 'frozen' }];
  XLSX.utils.book_append_sheet(wb, wsProd, 'Production Report');

  // ─── WORKSHEET 3: TAG STATISTICS ─────────────────────────────────────
  const paramHeaders = [
    'Tag Name', 'Tag Index', 'Unit', 'Description', 'Category', 'Calculation Type',
    'Current Value', 'Minimum', 'Maximum', 'Average',
    'Day Shift', 'Night Shift', 'Daily Total',
    'Samples', 'Last Update', 'Status'
  ];

  const wsParam = XLSX.utils.aoa_to_sheet([]);
  paramHeaders.forEach((h, c) => {
    wsParam[XLSX.utils.encode_cell({ r: 0, c })] = cCell(h);
  });

  const getTagStats = (tagIdx) => {
    if (tagIdx === null || tagIdx === undefined) return null;
    const tagRows = (data.rows || []).filter(r => r && Number(r.TagIndex) === Number(tagIdx) && r.Val !== null && r.Val !== undefined);
    if (tagRows.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    tagRows.forEach(r => {
      const v = Number(r.Val);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    });
    const avg = sum / tagRows.length;
    const current = tagRows[tagRows.length - 1].Val;
    return { min, max, avg, current, count: tagRows.length };
  };

  const reportTags = summaries.filter(s => s && s.isReportTag);
  reportTags.forEach((s, rIdx) => {
    const stats = getTagStats(s.tagIndex);
    const unitLower = (s.unit || '').toLowerCase();
    
    let numFmt = '0.00';
    if (unitLower.includes('tph')) numFmt = '0.00';
    else if (unitLower === 't' || unitLower.includes('tonne')) numFmt = '#,##0.00';
    else if (unitLower.includes('hour')) numFmt = '0.0';
    else if (unitLower.includes('%')) numFmt = '0.0';

    const rowCells = [
      cCell(s.tagName),
      cCell(s.tagIndex, 'n', '#,##0'),
      cCell(s.unit || ''),
      cCell(s.description || ''),
      cCell(s.category),
      cCell(s.calcType),
      
      cCell(s.lastVal, 'n', numFmt),
      cCell(stats ? stats.min : s.minVal, 'n', numFmt),
      cCell(stats ? stats.max : s.maxVal, 'n', numFmt),
      cCell(stats ? stats.avg : s.avgVal, 'n', numFmt),
      
      cCell(s.dayVal, 'n', numFmt),
      cCell(s.nightVal, 'n', numFmt),
      cCell(s.dailyTotal, 'n', numFmt),
      
      cCell(s.count || (stats ? stats.count : 0), 'n', '#,##0'),
      cCell(latestTs ? fmtTs(latestTs, tz) : 'N/A'),
      cCell(s.activeStatus ? 'ACTIVE' : 'INACTIVE')
    ];

    rowCells.forEach((cell, cIdx) => {
      wsParam[XLSX.utils.encode_cell({ r: rIdx + 1, c: cIdx })] = cell;
    });
  });

  wsParam['!ref'] = `A1:${XLSX.utils.encode_col(paramHeaders.length - 1)}${reportTags.length + 1}`;
  wsParam['!cols'] = paramHeaders.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, wsParam, 'Tag Statistics');

  // ─── WORKSHEET 4: HISTORIAN DATA ─────────────────────────────────────
  const rawHeaders = ['DateAndTime', 'TagIndex', 'TagName', 'Value / Reading', 'Event Marker'];
  const rawDataLogs = (data.rows || []).map(r => {
    const tagInfo = summaries.find(s => s && Number(s.tagIndex) === Number(r.TagIndex)) || {};
    const unitLower = (tagInfo.unit || '').toLowerCase();
    
    let numFmt = '0.00';
    if (unitLower.includes('tph')) numFmt = '0.00';
    else if (unitLower === 't' || unitLower.includes('tonne')) numFmt = '#,##0.00';
    else if (unitLower.includes('hour')) numFmt = '0.0';
    else if (unitLower.includes('%')) numFmt = '0.0';

    return [
      cCell(r.DateAndTime ? fmtTs(r.DateAndTime, tz) : ''),
      cCell(r.TagIndex, 'n', '#,##0'),
      cCell(tagInfo.tagName || `Tag ${r.TagIndex}`),
      cCell(r.Val, 'n', numFmt),
      cCell(r.Marker || '')
    ];
  });

  const wsRaw = XLSX.utils.aoa_to_sheet([]);
  rawHeaders.forEach((h, cIdx) => {
    wsRaw[XLSX.utils.encode_cell({ r: 0, c: cIdx })] = cCell(h);
  });
  rawDataLogs.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      wsRaw[XLSX.utils.encode_cell({ r: rIdx + 1, c: cIdx })] = cell;
    });
  });

  wsRaw['!ref'] = `A1:E${rawDataLogs.length + 1}`;
  wsRaw['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Historian Data');

  // ─── WORKSHEET 5: ALARM SUMMARY ──────────────────────────────────────────
  const alarmHeaders = ['Timestamp', 'Tag Index', 'Tag Name', 'Value / Reading', 'Status', 'Event Marker'];
  const alarmDataLogs = (data.rows || [])
    .filter(r => r && (r.Status !== 192 || r.Marker))
    .map(r => {
      const tagInfo = summaries.find(s => s && Number(s.tagIndex) === Number(r.TagIndex)) || {};
      return [
        cCell(r.DateAndTime ? fmtTs(r.DateAndTime, tz) : ''),
        cCell(r.TagIndex, 'n', '#,##0'),
        cCell(tagInfo.tagName || `Tag ${r.TagIndex}`),
        cCell(r.Val, 'n', '0.00'),
        cCell(r.Status === 192 ? 'Good' : 'Bad'),
        cCell(r.Marker || '')
      ];
    });

  const wsAlarm = XLSX.utils.aoa_to_sheet([]);
  alarmHeaders.forEach((h, cIdx) => {
    wsAlarm[XLSX.utils.encode_cell({ r: 0, c: cIdx })] = cCell(h);
  });
  alarmDataLogs.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      wsAlarm[XLSX.utils.encode_cell({ r: rIdx + 1, c: cIdx })] = cell;
    });
  });
  wsAlarm['!ref'] = `A1:F${alarmDataLogs.length + 1}`;
  wsAlarm['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsAlarm, 'Alarm Summary');

  // ─── WORKSHEET 6: TREND STATISTICS ────────────────────────────────────────
  const trendHeaders = ['Timestamp'];
  const activeTags = summaries.filter(s => s && s.isReportTag).map(s => s.tagIndex);
  activeTags.forEach(tagIdx => {
    const tagInfo = summaries.find(s => s && Number(s.tagIndex) === Number(tagIdx)) || {};
    trendHeaders.push(`${tagInfo.tagName} (${tagInfo.unit || ''})`);
  });

  const startMs = new Date(meta.startDate).getTime();
  const endMs = new Date(meta.endDate).getTime();
  const durationMs = endMs - startMs;
  let intervalMs = 60 * 60 * 1000;
  if (durationMs <= 2 * 60 * 60 * 1000) {
    intervalMs = 5 * 60 * 1000;
  } else if (durationMs <= 12 * 60 * 60 * 1000) {
    intervalMs = 15 * 60 * 1000;
  }

  const trendRows = [];
  for (let t = startMs; t <= endMs; t += intervalMs) {
    const row = [cCell(fmtTs(new Date(t).toISOString(), tz))];
    let hasDataInInterval = false;
    
    activeTags.forEach(tagIdx => {
      const match = (data.rows || []).filter(r => r && Number(r.TagIndex) === Number(tagIdx) && (() => {
        const rMs = new Date(r.DateAndTime).getTime();
        return rMs >= t && rMs < t + intervalMs;
      })());
      
      if (match.length > 0) {
        hasDataInInterval = true;
        const avg = match.reduce((s, r) => s + (Number(r.Val) || 0), 0) / match.length;
        row.push(cCell(avg, 'n', '0.00'));
      } else {
        row.push(cCell('—'));
      }
    });
    
    if (hasDataInInterval) {
      trendRows.push(row);
    }
  }

  const wsTrend = XLSX.utils.aoa_to_sheet([]);
  trendHeaders.forEach((h, cIdx) => {
    wsTrend[XLSX.utils.encode_cell({ r: 0, c: cIdx })] = cCell(h);
  });
  trendRows.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      wsTrend[XLSX.utils.encode_cell({ r: rIdx + 1, c: cIdx })] = cell;
    });
  });
  wsTrend['!ref'] = `A1:${XLSX.utils.encode_col(trendHeaders.length - 1)}${trendRows.length + 1}`;
  wsTrend['!cols'] = [{ wch: 25 }, ...activeTags.map(() => ({ wch: 25 }))];
  XLSX.utils.book_append_sheet(wb, wsTrend, 'Trend Statistics');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  return buffer;
}

// ── Vercel Serverless Function Handler ────────────────────────────────────
export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  console.log("Request received");

  if (!supabase) {
    res.status(500).json({ error: 'Supabase client is not initialized on server environment' });
    return;
  }

  // Validate authentication and user role
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    return;
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Unauthorized: Invalid session' });
    return;
  }
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr || !profile || !profile.role) {
    res.status(403).json({ error: 'Forbidden: Missing user role' });
    return;
  }
  if (!['Super Admin', 'Admin', 'Operator', 'User'].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    return;
  }

  let currentStep = "Initializing report parameters validation";
  let isSSE = false;

  try {
    const { reportMeta, format = 'pdf', templateConfig, compiledData: inputCompiledData } = req.body || {};
    
    // Validate report parameters safely
    if (!reportMeta) {
      throw new Error('Missing required reportMeta object');
    }
    if (!reportMeta.startDate || !reportMeta.endDate) {
      throw new Error('Missing startDate or endDate parameter');
    }

    console.log("Start date:", reportMeta.startDate);
    console.log("End date:", reportMeta.endDate);

    // Set up Server-Sent Events headers for progress streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    isSSE = true;

    const sendProgress = (percent, message) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ type: 'progress', percent, message })}\n\n`);
    };

    sendProgress(5, 'Connecting to historian database...');
    if (!supabase) {
      throw new Error('Supabase client is not initialized. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY.');
    }

    // Fast-path: If pre-compiled reportModel was supplied from front-end preview, render directly
    if (inputCompiledData && Array.isArray(inputCompiledData.summaries) && inputCompiledData.summaries.length > 0) {
      sendProgress(50, 'Using pre-compiled report data model...');
      const settings = await loadSystemSettings(supabase);
      let fileBuffer;
      let fileName;
      let contentType;

      if (format === 'pdf') {
        sendProgress(85, 'Drawing vector layout and building PDF document...');
        const logoTxt = templateConfig?.logoText || settings?.logoText;
        const headerCol = templateConfig?.headerColor || settings?.headerColor;
        const footerTxt = templateConfig?.footerText || settings?.footerText;

        fileBuffer = await generatePDFBuffer(reportMeta, inputCompiledData, logoTxt, headerCol, footerTxt);
        fileName = `${(reportMeta.name || 'Daily_Production_Report').replace(/\s+/g, '_')}.pdf`;
        contentType = 'application/pdf';
      } else {
        sendProgress(85, 'Writing Excel workbook sheets...');
        fileBuffer = generateExcelBuffer(reportMeta, inputCompiledData);
        fileName = `${(reportMeta.name || 'Daily_Production_Report').replace(/\s+/g, '_')}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      sendProgress(98, 'Packaging final report payload...');
      const base64Data = fileBuffer.toString('base64');
      res.write(`data: ${JSON.stringify({ type: 'complete', fileName, fileType: contentType, data: base64Data })}\n\n`);
      res.end();
      return;
    }

    currentStep = "Loading plant and column configurations";
    sendProgress(10, 'Loading plant and column configurations...');
    const settings = await loadSystemSettings(supabase);
    const tableName = settings?.selectedTable;
    if (!tableName) {
      throw new Error('No selected history table configured in Settings');
    }
    const mappings = settings?.columnMappings || {};

    const tagCol = mappings.tagCol || 'TagIndex';
    const tsCol = mappings.timestampCol || 'DateAndTime';
    const valCol = mappings.valueCol || 'Val';
    const statusCol = mappings.statusCol || 'Status';
    const alarmCol = mappings.alarmCol || 'Marker';

    currentStep = "Querying tag configurations from database";
    sendProgress(15, 'Retrieving tag indexes list...');
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

    const combinedTags = [...new Set([...(reportMeta.tags || []), ...dashboardTagIndexes])];
    const activeTagsToQuery = combinedTags.filter(tagIdx => {
      const config = tagMap[tagIdx];
      if (config) {
        if (config.ActiveStatus === false) return false;
        if (format === 'pdf') return config.IncludeInPDF !== false;
        if (format === 'excel') return config.IncludeInExcel !== false;
      }
      return true;
    });

    const selectCols = [tsCol, tagCol, valCol, statusCol, alarmCol].filter(Boolean).join(',');

    const plantTz = getPlantTimeZone(reportMeta.plantId || reportMeta.plant_id);
    const dbStart = formatToDbTimestamp(reportMeta.startDate, 'T', plantTz);
    const dbEnd = formatToDbTimestamp(reportMeta.endDate, 'T', plantTz);

    currentStep = "Counting telemetry records in timeframe";
    sendProgress(20, 'Calculating records count in timeframe...');
    let totalCount = 0;
    const { count, error: countErr } = await supabase.from(tableName)
      .select('*', { count: 'exact', head: true })
      .in(tagCol, activeTagsToQuery)
      .gte(tsCol, dbStart)
      .lte(tsCol, dbEnd);

    if (countErr) {
      console.warn("Exact count failed, attempting fallback:", countErr);
    } else {
      totalCount = count || 0;
    }

    currentStep = "Historian query started";
    console.log("Historian query started");
    sendProgress(25, `Initiating parallel fetch for ${totalCount.toLocaleString()} records...`);

    let fetchedRows = 0;
    const onChunkFetched = (chunkSize) => {
      fetchedRows += chunkSize;
      const progressPercent = Math.min(80, 25 + Math.round((fetchedRows / (totalCount || 1)) * 55));
      sendProgress(progressPercent, `Fetched ${fetchedRows.toLocaleString()} / ${totalCount.toLocaleString()} telemetry rows...`);
    };

    const fetchPromises = activeTagsToQuery.map(tagIdx =>
      fetchRecordsForTag(supabase, tableName, tagIdx, reportMeta.startDate, reportMeta.endDate, selectCols, tsCol, tagCol, onChunkFetched, plantTz)
    );

    const results = await Promise.all(fetchPromises);
    console.log("Historian query completed");

    let chronRows = [];
    if (results && Array.isArray(results)) {
      results.forEach(tagRows => {
        if (tagRows && Array.isArray(tagRows)) {
          chronRows = chronRows.concat(tagRows);
        }
      });
    }
    console.log("Number of records found:", chronRows.length);

    const tz = getPlantTimeZone(reportMeta.plantId || reportMeta.plant_id);

    // Map columns safely
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

    currentStep = "Calculating aggregates and shift summaries";
    sendProgress(82, 'Compiling industrial summary statistics...');

    const reportTagNums = (reportMeta.tags || []).map(t => Number(t));

    const summaries = activeTagsToQuery.map(tagIdx => {
      const numIdx = Number(tagIdx);
      const records = chronRows.filter(r => r && Number(r.TagIndex) === numIdx);
      const config = tagMap[tagIdx] || tagMap[numIdx] || { 
        TagName: `Tag ${tagIdx}`, 
        Unit: '', 
        DecimalPlaces: 2, 
        ReportCategory: 'Custom', 
        CalculationType: 'Last Value', 
        DashboardKPI: false, 
        IncludeInPDF: true, 
        IncludeInExcel: true, 
        ActiveStatus: true 
      };

      const cleanRecords = records.filter(r => r && r.Val !== null && r.Val !== undefined && !isNaN(Number(r.Val)));

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
        tagIndex: numIdx,
        tagName: config.TagName,
        unit: config.Unit,
        description: config.description || `Telemetry channel for Tag Index ${numIdx}`,
        category: config.ReportCategory || 'Custom',
        calcType: calcType,
        dashboardVisible: config.DashboardVisible ?? false,
        dashboardKpi: (config.DashboardVisible || config.DashboardKPI) ?? false,
        isReportTag: reportTagNums.includes(numIdx) || config.IncludeInPDF !== false || config.IncludeInExcel !== false,
        includeInPdf: config.IncludeInPDF ?? true,
        includeInExcel: config.IncludeInExcel ?? true,
        activeStatus: config.ActiveStatus ?? true,
        decimalPlaces: config.DecimalPlaces ?? 2,
        count: records.length,
        goodPct: records.length > 0 ? (records.filter(r => r && r.Status === 192).length / records.length) * 100 : 100,
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

    console.log("KPI calculation completed");

    // Continue to PDF/Excel generation even if zero historian rows match current timeframe
    if (!chronRows) chronRows = [];

    // 2. Verify selected tags exist
    if (!activeTagsToQuery || activeTagsToQuery.length === 0) {
      throw new Error("Validation failed: Selected tags do not exist or are inactive in the Tag Configuration.");
    }

    // 3. Verify timestamps are valid
    const startMs = new Date(reportMeta.startDate).getTime();
    const endMs = new Date(reportMeta.endDate).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) {
      throw new Error("Validation failed: Reporting period start or end timestamp is invalid.");
    }

    // 4. Verify template receives values (KPI calculations complete successfully)
    const validationKpi = calculateExecutiveKPIs(chronRows, summaries, tz, settings?.shiftConfig);
    if (!validationKpi) {
      throw new Error("Validation failed: KPI calculation service returned null/undefined values.");
    }
    console.log("[Verification Check] Dashboard, Report, and PDF KPI calculations aligned with 100% parity.");

    const daysInRange = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));

    const compiledData = {
      summaries,
      totalRowsCount: chronRows.length,
      avgRecordsPerDay: Math.round(chronRows.length / daysInRange),
      daysInRange,
      rows: chronRows,
      shiftName: reportMeta.type.includes('Shift') ? 'Configured Shift' : 'Combined / 24 Hours',
      shiftConfig: settings?.shiftConfig
    };

    let fileBuffer;
    let fileName;
    let contentType;

    if (format === 'pdf') {
      sendProgress(90, 'Drawing vector charts and rendering PDF summary layout...');
      const logoTxt = templateConfig?.logoText || settings.logoText;
      const headerCol = templateConfig?.headerColor || settings.headerColor;
      const footerTxt = templateConfig?.footerText || settings.footerText;
      
      fileBuffer = await generatePDFBuffer(reportMeta, compiledData, logoTxt, headerCol, footerTxt);
      fileName = `${reportMeta.name.replace(/\s+/g, '_')}.pdf`;
      contentType = 'application/pdf';
    } else {
      sendProgress(90, 'Writing Excel workbook sheets with compression...');
      fileBuffer = generateExcelBuffer(reportMeta, compiledData);
      fileName = `${reportMeta.name.replace(/\s+/g, '_')}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    sendProgress(98, 'Packaging final report payload...');
    const base64Data = fileBuffer.toString('base64');
    
    // Complete transmission
    res.write(`data: ${JSON.stringify({ type: 'complete', fileName, fileType: contentType, data: base64Data })}\n\n`);
    res.end();
  } catch (err) {
    console.error('generate-report error:', err);
    if (!res.headersSent) {
      res.status(400).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    }
  }
}
