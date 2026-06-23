/* global process, Buffer */
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import os from 'os';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;


// ── PDF Helper Utilities ──────────────────────────────────────────────
function fmtVal(v, dp) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(dp ?? 2);
}
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
function drawPageHeader(doc, logoText, headerColor, reportTitle, pageLabel) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 46).fill(headerColor || '#0A1628');
  doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
     .text(logoText || 'SKADOMATION HISTORIAN', 18, 8, { width: 260 });
  doc.fillColor('#94A3B8').fontSize(7).font('Helvetica')
     .text(reportTitle || 'Historian Report', 18, 24, { width: 260 });
  doc.fillColor('#60A5FA').fontSize(7.5).font('Helvetica-Bold')
     .text(pageLabel || '', w - 200, 18, { width: 182, align: 'right' });
}
function drawPageFooter(doc, footerText, pageNum, totalPages, generatedAt) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.rect(0, h - 28, w, 28).fill('#0A1628');
  doc.fillColor('#94A3B8').fontSize(6.5).font('Helvetica')
     .text(footerText || 'CONFIDENTIAL — SKADOMATION INDUSTRIAL HISTORIAN REPORT', 18, h - 18, { width: w - 180 });
  doc.fillColor('#60A5FA').fontSize(6.5).font('Helvetica-Bold')
     .text(`Page ${pageNum} of ${totalPages}  |  Generated: ${generatedAt}`, w - 220, h - 18, { width: 202, align: 'right' });
}
function drawSectionTitle(doc, title, y) {
  const w = doc.page.width;
  doc.rect(18, y, w - 36, 20).fill('#1E3A5F');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
     .text(title, 26, y + 6, { width: w - 52 });
  return y + 28;
}
function drawTableRow(doc, cells, colX, colW, y, rowH, isHeader, isAlt) {
  const w = doc.page.width;
  if (isHeader) {
    doc.rect(18, y, w - 36, rowH).fill('#1E3A5F');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
  } else if (isAlt) {
    doc.rect(18, y, w - 36, rowH).fill('#F0F4FA');
    doc.fillColor('#1E293B').font('Helvetica').fontSize(7);
  } else {
    doc.fillColor('#1E293B').font('Helvetica').fontSize(7);
  }
  cells.forEach((cell, i) => {
    doc.text(String(cell ?? '—'), colX[i] + 3, y + (rowH - 7) / 2, {
      width: colW[i] - 6, align: i > 0 ? 'right' : 'left', lineBreak: false
    });
  });
}

// Helper function to generate PDF buffer
function generatePDFBuffer(meta, data, logoText, headerColor, footerText) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, bufferPages: true, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const marginL = 18;
      const contentW = pageW - 36;
      const contentTop = 56;
      const contentBottom = pageH - 38;
      const themeColor = headerColor || '#0A1628';
      const accentBlue = '#3B82F6';
      const tz = getPlantTimeZone(meta.plantId || meta.plant_id);
      const generatedAt = fmtTs(meta.generatedAt || new Date().toISOString(), tz);
      const reportTitle = meta.name || 'Historian Report';
      const dateRange = meta.dateInfo || (meta.startDate + ' — ' + meta.endDate);
      const summaries = data.summaries || [];
      const totalRecords = data.totalRowsCount || 0;
      const totalTags = summaries.length;
      const avgPerDay = data.avgRecordsPerDay || 0;

      // ══════════════════════════════════════════════
      // PAGE 1: COVER PAGE
      // ══════════════════════════════════════════════

      // Hero background
      doc.rect(0, 0, pageW, pageH * 0.55).fill(themeColor);

      // Accent line
      doc.rect(0, pageH * 0.55, pageW, 4).fill(accentBlue);

      // Logo / Company Name
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22)
         .text(logoText || 'SKADOMATION HISTORIAN', marginL + 10, 70, { width: contentW - 20 });

      doc.fillColor('#60A5FA').font('Helvetica').fontSize(10)
         .text('INDUSTRIAL PROCESS HISTORIAN REPORT SYSTEM', marginL + 10, 100, { width: contentW - 20 });

      // Horizontal rule
      doc.rect(marginL + 10, 122, 80, 2).fill(accentBlue);

      // Report Title
      doc.fillColor('#F1F5F9').font('Helvetica-Bold').fontSize(13);
      doc.text(reportTitle, marginL + 10, 136, { width: contentW - 20 });
      const titleHeight = doc.heightOfString(reportTitle, { width: contentW - 20 });

      // Date Range
      const dateRangeY = 136 + titleHeight + 12;
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(9)
         .text(`Data Collection Period:  ${dateRange}`, marginL + 10, dateRangeY, { width: contentW - 20 });

      // Cover KPI boxes
      const kpiY = dateRangeY + 20;
      const kpiW = (contentW - 20) / 4 - 8;
      const kpiItems = [
        { label: 'TOTAL RECORDS', value: totalRecords.toLocaleString() },
        { label: 'TOTAL TAGS', value: String(totalTags) },
        { label: 'AVG RECORDS/DAY', value: avgPerDay.toLocaleString() },
        { label: 'DATA PERIOD (DAYS)', value: String(data.daysInRange || '—') },
      ];
      kpiItems.forEach((kpi, i) => {
        const kx = marginL + 10 + i * (kpiW + 8);
        doc.save();
        doc.fillColor('#FFFFFF').opacity(0.08).rect(kx, kpiY, kpiW, 60).fill();
        doc.restore();
        doc.rect(kx, kpiY, kpiW, 3).fill(accentBlue);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16)
           .text(kpi.value, kx + 6, kpiY + 14, { width: kpiW - 12, align: 'center' });
        doc.fillColor('#94A3B8').font('Helvetica').fontSize(6.5)
           .text(kpi.label, kx + 6, kpiY + 38, { width: kpiW - 12, align: 'center' });
      });

      // Lower white section
      const lowerY = pageH * 0.55 + 20;
      const metaItems = [
        ['Report Title', reportTitle],
        ['Generated By', meta.createdBy || 'System'],
        ['Generated At', generatedAt],
        ['Plant / Location', meta.plantId || meta.plant_id || 'All Plants'],
        ['Report Type', meta.type || 'Historian Summary'],
        ['Date Range', dateRange],
        ['Total Records', totalRecords.toLocaleString()],
        ['Total Tags Included', String(totalTags)],
      ];
      doc.fillColor('#0A1628').font('Helvetica-Bold').fontSize(9)
         .text('REPORT METADATA', marginL + 10, lowerY, { width: contentW - 20 });
      metaItems.forEach((item, i) => {
        const my = lowerY + 18 + i * 18;
        const mx = marginL + 10;
        const col2x = mx + 160;
        if (i % 2 === 0) doc.rect(mx, my - 2, contentW - 20, 17).fill('#F8FAFC');
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5)
           .text(item[0], mx + 4, my + 2, { width: 150 });
        doc.fillColor('#0F172A').font('Helvetica').fontSize(7.5)
           .text(item[1], col2x, my + 2, { width: contentW - 20 - 160 });
      });

      // Cover page footer
      doc.rect(0, pageH - 28, pageW, 28).fill(themeColor);
      doc.fillColor('#94A3B8').fontSize(6.5).font('Helvetica')
         .text(footerText || 'CONFIDENTIAL — SKADOMATION INDUSTRIAL HISTORIAN REPORT', marginL, pageH - 18, { width: pageW - 36, align: 'center' });

      // ══════════════════════════════════════════════
      // PAGE 2: EXECUTIVE SUMMARY
      // ══════════════════════════════════════════════
      doc.addPage();
      drawPageHeader(doc, logoText, themeColor, reportTitle, 'EXECUTIVE SUMMARY');

      let y = contentTop + 4;

      y = drawSectionTitle(doc, 'EXECUTIVE SUMMARY — KEY PERFORMANCE INDICATORS', y);

      const execKpis = [
        { label: 'Total Records Collected', value: totalRecords.toLocaleString(), icon: '●' },
        { label: 'Total Tags Monitored', value: String(totalTags), icon: '◆' },
        { label: 'Data Collection Period', value: `${data.daysInRange || '—'} days`, icon: '◉' },
        { label: 'Average Records / Day', value: avgPerDay.toLocaleString(), icon: '▲' },
        { label: 'Date Range Start', value: meta.startDate ? fmtTs(meta.startDate, tz) : '—', icon: '◀' },
        { label: 'Date Range End', value: meta.endDate ? fmtTs(meta.endDate, tz) : '—', icon: '▶' },
      ];
      const ekW = (contentW) / 3 - 6;
      execKpis.forEach((kpi, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const kx = marginL + col * (ekW + 8);
        const ky = y + row * 70;
        doc.rect(kx, ky, ekW, 62).fill('#F8FAFC');
        doc.rect(kx, ky, 4, 62).fill(accentBlue);
        doc.fillColor('#64748B').font('Helvetica').fontSize(6.5)
           .text(kpi.label.toUpperCase(), kx + 10, ky + 8, { width: ekW - 14 });
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(14)
           .text(kpi.value, kx + 10, ky + 22, { width: ekW - 14 });
      });
      y += 150;

      // Database status
      y = drawSectionTitle(doc, 'DATABASE CONNECTION STATUS', y);
      doc.rect(marginL, y, contentW, 30).fill('#F0FDF4');
      doc.rect(marginL, y, 4, 30).fill('#22C55E');
      doc.fillColor('#15803D').font('Helvetica-Bold').fontSize(8)
         .text('● ONLINE — Historian database responding normally. All telemetry records retrieved successfully.', marginL + 10, y + 10, { width: contentW - 20 });
      doc.fillColor('#166534').font('Helvetica').fontSize(7)
         .text(`Report compiled at: ${generatedAt}  |  Records retrieved: ${totalRecords.toLocaleString()}  |  Tags: ${totalTags}`, marginL + 10, y + 20, { width: contentW - 20 });
      y += 40;

      // Tag overview table
      y = drawSectionTitle(doc, 'TAG OVERVIEW', y);
      const tagOvCols = ['Tag Index', 'Tag Name', 'Unit', 'Records', 'Quality %'];
      const tagOvX = [marginL, marginL + 60, marginL + 240, marginL + 310, marginL + 380];
      const tagOvW = [58, 178, 68, 68, 68];
      drawTableRow(doc, tagOvCols, tagOvX, tagOvW, y, 16, true, false);
      y += 16;
      summaries.forEach((s, i) => {
        if (y > contentBottom - 20) { doc.addPage(); drawPageHeader(doc, logoText, themeColor, reportTitle, 'EXECUTIVE SUMMARY (cont.)'); y = contentTop + 4; }
        drawTableRow(doc, [s.tagIndex, s.tagName, s.unit || '—', s.count.toLocaleString(), s.goodPct != null ? s.goodPct.toFixed(1) + '%' : '—'], tagOvX, tagOvW, y, 15, false, i % 2 === 0);
        y += 15;
      });

      // ══════════════════════════════════════════════
      // PAGE 3+: TAG SUMMARY TABLE
      // ══════════════════════════════════════════════
      doc.addPage();
      drawPageHeader(doc, logoText, themeColor, reportTitle, 'TAG SUMMARY');
      y = contentTop + 4;
      y = drawSectionTitle(doc, 'SECTION 1 — TAG SUMMARY TABLE', y);

      const sumCols = ['Idx', 'Tag Name', 'Unit', 'Min', 'Max', 'Average', 'Last Value', 'Records'];
      const sumX = [marginL, marginL + 28, marginL + 188, marginL + 222, marginL + 268, marginL + 314, marginL + 368, marginL + 424];
      const sumW = [26, 158, 32, 44, 44, 52, 54, 54];
      drawTableRow(doc, sumCols, sumX, sumW, y, 17, true, false);
      y += 17;

      summaries.forEach((s, i) => {
        if (y > contentBottom - 20) {
          doc.addPage();
          drawPageHeader(doc, logoText, themeColor, reportTitle, 'TAG SUMMARY (cont.)');
          y = contentTop + 4;
          drawTableRow(doc, sumCols, sumX, sumW, y, 17, true, false);
          y += 17;
        }
        const dp = s.decimalPlaces;
        drawTableRow(doc, [
          s.tagIndex,
          s.tagName,
          s.unit || '—',
          s.min != null ? fmtVal(s.min, dp) : '—',
          s.max != null ? fmtVal(s.max, dp) : '—',
          s.avg != null ? fmtVal(s.avg, dp) : '—',
          s.current != null ? fmtVal(s.current, dp) : '—',
          s.count.toLocaleString()
        ], sumX, sumW, y, 15, false, i % 2 === 0);
        y += 15;
      });

      // ══════════════════════════════════════════════
      // STATISTICAL ANALYSIS
      // ══════════════════════════════════════════════
      doc.addPage();
      drawPageHeader(doc, logoText, themeColor, reportTitle, 'STATISTICAL ANALYSIS');
      y = contentTop + 4;
      y = drawSectionTitle(doc, 'SECTION 2 — STATISTICAL ANALYSIS PER TAG', y);

      summaries.forEach((s, si) => {
        if (y > contentBottom - 100) {
          doc.addPage();
          drawPageHeader(doc, logoText, themeColor, reportTitle, 'STATISTICAL ANALYSIS (cont.)');
          y = contentTop + 4;
        }
        const dp = s.decimalPlaces;
        const bgColor = si % 2 === 0 ? '#F8FAFC' : '#FFFFFF';

        // Tag header bar
        doc.rect(marginL, y, contentW, 16).fill(accentBlue);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5)
           .text(`T${s.tagIndex}  —  ${s.tagName}  [${s.unit || 'dimensionless'}]`, marginL + 6, y + 4, { width: contentW - 12 });
        y += 16;

        // Stats grid 4 columns
        const statItems = [
          ['Minimum Value', s.min != null ? fmtVal(s.min, dp) : '—'],
          ['Maximum Value', s.max != null ? fmtVal(s.max, dp) : '—'],
          ['Average Value', s.avg != null ? fmtVal(s.avg, dp) : '—'],
          ['Std Deviation', s.stdDev != null ? fmtVal(s.stdDev, dp) : '—'],
          ['Total Samples', s.count.toLocaleString()],
          ['Quality Index', s.goodPct != null ? s.goodPct.toFixed(1) + '%' : '—'],
          ['First Sample', fmtTs(s.firstSampleTime, tz)],
          ['Last Sample', fmtTs(s.lastSampleTime, tz)],
        ];
        const scW = contentW / 4 - 4;
        statItems.forEach((stat, si2) => {
          const col = si2 % 4;
          const row = Math.floor(si2 / 4);
          const sx = marginL + col * (scW + 4);
          const sy = y + row * 32;
          doc.rect(sx, sy, scW, 30).fill(bgColor);
          doc.rect(sx, sy, scW, 2).fill('#CBD5E1');
          doc.fillColor('#64748B').font('Helvetica').fontSize(6)
             .text(stat[0].toUpperCase(), sx + 4, sy + 4, { width: scW - 8 });
          doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9)
             .text(stat[1], sx + 4, sy + 14, { width: scW - 8 });
        });
        y += 70;
      });

      // ══════════════════════════════════════════════
      // RAW HISTORIAN DATA APPENDIX
      // ══════════════════════════════════════════════
      doc.addPage();
      drawPageHeader(doc, logoText, themeColor, reportTitle, 'RAW DATA APPENDIX');
      y = contentTop + 4;
      y = drawSectionTitle(doc, `APPENDIX — RAW HISTORIAN DATA  (${(data.rows || []).length.toLocaleString()} records${totalRecords > 10000 ? ', last 10,000 shown — full dataset in Excel attachment' : ''})`, y);

      const rawCols = ['DateAndTime', 'Idx', 'Tag Name', 'Value', 'Status', 'Marker'];
      const rawX = [marginL, marginL + 120, marginL + 150, marginL + 310, marginL + 358, marginL + 406];
      const rawW = [118, 28, 158, 46, 46, 80];

      drawTableRow(doc, rawCols, rawX, rawW, y, 15, true, false);
      y += 15;

      (data.rows || []).forEach((row, i) => {
        if (y > contentBottom - 16) {
          doc.addPage();
          drawPageHeader(doc, logoText, themeColor, reportTitle, 'RAW DATA APPENDIX (cont.)');
          y = contentTop + 4;
          drawTableRow(doc, rawCols, rawX, rawW, y, 15, true, false);
          y += 15;
        }
        const statusLabel = row.Status === 192 ? 'Good' : row.Status === 0 ? 'Bad' : String(row.Status);
        drawTableRow(doc, [
          fmtTs(row.DateAndTime, tz),
          row.TagIndex,
          row.TagName || '—',
          row.Val != null ? String(row.Val) : '—',
          statusLabel,
          row.Marker || '—'
        ], rawX, rawW, y, 14, false, i % 2 === 0);
        y += 14;
      });

      // ── Add page numbers and footer to all pages ─────────────────────
      const pageRange = doc.bufferedPageRange();
      const totalPages = pageRange.count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        drawPageFooter(doc, footerText, p + 1, totalPages, generatedAt);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}


// Helper function to generate Excel buffer
function generateExcelBuffer(meta, data) {
  const wb = XLSX.utils.book_new();
  const summaries = data.summaries || [];
  const totalRecords = data.totalRowsCount || 0;
  const tz = getPlantTimeZone(meta.plantId || meta.plant_id);
  const generatedAt = meta.generatedAt ? fmtTs(meta.generatedAt, tz) : fmtTs(new Date().toISOString(), tz);

  // ─── SHEET 1: SUMMARY DASHBOARD ───────────────────────────────
  const dashRows = [
    ['SKADOMATION HISTORIAN REPORT — SUMMARY DASHBOARD'],
    [],
    ['Report Title', meta.name || 'Historian Report'],
    ['Plant / Location', meta.plantId || meta.plant_id || 'All Plants'],
    ['Date Range Start', meta.startDate || ''],
    ['Date Range End', meta.endDate || ''],
    ['Generated By', meta.createdBy || 'System'],
    ['Generated At', generatedAt],
    ['Report Type', meta.type || 'Historian Summary'],
    [],
    ['— KEY METRICS —'],
    ['Total Records Collected', totalRecords],
    ['Total Tags Monitored', summaries.length],
    ['Data Period (Days)', data.daysInRange || ''],
    ['Average Records / Day', data.avgRecordsPerDay || ''],
    [],
    ['— TAG SUMMARY TABLE —'],
    ['Tag Index', 'Tag Name', 'Unit', 'Min', 'Max', 'Average', 'Last Value', 'Record Count', 'Quality %'],
    ...summaries.map(s => {
      const dp = s.decimalPlaces;
      return [
        s.tagIndex,
        s.tagName,
        s.unit || '',
        s.min != null ? Number(Number(s.min).toFixed(dp)) : null,
        s.max != null ? Number(Number(s.max).toFixed(dp)) : null,
        s.avg != null ? Number(Number(s.avg).toFixed(dp)) : null,
        s.current != null ? Number(Number(s.current).toFixed(dp)) : null,
        s.count,
        s.goodPct != null ? Number(s.goodPct.toFixed(1)) : null
      ];
    })
  ];
  const wsDash = XLSX.utils.aoa_to_sheet(dashRows);
  wsDash['!cols'] = [{ wch: 28 }, { wch: 34 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDash, 'Summary Dashboard');

  // ─── SHEET 2: TAG STATISTICS ─────────────────────────────────
  const statRows = [
    ['SKADOMATION HISTORIAN REPORT — TAG STATISTICAL ANALYSIS'],
    [],
    ['Tag Index', 'Tag Name', 'Unit', 'Minimum', 'Maximum', 'Average', 'Std Deviation', 'Total Samples', 'Quality %', 'First Sample Time', 'Last Sample Time'],
    ...summaries.map(s => {
      const dp = s.decimalPlaces;
      return [
        s.tagIndex,
        s.tagName,
        s.unit || '',
        s.min != null ? Number(Number(s.min).toFixed(dp)) : null,
        s.max != null ? Number(Number(s.max).toFixed(dp)) : null,
        s.avg != null ? Number(Number(s.avg).toFixed(dp)) : null,
        s.stdDev != null ? Number(Number(s.stdDev).toFixed(dp)) : null,
        s.count,
        s.goodPct != null ? Number(s.goodPct.toFixed(1)) : null,
        s.firstSampleTime ? fmtTs(s.firstSampleTime, tz) : '',
        s.lastSampleTime ? fmtTs(s.lastSampleTime, tz) : ''
      ];
    })
  ];
  const wsStats = XLSX.utils.aoa_to_sheet(statRows);
  wsStats['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsStats, 'Tag Statistics');

  // ─── SHEET 3: RAW HISTORIAN DATA (ALL RECORDS) ────────────────
  const rawRows = [
    ['SKADOMATION HISTORIAN REPORT — COMPLETE RAW DATA'],
    [`Total Records: ${totalRecords.toLocaleString()}  |  Report Generated: ${generatedAt}`],
    [],
    ['DateAndTime', 'TagIndex', 'Tag Name', 'Value', 'Status Code', 'Status Label', 'Marker', 'Milliseconds'],
    ...(data.allRows || data.rows || []).map(r => [
      r.DateAndTime ? fmtTs(r.DateAndTime, tz) : '',
      r.TagIndex,
      r.TagName || '',
      r.Val,
      r.Status,
      r.Status === 192 ? 'Good' : r.Status === 0 ? 'Bad' : `Status(${r.Status})`,
      r.Marker || '',
      r.Millitm || 0
    ])
  ];
  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
  wsRaw['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw Historian Data');

  // Write to buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}


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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { smtpConfig, templateConfig, recipient, to, cc, bcc, subject, message, reportData } = req.body;
  const targetTo = to || recipient;

  if (!targetTo || !subject || !message) {
    return res.status(400).json({ error: 'Missing required parameters (to/recipient, subject, message)' });
  }

  let host, port, username, password, secure;
  let logoText = 'Skadomation System';
  let headerColor = '#0A0F1E';
  let footerText = 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.';

  if (smtpConfig && smtpConfig.host) {
    host = smtpConfig.host || smtpConfig.smtpHost;
    port = parseInt(smtpConfig.port || smtpConfig.smtpPort) || 587;
    username = smtpConfig.username || smtpConfig.smtpUser;
    password = smtpConfig.password || smtpConfig.smtpPass;
    secure = port === 465;
    logoText = smtpConfig.logoText || smtpConfig.logo_text || smtpConfig.templateLogoText || logoText;
    headerColor = smtpConfig.headerColor || smtpConfig.header_color || smtpConfig.templateHeaderColor || headerColor;
    footerText = smtpConfig.footerText || smtpConfig.footer_text || smtpConfig.templateFooterText || footerText;
  } else {
    // Look up active configuration from database
    try {
      if (!supabase) throw new Error('Supabase client is not initialized. Please configure credentials on the server.');
      const { data: activeSmtp, error: smtpErr } = await supabase
        .from('smtp_configurations')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();
      
      if (smtpErr || !activeSmtp) {
        throw new Error(smtpErr?.message || 'No active SMTP configuration found in database.');
      }
      
      host = activeSmtp.host;
      port = parseInt(activeSmtp.port) || 587;
      username = activeSmtp.username;
      password = activeSmtp.password;
      secure = activeSmtp.secure;
    } catch (dbErr) {
      console.error('[SMTP] Failed to load active SMTP config from database:', dbErr);
      return res.status(500).json({ error: `SMTP Configuration loading failed: ${dbErr.message}` });
    }
  }

  if (templateConfig) {
    logoText = templateConfig.logoText || templateConfig.logo_text || templateConfig.templateLogoText || logoText;
    headerColor = templateConfig.headerColor || templateConfig.header_color || templateConfig.templateHeaderColor || headerColor;
    footerText = templateConfig.footerText || templateConfig.footer_text || templateConfig.templateFooterText || footerText;
  }

  if (!host || !username || !password) {
    return res.status(400).json({ error: 'Incomplete SMTP credentials configuration (Host, Username, and Password are required)' });
  }

  let attachments = [];
  const tempDir = os.tmpdir();

  // Generate attachments if report data is provided
  if (reportData && reportData.meta && reportData.data) {
    const { meta, data, formatPdf = true, formatExcel = true } = reportData;
    console.log(`[SMTP] Processing report data for: ${meta.name}`);

    const safeName = meta.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    // 1. PDF Attachment Generation
    if (formatPdf) {
      try {
        console.log('[SMTP] Initiating PDF report generation...');
        const pdfBuffer = await generatePDFBuffer(meta, data, logoText, headerColor, footerText);
        console.log('[SMTP] PDF generation completed successfully.');

        const pdfPath = path.join(tempDir, `report_${safeName}.pdf`);
        fs.writeFileSync(pdfPath, pdfBuffer);
        const pdfSize = fs.statSync(pdfPath).size;

        console.log(`[SMTP] Attachment file path: ${pdfPath}`);
        console.log(`[SMTP] Attachment file size: ${pdfSize} bytes`);

        attachments.push({
          filename: `${meta.name}.pdf`,
          path: pdfPath
        });
      } catch (pdfError) {
        console.error('[SMTP] PDF generation failed with error:', pdfError);
        return res.status(500).json({ error: `PDF generation failed: ${pdfError.message}` });
      }
    }

    // 2. Excel Attachment Generation
    if (formatExcel) {
      try {
        console.log('[SMTP] Initiating Excel report generation...');
        const xlsxBuffer = generateExcelBuffer(meta, data);
        console.log('[SMTP] Excel generation completed successfully.');

        const xlsxPath = path.join(tempDir, `report_${safeName}.xlsx`);
        fs.writeFileSync(xlsxPath, xlsxBuffer);
        const xlsxSize = fs.statSync(xlsxPath).size;

        console.log(`[SMTP] Attachment file path: ${xlsxPath}`);
        console.log(`[SMTP] Attachment file size: ${xlsxSize} bytes`);

        attachments.push({
          filename: `${meta.name}.xlsx`,
          path: xlsxPath
        });
      } catch (xlsxError) {
        console.error('[SMTP] Excel generation failed with error:', xlsxError);
        return res.status(500).json({ error: `Excel generation failed: ${xlsxError.message}` });
      }
    }

    console.log(`[SMTP] SMTP attachment count: ${attachments.length}`);
  }

  try {
    console.log(`[SMTP] Attempting connection to ${host}:${port}...`);
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: port,
      secure: secure,
      auth: {
        user: username.trim(),
        pass: password,
      },
      tls: {
        rejectUnauthorized: false // avoids handshake failures on self-signed industrial relay certs
      },
      connectionTimeout: 8000,
      greetingTimeout: 5000
    });

    const info = await transporter.sendMail({
      from: `"${logoText}" <${username.trim()}>`,
      to: Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
      cc: Array.isArray(cc) ? cc.join(', ') : cc,
      bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc,
      subject: subject,
      text: message,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #060b18; color: #f1f5f9; max-width: 600px; margin: 0 auto; border-radius: 12px; border: 1px solid #1e2d4a;">
          <div style="background-color: ${headerColor}; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 1px solid #1e2d4a; color: white;">
            <h2 style="margin: 0; font-size: 1.2rem; font-weight: 600; letter-spacing: -0.5px;">${logoText}</h2>
          </div>
          <div style="padding: 24px 16px; min-height: 150px; line-height: 1.6; font-size: 0.95rem; color: #cbd5e1; background-color: #0d1526;">
            ${message.replace(/\n/g, '<br/>')}
          </div>
          <div style="padding: 16px; border-radius: 0 0 8px 8px; border-top: 1px solid #1e2d4a; font-size: 0.72rem; color: #7c9dbf; text-align: center; background-color: #0d1526;">
            ${footerText}
          </div>
        </div>
      `,
      attachments: attachments
    });

    console.log('[SMTP] Email dispatched successfully:', info.messageId);

    // Log successful delivery to report_history
    try {
      const dbRow = {
        id: 'rep-' + Date.now(),
        name: subject,
        type: message.substring(0, 150) || 'Production Email Report',
        date_range: reportData?.meta?.dateInfo || new Date().toISOString().split('T')[0],
        shift: reportData?.meta?.type || 'Email Delivery Log',
        plant_id: reportData?.meta?.plantId || reportData?.meta?.plant_id || 'all',
        created_by: username,
        recipients: [
          Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
          Array.isArray(cc) ? cc.join(', ') : cc,
          Array.isArray(bcc) ? bcc.join(', ') : bcc
        ].filter(Boolean).join(' | '),
        delivery_time: new Date().toISOString(),
        delivery_status: 'SENT',
        attachments_sent: reportData ? 'PDF, Excel' : 'None',
        trigger_time: reportData?.meta?.triggerTime || null,
        records_processed: reportData?.meta?.recordsProcessed || null
      };
      if (supabase) {
        await supabase.from('report_history').insert(dbRow);
        console.log('[SMTP] Delivery successfully logged in report_history.');
      } else {
        console.warn('[SMTP] Supabase client offline, skipped report_history log insert.');
      }
    } catch (dbEx) {
      console.error('[SMTP] Exception logging delivery in database:', dbEx);
    }
    
    // Clean up temporary files from disk
    attachments.forEach(att => {
      try {
        if (fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
        }
      } catch (cleanupErr) {
        console.warn(`[SMTP] Error deleting temporary file ${att.path}:`, cleanupErr);
      }
    });

    return res.status(200).json({ status: 'success', messageId: info.messageId });
  } catch (error) {
    console.error('[SMTP] Connection or sending failed:', error);

    // Log failed delivery to report_history
    try {
      const dbRow = {
        id: 'rep-' + Date.now(),
        name: subject,
        type: `FAILED: ${error.message.substring(0, 80)}`,
        date_range: reportData?.meta?.dateInfo || new Date().toISOString().split('T')[0],
        shift: reportData?.meta?.type || 'Email Delivery Log',
        plant_id: reportData?.meta?.plantId || reportData?.meta?.plant_id || 'all',
        created_by: username,
        recipients: [
          Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
          Array.isArray(cc) ? cc.join(', ') : cc,
          Array.isArray(bcc) ? bcc.join(', ') : bcc
        ].filter(Boolean).join(' | '),
        delivery_time: new Date().toISOString(),
        delivery_status: 'FAILED',
        attachments_sent: reportData ? 'PDF, Excel' : 'None',
        trigger_time: reportData?.meta?.triggerTime || null,
        records_processed: reportData?.meta?.recordsProcessed || null
      };
      if (supabase) {
        await supabase.from('report_history').insert(dbRow);
      } else {
        console.warn('[SMTP] Supabase client offline, skipped failed report_history log insert.');
      }
    } catch (dbEx) {
      console.error('[SMTP] Exception logging failed delivery:', dbEx);
    }
    
    // Clean up files in case of error
    attachments.forEach(att => {
      try {
        if (fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
        }
      } catch {
        /* ignored */
      }
    });

    return res.status(500).json({ error: `SMTP Connection/Auth failure: ${error.message}` });
  }
}
