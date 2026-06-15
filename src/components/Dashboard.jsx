// src/components/Dashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { getHistorianData, getTagConfigs, getSettings, getSyncLogs } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Dashboard({ user }) {
  const { syncTrigger, isNetworkOnline, localBuffer, totalSyncedRecords, cloudStorageUsageKb, failedSyncAttempts } = useSimulator();
  
  // Settings & configs state
  const [dashboardTags, setDashboardTags] = useState([]);
  const [tagConfigs, setTagConfigs] = useState([]);
  const [dbTable, setDbTable] = useState('Database');
  
  // Data states
  const [historianRecords, setHistorianRecords] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load configuration
  useEffect(() => {
    const loadConfigs = async () => {
      const settings = await getSettings();
      const configs = await getTagConfigs();
      setTagConfigs(configs);

      // Filter settings dashboardTags to only include those with DashboardVisible = Yes
      let activeKpiIds = settings.dashboardTags || [];
      activeKpiIds = activeKpiIds.filter(id => {
        const conf = configs.find(c => c.TagIndex === id);
        return conf ? conf.DashboardVisible : false;
      });

      setDashboardTags(activeKpiIds.slice(0, 5));
      setDbTable(settings.selectedTable || 'Database');
    };
    loadConfigs();
  }, [syncTrigger]);

  // Fetch telemetry data and logs on simulator ticks
  useEffect(() => {
    const fetchTelemetry = async () => {
      if (dashboardTags.length === 0) {
        setHistorianRecords([]);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const result = await getHistorianData({
          tagIndexes: dashboardTags,
          limit: 300
        });
        setHistorianRecords(result);

        const logs = await getSyncLogs();
        setRecentLogs(logs.slice(0, 5));
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTelemetry();
  }, [dashboardTags, syncTrigger]);

  // Tag configuration map helper
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => {
      map[c.TagIndex] = c;
    });
    return map;
  }, [tagConfigs]);

  // Process data for the KPI Cards
  const kpiData = useMemo(() => {
    return dashboardTags.map(tagIndex => {
      const config = tagMap[tagIndex] || {
        TagName: `Tag Index ${tagIndex}`,
        Unit: '',
        DecimalPlaces: 2
      };

      // Filter records belonging to this specific tag
      const tagRecords = historianRecords
        .filter(r => r.TagIndex === tagIndex)
        .sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime)); // desc order

      const latest = tagRecords[0];
      const previous = tagRecords[1];

      let currentValue = null;
      let lastUpdated = 'N/A';
      let trend = 'stable'; // up, down, stable
      let status = 0; // default Bad if no record
      let marker = '';
      
      if (latest) {
        currentValue = latest.Val;
        status = latest.Status;
        marker = latest.Marker;
        
        const dateObj = new Date(latest.DateAndTime);
        lastUpdated = isNaN(dateObj.getTime()) 
          ? latest.DateAndTime.split('T')[1]?.substring(0, 8) || latest.DateAndTime 
          : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (previous) {
          if (latest.Val > previous.Val) trend = 'up';
          else if (latest.Val < previous.Val) trend = 'down';
        }
      }

      // Extract last 10 points for sparkline
      const sparkPoints = tagRecords
        .slice(0, 12)
        .map(r => r.Val)
        .reverse();

      return {
        tagIndex,
        tagName: config.TagName,
        unit: config.Unit,
        decimalPlaces: config.DecimalPlaces,
        currentValue,
        lastUpdated,
        trend,
        status,
        marker,
        sparkPoints
      };
    });
  }, [dashboardTags, historianRecords, tagMap]);

  // Generate micro SVG Sparkline for KPI Card
  const renderMicroSparkline = (points, trend) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 100;
    const height = 30;

    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - 2 - ((val - min) / range) * (height - 4);
      return `${x},${y}`;
    }).join(' ');

    const strokeColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--error)' : 'var(--secondary)';

    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords}
        />
      </svg>
    );
  };

  // Prepare chart data for main trends visualizer
  const mainChartData = useMemo(() => {
    const timestampsSet = new Set();
    historianRecords.forEach(r => {
      if (r.DateAndTime) timestampsSet.add(r.DateAndTime);
    });
    
    const sortedTimestamps = Array.from(timestampsSet)
      .sort((a, b) => new Date(a) - new Date(b)) // asc
      .slice(-15); // get last 15 points

    const datasets = dashboardTags.map(tagIndex => {
      const config = tagMap[tagIndex] || { TagName: `Tag ${tagIndex}` };
      const tagRecs = historianRecords.filter(r => r.TagIndex === tagIndex);
      
      const values = sortedTimestamps.map(ts => {
        const match = tagRecs.find(r => r.DateAndTime === ts);
        return match ? match.Val : null;
      });

      return {
        tagIndex,
        displayName: config.TagName,
        unit: config.Unit,
        values
      };
    });

    const labels = sortedTimestamps.map(ts => {
      const dateObj = new Date(ts);
      return isNaN(dateObj.getTime()) 
        ? ts.split('T')[1]?.substring(0, 5) || ts 
        : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    return { labels, datasets };
  }, [dashboardTags, historianRecords, tagMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. Page Header & Info Banner */}
      <div className="card" style={{
        padding: '18px 24px',
        background: 'linear-gradient(135deg, var(--surface) 0%, #111A30 100%)',
        border: '1px solid var(--border)'
      }}>
        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--secondary)', fontWeight: 700 }}>
              SCADA Process Value Annunciator
            </span>
            <h1 style={{ color: 'white', margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 800 }}>
              Smart Historian Dashboard
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
              Direct live connection table: <code style={{ color: 'white', fontFamily: 'var(--mono)' }}>{dbTable}</code> | Dynamic polling active.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <span style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>GATEWAY LINK</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isNetworkOnline ? 'var(--success)' : 'var(--error)' }}>
                {isNetworkOnline ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <span style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>SQL Spooler Queue</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: localBuffer.length > 0 ? 'var(--warning)' : 'var(--text-muted)' }} className="font-mono">
                +{localBuffer.length} rows
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Exactly 5 KPI Cards Section */}
      {dashboardTags.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>📊</span>
          <h3 style={{ margin: '0 0 6px 0', color: 'white' }}>No dashboard tags configured.</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            Please configure tags and set "Dashboard Visible = Yes" in the Tag Configuration module.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dashboardTags.length}, 1fr)`, gap: '14px' }} className="kpi-grid-container">
          {kpiData.map((kpi, index) => {
            const formattedVal = kpi.currentValue !== null && kpi.currentValue !== undefined
              ? kpi.currentValue.toFixed(kpi.decimalPlaces)
              : '---';

            return (
              <div 
                key={index} 
                className="card" 
                style={{ 
                  padding: '16px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  minHeight: '138px',
                  borderLeft: kpi.status === 192 ? '3px solid var(--secondary)' : '3px solid var(--error)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* Card Title Info */}
                <div className="flex justify-between items-start" style={{ width: '100%' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <span className="font-mono text-xs text-muted" style={{ fontSize: '0.68rem', display: 'block' }}>TAG {kpi.tagIndex}</span>
                    <strong style={{ color: 'white', fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }} title={kpi.tagName}>
                      {kpi.tagName}
                    </strong>
                  </div>
                  {/* Trend arrows */}
                  <span style={{ 
                    fontSize: '1rem', 
                    color: kpi.trend === 'up' ? 'var(--success)' : kpi.trend === 'down' ? 'var(--error)' : 'var(--text-muted)',
                    fontWeight: 'bold'
                  }}>
                    {kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '➔'}
                  </span>
                </div>

                {/* Large Value Display */}
                <div style={{ margin: '8px 0' }}>
                  <span 
                    className="font-mono" 
                    style={{ 
                      fontSize: '1.75rem', 
                      fontWeight: 700, 
                      color: kpi.status === 192 ? 'var(--secondary)' : 'var(--error)',
                      textShadow: kpi.status === 192 ? '0 0 10px rgba(0, 240, 255, 0.1)' : '0 0 10px rgba(255, 46, 46, 0.1)'
                    }}
                  >
                    {formattedVal}
                  </span>
                  {kpi.unit && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px', fontFamily: 'var(--mono)' }}>{kpi.unit}</span>}
                </div>

                {/* Sparkline & Status */}
                <div className="flex justify-between items-end" style={{ width: '100%', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className={`badge ${kpi.status === 192 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.58rem', padding: '1px 4px' }}>
                      {kpi.status === 192 ? 'Good' : 'Bad'}
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }} className="font-mono">
                      {kpi.lastUpdated}
                    </span>
                  </div>
                  {/* Micro sparkline */}
                  {renderMicroSparkline(kpi.sparkPoints, kpi.trend)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 1200px) {
          .kpi-grid-container {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
          }
        }
      `}</style>

      {/* 3. Main Dashboard Charts & Diagnostics Row */}
      {dashboardTags.length > 0 && (
        <div className="grid-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
          
          {/* Left Side: Real-time Multi-Tag Overlay trend */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
              <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase' }}>
                🎯 Live Telemetry Trend Overlay (KPI Tags)
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {mainChartData.datasets.map((ds, idx) => (
                  <span key={idx} style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'white' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: ['#00F0FF', '#00FF66', '#FFB800', '#FF2E2E', '#A78BFA'][idx]
                    }} />
                    {ds.displayName}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ height: '220px', position: 'relative' }}>
              {mainChartData.labels.length > 1 ? (
                <svg viewBox="0 0 500 220" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* Horizontal gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
                    <line
                      key={i}
                      x1="0"
                      y1={220 * r}
                      x2="500"
                      y2={220 * r}
                      stroke="rgba(255,255,255,0.04)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Plot line for each tag */}
                  {mainChartData.datasets.map((dataset, dsIdx) => {
                    const color = ['#00F0FF', '#00FF66', '#FFB800', '#FF2E2E', '#A78BFA'][dsIdx];
                    const nonNullValues = dataset.values.filter(v => v !== null);
                    const min = Math.min(...nonNullValues);
                    const max = Math.max(...nonNullValues);
                    const range = max - min || 1;

                    const points = dataset.values.map((val, idx) => {
                      if (val === null) return null;
                      const x = (idx / (dataset.values.length - 1)) * 500;
                      const y = 200 - ((val - min) / range) * 170;
                      return { x, y };
                    }).filter(p => p !== null);

                    const pathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                    return (
                      <g key={dsIdx}>
                        <path
                          d={pathStr}
                          fill="none"
                          stroke={color}
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ opacity: 0.8 }}
                        />
                        {points.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={p.x}
                            cy={p.y}
                            r="2.5"
                            fill="var(--background)"
                            stroke={color}
                            strokeWidth="1.2"
                          />
                        ))}
                      </g>
                    );
                  })}

                  {/* X Axis Timestamps Labels */}
                  {mainChartData.labels.map((lbl, idx) => {
                    const x = (idx / (mainChartData.labels.length - 1)) * 500;
                    if (idx % 3 !== 0 && idx !== mainChartData.labels.length - 1) return null;
                    return (
                      <text
                        key={idx}
                        x={x}
                        y="216"
                        fill="var(--text-muted)"
                        fontSize="8"
                        textAnchor="middle"
                        fontFamily="var(--mono)"
                      >
                        {lbl}
                      </text>
                    );
                  })}
                </svg>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Waiting for PLC Simulation ticks...
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Database metrics */}
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '14px' }}>
              ⚙️ DB Connection Diagnostics
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span className="text-xs text-muted">Gateway SSL Status</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>SECURED (TLS 1.3)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span className="text-xs text-muted">SQL Gateway API</span>
                <span className="text-xs font-semibold font-mono" style={{ color: 'white' }}>PostgREST client</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span className="text-xs text-muted">Total Synced Records</span>
                <span className="text-xs font-semibold font-mono" style={{ color: 'var(--secondary)' }}>
                  {totalSyncedRecords.toLocaleString()} rows
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span className="text-xs text-muted">Cloud DB Storage</span>
                <span className="text-xs font-semibold font-mono" style={{ color: 'white' }}>{cloudStorageUsageKb} KB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span className="text-xs text-muted">Driver Health Score</span>
                <span className="text-xs font-semibold" style={{ color: failedSyncAttempts > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  {failedSyncAttempts > 0 ? '85% Warning' : '100% Optimal'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '2px' }}>
                <span className="text-xs text-muted">Avg Database Latency</span>
                <span className="text-xs font-semibold font-mono" style={{ color: 'white' }}>45 ms</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 4. Bottom System Messages Gateway Logs */}
      <div className="card" style={{ padding: '20px' }}>
        <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.9rem', margin: 0, color: 'white' }}>📡 SCADA Historian Sync Gateway Monitor Logs</h3>
          <span className="badge badge-secondary font-mono" style={{ fontSize: '0.62rem' }}>
            AUTO REFRESH: ON
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
          {recentLogs.length === 0 ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              No messages logged from the sync daemon yet.
            </span>
          ) : (
            recentLogs.map((log, idx) => {
              const dateObj = new Date(log.timestamp);
              const logTime = isNaN(dateObj.getTime())
                ? log.timestamp
                : dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

              return (
                <div 
                  key={idx} 
                  className="font-mono"
                  style={{ 
                    display: 'flex', 
                    fontSize: '0.72rem', 
                    padding: '5px 8px', 
                    backgroundColor: 'rgba(0,0,0,0.2)', 
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: `2.5px solid ${log.type === 'SYNC' ? 'var(--secondary)' : log.type === 'ERROR' ? 'var(--error)' : 'var(--success)'}`
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', marginRight: '10px', whiteSpace: 'nowrap' }}>[{logTime}]</span>
                  <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontWeight: 600 }}>[{log.type}]</span>
                  <span style={{ color: 'white', flex: 1, whiteSpace: 'normal', wordBreak: 'break-all' }}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
