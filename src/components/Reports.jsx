import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import html2pdf from 'html2pdf.js';
import { formatTimestampToPlantTime, toLocalInput, getPlantTimeZone, getTimeZoneOffsetMs } from '../utils/timeService';
import { getTagConfigs, getReportTemplates, addEmailLog, getReportsList, saveReportRecord, deleteReportRecord, compileReportData, getRecipients, getSettings, saveSettings } from '../utils/db';
import { calculateExecutiveKPIs } from '../utils/historianService';
import { useRefresh } from '../utils/useRefresh';
import RefreshButton from './RefreshButton';
import { getSupabaseClient } from '../utils/supabaseClient';
import { useSimulator } from '../utils/SimulatorContext';

function formatTemplateString(str, report, plantId) {
  if (!str) return '';
  return str
    .replace(/\{\{reportName\}\}/g, report.name || '')
    .replace(/\{\{reportType\}\}/g, report.type || '')
    .replace(/\{\{shift\}\}/g, report.shift || 'Email Delivery Log')
    .replace(/\{\{dateRange\}\}/g, report.dateInfo || '')
    .replace(/\{\{generatedAt\}\}/g, formatTimestampToPlantTime(report.generatedAt || Date.now(), plantId));
}

function DailyProductionSummaryView({ report }) {
  if (!report || !report.data) return null;
  const { data, meta } = report;
  const dp = data.dailyProduction || {};
  const metadata = dp.metadata || {
    siteName: meta.siteName || 'Crushing Circuit',
    projectName: 'OHP4 Crushing Circuit',
    preparedBy: meta.createdBy || 'System Administrator',
    reportDate: meta.startDate ? meta.startDate.substring(0, 10) : new Date().toISOString().substring(0, 10),
    timeGenerated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    shiftReported: 'Day / Night / Daily'
  };

  const pt = dp.productionTonnes || {
    dayShiftRow: { day: { lump: 0, fines: 0, total: 0 } },
    nightShiftRow: { night: { lump: 0, fines: 0, total: 0 } },
    dailyTotalRow: { total: { lump: 0, fines: 0, total: 0 } },
    refeedDay: 0,
    refeedNight: 0
  };

  const downtime = dp.downtimeSummary || [];
  const totalDowntime = dp.totalDowntimeRow || { dayEvents: 0, dayMins: 0, dayPct: 0, nightEvents: 0, nightMins: 0, nightPct: 0, combEvents: 0, combMins: 0, combPct: 0 };
  const lumpSamples = dp.lumpSamples || [];
  const fineSamples = dp.fineSamples || [];

  const fmtNum = (v, decimals = 0) => {
    if (v === null || v === undefined || isNaN(Number(v))) return '—';
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };  return (
    <div style={{ padding: '0', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0F172A', backgroundColor: '#FFFFFF', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      
      {/* ── 1. MAIN REPORT TITLE BANNER ── */}
      <div style={{ backgroundColor: '#1E3A8A', color: '#FFFFFF', padding: '10px 16px', textAlign: 'center', fontWeight: 800, fontSize: '1.15rem', letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: '4px 4px 0 0' }}>
        DAILY PRODUCTION SUMMARY REPORT
      </div>

      {/* ── 2. REPORT INFORMATION HEADER ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #CBD5E1', borderTop: 'none', backgroundColor: '#F8FAFC', padding: '8px 14px', gap: '12px', fontSize: '0.75rem', marginBottom: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div><strong style={{ color: '#475569' }}>Site Name:</strong> <span style={{ color: '#0F172A', fontWeight: 600 }}>{metadata.siteName}</span></div>
          <div><strong style={{ color: '#475569' }}>Project / Contract:</strong> <span style={{ color: '#0F172A', fontWeight: 600 }}>{metadata.projectName}</span></div>
          <div><strong style={{ color: '#475569' }}>Prepared By:</strong> <span style={{ color: '#0F172A', fontWeight: 600 }}>{metadata.preparedBy}</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div><strong style={{ color: '#475569' }}>Report Date:</strong> <span style={{ color: '#0F172A', fontWeight: 600 }}>{metadata.reportDate}</span></div>
          <div><strong style={{ color: '#475569' }}>Time Generated:</strong> <span style={{ color: '#0F172A', fontWeight: 600 }}>{metadata.timeGenerated}</span></div>
          <div><strong style={{ color: '#475569' }}>Shift Reported:</strong> <span style={{ color: '#0F172A', fontWeight: 600 }}>{metadata.shiftReported}</span></div>
        </div>
      </div>

      {/* ── 3. PRODUCTION TONNES SECTION ── */}
      <div style={{ marginBottom: '12px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div style={{ backgroundColor: '#1E40AF', color: '#FFFFFF', padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          PRODUCTION TONNES &mdash; {metadata.siteName}
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #CBD5E1', borderTop: 'none' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'center' }}>
            <thead>
              <tr style={{ color: '#FFFFFF' }}>
                <th style={{ padding: '5px 6px', backgroundColor: '#1E3A8A', border: '1px solid #CBD5E1', textAlign: 'left', width: '22%' }}>PRODUCTION ROW</th>
                <th colSpan={3} style={{ padding: '5px 6px', backgroundColor: '#1E3A8A', border: '1px solid #CBD5E1' }}>DAY SHIFT</th>
                <th colSpan={3} style={{ padding: '5px 6px', backgroundColor: '#1E3A8A', border: '1px solid #CBD5E1' }}>NIGHT SHIFT</th>
                <th colSpan={3} style={{ padding: '5px 6px', backgroundColor: '#6D28D9', border: '1px solid #CBD5E1' }}>DAILY TOTAL</th>
              </tr>
              <tr style={{ backgroundColor: '#F1F5F9', color: '#334155', fontWeight: 700, fontSize: '0.68rem' }}>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Lump (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Fines (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Total Feed (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Lump (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Fines (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Total Feed (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Lump (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Fines (t)</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Grand Total (t)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', textAlign: 'left', fontWeight: 600 }}>Day Shift</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.dayShiftRow?.day?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.dayShiftRow?.day?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 700 }}>{fmtNum(pt.dayShiftRow?.day?.total)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>—</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>—</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>—</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.dayShiftRow?.day?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.dayShiftRow?.day?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 700 }}>{fmtNum(pt.dayShiftRow?.day?.total)}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', textAlign: 'left', fontWeight: 600 }}>Night Shift</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>—</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>—</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>—</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.nightShiftRow?.night?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.nightShiftRow?.night?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 700 }}>{fmtNum(pt.nightShiftRow?.night?.total)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.nightShiftRow?.night?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1' }}>{fmtNum(pt.nightShiftRow?.night?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 700 }}>{fmtNum(pt.nightShiftRow?.night?.total)}</td>
              </tr>
              {/* Highlighted Daily Total Row (Subtle light green) */}
              <tr style={{ backgroundColor: '#DCFCE7', fontWeight: 800 }}>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', textAlign: 'left', color: '#14532D' }}>DAILY TOTAL</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.dayShiftRow?.day?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.dayShiftRow?.day?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.dayShiftRow?.day?.total)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.nightShiftRow?.night?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.nightShiftRow?.night?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.nightShiftRow?.night?.total)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.dailyTotalRow?.day?.lump)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.dailyTotalRow?.day?.fines)}</td>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', color: '#14532D' }}>{fmtNum(pt.dailyTotalRow?.day?.total)}</td>
              </tr>
              {/* Highlighted Re-Feed Conveyor Row (Yellow) */}
              <tr style={{ backgroundColor: '#FEF08A' }}>
                <td style={{ padding: '5px 6px', border: '1px solid #CBD5E1', textAlign: 'left', fontWeight: 700, color: '#713F12' }}>Re-Feed Conveyor (t)</td>
                <td colSpan={3} style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 700, color: '#713F12' }}>{fmtNum(pt.refeedDay)} T</td>
                <td colSpan={3} style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 700, color: '#713F12' }}>{fmtNum(pt.refeedNight)} T</td>
                <td colSpan={3} style={{ padding: '5px 6px', border: '1px solid #CBD5E1', fontWeight: 800, color: '#713F12' }}>{fmtNum(pt.refeedDay + pt.refeedNight)} T</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. SHIFT DOWNTIME SUMMARY SECTION ── */}
      <div style={{ marginBottom: '12px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div style={{ backgroundColor: '#1E3A8A', color: '#FFFFFF', padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SHIFT DOWNTIME SUMMARY
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #CBD5E1', borderTop: 'none' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', textAlign: 'center' }}>
            <thead>
              <tr style={{ backgroundColor: '#1E3A8A', color: '#FFFFFF' }}>
                <th style={{ padding: '6px', border: '1px solid #CBD5E1', textAlign: 'left', width: '31%' }}>DOWNTIME EVENT REASON</th>
                <th colSpan={3} style={{ padding: '6px', border: '1px solid #CBD5E1' }}>DAY SHIFT</th>
                <th colSpan={3} style={{ padding: '6px', border: '1px solid #CBD5E1' }}>NIGHT SHIFT</th>
                <th colSpan={3} style={{ padding: '6px', border: '1px solid #CBD5E1' }}>COMBINED</th>
              </tr>
              <tr style={{ backgroundColor: '#F1F5F9', color: '#334155', fontWeight: 700, fontSize: '0.66rem' }}>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1', textAlign: 'left' }}>Event Description</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Events</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Mins Down</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>% Shift</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Events</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Mins Down</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>% Shift</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Events</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>Mins Down</th>
                <th style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>% Shift</th>
              </tr>
            </thead>
            <tbody>
              {downtime.map((row, idx) => (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1', textAlign: 'left', fontWeight: 500 }}>{row.event}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>{row.dayEvents}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>{row.dayMins}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>{row.dayPct}%</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>{row.nightEvents}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>{row.nightMins}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1' }}>{row.nightPct}%</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1', fontWeight: 600 }}>{row.combEvents}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1', fontWeight: 600 }}>{row.combMins}</td>
                  <td style={{ padding: '4px 6px', border: '1px solid #CBD5E1', fontWeight: 600 }}>{row.combPct}%</td>
                </tr>
              ))}
              {/* Highlighted Total Downtime Row (Yellow) */}
              <tr style={{ backgroundColor: '#FEF08A', fontWeight: 800, color: '#713F12', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1', textAlign: 'left' }}>{totalDowntime.event}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.dayEvents}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.dayMins}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.dayPct}%</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.nightEvents}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.nightMins}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.nightPct}%</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.combEvents}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.combMins}</td>
                <td style={{ padding: '6px', border: '1px solid #CBD5E1' }}>{totalDowntime.combPct}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. SAMPLE STATION DATA SECTION (Explicit Page Break Before) ── */}
      {/* ── 5. SAMPLE STATION DATA SECTION (Explicit Page Break Before) ── */}
      <div style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
        <div style={{ backgroundColor: '#15803D', color: '#FFFFFF', padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SAMPLE STATION DATA
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
          
          {/* Lump Sample Station Table */}
          <div style={{ border: '1px solid #CBD5E1', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#DCFCE7', color: '#166534', padding: '6px 12px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase' }}>
              🟢 LUMP SAMPLE STATION
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', color: '#334155', borderBottom: '1px solid #CBD5E1' }}>
                    <th style={{ padding: '6px 8px', width: '24%' }}>TIMESTAMP</th>
                    <th style={{ padding: '6px 8px', width: '24%' }}>EQUIPMENT NAME</th>
                    <th style={{ padding: '6px 8px', width: '14%' }}>SHIFT ID</th>
                    <th style={{ padding: '6px 8px', width: '19%', textAlign: 'center' }}>SHIFT CUM. TONNES</th>
                    <th style={{ padding: '6px 8px', width: '19%', textAlign: 'center' }}>STOCKPILE TONNES</th>
                  </tr>
                </thead>
                <tbody>
                  {lumpSamples.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                        No Lump Sample Station data available.
                      </td>
                    </tr>
                  ) : (
                    lumpSamples.map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.68rem', color: '#475569' }}>
                          {s.timestamp ? formatTimestampToPlantTime(s.timestamp, meta.plantId) : (s.dateTime || '—')}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1F2937' }}>
                          {s.tagName || s.tag_name || 'Lump Sample Station'}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#111827' }}>
                          {s.shift_id != null ? s.shift_id : (s.shiftId || '—')}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>
                          {s.shift_cumulative_tonnes != null ? Number(s.shift_cumulative_tonnes).toFixed(2) : (s.cumTons != null ? Number(s.cumTons).toFixed(2) : '—')}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>
                          {s.stockpile_tonnes != null ? Number(s.stockpile_tonnes).toFixed(2) : (s.stockpileTons != null ? Number(s.stockpileTons).toFixed(2) : '—')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fines Sample Station Table */}
          <div style={{ border: '1px solid #CBD5E1', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '6px 12px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase' }}>
              🟠 FINES SAMPLE STATION
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', color: '#334155', borderBottom: '1px solid #CBD5E1' }}>
                    <th style={{ padding: '6px 8px', width: '24%' }}>TIMESTAMP</th>
                    <th style={{ padding: '6px 8px', width: '24%' }}>EQUIPMENT NAME</th>
                    <th style={{ padding: '6px 8px', width: '14%' }}>SHIFT ID</th>
                    <th style={{ padding: '6px 8px', width: '19%', textAlign: 'center' }}>SHIFT CUM. TONNES</th>
                    <th style={{ padding: '6px 8px', width: '19%', textAlign: 'center' }}>STOCKPILE TONNES</th>
                  </tr>
                </thead>
                <tbody>
                  {fineSamples.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                        No Fines Sample Station data available.
                      </td>
                    </tr>
                  ) : (
                    fineSamples.map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.68rem', color: '#475569' }}>
                          {s.timestamp ? formatTimestampToPlantTime(s.timestamp, meta.plantId) : (s.dateTime || '—')}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1F2937' }}>
                          {s.tagName || s.tag_name || 'Fines Sample Station'}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#111827' }}>
                          {s.shift_id != null ? s.shift_id : (s.shiftId || '—')}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>
                          {s.shift_cumulative_tonnes != null ? Number(s.shift_cumulative_tonnes).toFixed(2) : (s.cumTons != null ? Number(s.cumTons).toFixed(2) : '—')}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>
                          {s.stockpile_tonnes != null ? Number(s.stockpile_tonnes).toFixed(2) : (s.stockpileTons != null ? Number(s.stockpileTons).toFixed(2) : '—')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

function DailyProductionAccountView({ data }) {
  if (!data) return null;
  const { safetyAndRisk: sr, productionOHP4: pt, dayShiftDowntime: dsD, nightShiftDowntime: dsN, dayTotalMins: tMinsD, nightTotalMins: tMinsN } = data;

  const S = {
    titleBlock: {
      border: '2.5px solid #059669', // green border
      borderRadius: '4px',
      padding: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      marginBottom: '20px',
      background: '#FFFFFF'
    },
    logo: {
      backgroundColor: '#E11D48', // red oval
      width: '54px',
      height: '32px',
      borderRadius: '16px / 16px', // oval shape
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      fontWeight: 'bold',
      fontSize: '0.8rem',
      fontStyle: 'italic',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    title: {
      color: '#1E293B',
      fontWeight: 'bold',
      fontSize: '1.25rem',
      margin: 0
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.72rem',
      marginBottom: '15px',
      border: '1px solid #CBD5E1'
    },
    th: {
      backgroundColor: '#1B365D',
      color: '#FFFFFF',
      padding: '5px 8px',
      fontWeight: 'bold',
      border: '1px solid #CBD5E1',
      fontSize: '0.7rem'
    },
    td: {
      padding: '4px 8px',
      border: '1px solid #CBD5E1',
      color: '#1E293B',
      background: '#FFFFFF'
    },
    tdLabel: {
      padding: '4px 8px',
      border: '1px solid #CBD5E1',
      color: '#1E293B',
      background: '#F8FAFC',
      fontWeight: 'bold',
      textAlign: 'left'
    },
    tdBold: {
      padding: '4px 8px',
      border: '1px solid #CBD5E1',
      fontWeight: 'bold',
      color: '#1E293B',
      background: '#F8FAFC'
    },
    tdYellow: {
      padding: '4px 8px',
      border: '1px solid #CBD5E1',
      background: '#FFFF00', // yellow
      color: '#1E293B',
      fontWeight: 'bold'
    },
    headerBanner: {
      backgroundColor: '#1B365D', // Navy banner
      color: '#FFFFFF',
      padding: '5px 12px',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      textAlign: 'center',
      border: '1px solid #CBD5E1',
      borderBottom: 'none'
    }
  };

  return (
    <div className="daily-production-account-report" style={{ padding: '4px' }}>
      {/* ── MACA STYLE HEADER TITLE BLOCK ── */}
      <div style={S.titleBlock}>
        <div style={S.logo}>maca</div>
        <h2 style={S.title}>Daily Production Account</h2>
      </div>

      {/* ── SAFETY / METADATA TABLE ── */}
      <table style={S.table}>
        <tbody>
          <tr>
            <td style={{ ...S.tdLabel, width: '22%' }}>Safety Share/Safety topic</td>
            <td style={{ ...S.td, textAlign: 'left', fontWeight: '500' }} colSpan="3">{sr.safetyShare}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>Hazards</td>
            <td style={{ ...S.td, textAlign: 'left' }} colSpan="3">{sr.hazards}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>Take 5</td>
            <td style={{ ...S.td, textAlign: 'left' }} colSpan="3">{sr.take5}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>Incidents</td>
            <td style={{ ...S.td, textAlign: 'left' }} colSpan="3">{sr.incidents}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>Trucks per shift</td>
            <td style={{ ...S.td, textAlign: 'left' }} colSpan="3">
              Trucks per shift target {sr.trucksPerShiftTarget} &nbsp;&nbsp;&nbsp;&nbsp; 
              Day Shift - {sr.trucksDayShift} &nbsp;&nbsp;&nbsp;&nbsp; 
              Night Shift - {sr.trucksNightShift}
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>Re-Feed Conveyor</td>
            <td style={{ ...S.td, textAlign: 'left' }} colSpan="3">
              Tonnes &nbsp;&nbsp;&nbsp;&nbsp; 
              Day Shift - {sr.refeedDay} &nbsp;&nbsp;&nbsp;&nbsp; 
              Night Shift - {sr.refeedNight}
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>Catastrophic Risks today</td>
            <td style={{ ...S.td, textAlign: 'left', fontWeight: 'bold' }} colSpan="3">{sr.catastrophicRisks}</td>
          </tr>
        </tbody>
      </table>

      {/* ── PRODUCTION OHP4 ── */}
      <div style={S.headerBanner}>
        Production OHP4
      </div>
      <table style={{ ...S.table, marginTop: 0 }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: '30%', textAlign: 'left' }}></th>
            <th style={S.th}>CV10 Lump (Tonnes)</th>
            <th style={S.th}>CV17 Fines (Tonnes)</th>
            <th style={S.th}>Totals</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...S.td, fontWeight: 'bold', textAlign: 'left' }}>Day shift (6am to 6pm)</td>
            <td style={S.td}>{pt.dayShift.lump.toLocaleString()}</td>
            <td style={S.td}>{pt.dayShift.fines.toLocaleString()}</td>
            <td style={S.tdBold}>{pt.dayShift.total.toLocaleString()}</td>
          </tr>
          <tr>
            <td style={{ ...S.td, fontWeight: 'bold', textAlign: 'left' }}>Night shift (6pm to 6am)</td>
            <td style={S.td}>{pt.nightShift.lump.toLocaleString()}</td>
            <td style={S.td}>{pt.nightShift.fines.toLocaleString()}</td>
            <td style={S.tdBold}>{pt.nightShift.total.toLocaleString()}</td>
          </tr>
          <tr>
            <td style={{ ...S.td, fontWeight: 'bold', textAlign: 'left' }}>Total</td>
            <td style={S.tdBold}>{pt.totals.lump.toLocaleString()}</td>
            <td style={S.tdBold}>{pt.totals.fines.toLocaleString()}</td>
            <td style={S.tdYellow}>{pt.totals.total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      {/* ── DAY SHIFT DOWNTIME OHP4 ── */}
      <div style={S.headerBanner}>
        Day Shift Downtime OHP4
      </div>
      <table style={{ ...S.table, marginTop: 0 }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: '40%', textAlign: 'left' }}>Event</th>
            <th style={S.th}>Number of Events</th>
            <th style={S.th}>Minutes Down</th>
          </tr>
        </thead>
        <tbody>
          {dsD.map((row, idx) => (
            <tr key={idx}>
              <td style={{ ...S.td, textAlign: 'left' }}>{row.event}</td>
              <td style={S.td}>{row.events ?? ''}</td>
              <td style={S.td}>{row.mins ?? ''}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 'bold', background: '#F1F5F9' }}>
            <td style={{ ...S.tdLabel, textAlign: 'left' }}>TOTAL:</td>
            <td style={S.tdBold}></td>
            <td style={S.tdBold}>{tMinsD}</td>
          </tr>
        </tbody>
      </table>

      {/* ── NIGHT SHIFT DOWNTIME OHP4 ── */}
      <div style={S.headerBanner}>
        Night Shift Downtime OHP4
      </div>
      <table style={{ ...S.table, marginTop: 0 }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: '40%', textAlign: 'left' }}>Event</th>
            <th style={S.th}>Number of Events</th>
            <th style={S.th}>Minutes Down</th>
          </tr>
        </thead>
        <tbody>
          {dsN.map((row, idx) => (
            <tr key={idx}>
              <td style={{ ...S.td, textAlign: 'left' }}>{row.event}</td>
              <td style={S.td}>{row.events ?? ''}</td>
              <td style={S.td}>{row.mins ?? ''}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 'bold', background: '#F1F5F9' }}>
            <td style={{ ...S.tdLabel, textAlign: 'left' }}>TOTAL:</td>
            <td style={S.tdBold}></td>
            <td style={S.tdBold}>{tMinsN}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Reports({ user, isActive }) {
  const { refreshTrigger, currentPlantId, chartStart, chartEnd } = useSimulator();
  const isReadOnly = user?.role === 'Admin';

  // Tab State: 'workspace', 'history'
  const [activeTab, setActiveTab] = useState('workspace');

  // Configuration state
  const [tagConfigs, setTagConfigs] = useState([]);
  const [templatesList, setTemplatesList] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  // Report Builder Form State
  const [reportTitle, setReportTitle] = useState('');
  const [reportType, setReportType] = useState('Daily Production Report');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Align Report custom range state with centralized time range
  useEffect(() => {
    if (chartStart) setCustomStart(toLocalInput(new Date(chartStart)));
    if (chartEnd) setCustomEnd(toLocalInput(new Date(chartEnd)));
  }, [chartStart, chartEnd]);
  const [selectedReportTags, setSelectedReportTags] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReportCompiling, setIsReportCompiling] = useState(false);

  // Active compiled report in workspace preview
  const [selectedReport, setSelectedReport] = useState(null);
  const selectedReportRef = useRef(selectedReport);
  useEffect(() => {
    selectedReportRef.current = selectedReport;
  }, [selectedReport]);

  // Saved reports history state
  const [reportsList, setReportsList] = useState([]);

  // Enhanced email recipients modal state
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [recipientsList, setRecipientsList] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState({}); // { [email]: 'to' | 'cc' | 'bcc' | 'none' }
  const [customRecipients, setCustomRecipients] = useState([]); // Array of { email, type }
  const [customEmail, setCustomEmail] = useState('');
  const [customType, setCustomType] = useState('to');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessage, setGenerationMessage] = useState('');
  const [generationFormat, setGenerationFormat] = useState('pdf');
  const [emailSuccessToast, setEmailSuccessToast] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');

  const [toEmails, setToEmails] = useState([]);
  const [ccEmails, setCcEmails] = useState([]);
  const [bccEmails, setBccEmails] = useState([]);

  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');

  const [toError, setToError] = useState('');
  const [ccError, setCcError] = useState('');
  const [bccError, setBccError] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachExcel, setAttachExcel] = useState(true);

  const didInitRef = useRef(false);

  const activeTemplate = useMemo(() => {
    if (!selectedReport) return null;
    return templatesList.find(t => t.report_type === selectedReport.meta.type && t.is_default) ||
           templatesList.find(t => t.report_type === selectedReport.meta.type) ||
           null;
  }, [templatesList, selectedReport]);

  // Filter tag configs for report workspace: union of PDF-enabled OR Excel-enabled tags
  const eligibleReportTags = useMemo(() => {
    return tagConfigs.filter(t => 
      (t.pdf_enabled || t.IncludeInPDF || t.excel_enabled || t.IncludeInExcel) && 
      (t.ActiveStatus !== false && t.active_status !== false)
    );
  }, [tagConfigs]);

  // Load configuration and initialize inputs
  useEffect(() => {
    const loadReportConfigs = async () => {
      const configs = await getTagConfigs();
      const sortedConfigs = configs.sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(sortedConfigs);

      const templates = await getReportTemplates();
      setTemplatesList(templates);

      // Load saved reports list from Supabase
      const savedReports = await getReportsList();
      setReportsList(savedReports);

      // Sanitize/delete demo email addresses from Supabase tables
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          const demoEmails = [
            'plantadmin@plant.com',
            'ops-lead@plant.com',
            'maintenance-tech@plant.com',
            'engineer@plant.com',
            'archive@plant.com'
          ];
          await supabase.from('report_recipients').delete().in('email', demoEmails);

          const { data: schedules } = await supabase.from('scheduled_reports').select('id, email_recipients');
          if (schedules) {
            for (const s of schedules) {
              if (s.email_recipients) {
                const cleaned = s.email_recipients.split(',')
                  .map(x => x.trim())
                  .filter(x => !demoEmails.includes(x.toLowerCase()))
                  .join(', ');
                if (cleaned !== s.email_recipients) {
                  await supabase.from('scheduled_reports').update({ email_recipients: cleaned }).eq('id', s.id);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to sanitize demo emails on startup:", err);
      }

      const recs = await getRecipients();
      setRecipientsList(recs);

      if (!didInitRef.current) {
        // Select all report-configured tags (PDF or Excel enabled) by default
        const reportVisibleTags = sortedConfigs
          .filter(t => (t.pdf_enabled || t.IncludeInPDF || t.excel_enabled || t.IncludeInExcel) && (t.ActiveStatus !== false && t.active_status !== false))
          .map(t => t.TagIndex);
        setSelectedReportTags(reportVisibleTags);

        // Default range: last 24 hours
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
        setCustomStart(yesterday);
        setCustomEnd(new Date().toISOString().slice(0, 16));
        didInitRef.current = true;
      }
    };
    if (isActive) {
      loadReportConfigs();
    }
  }, [isActive]);

  // Tag dictionary mapping
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(t => {
      map[t.TagIndex] = t;
    });
    return map;
  }, [tagConfigs]);

  const allSelected =
    eligibleReportTags.length > 0 &&
    eligibleReportTags.every(t => selectedReportTags.includes(t.TagIndex));

  // Select/deselect all tags
  const handleSelectAllToggle = () => {
    if (allSelected) {
      setSelectedReportTags([]);
    } else {
      setSelectedReportTags(eligibleReportTags.map(t => t.TagIndex));
    }
  };

  const applyPreset = (preset) => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 16);
    if (preset === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      setCustomStart(fmt(start)); setCustomEnd(fmt(now));
    } else if (preset === 'yesterday') {
      const s = new Date(now); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
      const e = new Date(now); e.setDate(e.getDate() - 1); e.setHours(23, 59, 0, 0);
      setCustomStart(fmt(s)); setCustomEnd(fmt(e));
    } else if (preset === '7d') {
      const s = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setCustomStart(fmt(s)); setCustomEnd(fmt(now));
    } else if (preset === '30d') {
      const s = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setCustomStart(fmt(s)); setCustomEnd(fmt(now));
    }
  };


  const handleFormTagToggle = (tagIdx) => {
    setSelectedReportTags(prev =>
      prev.includes(tagIdx) ? prev.filter(t => t !== tagIdx) : [...prev, tagIdx]
    );
  };

  // Compile and load into workspace preview
  const handleGenerate = (e) => {
    e.preventDefault();
    
    // Auto-populate tags if selectedReportTags is empty but eligible tags exist
    let activeTags = selectedReportTags;
    if (activeTags.length === 0 && eligibleReportTags.length > 0) {
      activeTags = eligibleReportTags.map(t => t.TagIndex);
      setSelectedReportTags(activeTags);
    }

    if (eligibleReportTags.length === 0) {
      alert('Daily Production Report cannot be generated: No historian tags have been enabled for PDF or Excel in Tag Configuration. Please enable PDF or Excel toggles in Tag Configuration first.');
      return;
    }

    if (!customStart || !customEnd) {
      alert('Please set a valid date range.');
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      alert('Start date cannot be after End date.');
      return;
    }

    setIsGenerating(true);

    setTimeout(async () => {
      const start = customStart ? new Date(customStart).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const end = customEnd ? new Date(customEnd).toISOString() : new Date().toISOString();
      const dateInfo = `${customStart.replace('T', ' ')} to ${customEnd.replace('T', ' ')}`;
      const name = reportTitle.trim() || `${reportType} — ${dateInfo}`;

      const newReport = {
        id: 'rep-' + Date.now(),
        name,
        type: reportType,
        dateInfo,
        startDate: start,
        endDate: end,
        tags: [...activeTags],
        generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        createdBy: user?.email || ''
      };

      // Persist to Supabase (with localStorage fallback inside saveReportRecord)
      try {
        await saveReportRecord(newReport);
      } catch (err) {
        console.warn('Report save error:', err);
      }
      setReportsList(prev => [newReport, ...prev]);
      setIsGenerating(false);

      await handleViewReport(newReport);
    }, 400);
  };

  // Load a report into workspace preview panel
  const handleViewReport = async (report) => {
    setIsReportCompiling(true);
    try {
      const data = await compileReportData(report);
      setSelectedReport({ meta: report, data });
      setActiveTab('workspace'); // navigate back to workspace to see it
    } catch (err) {
      console.error("Failed to compile report data:", err);
      alert(`Failed to compile report data: ${err.message || err}`);
    } finally {
      setIsReportCompiling(false);
    }
  };

  // Background auto-refresh of compiled reports has been removed to reduce Supabase egress usage
  // in line with the requirement that reports should only be compiled/fetched explicitly.

  const handleManualRefreshReport = useCallback(async () => {
    if (!selectedReportRef.current) {
      alert("No report is currently loaded in the workspace. Compile a report first, then click Refresh.");
      return;
    }
    const freshData = await compileReportData(selectedReportRef.current.meta);
    setSelectedReport(prev => prev ? { ...prev, data: freshData } : null);
  }, []);

  const { isRefreshing, refreshToast, handleRefresh } = useRefresh(handleManualRefreshReport, 'Reports');

  // Delete saved report
  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this saved report from history?')) return;
    // Remove from Supabase (with localStorage fallback inside deleteReportRecord)
    try {
      await deleteReportRecord(reportId);
    } catch (err) {
      console.warn('Report delete error:', err);
    }
    setReportsList(prev => prev.filter(r => r.id !== reportId));
    if (selectedReport && selectedReport.meta.id === reportId) {
      setSelectedReport(null);
    }
  };

  // Export CSV download
  const handleExportCSV = async (report) => {
    let compiled = selectedReport;
    if (!compiled || compiled.meta.id !== report.id) {
      compiled = { meta: report, data: await compileReportData(report) };
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += `SKADOMATION SYSTEM HISTORIAN REPORT - ${report.name.toUpperCase()}\r\n`;
    csvContent += `Generated At: ${report.generatedAt}\r\n`;
    csvContent += `Type: ${report.type || 'Historian Shift Summary'}\r\n`;
    csvContent += `Time Scope: ${report.startDate} to ${report.endDate}\r\n\r\n`;

    csvContent += 'TAG STATS SUMMARY\r\n';
    csvContent += 'TagIndex,TagName,CurrentValue,Unit,Min,Max,Average,SamplesCount,QualityIndex\r\n';
    compiled.data.summaries.forEach(s => {
      csvContent += `${s.tagIndex},"${s.tagName}",${s.count > 0 ? s.current.toFixed(s.decimalPlaces) : '—'},"${s.unit}",${s.count > 0 ? s.min.toFixed(s.decimalPlaces) : '—'},${s.count > 0 ? s.max.toFixed(s.decimalPlaces) : '—'},${s.count > 0 ? s.avg.toFixed(s.decimalPlaces) : '—'},${s.count},${s.goodPct.toFixed(1)}%\r\n`;
    });

    csvContent += '\r\nINCIDENTS LOG\r\n';
    csvContent += 'Timestamp,TagIndex,TagName,Value,Status,Marker\r\n';
    compiled.data.incidents.forEach(inc => {
      csvContent += `"${inc.timestamp}",${inc.tagIndex},"${inc.tagName}",${inc.val},${inc.status},"${inc.marker}"\r\n`;
    });

    csvContent += `\r\nTAG STATISTICAL ANALYSIS\r\n`;
    csvContent += 'TagIndex,TagName,Unit,Min,Max,Average,StdDeviation,Samples,Quality%,FirstSample,LastSample\r\n';
    compiled.data.summaries.forEach(s => {
      const dp = s.decimalPlaces;
      csvContent += `${s.tagIndex},"${s.tagName}","${s.unit || ''}",${s.min != null ? s.min.toFixed(dp) : ''},${s.max != null ? s.max.toFixed(dp) : ''},${s.avg != null ? s.avg.toFixed(dp) : ''},${s.stdDev != null ? s.stdDev.toFixed(dp) : ''},${s.count},${s.goodPct != null ? s.goodPct.toFixed(1) : ''},"${s.firstSampleTime || ''}","${s.lastSampleTime || ''}"\r\n`;
    });

    csvContent += `\r\nRAW HISTORIAN DATA (ALL ${(compiled.data.allRows || compiled.data.rows).length} RECORDS)\r\n`;
    csvContent += 'Timestamp,Millitm,TagIndex,TagName,Value,StatusCode,StatusLabel,Marker\r\n';
    (compiled.data.allRows || compiled.data.rows).forEach(r => {
      const statusLabel = r.Status === 192 ? 'Good' : r.Status === 0 ? 'Bad' : `Status(${r.Status})`;
      csvContent += `"${r.DateAndTime}",${r.Millitm},${r.TagIndex},"${r.TagName || ''}",${r.Val},${r.Status},"${statusLabel}","${r.Marker || ''}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${report.name.replace(/\s+/g, '_')}_compiled.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => window.print();



  const handleDownloadPDF = async () => {
    if (!selectedReport) {
      alert('No report loaded to download.');
      return;
    }
    
    setIsGeneratingReport(true);
    setGenerationProgress(10);
    setGenerationMessage('Initializing client PDF export...');
    setGenerationFormat('pdf');

    try {
      setGenerationProgress(30);
      setGenerationMessage('Capturing report DOM...');
      
      const element = document.getElementById('printable-area');
      if (!element) {
        throw new Error('Report container element #printable-area not found in DOM');
      }

      setGenerationProgress(60);
      setGenerationMessage('Rendering PDF pages...');

      const repDate = (selectedReport.meta.startDate || new Date().toISOString()).substring(0, 10);
      const opt = {
        margin:       [6, 6, 6, 6],
        filename:     `Daily_Production_Report_${repDate}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
        pagebreak:    { mode: ['css', 'legacy'] }
      };

      setGenerationProgress(85);
      setGenerationMessage('Generating document file...');

      await html2pdf().set(opt).from(element).save();

      setGenerationProgress(100);
      setGenerationMessage('Download completed!');
      console.log('[PDF Export] Client-side PDF export succeeded');
    } catch (err) {
      console.error('[PDF Export Error]:', err);
      alert(`PDF Export Failed: ${err.message || err}`);
    } finally {
      setTimeout(() => {
        setIsGeneratingReport(false);
        setGenerationProgress(0);
      }, 400);
    }
  };

  const handleGenerateReport = async (report, format) => {
    if (!report || isGeneratingReport) return;
    setIsGeneratingReport(true);
    setGenerationProgress(0);
    setGenerationMessage('Initializing report generation...');
    setGenerationFormat(format);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const activeTemplate = templatesList.find(t => t.report_type === report.type && t.is_default) ||
                            templatesList.find(t => t.report_type === report.type) ||
                            null;
      const supabase = getSupabaseClient();
      let token = '';
      if (supabase) {
        const sessionRes = await supabase.auth.getSession();
        token = sessionRes.data.session?.access_token || '';
      }

      console.log(`[PDF/Report Export] Starting ${format.toUpperCase()} generation for:`, report.name);

      const response = await fetch('/api/generate-report', {
        method: 'POST',
        signal: controller.signal,
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          format,
          reportMeta: report,
          templateConfig: activeTemplate ? {
            logoText: activeTemplate.logo_text,
            headerColor: activeTemplate.header_color,
            footerText: activeTemplate.footer_text
          } : null
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const processLine = (line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const payload = JSON.parse(trimmed.substring(6));
            if (payload.type === 'progress') {
              console.log(`[PDF/Report Export Progress] ${payload.percent}% - ${payload.message}`);
              setGenerationProgress(payload.percent);
              setGenerationMessage(payload.message);
            } else if (payload.type === 'complete') {
              console.log(`[PDF/Report Export Complete] 100% - Downloading ${payload.fileName}`);
              setGenerationProgress(100);
              setGenerationMessage('Download ready!');
              
              // Decode base64 to Blob
              const byteCharacters = atob(payload.data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: payload.fileType });
              
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.setAttribute('download', payload.fileName);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(url);
            } else if (payload.type === 'error') {
              throw new Error(payload.message);
            }
          } catch (jsonErr) {
            if (trimmed.length > 200) {
              console.warn('NDJSON parse error for payload length:', trimmed.length);
            }
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer && buffer.trim()) {
            processLine(buffer);
            buffer = '';
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line);
        }
      }
    } catch (err) {
      console.error('[PDF/Report Export Error]:', err);
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort ? 'PDF generation timed out after 35s. Please retry.' : (err.message || 'Unknown generation error');
      setGenerationMessage(`Error generating report: ${errMsg}`);
      alert(`Report Generation Failed: ${errMsg}`);
    } finally {
      clearTimeout(timeoutId);
      setTimeout(() => {
        setIsGeneratingReport(false);
      }, 600);
    }
  };

  const filteredRecipients = useMemo(() => {
    const demoEmails = [
      'plantadmin@plant.com',
      'ops-lead@plant.com',
      'maintenance-tech@plant.com',
      'engineer@plant.com',
      'archive@plant.com'
    ];
    return recipientsList.filter(rec => rec && rec.email && !demoEmails.includes(rec.email.toLowerCase().trim()));
  }, [recipientsList]);

  const handleAddEmail = (type) => {
    let emailInput = '';
    let setInput, setEmailList, emailList, setError;
    
    if (type === 'to') {
      emailInput = toInput; setInput = setToInput; setEmailList = setToEmails; emailList = toEmails; setError = setToError;
    } else if (type === 'cc') {
      emailInput = ccInput; setInput = setCcInput; setEmailList = setCcEmails; emailList = ccEmails; setError = setCcError;
    } else {
      emailInput = bccInput; setInput = setBccInput; setEmailList = setBccEmails; emailList = bccEmails; setError = setBccError;
    }

    const clean = emailInput.trim();
    if (!clean) return;

    if (!validateEmail(clean)) {
      setError('Invalid format');
      return;
    }

    if (emailList.includes(clean)) {
      setError('Duplicate email');
      return;
    }

    const newList = [...emailList, clean];
    setEmailList(newList);
    setInput('');
    setError('');

    if (type === 'to') setEmailTo(newList.join(', '));
    else if (type === 'cc') setEmailCc(newList.join(', '));
    else setEmailBcc(newList.join(', '));
  };

  const handleRemoveEmail = (type, email) => {
    let setEmailList, emailList;
    if (type === 'to') {
      setEmailList = setToEmails; emailList = toEmails;
    } else if (type === 'cc') {
      setEmailList = setCcEmails; emailList = ccEmails;
    } else {
      setEmailList = setBccEmails; emailList = bccEmails;
    }

    const newList = emailList.filter(x => x !== email);
    setEmailList(newList);

    if (type === 'to') setEmailTo(newList.join(', '));
    else if (type === 'cc') setEmailCc(newList.join(', '));
    else setEmailBcc(newList.join(', '));
  };

  const handleQuickAdd = (email, type) => {
    let setEmailList, emailList, setError;
    if (type === 'to') {
      setEmailList = setToEmails; emailList = toEmails; setError = setToError;
    } else if (type === 'cc') {
      setEmailList = setCcEmails; emailList = ccEmails; setError = setCcError;
    } else {
      setEmailList = setBccEmails; emailList = bccEmails; setError = setBccError;
    }

    if (emailList.includes(email)) return;

    const newList = [...emailList, email];
    setEmailList(newList);
    setError('');

    if (type === 'to') setEmailTo(newList.join(', '));
    else if (type === 'cc') setEmailCc(newList.join(', '));
    else setEmailBcc(newList.join(', '));
  };

  const handleSaveDefaultRecipients = async () => {
    try {
      const currentSettings = await getSettings({ forceRefresh: true });
      const updated = {
        ...currentSettings,
        emailRecipients: emailTo
      };
      await saveSettings(updated);
      alert('Default recipients successfully saved in Plant Settings.');
    } catch (err) {
      alert(`Failed to save default recipients: ${err.message}`);
    }
  };

  // Email simulation helpers & handlers
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

  const validateEmail = (email) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const handleOpenEmailPrompt = () => {
    if (!selectedReport) return;

    const defaultTemp = templatesList.find(t => t.report_type === selectedReport.meta.type && t.is_default);
    if (defaultTemp) {
      setSelectedTemplateId(defaultTemp.id);
      setEmailSubject(formatTemplateString(defaultTemp.subject, selectedReport.meta, currentPlantId));
      setEmailMessage(formatTemplateString(defaultTemp.email_body, selectedReport.meta, currentPlantId));
    } else {
      setSelectedTemplateId('');
      setEmailSubject(`Skadomation Production Report: ${selectedReport.meta.name}`);
      setEmailMessage(`Dear Team,\n\nPlease find the compiled production report details attached below:\n\nReport Name: ${selectedReport.meta.name}\nReport Type: ${selectedReport.meta.type}\nGenerated At: ${formatTimestampToPlantTime(selectedReport.meta.generatedAt, currentPlantId)}\n\nMonitored Tags: ${selectedReport.meta.tags.length}\nTotal Telemetry Records: ${selectedReport.data.totalRowsCount}\n\nReport compilation completed successfully. Formats: PDF, Excel.`);
    }

    const category = getReportCategory(selectedReport.meta.type);
    const toList = [];
    filteredRecipients.forEach(rec => {
      if (rec.active) {
        const subbedTypes = (rec.report_types || '').split(',').map(x => x.trim()).filter(Boolean);
        if (subbedTypes.includes(category)) {
          toList.push(rec.email);
        }
      }
    });

    if (toList.length === 0) {
      getSettings().then(sett => {
        const demoEmails = [
          'plantadmin@plant.com',
          'ops-lead@plant.com',
          'maintenance-tech@plant.com',
          'engineer@plant.com',
          'archive@plant.com'
        ];
        if (sett && sett.emailRecipients) {
          const defaults = sett.emailRecipients.split(',')
            .map(x => x.trim())
            .filter(x => validateEmail(x) && !demoEmails.includes(x.toLowerCase()));
          setToEmails(defaults);
          setEmailTo(defaults.join(', '));
        } else {
          setToEmails([]);
          setEmailTo('');
        }
      }).catch(() => {
        setToEmails([]);
        setEmailTo('');
      });
    } else {
      setToEmails(toList);
      setEmailTo(toList.join(', '));
    }

    setCcEmails([]);
    setBccEmails([]);
    setEmailCc('');
    setEmailBcc('');

    setToInput('');
    setCcInput('');
    setBccInput('');

    setToError('');
    setCcError('');
    setBccError('');
    setAttachPdf(true);
    setAttachExcel(true);

    setShowEmailPrompt(true);
  };

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    const temp = templatesList.find(t => t.id === templateId);
    if (temp) {
      setEmailSubject(formatTemplateString(temp.subject, selectedReport.meta, currentPlantId));
      setEmailMessage(formatTemplateString(temp.email_body, selectedReport.meta, currentPlantId));
    } else {
      setEmailSubject(`Skadomation Production Report: ${selectedReport.meta.name}`);
      setEmailMessage(`Dear Team,\n\nPlease find the compiled production report details attached below:\n\nReport Name: ${selectedReport.meta.name}\nReport Type: ${selectedReport.meta.type}\nGenerated At: ${formatTimestampToPlantTime(selectedReport.meta.generatedAt, currentPlantId)}\n\nMonitored Tags: ${selectedReport.meta.tags.length}\nTotal Telemetry Records: ${selectedReport.data.totalRowsCount}\n\nReport compilation completed successfully. Formats: PDF, Excel.`);
    }
  };

  const handleEmailReportSubmit = async (e) => {
    e.preventDefault();

    const toEmails = emailTo.split(',').map(x => x.trim()).filter(Boolean);
    const ccEmails = emailCc.split(',').map(x => x.trim()).filter(Boolean);
    const bccEmails = emailBcc.split(',').map(x => x.trim()).filter(Boolean);

    // Validate To field is not empty
    if (toEmails.length === 0) {
      alert("Error: The 'To' field cannot be empty. Please configure or enter a recipient.");
      return;
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidTo = toEmails.filter(x => !emailRegex.test(x));
    const invalidCc = ccEmails.filter(x => !emailRegex.test(x));
    const invalidBcc = bccEmails.filter(x => !emailRegex.test(x));
    const allInvalids = [...invalidTo, ...invalidCc, ...invalidBcc];

    if (allInvalids.length > 0) {
      alert(`Error: The following email addresses are invalid:\n${allInvalids.join('\n')}`);
      return;
    }

    setIsSendingEmail(true);
    try {
      const activeTemplate = templatesList.find(t => t.id === selectedTemplateId);

      const supabase = getSupabaseClient();
      let token = '';
      if (supabase) {
        const sessionRes = await supabase.auth.getSession();
        token = sessionRes.data.session?.access_token || '';
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          smtpConfig: null, 
          templateConfig: activeTemplate ? {
            logoText: activeTemplate.logo_text,
            headerColor: activeTemplate.header_color,
            footerText: activeTemplate.footer_text
          } : null,
          to: toEmails,
          cc: ccEmails,
          bcc: bccEmails,
          subject: emailSubject,
          message: emailMessage,
          reportData: (() => {
            const dataCopy = { ...selectedReport.data };
            delete dataCopy.allRows;
            return { 
              meta: selectedReport.meta, 
              data: dataCopy,
              formatPdf: attachPdf,
              formatExcel: attachExcel
            };
          })()
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to dispatch report email.');
      }

      const recipientSummaryString = [
        toEmails.length > 0 ? `To: ${toEmails.join(', ')}` : '',
        ccEmails.length > 0 ? `CC: ${ccEmails.join(', ')}` : '',
        bccEmails.length > 0 ? `BCC: ${bccEmails.join(', ')}` : ''
      ].filter(Boolean).join(' | ');

      await addEmailLog({
        recipient: recipientSummaryString,
        subject: emailSubject,
        message: `Historian telemetry report compiled. Dispatched to ${toEmails.length + ccEmails.length + bccEmails.length} total recipients.`,
        status: 'SENT'
      });

      setIsSendingEmail(false);
      setShowEmailPrompt(false);
      setEmailSuccessToast(true);
      setTimeout(() => setEmailSuccessToast(false), 4000);
    } catch (err) {
      setIsSendingEmail(false);
      alert(`SMTP Dispatch Failure: ${err.message}`);
    }
  };

  // Sparkline SVG renderer
  const generateReportSparkline = (points) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 80, height = 18;
    const pointsStr = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - 2 - ((val - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return (
      <svg width={width} height={height} style={{ overflow: 'visible', opacity: 0.85 }}>
        <polyline
          fill="none"
          stroke="#475569"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointsStr}
        />
      </svg>
    );
  };

  /* ─── Styles ─── */
  const tabStyle = (active) => ({
    padding: '10px 16px',
    border: 'none',
    background: 'transparent',
    color: active ? 'var(--secondary)' : 'var(--text-muted)',
    fontWeight: active ? 600 : 500,
    borderBottom: active ? '2.5px solid var(--secondary)' : '2.5px solid transparent',
    cursor: 'pointer',
    fontSize: '0.88rem',
    transition: 'all 0.15s ease',
    outline: 'none'
  });

  // Dynamic recipient count memo
  const { toCount, ccCount, bccCount, totalSelectedCount } = useMemo(() => {
    let toC = 0, ccC = 0, bccC = 0;
    Object.values(selectedRecipients).forEach(role => {
      if (role === 'to') toC++;
      if (role === 'cc') ccC++;
      if (role === 'bcc') bccC++;
    });
    customRecipients.forEach(cr => {
      if (cr.type === 'to') toC++;
      if (cr.type === 'cc') ccC++;
      if (cr.type === 'bcc') bccC++;
    });
    return {
      toCount: toC,
      ccCount: ccC,
      bccCount: bccC,
      totalSelectedCount: toC + ccC + bccC
    };
  }, [selectedRecipients, customRecipients]);

  const handleAddCustomRecipient = (e) => {
    e.preventDefault();
    const email = customEmail.trim();
    if (!email) return;
    if (!validateEmail(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    const existsInCustom = customRecipients.some(cr => cr.email.toLowerCase() === email.toLowerCase());
    const existsInDb = Object.keys(selectedRecipients).some(key => key.toLowerCase() === email.toLowerCase() && selectedRecipients[key] !== 'none');
    
    if (existsInCustom || existsInDb) {
      alert('This email address is already added/selected.');
      return;
    }
    
    setCustomRecipients(prev => [...prev, { email, type: customType }]);
    setCustomEmail('');
  };

  const handleRemoveCustomRecipient = (emailToRemove) => {
    setCustomRecipients(prev => prev.filter(cr => cr.email !== emailToRemove));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%', minHeight: 0 }}>

      {/* ── Tabs Navigation Bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '8px', marginBottom: '20px', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setActiveTab('workspace')} style={tabStyle(activeTab === 'workspace')}>
            📊 Report Workspace
          </button>
          <button onClick={() => setActiveTab('history')} style={tabStyle(activeTab === 'history')}>
            📜 Saved Reports
          </button>
        </div>
        <div style={{ paddingBottom: '4px' }}>
          <RefreshButton isRefreshing={isRefreshing} onClick={handleRefresh} toast={refreshToast} id="refresh-btn-reports" />
        </div>
      </div>

      {/* ── Tab Contents ── */}
      <div style={{ flex: 1, minHeight: 0 }} className="no-print-padding">

        {/* TAB 1: Report Workspace */}
        {activeTab === 'workspace' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>

            {/* Panel 1: Top Input parameters */}
            <div className="card" style={{ padding: '16px 20px' }} data-testid="top-parameters">
              <span className="section-label">Report Parameters</span>
              <form onSubmit={handleGenerate} className="reports-form-grid">
                {/* Column 1: Title & Type */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className="form-label" htmlFor="rep-title">Report Title</label>
                    <input
                      id="rep-title"
                      className="form-control"
                      placeholder="Automatic title if left empty"
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      style={{ height: '36px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className="form-label" htmlFor="rep-type">Report Type</label>
                    <select
                      id="rep-type"
                      className="form-control"
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      style={{ height: '36px' }}
                    >
                      <option value="Historian Shift Summary">Historian Shift Summary</option>
                      <option value="Daily Production Report">Daily Production Report</option>
                    </select>
                  </div>
                </div>

                {/* Column 2: Date presets & pickers */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Week']].map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => applyPreset(k)}
                        className="btn btn-secondary btn-sm"
                        style={{ height: '24px', fontSize: '0.7rem', padding: '0 8px', borderRadius: '12px' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <label className="form-label" style={{ fontSize: '0.72rem' }} htmlFor="rep-start">Start Time</label>
                      <input
                        id="rep-start"
                        type="datetime-local"
                        className="form-control"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        style={{ height: '36px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <label className="form-label" style={{ fontSize: '0.72rem' }} htmlFor="rep-end">End Time</label>
                      <input
                        id="rep-end"
                        type="datetime-local"
                        className="form-control"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        style={{ height: '36px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Column 3: Tag selector list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">Equipment Selection</label>
                    <button
                      type="button"
                      onClick={handleSelectAllToggle}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.7rem', height: '20px', padding: '0 4px', color: 'var(--secondary)' }}
                    >
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div style={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-raised)',
                    padding: '6px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    {eligibleReportTags.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        No report-configured tags found
                      </span>
                    ) : (
                      eligibleReportTags.map(t => {
                        const checked = selectedReportTags.includes(t.TagIndex);
                        return (
                          <label key={t.TagIndex} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem', color: checked ? 'var(--text)' : 'var(--text-muted)' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleFormTagToggle(t.TagIndex)}
                              style={{ accentColor: 'var(--secondary)', width: '13px', height: '13px' }}
                            />
                            {t.TagName}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 4: Compile Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isGenerating}
                    style={{ height: '36px', padding: '0 16px', minWidth: '135px' }}
                  >
                    {isGenerating ? 'Compiling...' : '⚡ Compile Report'}
                  </button>
                </div>
              </form>
            </div>

            {/* Panel 2: Middle preview sheet */}
            <div style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
              {!selectedReport ? (
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center', background: 'var(--surface)' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    backgroundColor: 'rgba(0, 240, 255, 0.05)',
                    border: '1px dashed rgba(0, 240, 255, 0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '16px', color: 'var(--text-dim)'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', color: 'var(--text)' }}>No Compiled Report Loaded</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.83rem', maxWidth: '340px', lineHeight: 1.5 }}>
                    Define your date range boundaries, select the process tags checklist above, and click compile to view the generated document sheet.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  
                  {/* Document Sheet container (Scrollable) */}
                  <div
                    id="printable-area"
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                      padding: '32px 40px',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--shadow-md)',
                      border: '1px solid #E2E8F0',
                      fontFamily: 'var(--sans)'
                    }}
                  >
                    {/* Document Header */}
                    <div style={{ borderBottom: `2.5px solid ${activeTemplate?.header_color || '#0F172A'}`, paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        {activeTemplate?.logo_text ? (
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: activeTemplate.header_color || '#2563EB', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                            {activeTemplate.logo_text}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                            Skadomation System
                          </div>
                        )}
                        <h2 style={{ fontSize: '1.25rem', margin: '0 0 4px', color: '#0F172A', fontWeight: 800 }}>
                          {selectedReport.meta.name}
                        </h2>
                        <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0 }}>
                          <strong>Reporting Period:</strong>{' '}
                          {formatTimestampToPlantTime(selectedReport.meta.startDate, currentPlantId)} &mdash;{' '}
                          {formatTimestampToPlantTime(selectedReport.meta.endDate, currentPlantId)}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#475569', fontFamily: 'monospace', lineHeight: 1.6 }}>
                        <div><strong>Report ID:</strong> {selectedReport.meta.id}</div>
                        <div><strong>Generated At:</strong> {selectedReport.meta.generatedAt}</div>
                        <div><strong>Scope Tags:</strong> {selectedReport.meta.tags.length} Mapped</div>
                      </div>
                    </div>

                    {/* Report Data Body */}
                    {selectedReport.meta.type === 'Daily Production Report' ? (
                      <DailyProductionSummaryView report={selectedReport} />
                    ) : selectedReport.meta.type === 'Daily Production Account' ? (
                      <DailyProductionAccountView data={selectedReport.data.dailyProductionAccount} />
                    ) : selectedReport.data.totalRowsCount === 0 ? (
                      <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748B' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
                        <h4 style={{ fontSize: '0.92rem', margin: '0 0 4px', color: '#0F172A', fontWeight: 700 }}>No telemetry records available.</h4>
                        <p style={{ fontSize: '0.8rem', margin: 0 }}>No historian logs matched these parameters in the selected window.</p>
                      </div>
                    ) : (
                      <>
                        {/* ── EXECUTIVE KPI DASHBOARD ── */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '10px', borderBottom: '2px solid #1E3A5F', paddingBottom: '4px' }}>
                          SECTION 1 &mdash; Executive KPI Dashboard
                        </h4>
                        {(() => {
                          const summaries = selectedReport.data.summaries || [];
                          const totalRowsCount = selectedReport.data.totalRowsCount || 0;
                          const daysInRange = selectedReport.data.daysInRange || 1;
                          const rawRows = selectedReport.data.rows || [];

                          // Helper to find tag index dynamically by name
                          const findTagIdx = (name) => {
                            const cleanTarget = name.toLowerCase().trim();
                            const match = summaries.find(s => {
                              const sName = (s.tagName || s.display_name || '').toLowerCase().trim();
                              return sName === cleanTarget;
                            });
                            return match ? match.tagIndex : null;
                          };

                          const feedRateIdx = findTagIdx("Total Input Feed");
                          const lumpRateIdx = findTagIdx("Lump Out");
                          const finesRateIdx = findTagIdx("Fines Out");

                          const feedShiftIdx = findTagIdx("Total Feed Input Per Shift");
                          
                          // Calculate KPIs dynamically using the unified Historian KPI Service
                          const kpisResult = calculateExecutiveKPIs(rawRows, summaries, 'UTC', null);
                           
                          const totalFeed = kpisResult.totalFeed;
                          const lumpProd = kpisResult.lumpProd;
                          const finesProd = kpisResult.finesProd;
                          const runtimeHours = kpisResult.runtimeHours;
                          const downtimeHours = kpisResult.downtimeHours;
                          const availability = kpisResult.availability;
                          const latestTs = kpisResult.latestTs;

                          // Stats mapping wrapper for UI compatibility
                          const feedRateStats = {
                            current: kpisResult.currentFeedRate,
                            avg: kpisResult.avgFeedRate,
                            max: kpisResult.maxFeedRate,
                            min: kpisResult.minFeedRate
                          };
                          const lumpRateStats = { avg: lumpProd / (daysInRange * 24) };
                          const finesRateStats = { avg: finesProd / (daysInRange * 24) };

                          const pt = selectedReport.data.productionTonnes || {
                             dayShiftRow: { day: { total: 0, lump: 0, fines: 0 } },
                             nightShiftRow: { night: { total: 0, lump: 0, fines: 0 } },
                             dailyTotalRow: { total: { total: 0, lump: 0, fines: 0 } }
                           };

                           const latestFeedShiftDay = pt.dayShiftRow?.day?.total || 0;
                           const latestFeedShiftNight = pt.nightShiftRow?.night?.total || 0;

                           const latestLumpShiftDay = pt.dayShiftRow?.day?.lump || 0;
                           const latestLumpShiftNight = pt.nightShiftRow?.night?.lump || 0;

                           const latestFinesShiftDay = pt.dayShiftRow?.day?.fines || 0;
                           const latestFinesShiftNight = pt.nightShiftRow?.night?.fines || 0;

                          // Formatters
                          const formatVal = (val, suffix = '', decimals = 0) => {
                            if (val === null || val === undefined || isNaN(val)) return 'No Historian Data';
                            return `${Number(val.toFixed(decimals)).toLocaleString()} ${suffix}`;
                          };

                          const executiveKpis = [
                            {
                              name: "Today's Total Feed",
                              value: formatVal(totalFeed, 'T', 0),
                              desc: "Total feed processed during the reporting period."
                            },
                            {
                              name: "Total Feed (Day Shift)",
                              value: formatVal(latestFeedShiftDay && latestFeedShiftDay > 0 ? latestFeedShiftDay : (feedRateStats && feedRateStats.avg ? feedRateStats.avg * 10 : 0), 'T', 0),
                              desc: "Total feed processed during the Day Shift."
                            },
                            {
                              name: "Total Feed (Night Shift)",
                              value: formatVal(latestFeedShiftNight && latestFeedShiftNight > 0 ? latestFeedShiftNight : (feedRateStats && feedRateStats.avg ? feedRateStats.avg * 10 : 0), 'T', 0),
                              desc: "Total feed processed during the Night Shift."
                            },
                            {
                              name: "Today's Lump Production",
                              value: formatVal(lumpProd, 'T', 0),
                              desc: "Total lump ore produced during the reporting period."
                            },
                            {
                              name: "Total Lump (Day Shift)",
                              value: formatVal(latestLumpShiftDay && latestLumpShiftDay > 0 ? latestLumpShiftDay : (lumpRateStats && lumpRateStats.avg ? lumpRateStats.avg * 10 : 0), 'T', 0),
                              desc: "Total lump ore produced during the Day Shift."
                            },
                            {
                              name: "Total Lump (Night Shift)",
                              value: formatVal(latestLumpShiftNight && latestLumpShiftNight > 0 ? latestLumpShiftNight : (lumpRateStats && lumpRateStats.avg ? lumpRateStats.avg * 10 : 0), 'T', 0),
                              desc: "Total lump ore produced during the Night Shift."
                            },
                            {
                              name: "Today's Fines Production",
                              value: formatVal(finesProd, 'T', 0),
                              desc: "Total fines produced during the reporting period."
                            },
                            {
                              name: "Total Fines (Day Shift)",
                              value: formatVal(latestFinesShiftDay && latestFinesShiftDay > 0 ? latestFinesShiftDay : (finesRateStats && finesRateStats.avg ? finesRateStats.avg * 10 : 0), 'T', 0),
                              desc: "Total fines produced during the Day Shift."
                            },
                            {
                              name: "Total Fines (Night Shift)",
                              value: formatVal(latestFinesShiftNight && latestFinesShiftNight > 0 ? latestFinesShiftNight : (finesRateStats && finesRateStats.avg ? finesRateStats.avg * 10 : 0), 'T', 0),
                              desc: "Total fines produced during the Night Shift."
                            },
                            {
                              name: "Current Feed Rate",
                              value: feedRateStats ? formatVal(feedRateStats.current, 'TPH', 1) : 'No Historian Data',
                              desc: "Latest recorded feed rate from the historian."
                            },
                            {
                              name: "Average Feed Rate",
                              value: feedRateStats ? formatVal(feedRateStats.avg, 'TPH', 1) : 'No Historian Data',
                              desc: "Average feed rate calculated from all historian samples."
                            },
                            {
                              name: "Maximum Feed Rate",
                              value: feedRateStats ? formatVal(feedRateStats.max, 'TPH', 1) : 'No Historian Data',
                              desc: "Highest recorded feed rate during the reporting period."
                            },
                            {
                              name: "Minimum Feed Rate",
                              value: feedRateStats ? formatVal(feedRateStats.min, 'TPH', 1) : 'No Historian Data',
                              desc: "Lowest recorded feed rate during the reporting period."
                            },
                            {
                              name: "Total Runtime",
                              value: formatVal(runtimeHours, 'Hours', 1),
                              desc: "Total plant operating runtime during the reporting period."
                            },
                            {
                              name: "Total Downtime",
                              value: formatVal(downtimeHours, 'Hours', 1),
                              desc: "Total plant downtime hours recorded."
                            },
                            {
                              name: "Plant Availability",
                              value: formatVal(availability, '%', 1),
                              desc: "Percentage of time the plant was operational and available."
                            },
                            {
                              name: "Total Historian Samples",
                              value: formatVal(totalRowsCount, 'Samples', 0),
                              desc: "Total count of telemetry samples logged."
                            },
                            {
                              name: "Last Telemetry Received",
                              value: latestTs ? formatTimestampToPlantTime(latestTs, currentPlantId) : 'No Historian Data',
                              desc: "Latest historian timestamp processed."
                            }
                          ];

                          return (
                            <div className="reports-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                              {executiveKpis.map((k, i) => (
                                <div key={i} style={{ background: '#F0F4FA', border: `1px solid #D2DFEC`, borderLeft: `4px solid #1E3A5F`, borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                  <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#4B5563', letterSpacing: '0.06em' }}>{k.name}</div>
                                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E3A5F' }}>{k.value}</div>
                                  <div style={{ fontSize: '0.6rem', color: '#6B7280', fontStyle: 'italic', borderTop: '1px dashed #D2DFEC', paddingTop: '4px', marginTop: '2px' }}>{k.desc}</div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* ── EXECUTIVE SUMMARY KPI CARDS ── */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '10px', borderBottom: '2px solid #1E3A5F', paddingBottom: '4px' }}>
                          Executive Summary
                        </h4>
                        <div className="reports-stats-grid">
                          {[
                            { label: 'Total Records', value: selectedReport.data.totalRowsCount.toLocaleString(), color: '#1E40AF' },
                            { label: 'Total Tags', value: String(selectedReport.data.summaries.filter(s => selectedReport.meta.tags.includes(s.tagIndex)).length), color: '#065F46' },
                            { label: 'Avg / Day', value: (selectedReport.data.avgRecordsPerDay || 0).toLocaleString(), color: '#7C3AED' },
                            { label: 'Period (Days)', value: String(selectedReport.data.daysInRange || '—'), color: '#92400E' },
                          ].map((kpi) => (
                            <div key={kpi.label} style={{ background: '#F8FAFC', border: `1px solid #E2E8F0`, borderTop: `3px solid ${kpi.color}`, borderRadius: '6px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.06em', marginBottom: '4px' }}>{kpi.label}</div>
                              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* ── EQUIPMENT SUMMARY TABLE ── */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '8px', borderBottom: '2px solid #1E3A5F', paddingBottom: '4px' }}>
                          Equipment Summary Table
                        </h4>
                        <table className="table responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', marginBottom: '24px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#1E3A5F', color: '#FFFFFF' }}>
                              {['Idx', 'Equipment Name', 'Unit', 'Min', 'Max', 'Average', 'Last Value', 'Total (t)', 'Records', 'Quality', 'Trend'].map(h => (
                                <th key={h} style={{ padding: '7px 8px', textAlign: ['Min', 'Max', 'Average', 'Last Value', 'Total (t)', 'Records'].includes(h) ? 'right' : 'left', fontWeight: 700, fontSize: '0.68rem' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedReport.data.summaries.filter(s => selectedReport.meta.tags.includes(s.tagIndex)).map((s, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', background: idx % 2 === 0 ? '#FFFFFF' : '#F0F4FA' }}>
                                <td data-label="Idx" style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.68rem' }}>{s.tagIndex}</td>
                                <td data-label="Equipment Name" style={{ padding: '6px 8px', fontWeight: 600 }}>{s.tagName}</td>
                                <td data-label="Unit" style={{ padding: '6px 8px', color: '#64748B' }}>{s.unit || '—'}</td>
                                <td data-label="Min" style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{s.min != null ? s.min.toFixed(s.decimalPlaces) : '—'}</td>
                                <td data-label="Max" style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{s.max != null ? s.max.toFixed(s.decimalPlaces) : '—'}</td>
                                <td data-label="Average" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{s.avg != null ? s.avg.toFixed(s.decimalPlaces) : '—'}</td>
                                <td data-label="Last Value" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1E3A5F' }}>{s.current != null ? s.current.toFixed(s.decimalPlaces) : '—'}</td>
                                <td data-label="Total (t)" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#0F172A' }}>
                                  {(() => {
                                    const unitClean = (s.unit || '').toLowerCase().trim();
                                    const isRate = unitClean === 'tph' || unitClean === 't/h' || unitClean === 't/hr' || unitClean === 'tons/hr';
                                    const hours = (selectedReport.data.daysInRange || 1) * 24;
                                    return isRate && s.avg != null ? (s.avg * hours).toFixed(1) : '—';
                                  })()}
                                </td>
                                <td data-label="Records" style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{s.count.toLocaleString()}</td>
                                <td data-label="Quality" style={{ padding: '6px 8px', fontWeight: 700, color: s.goodPct != null && s.goodPct > 98 ? '#16A34A' : '#D97706' }}>{s.goodPct != null ? s.goodPct.toFixed(1) + '%' : '—'}</td>
                                <td data-label="Trend" style={{ padding: '2px 8px', textAlign: 'center' }}>{generateReportSparkline(s.sparkPoints)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* ── STATISTICAL ANALYSIS ── */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '10px', borderBottom: '2px solid #1E3A5F', paddingBottom: '4px' }}>
                          Statistical Analysis
                        </h4>
                        <div style={{ marginBottom: '24px' }}>
                          {selectedReport.data.summaries.filter(s => selectedReport.meta.tags.includes(s.tagIndex)).map((s, si) => (
                            <div key={si} style={{ marginBottom: '12px', border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                              <div style={{ background: '#3B82F6', color: '#FFFFFF', padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700 }}>
                                T{s.tagIndex} &mdash; {s.tagName} {s.unit ? `[${s.unit}]` : ''}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: si % 2 === 0 ? '#F8FAFC' : '#FFFFFF' }}>
                                {[
                                  ['Minimum', s.min != null ? s.min.toFixed(s.decimalPlaces) : '—'],
                                  ['Maximum', s.max != null ? s.max.toFixed(s.decimalPlaces) : '—'],
                                  ['Average', s.avg != null ? s.avg.toFixed(s.decimalPlaces) : '—'],
                                  ['Std Deviation', s.stdDev != null ? s.stdDev.toFixed(s.decimalPlaces) : '—'],
                                  ['Total Samples', s.count.toLocaleString()],
                                  ['Quality Index', s.goodPct != null ? s.goodPct.toFixed(1) + '%' : '—'],
                                  ['First Sample', s.firstSampleTime ? formatTimestampToPlantTime(s.firstSampleTime, currentPlantId) : '—'],
                                  ['Last Sample', s.lastSampleTime ? formatTimestampToPlantTime(s.lastSampleTime, currentPlantId) : '—'],
                                ].map(([label, val], ii) => (
                                  <div key={ii} style={{ padding: '8px 12px', borderRight: ii % 4 !== 3 ? '1px solid #E2E8F0' : 'none', borderTop: ii >= 4 ? '1px solid #E2E8F0' : 'none' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{val}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ── INCIDENTS LOG ── */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '8px', borderBottom: '2px solid #1E3A5F', paddingBottom: '4px' }}>
                          Quality &amp; Fault Events
                        </h4>
                        {selectedReport.data.incidents.length === 0 ? (
                          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '6px', padding: '10px 14px', fontSize: '0.76rem', color: '#15803D', marginBottom: '24px' }}>
                            ✅ Zero anomalies or system failures recorded in this reporting range.
                          </div>
                        ) : (
                          <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', marginBottom: '24px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#1E3A5F', color: '#FFFFFF' }}>
                                {['Timestamp', 'Tag Reference', 'Value', 'Quality Status', 'Event Flag'].map(h => (
                                  <th key={h} style={{ padding: '7px 8px', textAlign: h === 'Value' ? 'right' : 'left', fontWeight: 700, fontSize: '0.68rem' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedReport.data.incidents.filter(inc => selectedReport.meta.tags.includes(inc.tagIndex)).map((inc, iIdx) => (
                                <tr key={iIdx} style={{ borderBottom: '1px solid #E2E8F0', background: iIdx % 2 === 0 ? '#FFFFFF' : '#FEF9F1' }}>
                                  <td data-label="Timestamp" style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: '0.68rem' }}>{formatTimestampToPlantTime(inc.timestamp, currentPlantId)}</td>
                                  <td data-label="Tag Reference" style={{ padding: '5px 8px' }}>T{inc.tagIndex}: {inc.tagName}</td>
                                  <td data-label="Value" style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{inc.val}</td>
                                  <td data-label="Quality Status" style={{ padding: '5px 8px', color: inc.status === 192 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                                    {inc.status === 192 ? 'Good' : `Bad (${inc.status})`}
                                  </td>
                                  <td data-label="Event Flag" style={{ padding: '5px 8px' }}>
                                    <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '0.65rem' }}>
                                      {inc.marker}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* ── RAW HISTORIAN DATA APPENDIX ── */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '8px', borderBottom: '2px solid #1E3A5F', paddingBottom: '4px' }}>
                          Raw Historian Data Appendix{' '}
                          {(() => {
                             const filteredRows = selectedReport.data.rows.filter(row => selectedReport.meta.tags.includes(row.TagIndex));
                             return (
                               <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#64748B', fontSize: '0.68rem' }}>
                                 ({filteredRows.length.toLocaleString()} records shown{selectedReport.data.totalRowsCount > 10000 ? ` of ${selectedReport.data.totalRowsCount.toLocaleString()} total — full dataset in Excel export` : ''})
                               </span>
                             );
                           })()}
                        </h4>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '6px' }} className="no-scroll-print">
                          <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#1E3A5F' }}>
                              <tr>
                                {['DateAndTime', 'Idx', 'Equipment Name', 'Value', 'Status', 'Marker'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Value' ? 'right' : 'left', color: '#FFFFFF', fontWeight: 700, fontSize: '0.66rem' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedReport.data.rows.filter(row => selectedReport.meta.tags.includes(row.TagIndex)).map((row, rIdx) => {
                                const cfg = tagMap[row.TagIndex] || { TagName: row.TagName || `Tag ${row.TagIndex}`, DecimalPlaces: 2 };
                                const statusGood = row.Status === 192;
                                return (
                                  <tr key={rIdx} style={{ borderBottom: '1px solid #F1F5F9', background: rIdx % 2 === 0 ? '#FFFFFF' : '#F0F4FA' }}>
                                    <td data-label="DateAndTime" style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '0.66rem' }}>{formatTimestampToPlantTime(row.DateAndTime, currentPlantId)}</td>
                                    <td data-label="Idx" style={{ padding: '4px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#1E3A5F' }}>{row.TagIndex}</td>
                                    <td data-label="Equipment Name" style={{ padding: '4px 8px' }}>{row.TagName || cfg.TagName}</td>
                                    <td data-label="Value" style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{row.Val != null ? Number(row.Val).toFixed(cfg.DecimalPlaces) : '—'}</td>
                                    <td data-label="Status" style={{ padding: '4px 8px', color: statusGood ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                                      {statusGood ? 'Good' : `Bad(${row.Status})`}
                                    </td>
                                    <td data-label="Marker" style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#64748B' }}>{row.Marker || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {/* Document Footer */}
                    <div style={{ marginTop: '36px', paddingTop: '10px', borderTop: `1.5px solid ${activeTemplate?.header_color || '#0F172A'}`, textAlign: 'center', fontSize: '0.67rem', color: '#64748B' }}>
                      {activeTemplate?.footer_text || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.'}
                    </div>
                  </div>

                  {/* Panel 3: Bottom Action buttons */}
                  <div className="card" style={{ marginTop: '16px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--text)' }}>{selectedReport.meta.name}</strong>
                      <span style={{ marginLeft: '12px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--secondary)', border: '1px solid rgba(0, 240, 255, 0.15)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                        {selectedReport.data.totalRowsCount.toLocaleString()} records · {selectedReport.data.summaries.length} tags
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', minWidth: '380px' }}>
                      <button onClick={handleDownloadPDF} className="btn btn-secondary" style={{ fontSize: '0.8rem', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} disabled={isGeneratingReport}>
                        📥 Export PDF
                      </button>
                      <button onClick={() => handleGenerateReport(selectedReport.meta, 'xlsx')} className="btn btn-secondary" style={{ fontSize: '0.8rem', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} disabled={isGeneratingReport}>
                        📊 Export Excel (Full)
                      </button>
                      {!isReadOnly && (
                        <button onClick={handleOpenEmailPrompt} className="btn btn-primary" style={{ fontSize: '0.8rem', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          ✉️ Email Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Saved Reports list */}
        {activeTab === 'history' && (
          <div className="card" style={{ padding: '24px' }}>
            <span className="section-label">Report Compilation History</span>
            <div className="table-responsive">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Report Name</th>
                    <th>Report Type</th>
                    <th>Date boundary scope</th>
                    <th>Compiled Timestamp</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsList.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                        No saved production reports compiled yet.
                      </td>
                    </tr>
                  ) : (
                    reportsList.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Report Name" className="font-semibold" style={{ color: 'var(--text)' }}>{item.name}</td>
                        <td data-label="Report Type" style={{ fontSize: '0.82rem' }}>{item.type || 'Historian Shift Summary'}</td>
                        <td data-label="Date boundary scope" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.dateInfo}</td>
                        <td data-label="Compiled Timestamp" className="font-mono text-xs">{item.generatedAt}</td>
                        <td data-label="Actions" style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button onClick={() => handleViewReport(item)} className="btn btn-secondary btn-sm">
                              👁️ View Workspace
                            </button>
                            <button onClick={() => handleGenerateReport(item, 'xlsx')} className="btn btn-secondary btn-sm" disabled={isGeneratingReport}>
                              📊 Excel
                            </button>
                            {!isReadOnly && (
                              <button onClick={() => handleDeleteReport(item.id)} className="btn btn-danger btn-sm">
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3 Settings panel removed in favor of Settings Module redesign */}

      </div>

      {/* ── Email dispatch simulation dialog ── */}
      {showEmailPrompt && selectedReport && (
        <div className="modal-overlay" style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(5, 8, 17, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ maxWidth: '580px', width: '95%', padding: '24px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 10px', color: 'var(--text)' }}>Email Historian Report</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.4 }}>
              Compose and send the compiled production report <strong>{selectedReport.meta.name}</strong> to the plant operations team.
            </p>
            <div style={{ marginBottom: '16px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <h4 style={{ fontSize: '0.85rem', margin: '0 0 10px', color: 'var(--text)' }}>Manage Recipients</h4>
              
              {/* To Recipients */}
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>To Recipients:</span>
                  {toError && <span style={{ color: 'var(--error)', fontSize: '0.72rem' }}>{toError}</span>}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {toEmails.map(email => (
                    <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60A5FA', padding: '2px 8px', borderRadius: '12px', fontSize: '0.74rem' }}>
                      {email}
                      <button type="button" onClick={() => handleRemoveEmail('to', email)} style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}>×</button>
                    </span>
                  ))}
                  {toEmails.length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No To recipients.</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Add To email..."
                    value={toInput}
                    onChange={e => { setToInput(e.target.value); setToError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail('to'); } }}
                    style={{ height: '30px', fontSize: '0.8rem', flex: 1 }}
                  />
                  <button type="button" onClick={() => handleAddEmail('to')} className="btn btn-secondary" style={{ height: '30px', padding: '0 10px', fontSize: '0.76rem' }}>Add</button>
                </div>
              </div>

              {/* CC Recipients */}
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>CC Recipients:</span>
                  {ccError && <span style={{ color: 'var(--error)', fontSize: '0.72rem' }}>{ccError}</span>}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {ccEmails.map(email => (
                    <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.74rem' }}>
                      {email}
                      <button type="button" onClick={() => handleRemoveEmail('cc', email)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}>×</button>
                    </span>
                  ))}
                  {ccEmails.length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No CC recipients.</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Add CC email..."
                    value={ccInput}
                    onChange={e => { setCcInput(e.target.value); setCcError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail('cc'); } }}
                    style={{ height: '30px', fontSize: '0.8rem', flex: 1 }}
                  />
                  <button type="button" onClick={() => handleAddEmail('cc')} className="btn btn-secondary" style={{ height: '30px', padding: '0 10px', fontSize: '0.76rem' }}>Add</button>
                </div>
              </div>

              {/* BCC Recipients */}
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>BCC Recipients:</span>
                  {bccError && <span style={{ color: 'var(--error)', fontSize: '0.72rem' }}>{bccError}</span>}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {bccEmails.map(email => (
                    <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.74rem' }}>
                      {email}
                      <button type="button" onClick={() => handleRemoveEmail('bcc', email)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}>×</button>
                    </span>
                  ))}
                  {bccEmails.length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No BCC recipients.</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Add BCC email..."
                    value={bccInput}
                    onChange={e => { setBccInput(e.target.value); setBccError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail('bcc'); } }}
                    style={{ height: '30px', fontSize: '0.8rem', flex: 1 }}
                  />
                  <button type="button" onClick={() => handleAddEmail('bcc')} className="btn btn-secondary" style={{ height: '30px', padding: '0 10px', fontSize: '0.76rem' }}>Add</button>
                </div>
              </div>

              {/* Configured Plant Recipients list (Quick Add) */}
              <div style={{ marginTop: '12px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '10px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Quick Add Configured Recipients:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                  {filteredRecipients.map(rec => (
                    <div key={rec.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text)' }}>
                        <strong>{rec.name || 'Site User'}</strong> ({rec.email})
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => handleQuickAdd(rec.email, 'to')} className="btn" style={{ fontSize: '0.64rem', padding: '2px 6px', height: '20px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.2)' }}>+To</button>
                        <button type="button" onClick={() => handleQuickAdd(rec.email, 'cc')} className="btn" style={{ fontSize: '0.64rem', padding: '2px 6px', height: '20px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid var(--border-subtle)' }}>+CC</button>
                        <button type="button" onClick={() => handleQuickAdd(rec.email, 'bcc')} className="btn" style={{ fontSize: '0.64rem', padding: '2px 6px', height: '20px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid var(--border-subtle)' }}>+BCC</button>
                      </div>
                    </div>
                  ))}
                  {filteredRecipients.length === 0 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active plant-configured recipients. Configure them in Settings.</span>
                  )}
                </div>
              </div>

              {/* Save Defaults Button */}
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={handleSaveDefaultRecipients} className="btn btn-secondary" style={{ fontSize: '0.74rem', height: '28px', padding: '0 10px' }}>
                  💾 Save current list as default
                </button>
              </div>
            </div>

            {/* Select Template dropdown */}
            <div style={{ marginBottom: '14px' }} className="form-group">
              <label className="form-label" htmlFor="select-template">Select Email Template</label>
              <select
                id="select-template"
                className="form-control"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{ height: '36px', fontSize: '0.82rem' }}
              >
                <option value="">-- System Default --</option>
                {templatesList.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_default ? '(Default)' : ''} ({t.report_type})
                  </option>
                ))}
              </select>
            </div>

            {/* Email Subject input */}
            <div style={{ marginBottom: '14px' }} className="form-group">
              <label className="form-label" htmlFor="email-subject">Email Subject</label>
              <input
                id="email-subject"
                className="form-control"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={{ height: '36px', fontSize: '0.82rem' }}
              />
            </div>

            {/* Email Message input */}
            <div style={{ marginBottom: '14px' }} className="form-group">
              <label className="form-label" htmlFor="email-message">Email Body Message</label>
              <textarea
                id="email-message"
                className="form-control"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                style={{ minHeight: '80px', fontSize: '0.82rem', lineHeight: 1.5 }}
              />
            </div>

            {/* Attachment toggles */}
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Report Attachments</label>
              <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem', color: 'var(--text)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={attachPdf} onChange={e => setAttachPdf(e.target.checked)} style={{ cursor: 'pointer' }} />
                  Attach PDF Report
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={attachExcel} onChange={e => setAttachExcel(e.target.checked)} style={{ cursor: 'pointer' }} />
                  Attach Excel (Full)
                </label>
              </div>
            </div>

            {/* Live Attachment Previews */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '18px', fontSize: '0.74rem' }}>
              <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Attachments Preview:</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {attachPdf && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)' }}>
                    <span>📄</span> {selectedReport.meta.name}.pdf (~45 KB)
                  </div>
                )}
                {attachExcel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)' }}>
                    <span>📊</span> {selectedReport.meta.name}.xlsx (~12 KB)
                  </div>
                )}
                {!attachPdf && !attachExcel && (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No attachments configured (Email body summary only)</span>
                )}
              </div>
            </div>

            {/* Dispatch Confirmation Card */}
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', padding: '12px 14px', marginBottom: '20px', fontSize: '0.74rem', textAlign: 'left' }}>
              <strong style={{ color: '#60A5FA', display: 'block', marginBottom: '6px' }}>✉️ Dispatch Summary Confirmation:</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)' }}>
                <div><strong>To:</strong> {emailTo || <span style={{ color: 'var(--error)' }}>Empty</span>}</div>
                {emailCc && <div><strong>CC:</strong> {emailCc}</div>}
                {emailBcc && <div><strong>BCC:</strong> {emailBcc}</div>}
                <div><strong>Subject:</strong> {emailSubject}</div>
                <div><strong>Attachments:</strong> {[attachPdf ? 'PDF' : '', attachExcel ? 'Excel' : ''].filter(Boolean).join(', ') || 'None'}</div>
              </div>
            </div>

            <form onSubmit={handleEmailReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowEmailPrompt(false)} className="btn btn-secondary flex-1" style={{ height: '36px' }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={isSendingEmail} style={{ height: '36px' }}>
                  {isSendingEmail ? 'Dispatching...' : '✉️ Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Success Toast Notification ── */}
      {emailSuccessToast && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: '28px',
          backgroundColor: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 20px',
          color: 'var(--success)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Production report emailed successfully.</span>
          <style>{`
            @keyframes slideIn {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* ── Report Compiler spinner ── */}
      {isReportCompiling && (
        <div className="modal-overlay" style={{ zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(5, 8, 17, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: '24px', textAlign: 'center', maxWidth: '300px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '3px solid rgba(0, 240, 255, 0.1)',
              borderTopColor: 'var(--secondary)',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px'
            }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              COMPILING HISTORIAN RECORDS…
            </span>
          </div>
        </div>
      )}
      {/* ── Server-Side Report Generation Progress Modal ── */}
      {isGeneratingReport && (
        <div className="modal-overlay" style={{ zIndex: 99999, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(5, 8, 17, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: '32px', textAlign: 'center', width: '420px', maxWidth: '95%', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid #1E2D4A' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Generating Industrial Report
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Format: <strong style={{ color: 'var(--secondary)' }}>{generationFormat.toUpperCase()}</strong>
            </p>
            
            {/* Spinning Indicator */}
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              border: '3px solid rgba(59, 130, 246, 0.1)',
              borderTopColor: 'var(--secondary)',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }} />

            {/* Progress Bar */}
            <div style={{ background: '#1E293B', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '12px', border: '1px solid #334155' }}>
              <div style={{
                background: 'linear-gradient(90deg, #3B82F6 0%, #10B981 100%)',
                height: '100%',
                width: `${generationProgress}%`,
                transition: 'width 0.4s ease-out',
                boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)'
              }} />
            </div>

            {/* Percentage Indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                STATUS LOG
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace' }}>
                {generationProgress}%
              </span>
            </div>

            {/* Status Message */}
            <div style={{
              background: '#0D1526', border: '1px solid #1E2D4A', borderRadius: '6px',
              padding: '10px 14px', fontSize: '0.72rem', color: '#889FC6',
              fontFamily: 'monospace', minHeight: '38px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', lineHeight: 1.4
            }}>
              {generationMessage}
            </div>
          </div>
        </div>
      )}


      {/* Print styles override */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          body * { visibility: hidden; background-color: white !important; color: #000000 !important; }
          #printable-area, #printable-area * { visibility: visible; }
          #printable-area {
            position: absolute; left: 0; top: 0;
            width: 100%; height: auto; overflow: visible !important;
            box-shadow: none !important; border: none !important; padding: 0 !important;
          }
          .no-print { display: none !important; }
          .no-scroll-print { max-height: none !important; overflow: visible !important; }
        }
      `}</style>

    </div>
  );
}
