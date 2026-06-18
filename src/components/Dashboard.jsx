// src/components/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getHistorianData, getTagConfigs, getSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

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
function KpiCard({ kpi, accentColor }) {
  const formattedVal = kpi.currentValue !== null && kpi.currentValue !== undefined
    ? kpi.currentValue.toFixed(kpi.decimalPlaces)
    : '—';

  // Status mapping
  let statusBg = 'rgba(59, 130, 246, 0.1)';
  let statusColorText = 'var(--secondary)';
  let statusBorder = '1px solid rgba(59, 130, 246, 0.25)';
  let statusLabelText = 'Uncertain';

  if (kpi.currentValue === null) {
    statusBg = 'rgba(245, 158, 11, 0.1)';
    statusColorText = 'var(--warning)';
    statusBorder = '1px solid rgba(245, 158, 11, 0.25)';
    statusLabelText = 'No Data';
  } else if (kpi.status === 0) {
    statusBg = 'rgba(239, 68, 68, 0.1)';
    statusColorText = 'var(--error)';
    statusBorder = '1px solid rgba(239, 68, 68, 0.25)';
    statusLabelText = 'Bad';
  } else if (kpi.status === 1) {
    statusBg = 'rgba(16, 185, 129, 0.1)';
    statusColorText = 'var(--success)';
    statusBorder = '1px solid rgba(16, 185, 129, 0.25)';
    statusLabelText = 'Good';
  }

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '18px 20px',
        borderLeft: `4px solid ${kpi.currentValue !== null ? (kpi.status === 1 ? 'var(--success)' : 'var(--error)') : 'var(--warning)'}`,
        position: 'relative'
      }}
    >
      {/* Glow effect */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: `radial-gradient(ellipse at 0% 0%, ${accentColor}08 0%, transparent 60%)`,
        pointerEvents: 'none'
      }} />

      {/* Header Row: Name + Index badge + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tag #{kpi.tagIndex}
          </span>
          <strong
            title={kpi.tagName}
            style={{ fontSize: '0.92rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', marginTop: '2px' }}
          >
            {kpi.tagName}
          </strong>
        </div>

        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.68rem',
          fontWeight: 600,
          background: statusBg,
          color: statusColorText,
          border: statusBorder,
          textTransform: 'uppercase',
          letterSpacing: '0.03em'
        }}>
          {statusLabelText}
        </span>
      </div>

      {/* Middle row: Current Value + Unit + Trend Arrow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span className="font-mono" style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text)' }}>
            {formattedVal}
          </span>
          {kpi.unit && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              {kpi.unit}
            </span>
          )}
        </div>

        {/* Trend Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {kpi.trend === 'up' && (
            <span style={{ color: 'var(--success)', fontSize: '1.5rem', fontWeight: 'bold' }} title="Trending Up">↑</span>
          )}
          {kpi.trend === 'down' && (
            <span style={{ color: 'var(--error)', fontSize: '1.5rem', fontWeight: 'bold' }} title="Trending Down">↓</span>
          )}
          {kpi.trend === 'stable' && (
            <span style={{ color: 'var(--text-dim)', fontSize: '1.5rem', fontWeight: 'bold' }} title="Stable">→</span>
          )}
        </div>
      </div>

      {/* Sparkline visualization */}
      {kpi.sparkPoints && kpi.sparkPoints.length >= 2 && (
        <div style={{ margin: '4px 0 2px' }}>
          <Sparkline points={kpi.sparkPoints} color={accentColor} />
        </div>
      )}

      {/* Statistics Grid (Min, Max, Avg, Records) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        padding: '10px',
        background: 'var(--surface-raised)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        textAlign: 'center'
      }}>
        <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Min</div>
          <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.minVal !== null ? kpi.minVal.toFixed(kpi.decimalPlaces) : '—'}
          </div>
        </div>
        <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Max</div>
          <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.maxVal !== null ? kpi.maxVal.toFixed(kpi.decimalPlaces) : '—'}
          </div>
        </div>
        <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Average</div>
          <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.avgVal !== null ? kpi.avgVal.toFixed(kpi.decimalPlaces) : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Records</div>
          <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
            {kpi.recordCount !== undefined ? kpi.recordCount : 0}
          </div>
        </div>
      </div>

      {/* Footer: Last Update time */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.72rem',
        color: 'var(--text-dim)',
        marginTop: 'auto',
        paddingTop: '6px',
        borderTop: '1px dashed var(--border-subtle)'
      }}>
        <span>Last Ingested:</span>
        <span className="font-mono" style={{ fontWeight: 500 }}>
          {kpi.lastTimestamp ? new Date(kpi.lastTimestamp).toLocaleString() : 'Never'}
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

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export default function Dashboard({ onNavigate }) {
  const { refreshTrigger, dbConnectionStatus } = useSimulator();

  // ── State ────────────────────────────────────────────────────────────────
  const [tagConfigs, setTagConfigs]         = useState([]);
  const [historianRecords, setHistorianRecords] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [settings, setSettings]             = useState({});
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);
  const [latestIngestionTime, setLatestIngestionTime] = useState(null);

  // ── Fetch data ───────────────────────────────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load configs
      const configs = await getTagConfigs();
      setTagConfigs(configs);

      const dashboardTagIndexes = configs.filter(c => c.DashboardVisible).map(c => c.TagIndex);

      // 2. Fetch all historian data
      const allData = await getHistorianData();
      setTotalRecordsCount(allData.length);

      if (allData.length > 0) {
        setLatestIngestionTime(allData[0].DateAndTime);
      } else {
        setLatestIngestionTime(null);
      }

      // Filter historian records to only include dashboard tags
      const filteredRecords = allData.filter(r => dashboardTagIndexes.includes(r.TagIndex));
      setHistorianRecords(filteredRecords);

      // 3. Fetch settings
      const sysSettings = await getSettings();
      setSettings(sysSettings);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDashboardData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDashboardData, refreshTrigger]);

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

  // ── Tag Map ───────────────────────────────────────────────────────────────
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => { map[c.TagIndex] = c; });
    return map;
  }, [tagConfigs]);

  // ── dashboardTags (visible tag indexes) ───────────────────────────────────
  const dashboardTagIndexes = useMemo(() => {
    return tagConfigs.filter(c => c.DashboardVisible).map(c => c.TagIndex);
  }, [tagConfigs]);

  // ── KPI Data ──────────────────────────────────────────────────────────────
  const kpiData = useMemo(() => {
    return tagConfigs.filter(c => c.DashboardVisible).map(tag => {
      const tagIndex = tag.TagIndex;
      const tagRecs = historianRecords
        .filter(r => r.TagIndex === tagIndex)
        .sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime)); // desc

      const latest = tagRecs[0];
      const previous = tagRecs[1];

      let currentValue = null;
      let lastTimestamp = null;
      let status = null;
      let minVal = null;
      let maxVal = null;
      let avgVal = null;
      let trend = 'stable';

      if (tagRecs.length > 0) {
        currentValue = latest.Val;
        lastTimestamp = latest.DateAndTime;
        status = latest.Status;

        const values = tagRecs.map(r => r.Val);
        minVal = Math.min(...values);
        maxVal = Math.max(...values);
        avgVal = values.reduce((sum, v) => sum + v, 0) / values.length;

        if (previous) {
          if (latest.Val > previous.Val) trend = 'up';
          else if (latest.Val < previous.Val) trend = 'down';
        }
      }

      const sparkPoints = tagRecs.slice(0, 12).map(r => r.Val).reverse();

      return {
        tagIndex,
        tagName: tag.TagName,
        unit: tag.Unit || '',
        decimalPlaces: tag.DecimalPlaces ?? 2,
        currentValue,
        lastTimestamp,
        status,
        minVal,
        maxVal,
        avgVal,
        trend,
        sparkPoints,
        recordCount: tagRecs.length
      };
    });
  }, [tagConfigs, historianRecords]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="page-header-title">
          <span className="section-label">Historian</span>
          <h2>Historian Summary Dashboard</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            Analytical view of historical process values and telemetry statistics.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? <SavingSpinner /> : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 4c1-2.5 4-4 7-3.5A7 7 0 0115 8" />
                <path d="M15 12c-1 2.5-4 4-7 3.5A7 7 0 011 8" />
                <polyline points="1,1 1,4 4,4" />
                <polyline points="15,15 15,12 12,12" />
              </svg>
            )}
            Refresh Historian
          </button>
        </div>
      </div>

      {/* ── Historian Summary Cards ────────────────────────────────────── */}
      <div className="grid-5" style={{ marginBottom: '24px' }}>
        {/* Card 1: Total Configured Tags */}
        <div className="stat-card">
          <div className="stat-card-label">Configured Tags</div>
          <div className="stat-card-value">
            {tagConfigs.length}
            <span className="stat-card-unit">Tags</span>
          </div>
          <div className="stat-card-meta">All configured SCADA points</div>
        </div>

        {/* Card 2: Active Tags */}
        <div className="stat-card">
          <div className="stat-card-label">Active Tags</div>
          <div className="stat-card-value" style={{ color: 'var(--success)' }}>
            {activeTagsCount}
            <span className="stat-card-unit" style={{ color: 'var(--success)' }}>Active</span>
          </div>
          <div className="stat-card-meta">Telemetry received in last 60s</div>
        </div>

        {/* Card 3: Total Historian Records */}
        <div className="stat-card">
          <div className="stat-card-label">Total Records</div>
          <div className="stat-card-value" style={{ color: 'var(--secondary)' }}>
            {totalRecordsCount}
            <span className="stat-card-unit" style={{ color: 'var(--secondary)' }}>Rows</span>
          </div>
          <div className="stat-card-meta">Total database row count</div>
        </div>

        {/* Card 4: Latest Ingestion Time */}
        <div className="stat-card">
          <div className="stat-card-label">Latest Timestamp</div>
          <div className="stat-card-value" style={{ fontSize: '1.25rem', padding: '6px 0', color: 'var(--accent)' }}>
            {latestIngestionTime ? new Date(latestIngestionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
          </div>
          <div className="stat-card-meta">{latestIngestionTime ? new Date(latestIngestionTime).toLocaleDateString() : 'No historian logs'}</div>
        </div>

        {/* Card 5: Database Connection Status */}
        <div className="stat-card">
          <div className="stat-card-label">DB Link Status</div>
          <div className="stat-card-value" style={{
            color: dbConnectionStatus === 'Connected' ? 'var(--success)' : dbConnectionStatus === 'Syncing' ? 'var(--warning)' : 'var(--error)',
            fontSize: '1.38rem'
          }}>
            {dbConnectionStatus}
          </div>
          <div className="stat-card-meta">Database Link Status</div>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

