// src/components/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getTagConfigs, getSettings, saveTagConfigs, getSampleStationAssignments, writeSampleStationDatalogRow, getSampleStationDatalog } from '../utils/db';
import { getSupabaseClient } from '../utils/supabaseClient';
import { getLatestRecord, getRecordsInRange, getTotalCount } from '../utils/historianService';
import { useSimulator } from '../utils/SimulatorContext';
import { formatTimestampToPlantTime, formatTimeToPlantTime, calculateTelemetryStats } from '../utils/timeService';
import { useRefresh } from '../utils/useRefresh';
import RefreshButton from './RefreshButton';

// Robust tag index equality — handles both numeric (0) and string ("T0") formats
function tagIndexMatch(a, b) {
  if (a === b) return true;
  const norm = v => {
    const s = String(v).trim();
    if (/^[Tt](\d+)$/.test(s)) return parseInt(s.substring(1), 10);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    return s;
  };
  return norm(a) === norm(b);
}

function tagIndexIncluded(tagIdx, list) {
  if (!Array.isArray(list)) return false;
  return list.some(item => tagIndexMatch(tagIdx, item));
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a78bfa'];

// ─── Micro Sparkline ──────────────────────────────────────────────────────────
function Sparkline({ points, color }) {
  if (!points || points.length < 2) return null;
  const W = 110, H = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - 2 - ((v - min) / range) * (H - 6);
      return `${x},${y}`;
    })
    .join(' ');

  // Area fill path
  const first = points[0];
  const x0 = 0, xN = W;
  const y0 = H - 2 - ((first - min) / range) * (H - 6);
  const areaPath = `M ${x0},${y0} ` + points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - 2 - ((v - min) / range) * (H - 6);
      return `L ${x},${y}`;
    })
    .join(' ') + ` L ${xN},${H} L ${x0},${H} Z`;

  return (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-fill-${color.replace('#', '')})`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ kpi, accentColor, plantId }) {
  const [valClass, setValClass] = useState('');
  const prevValRef = useRef(kpi.currentValue);

  useEffect(() => {
    if (kpi.currentValue !== prevValRef.current) {
      setValClass('fade-updating');
      const timer = setTimeout(() => {
        setValClass('');
      }, 400);
      prevValRef.current = kpi.currentValue;
      return () => clearTimeout(timer);
    }
  }, [kpi.currentValue]);

  const formattedVal = kpi.currentValue !== null && kpi.currentValue !== undefined
    ? kpi.currentValue.toFixed(kpi.decimalPlaces)
    : '—';

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '20px 22px',
        borderLeft: `5px solid ${kpi.currentValue !== null ? accentColor : 'var(--warning)'}`,
        position: 'relative',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.2s ease'
      }}
    >
      {/* Glow effect */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: `radial-gradient(ellipse at 0% 0%, ${accentColor}0c 0%, transparent 65%)`,
        pointerEvents: 'none'
      }} />

      {/* Header Row: Name + Live indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <strong
            title={kpi.tagName}
            style={{ fontSize: '0.96rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}
          >
            {kpi.tagName}
          </strong>
        </div>

        {/* Live Indicator */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px',
          borderRadius: '20px',
          backgroundColor: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          fontSize: '0.62rem',
          fontWeight: 700,
          color: 'var(--success)',
          flexShrink: 0
        }}>
          <span className="pulse-green-dot" style={{ width: '5px', height: '5px' }} />
          LIVE
        </span>
      </div>

      {/* Middle row: Current Value + Unit + Trend Arrow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
          <span className={`font-mono ${valClass}`} style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1, display: 'inline-block' }}>
            {formattedVal}
          </span>
          {kpi.unit && (
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontWeight: 600 }}>
              {kpi.unit}
            </span>
          )}
        </div>

        {/* Trend Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }}>
          {kpi.trend === 'up' && (
            <span style={{ color: 'var(--success)', fontSize: '1.2rem', fontWeight: 'bold' }} title="Trending Up">↑</span>
          )}
          {kpi.trend === 'down' && (
            <span style={{ color: 'var(--error)', fontSize: '1.2rem', fontWeight: 'bold' }} title="Trending Down">↓</span>
          )}
          {kpi.trend === 'stable' && (
            <span style={{ color: 'var(--text-dim)', fontSize: '1.2rem', fontWeight: 'bold' }} title="Stable">→</span>
          )}
        </div>
      </div>

      {/* Sparkline visualization */}
      {kpi.sparkPoints && kpi.sparkPoints.length >= 2 && (
        <div style={{ margin: '8px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <Sparkline points={kpi.sparkPoints} color={accentColor} />
        </div>
      )}

      {/* Statistics Grid (Min, Max, Avg, Records) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '4px',
        backgroundColor: 'var(--surface-raised)',
        padding: '8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        textAlign: 'center',
        marginTop: '6px'
      }}>
        <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Min</div>
          <div className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.minVal !== null ? kpi.minVal.toFixed(kpi.decimalPlaces) : '—'}
          </div>
        </div>
        <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Max</div>
          <div className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.maxVal !== null ? kpi.maxVal.toFixed(kpi.decimalPlaces) : '—'}
          </div>
        </div>
        <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Avg</div>
          <div className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.avgVal !== null ? kpi.avgVal.toFixed(kpi.decimalPlaces) : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Recs</div>
          <div className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.recordCount !== undefined ? kpi.recordCount : 0}
          </div>
        </div>
      </div>

      {/* Footer: Last Update time */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.7rem',
        color: 'var(--text-dim)',
        marginTop: '4px',
        paddingTop: '8px',
        borderTop: '1px dashed var(--border-subtle)'
      }}>
        <span>Last Data Sync:</span>
        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
          {kpi.lastTimestamp ? formatTimestampToPlantTime(kpi.lastTimestamp, plantId) : 'Never'}
        </span>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onNavigate }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '80px 24px', textAlign: 'center', gap: '16px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)'
    }}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="16" fill="rgba(0,240,255,0.06)" />
        <rect x="10" y="42" width="8" height="12" rx="2" fill="rgba(0,240,255,0.25)" />
        <rect x="22" y="30" width="8" height="24" rx="2" fill="rgba(0,240,255,0.4)" />
        <rect x="34" y="20" width="8" height="34" rx="2" fill="rgba(0,240,255,0.6)" />
        <rect x="46" y="10" width="8" height="44" rx="2" fill="rgba(0,240,255,0.85)" />
        <polyline
          points="14,38 26,24 38,16 50,8"
          fill="none"
          stroke="#00F0FF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />
      </svg>
      <div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
          No Dashboard Tags Configured
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '380px' }}>
          Select tags to monitor in Tag Configuration and enable Dashboard visibility on them.
        </p>
      </div>
      <button
        onClick={() => onNavigate && onNavigate('tagConfig')}
        className="btn btn-primary"
      >
        Configure Tags
      </button>
    </div>
  );
}

// ─── SavingSpinner ────────────────────────────────────────────────────────────
const SavingSpinner = () => (
  <svg className="animate-spin" style={{ width: '12px', height: '12px', color: 'currentColor', display: 'inline-block' }} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const getNowTime = () => Date.now();

const formatToReadableDateTime = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) {
      const m = String(ts).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
      if (m) return `${m[1]} ${m[2]}`;
      return String(ts);
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return String(ts);
  }
};

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export default function Dashboard({ onNavigate, isActive }) {
  const { refreshTrigger, dbConnectionStatus, currentPlantId, chartStart, chartEnd } = useSimulator();

  // ── State ────────────────────────────────────────────────────────────────
  const [tagConfigs, setTagConfigs]           = useState([]);
  const [historianRecords, setHistorianRecords] = useState([]);  // time-window records for stats
  const [latestRecords, setLatestRecords]     = useState({});    // { tagIndex -> latest row } always newest
  const [loading, setLoading]                 = useState(true);
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);
  const [latestIngestionTime, setLatestIngestionTime] = useState(null);
  const [selectedKpis, setSelectedKpis] = useState([]);
  // Sample Station: single-row config + persisted datalog rows
  const [ssAssignments, setSsAssignments] = useState({});
  const [sampleDatalogRows, setSampleDatalogRows] = useState([]);

  // ── Fetch data ───────────────────────────────────────────────────────────
  const loadInitialConfig = useCallback(async () => {
    if (!isActive) return;
    try {
      const configs = await getTagConfigs({ forceRefresh: true });
      const settings = await getSettings();

      // Migrate old dashboardTags if any
      const oldKpiIndexes = settings?.dashboardTags || [];
      let migratedAny = false;
      const migratedConfigs = configs.map(t => {
        if (oldKpiIndexes.includes(t.TagIndex) && !t.DashboardKPI && !t.DashboardVisible) {
          migratedAny = true;
          return { ...t, DashboardKPI: true, DashboardVisible: true };
        }
        return t;
      });

      if (migratedAny) {
        console.log("[Dashboard Migration] Migrating old dashboard KPI settings...");
        await saveTagConfigs(migratedConfigs);
      }

      const finalConfigs = migratedAny ? migratedConfigs : configs;
      setTagConfigs(finalConfigs);

      // Load sample station assignments (single-row config) and datalog rows
      const [assignmentData, datalogData] = await Promise.all([
        getSampleStationAssignments(),
        getSampleStationDatalog(15)
      ]);
      setSsAssignments(assignmentData || {});
      setSampleDatalogRows(datalogData || []);
    } catch (e) {
      console.error("Failed to load initial dashboard config:", e);
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!isActive) return;
    // Wait for config to load first to avoid querying empty indexes
    if (tagConfigs.length === 0) {
      await loadInitialConfig();
      return;
    }
    try {
      const settings = await getSettings();

      // Filter dashboard tags directly by dashboard_enabled
      const dashboardTags = tagConfigs.filter(c => c.dashboard_enabled === true);
      const dashboardTagIndexes = dashboardTags.map(c => c.TagIndex);

      const tableTags = tagConfigs.filter(c => {
        const cat = c.ReportCategory || 'Custom';
        return cat === 'Input / Feed Data' || cat === 'Feed' || cat === 'Input' ||
               cat === 'Output / Production Data' || cat === 'Production' || cat === 'Output';
      });
      const tableTagIndexes = tableTags.map(c => c.TagIndex);

      const downtimeTagsList = tagConfigs.filter(c => c.downtime_datalog_enabled === true || c.DowntimeDatalog === true);
      const downtimeTagIndexes = downtimeTagsList.map(c => c.TagIndex);

      const sampleStationTagIndexes = [];
      Object.values(ssAssignments || {}).forEach(list => {
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (item.TagIndex !== undefined && item.TagIndex !== null) {
              sampleStationTagIndexes.push(Number(item.TagIndex));
            }
          });
        }
      });

      const allQueryTagIndexes = [...new Set([
        ...dashboardTagIndexes,
        ...tableTagIndexes,
        ...downtimeTagIndexes,
        ...sampleStationTagIndexes
      ])];

      // Fetch latest record per tag individually
      const supabase = getSupabaseClient();
      const tableName = settings?.selectedTable || 'Database';
      const newLatestRecords = {};
      let globalLatestTime = null;
      let globalTotalCount = 0;

      if (supabase && allQueryTagIndexes.length > 0) {
        globalTotalCount = await getTotalCount(supabase, tableName);

        const mappings = settings?.columnMappings || {};
        const isAlarmInt = settings?.selectedTable === 'Database';

        for (const tagIdx of allQueryTagIndexes) {
          try {
            const latestRow = await getLatestRecord(supabase, tableName, tagIdx, mappings, isAlarmInt, settings);
            
            // Debug logging for downtime tags as requested
            if (downtimeTagIndexes.includes(tagIdx)) {
              console.log(`[Downtime Data Debug]
  - Enabled TagIndex: ${tagIdx}
  - Query executed: "getLatestRecord" on Table: "${tableName}"
  - Latest Row Returned: ${latestRow ? JSON.stringify(latestRow) : 'NONE'}
  - Value: ${latestRow ? latestRow.Val : 'N/A'}
  - DateAndTime: ${latestRow ? latestRow.DateAndTime : 'N/A'}
  - Tag Name: ${tagConfigs.find(c => c.TagIndex === tagIdx)?.TagName || 'Unknown'}`);
            }

            if (latestRow) {
              newLatestRecords[tagIdx] = latestRow;
              if (latestRow.DateAndTime) {
                const rowTime = new Date(latestRow.DateAndTime);
                if (!globalLatestTime || rowTime > globalLatestTime) {
                  globalLatestTime = rowTime;
                }
              }
            }
          } catch (e) {
            console.warn(`Failed to fetch latest record for tag index ${tagIdx}:`, e);
          }
        }
      }

      setLatestRecords(newLatestRecords);
      setLatestIngestionTime(globalLatestTime);
      setTotalRecordsCount(globalTotalCount);

      // ── Query B: Time-window records for Min/Max/Avg/Sparkline ──
      const mappings = settings?.columnMappings || {};
      const isAlarmInt = settings?.selectedTable === 'Database';
      const windowData = allQueryTagIndexes.length > 0 ? await getRecordsInRange(
        supabase,
        tableName,
        allQueryTagIndexes,
        chartStart,
        chartEnd,
        mappings,
        'asc',
        isAlarmInt,
        settings
      ) : [];

      console.log(`[Dashboard Window Query Audit]
  - Start Date: "${chartStart}"
  - End Date: "${chartEnd}"
  - Row Count: ${windowData.length}`);

      setHistorianRecords(windowData);

      // ── Query C: Fetch and resolve Sample Station datalog rows from real historian database dynamically ──
      try {
        const resolvedRows = [];
        const isConnected = getSupabaseConfig() !== null;
        console.info('[Sample Station Pipeline Debug] isConnected:', isConnected, 'ssAssignments:', ssAssignments);

        if (isConnected && supabase && ssAssignments) {
          const tc = ssAssignments.tag_circuits || {};
          const circuits = ['lump', 'fines'];

          for (const circuit of circuits) {
            // Find configured Sample Tags for this circuit
            const sampleTags = (ssAssignments.sample_tag || []).filter(t => (tc[String(t.TagIndex)] || t.Circuit) === circuit);
            console.info(`[Sample Station Pipeline Debug] Circuit: ${circuit}, Configured Sample Tags:`, sampleTags);
            if (sampleTags.length === 0) continue;

            const shiftTags = (ssAssignments.shift_id_tag || []).filter(t => (tc[String(t.TagIndex)] || t.Circuit) === circuit);
            const cumTags = (ssAssignments.cumulative_tag || []).filter(t => (tc[String(t.TagIndex)] || t.Circuit) === circuit);
            const stockTags = (ssAssignments.stockpile_tag || []).filter(t => (tc[String(t.TagIndex)] || t.Circuit) === circuit);

            const allCircuitTagIndexes = [...new Set([
              ...sampleTags.flatMap(t => [Number(t.TagIndex), String(t.TagIndex)]),
              ...shiftTags.flatMap(t => [Number(t.TagIndex), String(t.TagIndex)]),
              ...cumTags.flatMap(t => [Number(t.TagIndex), String(t.TagIndex)]),
              ...stockTags.flatMap(t => [Number(t.TagIndex), String(t.TagIndex)])
            ])].filter(idx => idx !== null && idx !== undefined && idx !== '');

            console.info(`[Sample Station Pipeline Debug] Circuit: ${circuit}, allCircuitTagIndexes:`, allCircuitTagIndexes);
            if (allCircuitTagIndexes.length === 0) continue;

            // Fetch latest raw records for all configured tags in this circuit
            const rawRows = await getRawRows(
              supabase,
              tableName,
              allCircuitTagIndexes,
              null,
              null,
              500,
              'desc',
              mappings,
              isAlarmInt,
              settings
            );

            console.info(`[Sample Station Pipeline Debug] Circuit: ${circuit}, rawRows length:`, rawRows ? rawRows.length : 0);
            if (!rawRows || rawRows.length === 0) continue;

            // Group non-sample tags by tag index for quick lookup
            const tagRecordsMap = {};
            rawRows.forEach(row => {
              const idx = Number(row.TagIndex);
              if (!tagRecordsMap[idx]) tagRecordsMap[idx] = [];
              tagRecordsMap[idx].push(row);
            });

            // Filter out sample records
            const sampleTagIndexes = sampleTags.map(t => Number(t.TagIndex));
            const sampleRecords = rawRows.filter(row => sampleTagIndexes.includes(Number(row.TagIndex)));
            console.info(`[Sample Station Pipeline Debug] Circuit: ${circuit}, sampleRecords count:`, sampleRecords.length);

            // For each sample record, build a dashboard row
            sampleRecords.forEach(sampleRec => {
              const tSample = new Date(sampleRec.DateAndTime).getTime();
              if (isNaN(tSample)) return;

              // Resolve Shift ID: find latest record for any shiftTags before or at tSample
              let resolvedShiftId = '—';
              let bestShiftTime = 0;
              shiftTags.forEach(st => {
                const recs = tagRecordsMap[Number(st.TagIndex)] || [];
                recs.forEach(r => {
                  const tRow = new Date(r.DateAndTime).getTime();
                  if (tRow <= tSample && tRow > bestShiftTime) {
                    resolvedShiftId = r.Val;
                    bestShiftTime = tRow;
                  }
                });
              });

              // Resolve Shift Cumulative Tonnes
              let resolvedCumTonnes = null;
              let bestCumTime = 0;
              cumTags.forEach(ct => {
                const recs = tagRecordsMap[Number(ct.TagIndex)] || [];
                recs.forEach(r => {
                  const tRow = new Date(r.DateAndTime).getTime();
                  if (tRow <= tSample && tRow > bestCumTime) {
                    const parsed = parseFloat(r.Val);
                    resolvedCumTonnes = isNaN(parsed) ? null : parsed;
                    bestCumTime = tRow;
                  }
                });
              });

              // Resolve Stockpile Tonnes
              let resolvedStockpile = null;
              let bestStockTime = 0;
              stockTags.forEach(spt => {
                const recs = tagRecordsMap[Number(spt.TagIndex)] || [];
                recs.forEach(r => {
                  const tRow = new Date(r.DateAndTime).getTime();
                  if (tRow <= tSample && tRow > bestStockTime) {
                    const parsed = parseFloat(r.Val);
                    resolvedStockpile = isNaN(parsed) ? null : parsed;
                    bestStockTime = tRow;
                  }
                });
              });

              // Find Equipment Name: TagName of sample tag
              const eqConfig = tagConfigs.find(c => Number(c.TagIndex) === Number(sampleRec.TagIndex));
              const equipmentName = eqConfig ? eqConfig.TagName : (sampleRec.TagName || `Tag #${sampleRec.TagIndex}`);

              resolvedRows.push({
                timestamp: sampleRec.DateAndTime,
                tagName: equipmentName,
                shift_id: resolvedShiftId,
                shift_cumulative_tonnes: resolvedCumTonnes,
                stockpile_tonnes: resolvedStockpile,
                material: circuit, // 'lump' or 'fines'
                decimalPlaces: 2
              });
            });
          }
        }

        // Sort all resolved rows by timestamp desc and take latest 30
        resolvedRows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        console.info('[Sample Station Pipeline Debug] Final resolvedRows count:', resolvedRows.length);
        setSampleDatalogRows(resolvedRows.slice(0, 30));
      } catch (e) {
        console.warn("[Dashboard] Failed to fetch and resolve sample station datalog rows dynamically:", e);
      }

    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      throw err; // propagate to useRefresh error handler
    } finally {
      setLoading(false);
    }
  }, [tagConfigs, chartStart, chartEnd, loadInitialConfig, ssAssignments]);

  const handleManualRefreshDashboard = useCallback(async () => {
    await loadInitialConfig();
    await loadDashboardData();
  }, [loadInitialConfig, loadDashboardData]);

  const { isRefreshing, refreshToast, handleRefresh } = useRefresh(handleManualRefreshDashboard, 'Dashboard');

  // Trigger initial config fetch on mount
  useEffect(() => {
    if (isActive) {
      loadInitialConfig().catch(() => {});
    }
  }, [loadInitialConfig, isActive]);

  // Handle periodic updates and refreshTrigger polling
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        loadDashboardData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [loadDashboardData, refreshTrigger, isActive]);

  // ── Active Tags Count ─────────────────────────────────────────────────────
  const activeTagsCount = useMemo(() => {
    const now = getNowTime();
    const activeIndexes = new Set();
    historianRecords.forEach(r => {
      const recTime = new Date(r.DateAndTime).getTime();
      if ((now - recTime) / 1000 <= 60) {
        activeIndexes.add(r.TagIndex);
      }
    });
    return activeIndexes.size;
  }, [historianRecords]);


  // ── dashboardTags (visible tag indexes) ───────────────────────────────────
  const dashboardTagIndexes = useMemo(() => {
    return tagConfigs.filter(c => c.dashboard_enabled === true).map(c => c.TagIndex);
  }, [tagConfigs]);

  // ── KPI Data ──────────────────────────────────────────────────────────────
  // Current Value, Last Ingested, Status → from latestRecords (newest row ever, no time window)
  // Min, Max, Avg, Sparkline, Count → from historianRecords (time-window records)
  // Shows any tag that has Dashboard Display enabled.
  const kpiData = useMemo(() => {
    return tagConfigs
      .filter(c => c.dashboard_enabled === true && c.active_status === true)
      .map(tag => {
        // Time-window stats (min/max/avg/sparkline) — may be empty if no records in window
        const stats = calculateTelemetryStats(historianRecords, tag.TagIndex);

        // Latest record — always the single newest row regardless of time window
        const latestRow = latestRecords[tag.TagIndex] || null;
        const currentValue = latestRow ? latestRow.Val : stats.current;
        const lastTimestamp = latestRow ? latestRow.DateAndTime : stats.lastTimestamp;
        const latestStatus = latestRow ? latestRow.Status : (
          historianRecords
            .filter(r => tagIndexMatch(r.TagIndex, tag.TagIndex))
            .sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime))[0]?.Status ?? null
        );

        return {
          tagIndex: tag.TagIndex,
          tagName: tag.TagName,
          unit: tag.Unit || '',
          decimalPlaces: tag.DecimalPlaces ?? 2,
          currentValue,
          lastTimestamp,
          status: latestStatus,
          minVal: stats.min,
          maxVal: stats.max,
          avgVal: stats.avg,
          trend: stats.trend,
          sparkPoints: stats.sparkPoints,
          recordCount: stats.count
        };
      });
  }, [tagConfigs, historianRecords, latestRecords]);


  // ── Tables Data ───────────────────────────────────────────────────────────
  const tableData = useMemo(() => {
    return tagConfigs.map(tag => {
      const stats = calculateTelemetryStats(historianRecords, tag.TagIndex);
      const latestRow = latestRecords[tag.TagIndex] || null;
      const currentValue = latestRow ? latestRow.Val : stats.current;
      const lastTimestamp = latestRow ? latestRow.DateAndTime : stats.lastTimestamp;
      const latestStatus = latestRow ? latestRow.Status : (
        historianRecords
          .filter(r => tagIndexMatch(r.TagIndex, tag.TagIndex))
          .sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime))[0]?.Status ?? null
      );
      return {
        tagIndex: tag.TagIndex,
        tagName: tag.TagName,
        unit: tag.Unit || '',
        decimalPlaces: tag.DecimalPlaces ?? 2,
        currentValue,
        lastTimestamp,
        status: latestStatus,
        minVal: stats.min,
        maxVal: stats.max,
        avgVal: stats.avg,
        trend: stats.trend,
        reportCategory: tag.ReportCategory || 'Custom',
        activeStatus: tag.ActiveStatus ?? true,
        sampleDatalog: tag.sample_datalog_enabled === true || tag.SampleDatalog === true,
        downtimeDatalog: tag.downtime_datalog_enabled === true || tag.DowntimeDatalog === true,
        sampleColumn: tag.sample_station_column || tag.SampleColumn || ''
      };
    });

  }, [tagConfigs, historianRecords, latestRecords]);

  // Helper to normalize the exact requested Sample Station Column options to row property keys
  const normalizeColKey = (col) => {
    if (!col) return '';
    const c = col.trim();
    if (c === 'Shift ID' || c === 'shift_id' || c === 'ShiftID') return 'ShiftID';
    if (c === 'Shift Cumulative Tonnes' || c === 'shift_cumulative_tonnes' || c === 'ShiftCumulativeTonnes') return 'ShiftCumulativeTonnes';
    if (c === 'Stockpile Tonnes' || c === 'stockpile_tonnes' || c === 'StockpileTonnes') return 'StockpileTonnes';
    if (c === 'FingerID' || c === 'finger_id') return 'FingerID';
    if (c === 'CutID' || c === 'cut_id') return 'CutID';
    if (c === 'Material' || c === 'material') return 'Material';
    if (c === 'Datetime' || c === 'datetime') return 'datetime';
    return c;
  };

  // Sample Station Datalog: derived from sampleDatalogRows (which loads from database table sample_station_datalog)
  const sampleRows = useMemo(() => {
    return sampleDatalogRows;
  }, [sampleDatalogRows]);

  const getRowMaterialType = (row) => {
    if (row.material) return row.material.toLowerCase();
    const name = (row.tagName || '').toLowerCase();
    if (name.includes('lump')) return 'lump';
    if (name.includes('fines')) return 'fines';
    return 'lump'; // default fallback
  };

  const lumpRows = useMemo(() => {
    return sampleRows.filter(r => getRowMaterialType(r) === 'lump');
  }, [sampleRows]);

  const finesRows = useMemo(() => {
    return sampleRows.filter(r => getRowMaterialType(r) === 'fines');
  }, [sampleRows]);

  const hasLumpMappings = useMemo(() => {
    const tc = ssAssignments.tag_circuits || {};
    const hasCircuitMap = Object.keys(tc).some(tagIdx => tc[tagIdx] === 'lump');
    const hasSampleTag = (ssAssignments.sample_tag || []).some(t => (tc[String(t.TagIndex)] || t.Circuit) === 'lump');
    return hasCircuitMap || hasSampleTag;
  }, [ssAssignments]);

  const hasFinesMappings = useMemo(() => {
    const tc = ssAssignments.tag_circuits || {};
    const hasCircuitMap = Object.keys(tc).some(tagIdx => tc[tagIdx] === 'fines');
    const hasSampleTag = (ssAssignments.sample_tag || []).some(t => (tc[String(t.TagIndex)] || t.Circuit) === 'fines');
    return hasCircuitMap || hasSampleTag;
  }, [ssAssignments]);

  const sampleMappedCount = useMemo(() => {
    return tableData.filter(t => t.activeStatus !== false && t.sampleDatalog).length;
  }, [tableData]);

  const sampleDatalogTags = useMemo(() => {
    return tableData.filter(t => t.activeStatus !== false && t.sampleDatalog);
  }, [tableData]);

  const downtimeTags = useMemo(() => {
    return tableData.filter(t => t.activeStatus !== false && t.downtimeDatalog);
  }, [tableData]);



  const formattedVal = (val, dp) => {
    if (val === null || val === undefined || val === '') return '—';
    if (isNaN(val)) return val; // Render string values as is (e.g., Shift ID text)
    return Number(val).toFixed(dp ?? 2);
  };

  const getTodayCutsCount = (rows) => {
    const today = new Date().toDateString();
    return rows.filter(r => r.timestamp && new Date(r.timestamp).toDateString() === today).length;
  };

  const renderKpiCards = (latestRow, allRows, accentColor) => {
    const kpis = [
      { label: 'Shift ID', val: latestRow.shift_id !== null && latestRow.shift_id !== undefined ? Number(latestRow.shift_id).toFixed(0) : '—' },
      { label: 'Shift Cum. Tonnes', val: latestRow.shift_cumulative_tonnes !== null && latestRow.shift_cumulative_tonnes !== undefined ? `${Number(latestRow.shift_cumulative_tonnes).toFixed(1)} T` : '—' },
      { label: 'Stockpile Tonnes', val: latestRow.stockpile_tonnes !== null && latestRow.stockpile_tonnes !== undefined ? `${Number(latestRow.stockpile_tonnes).toFixed(1)} T` : '—' },
      { label: 'Last Sample Time', val: latestRow.timestamp ? new Date(latestRow.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' },
      { label: "Today's Cuts", val: getTodayCutsCount(allRows) }
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        {kpis.map((k, idx) => (
          <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #D9E2EC', borderRadius: '6px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', borderTop: `3px solid ${accentColor}` }}>
            <span style={{ fontSize: '0.58rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</span>
            <span style={{ fontSize: '0.88rem', color: '#1F2937', fontWeight: 800 }}>{k.val}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderEmptyState = (materialName) => {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: '#F8FAFC', border: '1px dashed #D9E2EC', borderRadius: '6px', margin: '8px' }}>
        <span style={{ fontSize: '2rem' }}>📋</span>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1F2937' }}>
          No {materialName} Sample Station configured.
        </div>
        <div style={{ fontSize: '0.74rem', color: '#6B7280', maxWidth: '280px', margin: '0 auto', lineHeight: '1.4' }}>
          Configure historian tags from Sample Station Assignment.
        </div>
      </div>
    );
  };

  const renderWaitingState = (materialName) => {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: '#F8FAFC', border: '1px dashed #D9E2EC', borderRadius: '6px', margin: '8px' }}>
        <span style={{ fontSize: '1.8rem', animation: 'spin 4s linear infinite', display: 'inline-block' }}>⏳</span>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1F2937' }}>
          Waiting for historian data...
        </div>
        <div style={{ fontSize: '0.74rem', color: '#6B7280', maxWidth: '280px', margin: '0 auto', lineHeight: '1.4' }}>
          No {materialName} historian records generated yet. Waiting for simulator telemetry update.
        </div>
      </div>
    );
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        /* ── Modern Premium Industrial Datalog Tables ─────────────────────────────── */
        .datalog-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 28px;
          margin-bottom: 24px;
        }
        @media (max-width: 1100px) {
          .datalog-section {
            grid-template-columns: 1fr;
          }
        }
        .datalog-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          min-width: 0;
          box-shadow: var(--shadow-sm);
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .datalog-panel:hover {
          box-shadow: var(--shadow-md);
          border-color: rgba(59,130,246,0.25);
        }
        .datalog-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: linear-gradient(90deg, #1E3A5F 0%, #112240 100%);
          border-bottom: 1px solid var(--border-subtle);
        }
        .datalog-panel-title {
          font-family: var(--sans);
          font-size: 0.85rem;
          font-weight: 700;
          color: #FFFFFF;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .datalog-panel-count {
          font-family: var(--sans);
          font-size: 0.72rem;
          color: #93C5FD;
          font-weight: 600;
        }
        .datalog-table-wrapper {
          overflow-x: auto;
          overflow-y: auto;
          max-height: 380px;
          background: var(--surface);
        }
        .datalog-table {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--sans);
          font-size: 0.8rem;
        }
        .datalog-table thead tr {
          background: var(--surface-raised);
        }
        .datalog-table th {
          padding: 12px 14px;
          font-family: var(--sans);
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          border-bottom: 2px solid var(--border-subtle);
          text-align: left;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--surface-raised);
        }
        .datalog-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text);
          font-family: var(--sans);
          font-size: 0.8rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle;
          background: var(--surface);
          transition: background 0.1s ease;
        }
        .datalog-table tbody tr:nth-child(even) td {
          background: #F8FAFC;
        }
        .datalog-table tbody tr:hover td {
          background: var(--accent-dim);
        }
        .datalog-table tbody tr:last-child td {
          border-bottom: none;
        }
        .datalog-val {
          font-weight: 600;
          color: var(--text);
        }
        .datalog-val-alarm {
          font-weight: 700;
          color: var(--error);
        }
        .datalog-empty td {
          text-align: center;
          padding: 32px 0;
          color: var(--text-dim);
          font-style: italic;
          font-size: 0.8rem;
          background: var(--surface-raised);
          border: none;
        }

        /* SCADA Badges */
        .scada-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          font-size: 0.62rem;
          font-weight: 700;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .scada-badge-green {
          background-color: rgba(16, 185, 129, 0.12);
          color: #16A34A;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .scada-badge-blue {
          background-color: rgba(59, 130, 246, 0.12);
          color: #2563EB;
          border: 1px solid rgba(59, 130, 246, 0.25);
        }
        .scada-badge-orange {
          background-color: rgba(245, 158, 11, 0.12);
          color: #D97706;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }
        .scada-badge-red {
          background-color: rgba(239, 68, 68, 0.12);
          color: #DC2626;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        /* SCADA Layouts & Tables */
        .scada-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
          gap: 24px;
          margin-bottom: 24px;
        }
        .scada-table-container {
          background: #FFFFFF;
          border: 1px solid #D9E2EC;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .scada-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.72rem;
          text-align: left;
        }
        .scada-table th {
          padding: 8px 12px;
          background: #F1F5F9;
          color: #1F2937;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border-bottom: 1px solid #D9E2EC;
          border-right: 1px solid #D9E2EC;
        }
        .scada-table th:last-child {
          border-right: none;
        }
        .scada-table td {
          padding: 8px 12px;
          border-bottom: 1px solid #D9E2EC;
          border-right: 1px solid #D9E2EC;
          color: #1F2937;
          transition: background 0.1s ease;
        }
        .scada-table td:last-child {
          border-right: none;
        }
        .scada-table tbody tr:nth-child(even) td {
          background: #F8FAFC;
        }
        .scada-table tbody tr:hover td {
          background: #F1F5F9;
        }
      `}</style>

      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div className="page-header-title">
          <span className="section-label">Historian</span>
          <h2>Production Data</h2>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      {dashboardTagIndexes.length === 0 ? (
        <EmptyState onNavigate={onNavigate} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '24px'
        }}>
          {kpiData.map((kpi, idx) => (
            <KpiCard
              key={kpi.tagIndex}
              kpi={kpi}
              accentColor={ACCENT_COLORS[idx % ACCENT_COLORS.length]}
              plantId={currentPlantId}
            />
          ))}
        </div>
      )}

      {/* ── Sample Station Dashboard Redesign (SCADA Modern Light Industrial Style) ── */}
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1F2937', marginTop: '28px', marginBottom: '24px' }}>
        
        {/* Clean Dashboard Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #D9E2EC' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1F2937', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
              Sample Station Data
            </h1>
          </div>
        </div>


        {/* 2-Column Responsive SCADA Grid */}
        <div className="scada-grid">
          
          {/* LUMP SAMPLE STATION PANEL */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #D9E2EC', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column' }}>
            
            {/* Lump Header Bar */}
            <div style={{ backgroundColor: '#ECFDF5', color: '#16A34A', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid #D9E2EC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#16A34A' }}>🟢</span> Lump Sample Station
              </span>
              <span style={{ fontSize: '0.62rem', color: '#059669', backgroundColor: 'rgba(22, 163, 74, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                Lump Circuit Tags Only
              </span>
            </div>

            {/* Render KPI Cards if data exists */}
            {lumpRows.length > 0 && renderKpiCards(lumpRows[0] || {}, lumpRows, '#16A34A')}
            
            {/* Always Render Table Structure */}
            <div className="scada-table-container" style={{ overflowX: 'auto', maxHeight: '350px' }}>
              <table className="scada-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Equipment Name</th>
                    <th>Shift ID</th>
                    <th style={{ textAlign: 'center' }}>Shift Cum. Tonnes</th>
                    <th style={{ textAlign: 'center' }}>Stockpile Tonnes</th>
                  </tr>
                </thead>
                <tbody>
                  {!hasLumpMappings ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontStyle: 'italic' }}>
                        No Sample Station equipment configured.
                      </td>
                    </tr>
                  ) : lumpRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontStyle: 'italic' }}>
                        No historian data available.
                      </td>
                    </tr>
                  ) : (
                    lumpRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', whiteSpace: 'nowrap', color: '#475569' }}>
                          {row.timestamp ? formatTimestampToPlantTime(row.timestamp, currentPlantId) : '—'}
                        </td>
                        <td style={{ fontWeight: '600', color: '#1F2937' }}>
                          {row.tagName}
                        </td>
                        <td style={{ color: '#111827', fontWeight: 800 }}>
                          {formattedVal(row.shift_id, 0)}
                        </td>
                        <td style={{ textAlign: 'center', color: '#111827', fontWeight: 800 }}>
                          {formattedVal(row.shift_cumulative_tonnes, 2)}
                        </td>
                        <td style={{ textAlign: 'center', color: '#111827', fontWeight: 800 }}>
                          {formattedVal(row.stockpile_tonnes, 2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* FINES SAMPLE STATION PANEL */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #D9E2EC', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column' }}>
            
            {/* Fines Header Bar */}
            <div style={{ backgroundColor: '#FFFBEB', color: '#F59E0B', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid #D9E2EC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#F59E0B' }}>🟠</span> Fines Sample Station
              </span>
              <span style={{ fontSize: '0.62rem', color: '#D97706', backgroundColor: 'rgba(245, 158, 11, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                Fines Circuit Tags Only
              </span>
            </div>

            {/* Render KPI Cards if data exists */}
            {finesRows.length > 0 && renderKpiCards(finesRows[0] || {}, finesRows, '#F59E0B')}
            
            {/* Always Render Table Structure */}
            <div className="scada-table-container" style={{ overflowX: 'auto', maxHeight: '350px' }}>
              <table className="scada-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Equipment Name</th>
                    <th>Shift ID</th>
                    <th style={{ textAlign: 'center' }}>Shift Cum. Tonnes</th>
                    <th style={{ textAlign: 'center' }}>Stockpile Tonnes</th>
                  </tr>
                </thead>
                <tbody>
                  {!hasFinesMappings ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontStyle: 'italic' }}>
                        No Sample Station equipment configured.
                      </td>
                    </tr>
                  ) : finesRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontStyle: 'italic' }}>
                        No historian data available.
                      </td>
                    </tr>
                  ) : (
                    finesRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', whiteSpace: 'nowrap', color: '#475569' }}>
                          {row.timestamp ? formatTimestampToPlantTime(row.timestamp, currentPlantId) : '—'}
                        </td>
                        <td style={{ fontWeight: '600', color: '#1F2937' }}>
                          {row.tagName}
                        </td>
                        <td style={{ color: '#111827', fontWeight: 800 }}>
                          {formattedVal(row.shift_id, 0)}
                        </td>
                        <td style={{ textAlign: 'center', color: '#111827', fontWeight: 800 }}>
                          {formattedVal(row.shift_cumulative_tonnes, 2)}
                        </td>
                        <td style={{ textAlign: 'center', color: '#111827', fontWeight: 800 }}>
                          {formattedVal(row.stockpile_tonnes, 2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* ── Downtime Datalog ──────────────────────────── */}
        <div className="datalog-panel" style={{ width: '100%', marginTop: '24px' }}>
          <div className="datalog-panel-header" style={{ background: 'linear-gradient(90deg, #4F1F1F 0%, #2E1111 100%)', borderBottom: '1px solid var(--error-border)' }}>
            <span className="datalog-panel-title">⬛ Downtime Datalog</span>
            <span className="datalog-panel-count">{downtimeTags.length} Tag{downtimeTags.length !== 1 ? 's' : ''} Enabled</span>
          </div>
          <div className="datalog-table-wrapper">
            <table className="datalog-table">
              <thead>
                <tr>
                  <th style={{ width: '130px', minWidth: '130px' }}>Timestamp</th>
                  <th style={{ width: '220px', minWidth: '220px' }}>Equipment Name</th>
                  <th style={{ minWidth: '150px' }}>Value (Mins) / Reason</th>
                </tr>
              </thead>
              <tbody>
                {downtimeTags.length === 0 ? (
                  <tr className="datalog-empty">
                    <td colSpan={3}>
                      No tags enabled for Downtime Datalog. Enable tags via Tag Configuration → Downtime Datalog toggle.
                    </td>
                  </tr>
                ) : downtimeTags.every(tag => !tag.lastTimestamp) ? (
                  <tr className="datalog-empty">
                    <td colSpan={3}>No downtime historian records available</td>
                  </tr>
                ) : (
                  downtimeTags.map(tag => {
                    const displayVal = formattedVal(tag.currentValue, tag.decimalPlaces);
                    return (
                      <tr key={tag.tagIndex}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                          {tag.lastTimestamp ? formatTimestampToPlantTime(tag.lastTimestamp, currentPlantId) : '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={tag.tagName}>
                          {tag.tagName}
                        </td>
                        <td className="datalog-val" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                          {displayVal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

