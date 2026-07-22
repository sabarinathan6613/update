/* global process, Buffer */
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { generatePDFBuffer, generateExcelBuffer } from './generate-report.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;


// ── PDF Helper Utilities ──────────────────────────────────────────────
function fmtVal(v, dp) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(dp ?? 2);
}
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
  doc.rect(18, 12, w - 36, 14).fill('#1B365D');
  doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold')
     .text(((reportTitle || 'Daily Production Report') + ' — ' + (pageLabel || 'KPI & Indicator Guide')).toUpperCase(), 24, 16, { width: w - 48, lineBreak: false });
}
function drawPageFooter(doc, footerText, pageNum, totalPages, generatedAt) {
  const w = doc.page.width;
  const h = doc.page.height;
  const company = footerText || 'Automation Alliance Solutions';
  doc.fillColor('#64748B').fontSize(7).font('Helvetica')
     .text(`${company} | Confidential | Page ${pageNum} of ${totalPages}`, 18, h - 24, { width: w - 36, align: 'left' });
}
function drawSectionTitle(doc, title, y) {
  const w = doc.page.width;
  doc.rect(18, y, w - 36, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
     .text(title, 24, y + 5, { width: w - 48 });
  return y + 26;
}
function drawSubsectionTitle(doc, title, y) {
  const w = doc.page.width;
  doc.rect(18, y, w - 36, 14).fill('#3B82F6');
  doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold')
     .text(title, 24, y + 3.5, { width: w - 48 });
  return y + 20;
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
    // Draw thin border around cell
    doc.save();
    doc.strokeColor('#CBD5E1').lineWidth(0.5);
    doc.rect(colX[i], y, colW[i], rowH).stroke();
    doc.restore();

    doc.text(String(cell ?? '—'), colX[i] + 3, y + (rowH - 7) / 2, {
      width: colW[i] - 6, align: i > 0 && !isHeader ? 'right' : 'left', lineBreak: false
    });
  });
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
  const marginL = 18;
  const contentW = pageW - 36;

  // Helper to draw clean table grids
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
    // Vertical centering
    doc.text(String(text ?? ''), x + 2, y + (h - size) / 2 - 1, { width: w - 4, align });
    doc.restore();
  }

  // ══════════════════════════════════════════════
  // PAGE 1: COVER PAGE
  // ══════════════════════════════════════════════
  
  // Title
  doc.y = 110;
  doc.fillColor('#1B365D').font('Helvetica-Bold').fontSize(22)
     .text('DAILY PRODUCTION SUMMARY REPORT', 18, { width: contentW, align: 'center' });

  // Subtitle 1
  doc.y = doc.y + 12;
  doc.fillColor('#3B82F6').font('Helvetica-Bold').fontSize(12)
     .text('Key Functional Indicators & Report Guide', 18, { width: contentW, align: 'center' });

  // Subtitle 2
  doc.y = doc.y + 6;
  doc.fillColor('#64748B').font('Helvetica').fontSize(9)
     .text('Crushing & Screening Project — OHP4 Circuit', 18, { width: contentW, align: 'center' });

  // Metadata Table (centered)
  let startY = doc.y + 24;
  const tableX = (pageW - 360) / 2; // centered
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
    // Left cell (Label)
    doc.save();
    doc.fillColor('#1B365D').rect(tableX, startY, labelW, rowH).fill();
    doc.strokeColor('#CBD5E1').lineWidth(0.5).rect(tableX, startY, labelW, rowH).stroke();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
    doc.text(label, tableX + 8, startY + (rowH - 7.5) / 2, { width: labelW - 16, align: 'left', lineBreak: false });
    doc.restore();

    // Right cell (Value)
    doc.save();
    doc.fillColor('#F8FAFC').rect(tableX + labelW, startY, valW, rowH).fill();
    doc.strokeColor('#CBD5E1').lineWidth(0.5).rect(tableX + labelW, startY, valW, rowH).stroke();
    doc.fillColor('#1E293B').font('Helvetica').fontSize(7.5);
    doc.text(String(val || '—'), tableX + labelW + 8, startY + (rowH - 7.5) / 2, { width: valW - 16, align: 'left', lineBreak: false });
    doc.restore();

    startY += rowH;
  });

  // ══════════════════════════════════════════════
  // PAGE 2: PRODUCTION & DOWNTIME
  // ══════════════════════════════════════════════
  doc.addPage();

  // Section 1: Production Tonnes
  let y = 36;
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  PRODUCTION TONNES — OHP4 Crushing Circuit', 18, y + 5);

  y += 23;

  // Pt columns
  const ptX = [18, 18 + 75, 18 + 75 + 50, 18 + 75 + 100, 18 + 75 + 150, 18 + 75 + 200, 18 + 75 + 250, 18 + 75 + 300, 18 + 75 + 350, 18 + 75 + 400];
  const ptW = [75, 50, 50, 50, 50, 50, 50, 50, 50, 50];

  // Table Headers
  // Row 1
  drawGridCell(ptX[0], y, ptW[0], 28, '', { fill: '#1B365D' });
  drawGridCell(ptX[1], y, ptW[1] * 3, 14, 'DAY SHIFT (08:00 - 18:00)', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(ptX[4], y, ptW[4] * 3, 14, 'NIGHT SHIFT (18:00 - 08:00)', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(ptX[7], y, ptW[7] * 3, 14, 'DAILY TOTAL', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  y += 14;

  // Row 2
  const headers = [
    'Lump (CV10, t)', 'Fines (CV17, t)', 'Total Feed (t)',
    'Lump (CV10, t)', 'Fines (CV17, t)', 'Total Feed (t)',
    'Lump (CV10, t)', 'Fines (CV17, t)', 'Grand Total (t)'
  ];
  headers.forEach((h, idx) => {
    drawGridCell(ptX[idx + 1], y, ptW[idx + 1], 14, h, {
      fill: '#1B365D',
      color: '#FFFFFF',
      bold: true,
      size: 5.5
    });
  });
  y += 14;

  // Day Shift row
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

  // Night Shift row
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

  // Daily Total row
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

  // Re-feed row (yellow highlight background)
  drawGridCell(ptX[0], y, ptW[0], 14, 'Re-Feed Conveyor (t)', { bold: true, fill: '#F1F5F9', align: 'left', size: 6 });
  drawGridCell(ptX[1], y, ptW[1] * 3, 14, pt.refeedDay, { fill: '#FEF08A', color: '#1E293B', bold: true });
  drawGridCell(ptX[4], y, ptW[4], 14, 'Re-Feed - Night (t)', { bold: true, fill: '#F1F5F9', align: 'left', size: 6 });
  drawGridCell(ptX[5], y, ptW[5] * 5, 14, pt.refeedNight, { fill: '#FEF08A', color: '#1E293B', bold: true });
  y += 24;

  // Section 2: Shift Downtime Summary
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  SHIFT DOWNTIME SUMMARY', 18, y + 5);
  y += 23;

  const dtX = [18, 18 + 140, 18 + 140 + 38, 18 + 140 + 76, 18 + 140 + 114, 18 + 140 + 152, 18 + 140 + 190, 18 + 140 + 228, 18 + 140 + 266, 18 + 140 + 304, 18 + 140 + 342];
  const dtW = [140, 38, 38, 38, 38, 38, 38, 38, 38, 38];

  // Header Row 1
  drawGridCell(dtX[0], y, dtW[0], 28, 'Downtime Event', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(dtX[1], y, dtW[1] * 3, 14, 'DAY SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(dtX[4], y, dtW[4] * 3, 14, 'NIGHT SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(dtX[7], y, dtW[7] * 3, 14, 'COMBINED', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  y += 14;

  // Header Row 2
  const dtHeaders = [
    'Events', 'Mins Down', '% Shift',
    'Events', 'Mins Down', '% Shift',
    'Events', 'Mins Down', '% Shift'
  ];
  dtHeaders.forEach((h, idx) => {
    drawGridCell(dtX[idx + 1], y, dtW[idx + 1], 14, h, {
      fill: '#1B365D',
      color: '#FFFFFF',
      bold: true,
      size: 6
    });
  });
  y += 14;

  // Event rows
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

  // Total Downtime row
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

  // ══════════════════════════════════════════════
  // PAGE 3: SAMPLE DATA & KPIs
  // ══════════════════════════════════════════════
  doc.addPage();

  // Navy header for Sample Station Data
  y = 36;
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  SAMPLE STATION DATA', 18, y + 5);
  y += 24;

  const sW = (contentW - 12) / 2; // Split half width = 256
  const sX1 = 18;
  const sX2 = 18 + sW + 12;

  // Lump Table Header label
  doc.rect(sX1, y, sW, 12).fill('#3B82F6');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text('LUMP SAMPLE STATION (8801)', sX1, y + 3, { width: sW, align: 'center' });

  // Fines Table Header label
  doc.rect(sX2, y, sW, 12).fill('#3B82F6');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text('FINES SAMPLE STATION (8802)', sX2, y + 3, { width: sW, align: 'center' });
  y += 12;

  // Sub headers for station data
  const subCols = ['Cut', 'Time', 'Shift ID', 'Plgr', 'Tons', 'Material'];
  const sW_cols = [22, 40, 50, 24, 60, 60];
  const sX_lump = [sX1, sX1 + 22, sX1 + 62, sX1 + 112, sX1 + 136, sX1 + 196];
  const sX_fines = [sX2, sX2 + 22, sX2 + 62, sX2 + 112, sX2 + 136, sX2 + 196];

  subCols.forEach((col, i) => {
    drawGridCell(sX_lump[i], y, sW_cols[i], 12, col, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6 });
    drawGridCell(sX_fines[i], y, sW_cols[i], 12, col, { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6 });
  });
  y += 12;

  // Draw 8 sample cuts with alternating backgrounds
  for (let idx = 0; idx < 8; idx++) {
    const lRow = ls[idx] || {};
    const fRow = fs[idx] || {};
    const isAlt = idx % 2 === 1;
    const fill = isAlt ? '#F8FAFC' : '#FFFFFF';

    // Lump row
    drawGridCell(sX_lump[0], y, sW_cols[0], 12, lRow.cutId, { fill });
    drawGridCell(sX_lump[1], y, sW_cols[1], 12, lRow.dateTime ? lRow.dateTime.substring(11) : '', { font: 'Courier', size: 5.5, fill });
    drawGridCell(sX_lump[2], y, sW_cols[2], 12, lRow.shiftId, { size: 6, fill });
    drawGridCell(sX_lump[3], y, sW_cols[3], 12, lRow.plungerId, { fill });
    drawGridCell(sX_lump[4], y, sW_cols[4], 12, lRow.stockpileTons ? lRow.stockpileTons.toLocaleString() : '', { fill });
    drawGridCell(sX_lump[5], y, sW_cols[5], 12, lRow.material, { size: 6, fill });

    // Fines row
    drawGridCell(sX_fines[0], y, sW_cols[0], 12, fRow.cutId, { fill });
    drawGridCell(sX_fines[1], y, sW_cols[1], 12, fRow.dateTime ? fRow.dateTime.substring(11) : '', { font: 'Courier', size: 5.5, fill });
    drawGridCell(sX_fines[2], y, sW_cols[2], 12, fRow.shiftId, { size: 6, fill });
    drawGridCell(sX_fines[3], y, sW_cols[3], 12, fRow.plungerId, { fill });
    drawGridCell(sX_fines[4], y, sW_cols[4], 12, fRow.cumTons ? fRow.cumTons.toLocaleString() : '', { fill });
    drawGridCell(sX_fines[5], y, sW_cols[5], 12, fRow.material, { size: 6, color: '#047857', bold: true, fill });

    y += 12;
  }

  y += 12;

  // Section 4: Key Performance Indicators
  doc.rect(18, y, contentW, 18).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('  KEY PERFORMANCE INDICATORS', 18, y + 5);
  y += 23;

  const kpiX = [18, 18 + 150, 18 + 150 + 38, 18 + 150 + 76, 18 + 150 + 114, 18 + 150 + 152, 18 + 150 + 190, 18 + 150 + 228, 18 + 150 + 266, 18 + 150 + 304, 18 + 150 + 342];
  const kpiW = [150, 38, 38, 38, 38, 38, 38, 38, 38, 38];

  // Header Row 1
  drawGridCell(kpiX[0], y, kpiW[0], 26, 'KPI', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(kpiX[1], y, kpiW[1] * 3, 13, 'DAY SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(kpiX[4], y, kpiW[4] * 3, 13, 'NIGHT SHIFT', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  drawGridCell(kpiX[7], y, kpiW[7] * 3, 13, 'DAILY / COMBINED', { fill: '#1B365D', color: '#FFFFFF', bold: true });
  y += 13;

  // Header Row 2
  const kpiHeaders = [
    'Target', 'Actual', 'Status',
    'Target', 'Actual', 'Status',
    'Target', 'Actual', 'Status'
  ];
  kpiHeaders.forEach((h, idx) => {
    drawGridCell(kpiX[idx + 1], y, kpiW[idx + 1], 13, h, {
      fill: '#1B365D',
      color: '#FFFFFF',
      bold: true,
      size: 6
    });
  });
  y += 13;

  // KPI Row Values
  kpis.forEach((row, idx) => {
    const isNum = row.format === "number";
    const fmt = (v) => isNum ? Number(v).toLocaleString() : v;
    const isAlt = idx % 2 === 1;
    const fill = isAlt ? '#F8FAFC' : '#FFFFFF';

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

  // Compliance Footer
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
  const pageH = doc.page.height;
  const marginL = 18;
  const contentW = pageW - 36;

  // Helper to draw clean table grids
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
    // Vertical centering
    doc.text(String(text ?? ''), x + 4, y + (h - size) / 2 - 1, { width: w - 8, align });
    doc.restore();
  }

  // ══════════════════════════════════════════════
  // PAGE 1: TITLE, SAFETY, PRODUCTION
  // ══════════════════════════════════════════════
  
  // Title Block with green border
  let y = 36;
  doc.save();
  doc.strokeColor('#059669').lineWidth(2).rect(18, y, contentW, 36).stroke();
  doc.restore();

  // Draw MACA red oval logo badge
  doc.save();
  doc.fillColor('#E11D48').ellipse(18 + 36, y + 18, 24, 13).fill();
  doc.restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text('maca', 18 + 24, y + 14);

  // Title text
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12.5).text('Daily Production Account', 18 + 70, y + 12);

  y += 46;

  // Safety Share table
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

  // Production OHP4
  doc.rect(18, y, contentW, 14).fill('#1B365D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text('Production OHP4', 18, y + 4, { align: 'center', width: contentW });
  y += 14;

  const prodX = [18, 18 + 160, 18 + 160 + 120, 18 + 160 + 240];
  const prodW = [160, 120, 120, contentW - 400]; // 160, 120, 120, 115 = 515

  // Header
  drawGridCell(prodX[0], y, prodW[0], 14, '', { fill: '#1B365D' });
  drawGridCell(prodX[1], y, prodW[1], 14, 'CV10 Lump (Tonnes)', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  drawGridCell(prodX[2], y, prodW[2], 14, 'CV17 Fines (Tonnes)', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  drawGridCell(prodX[3], y, prodW[3], 14, 'Totals', { fill: '#1B365D', color: '#FFFFFF', bold: true, size: 6.5 });
  y += 14;

  // Day shift
  drawGridCell(prodX[0], y, prodW[0], 13, 'Day shift (6am to 6pm)', { bold: true, align: 'left', size: 6.5, fill: '#FFFFFF' });
  drawGridCell(prodX[1], y, prodW[1], 13, pt.dayShift.lump.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(prodX[2], y, prodW[2], 13, pt.dayShift.fines.toLocaleString(), { fill: '#FFFFFF' });
  drawGridCell(prodX[3], y, prodW[3], 13, pt.dayShift.total.toLocaleString(), { bold: true, fill: '#FFFFFF' });
  y += 13;

  // Night shift
  drawGridCell(prodX[0], y, prodW[0], 13, 'Night shift (6pm to 6am)', { bold: true, align: 'left', size: 6.5, fill: '#F8FAFC' });
  drawGridCell(prodX[1], y, prodW[1], 13, pt.nightShift.lump.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(prodX[2], y, prodW[2], 13, pt.nightShift.fines.toLocaleString(), { fill: '#F8FAFC' });
  drawGridCell(prodX[3], y, prodW[3], 13, pt.nightShift.total.toLocaleString(), { bold: true, fill: '#F8FAFC' });
  y += 13;

  // Total
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

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client is not initialized on server environment' });
  }

  // Validate authentication and user role
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  }
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr || !profile || !profile.role) {
    return res.status(403).json({ error: 'Forbidden: Missing user role' });
  }

  if (!['Super Admin', 'Admin', 'Operator', 'User'].includes(profile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const { smtpConfig, templateConfig, recipient, to, cc, bcc, subject, message, reportData, downloadOnly, format } = req.body;

  if (downloadOnly) {
    const { format: fmt = 'pdf', reportData } = req.body;
    if (!reportData || !reportData.meta || !reportData.data) {
      return res.status(400).json({ error: 'Missing reportData for download' });
    }
    try {
      if (fmt === 'pdf') {
        const pdfBuffer = await generatePDFBuffer(reportData.meta, reportData.data, 'Skadomation System', '#0A0F1E', 'CONFIDENTIAL');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${reportData.meta.name}.pdf"`);
        return res.status(200).send(pdfBuffer);
      } else {
        const xlsxBuffer = generateExcelBuffer(reportData.meta, reportData.data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${reportData.meta.name}.xlsx"`);
        return res.status(200).send(xlsxBuffer);
      }
    } catch (err) {
      console.error('[Download API] Error generating file:', err);
      return res.status(500).json({ error: `Generation failed: ${err.message}` });
    }
  }

  try {
    const result = await sendEmailLocal({
      smtpConfig,
      templateConfig,
      recipient,
      to,
      cc,
      bcc,
      subject,
      message,
      reportData
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[SMTP] Connection / Send Failed:', err);
    return res.status(err.status || 500).json({
      error: err.type || 'SMTP Connection Failed',
      details: err.message
    });
  }
}

export async function sendEmailLocal({
  smtpConfig,
  templateConfig,
  recipient,
  to,
  cc,
  bcc,
  subject,
  message,
  reportData,
  username: optUsername
}) {
  const targetTo = to || recipient;
  const username = optUsername || (smtpConfig?.username || smtpConfig?.smtpUser);

  let logoText = 'Skadomation System';
  let headerColor = '#0A0F1E';
  let footerText = 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.';

  if (smtpConfig) {
    logoText = smtpConfig.logoText || smtpConfig.logo_text || smtpConfig.templateLogoText || logoText;
    headerColor = smtpConfig.headerColor || smtpConfig.header_color || smtpConfig.templateHeaderColor || headerColor;
    footerText = smtpConfig.footerText || smtpConfig.footer_text || smtpConfig.templateFooterText || footerText;
  }

  if (templateConfig) {
    logoText = templateConfig.logoText || templateConfig.logo_text || templateConfig.templateLogoText || logoText;
    headerColor = templateConfig.headerColor || templateConfig.header_color || templateConfig.templateHeaderColor || headerColor;
    footerText = templateConfig.footerText || templateConfig.footer_text || templateConfig.templateFooterText || footerText;
  }

  // 1. Verify required parameters for the email message itself
  if (!targetTo || !subject || !message) {
    const err = new Error('Missing required parameters (Recipient Address, Subject, and Message Body are required).');
    err.status = 400;
    err.type = 'Validation Error';
    throw err;
  }

  let host, port, smtpUser, smtpPass, secure, security_type;

  // 2. Load SMTP config securely
  if (smtpConfig && smtpConfig.host) {
    host = smtpConfig.host || smtpConfig.smtpHost;
    port = parseInt(smtpConfig.port || smtpConfig.smtpPort) || 587;
    smtpUser = smtpConfig.username || smtpConfig.smtpUser;
    smtpPass = smtpConfig.password || smtpConfig.smtpPass;
    security_type = smtpConfig.security_type || (port === 465 ? 'SSL/TLS' : 'STARTTLS');
    secure = port === 465 || security_type === 'SSL/TLS';
  } else {
    try {
      if (!supabase) throw new Error('Supabase client offline.');
      const { data: activeSmtp, error: smtpErr } = await supabase
        .from('smtp_configurations')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (smtpErr || !activeSmtp) {
        throw new Error('No active SMTP server relay configuration selected in Settings.');
      }

      host = activeSmtp.host;
      port = parseInt(activeSmtp.port) || 587;
      smtpUser = activeSmtp.username;
      smtpPass = activeSmtp.password;
      security_type = activeSmtp.security_type || 'STARTTLS';
      secure = activeSmtp.secure;
    } catch (dbErr) {
      console.error('[SMTP] Failed to retrieve SMTP settings from database:', dbErr.message);
      const err = new Error(`Could not retrieve active server relay configuration: ${dbErr.message}`);
      err.status = 500;
      err.type = 'SMTP Configuration Failure';
      throw err;
    }
  }

  // 3. Verify SMTP Host, Port, Username, and Password before attempting connection
  if (!host || typeof host !== 'string' || !host.trim()) {
    const err = new Error('SMTP Host Server name is missing or invalid.');
    err.status = 400;
    err.type = 'Validation Error';
    throw err;
  }
  if (!port || isNaN(port) || port < 1 || port > 65535) {
    const err = new Error('SMTP Port number must be a valid number between 1 and 65535.');
    err.status = 400;
    err.type = 'Validation Error';
    throw err;
  }
  if (!smtpUser || typeof smtpUser !== 'string' || !smtpUser.trim() || !smtpUser.includes('@')) {
    const err = new Error('SMTP Username must be a valid email address.');
    err.status = 400;
    err.type = 'Validation Error';
    throw err;
  }
  if (!smtpPass || typeof smtpPass !== 'string' || !smtpPass.trim()) {
    const err = new Error('SMTP Password/App Key is missing.');
    err.status = 400;
    err.type = 'Validation Error';
    throw err;
  }

  // 4. Gmail App Password enforcement: Never use normal Google passwords
  const isGmailHost = host.toLowerCase().includes('gmail') || host.toLowerCase().includes('googlemail');
  if (isGmailHost) {
    const cleanPass = smtpPass.replace(/[\s-]/g, '');
    const isAppPassword = /^[a-zA-Z]{16}$/.test(cleanPass);
    if (!isAppPassword) {
      const err = new Error('Gmail requires a 16-character Google App Password (e.g. abcd efgh ijkl mnop). Never use your normal Google account password.');
      err.status = 400;
      err.type = 'SMTP Authentication Failed';
      throw err;
    }
  }

  let attachments = [];
  const tempDir = os.tmpdir();

  if (reportData && reportData.meta && reportData.data) {
    const { meta, data, formatPdf = true, formatExcel = true } = reportData;
    console.log(`[SMTP] Processing report data for: ${meta.name}`);

    // 1. PDF Attachment Generation
    if (formatPdf) {
      try {
        console.log('[Generating PDF]');
        console.log('[SMTP] Initiating PDF report generation...');
        const pdfBuffer = await generatePDFBuffer(meta, data, logoText, headerColor, footerText);
        console.log('[SMTP] PDF generation completed successfully.');

        const safeName = meta.name.replace(/[^a-zA-Z0-9]/g, '_');
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
        const err = new Error(`PDF generation failed: ${pdfError.message}`);
        err.status = 500;
        throw err;
      }
    }

    // 2. Excel Attachment Generation
    if (formatExcel) {
      try {
        console.log('[Generating Excel]');
        console.log('[SMTP] Initiating Excel report generation...');
        const xlsxBuffer = generateExcelBuffer(meta, data);
        console.log('[SMTP] Excel generation completed successfully.');

        const safeName = meta.name.replace(/[^a-zA-Z0-9]/g, '_');
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
        const err = new Error(`Excel generation failed: ${xlsxError.message}`);
        err.status = 500;
        throw err;
      }
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: secure,
      auth: {
        user: smtpUser.trim(),
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 8000,
      greetingTimeout: 5000
    });

    console.log('[SMTP Sending]');
    const info = await transporter.sendMail({
      from: `"${logoText}" <${smtpUser.trim()}>`,
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

    console.log('[SMTP Success]');
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
        created_by: smtpUser,
        recipients: [
          Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
          Array.isArray(cc) ? cc.join(', ') : cc,
          Array.isArray(bcc) ? bcc.join(', ') : bcc
        ].filter(Boolean).join(' | '),
        delivery_time: new Date().toISOString(),
        delivery_status: 'SENT',
        attachments_sent: (() => {
          const sentFormats = [];
          if (reportData) {
            if (reportData.formatPdf !== false) sentFormats.push('PDF');
            if (reportData.formatExcel !== false) sentFormats.push('Excel');
          }
          return sentFormats.length > 0 ? sentFormats.join(', ') : 'None';
        })(),
        trigger_time: reportData?.meta?.triggerTime || null,
        records_processed: reportData?.meta?.recordsProcessed || null
      };
      if (supabase) {
        await supabase.from('report_history').insert(dbRow);
        console.log('[SMTP] Delivery successfully logged in report_history.');
      }
    } catch (dbEx) {
      console.error('[SMTP] Exception logging successful delivery:', dbEx);
    }

    // Clean up temp files
    attachments.forEach(att => {
      try {
        if (fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
        }
      } catch {
        /* ignored */
      }
    });

    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('[SMTP] Connection / Send Failed:', error);

    // Log failure to report_history
    try {
      const dbRow = {
        id: 'rep-' + Date.now(),
        name: subject,
        type: `FAILED: ${error.message.substring(0, 80)}`,
        date_range: reportData?.meta?.dateInfo || new Date().toISOString().split('T')[0],
        shift: reportData?.meta?.type || 'Email Delivery Log',
        plant_id: reportData?.meta?.plantId || reportData?.meta?.plant_id || 'all',
        created_by: smtpUser || 'System',
        recipients: [
          Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
          Array.isArray(cc) ? cc.join(', ') : cc,
          Array.isArray(bcc) ? bcc.join(', ') : bcc
        ].filter(Boolean).join(' | '),
        delivery_time: new Date().toISOString(),
        delivery_status: 'FAILED',
        attachments_sent: (() => {
          const sentFormats = [];
          if (reportData) {
            if (reportData.formatPdf !== false) sentFormats.push('PDF');
            if (reportData.formatExcel !== false) sentFormats.push('Excel');
          }
          return sentFormats.length > 0 ? sentFormats.join(', ') : 'None';
        })(),
        trigger_time: reportData?.meta?.triggerTime || null,
        records_processed: reportData?.meta?.recordsProcessed || null
      };
      if (supabase) {
        await supabase.from('report_history').insert(dbRow);
      }
    } catch (dbEx) {
      console.error('[SMTP] Exception logging failed delivery:', dbEx);
    }
    
    // Clean up files
    attachments.forEach(att => {
      try {
        if (fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
        }
      } catch {
        /* ignored */
      }
    });

    const isGmailHost = host?.toLowerCase()?.includes('gmail') || host?.toLowerCase()?.includes('googlemail');
    const isAuthError = error.code === 'EAUTH' || 
                        (error.message && (
                          error.message.includes('535') || 
                          error.message.toLowerCase().includes('accepted') || 
                          error.message.toLowerCase().includes('credential')
                        ));

    let formattedDetails = '';
    let status = 500;
    let type = 'SMTP Connection Failed';

    if (isAuthError) {
      status = 401;
      type = 'SMTP Authentication Failed';
      if (isGmailHost) {
        formattedDetails = '❌ SMTP Authentication Failed\n\nThe Gmail account rejected the login credentials.\n\nPlease verify:\n• Gmail address\n• Google App Password\n• Two-Step Verification is enabled';
      } else {
        formattedDetails = '❌ SMTP Authentication Failed\n\nThe mail server rejected the login credentials.\n\nPlease verify your SMTP username and password.';
      }
    } else {
      formattedDetails = `❌ SMTP Connection Failed\n\nCould not connect to the mail server at ${host}:${port}.\n\nError: ${error.message}`;
    }

    const customErr = new Error(formattedDetails);
    customErr.status = status;
    customErr.type = type;
    throw customErr;
  }
}