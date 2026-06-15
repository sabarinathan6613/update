// src/components/Trends.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getHistorianData, getTagConfigs, getSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Trends() {
  const { syncTrigger } = useSimulator();
  
  // Tag configs and selection states
  const [tagConfigs, setTagConfigs] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]); 
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  
  // Time preset states: '1h', '8h', '24h', '7d', 'custom'
  const [timePreset, setTimePreset] = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Data states
  const [historianData, setHistorianData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Diagnostics State
  const [diagnostics, setDiagnostics] = useState({
    recordsFound: 0,
    queryTimeMs: 0,
    selectedTagsLabel: '',
    dateRangeLabel: ''
  });

  // Tooltip & Interactive State
  const [hoveredData, setHoveredData] = useState(null);
  const chartRef = useRef(null);

  // Neon colors list for overlaying up to 10 tags
  const tagColors = [
    '#00F0FF', // Cyan
    '#00FF66', // Green
    '#FFB800', // Yellow
    '#FF2E2E', // Red
    '#A78BFA', // Purple
    '#FB7185', // Pink
    '#3B82F6', // Blue
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#EC4899'  // Fuchsia
  ];

  // Load tag configurations
  useEffect(() => {
    const loadConfigs = async () => {
      const configs = await getTagConfigs();
      const sortedConfigs = configs.sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(sortedConfigs);
      
      // Filter configurations that have TrendsVisible = true
      const visibleTrendsTags = sortedConfigs.filter(t => t.TrendsVisible);
      if (visibleTrendsTags.length > 0) {
        // Default select the first 2 visible trends tags
        setSelectedTags(visibleTrendsTags.slice(0, 2).map(t => t.TagIndex));
      }
    };
    loadConfigs();
  }, [syncTrigger]);

  // Compute startDate & endDate based on presets
  const timeRange = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = now;

    if (timePreset === '1h') {
      start = new Date(now.getTime() - 60 * 60 * 1000);
    } else if (timePreset === '8h') {
      start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
    } else if (timePreset === '24h') {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (timePreset === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timePreset === 'custom') {
      start = customStart ? new Date(customStart) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
      end = customEnd ? new Date(customEnd) : now;
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  }, [timePreset, customStart, customEnd]);

  // Tag dictionary for quick lookup
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => {
      map[c.TagIndex] = c;
    });
    return map;
  }, [tagConfigs]);

  // Fetch historian records and track query diagnostics
  useEffect(() => {
    const fetchChartData = async () => {
      if (selectedTags.length === 0) {
        setHistorianData([]);
        setDiagnostics(prev => ({
          ...prev,
          recordsFound: 0,
          queryTimeMs: 0,
          selectedTagsLabel: 'None Selected',
          dateRangeLabel: `${new Date(timeRange.startDate).toLocaleString()} to ${new Date(timeRange.endDate).toLocaleString()}`
        }));
        setLoading(false);
        return;
      }

      setLoading(true);
      const queryStartTime = performance.now();
      try {
        const data = await getHistorianData({
          tagIndexes: selectedTags,
          startDate: timeRange.startDate,
          endDate: timeRange.endDate,
          limit: 2000 // higher limit for historical trends
        });
        const queryDuration = Math.round(performance.now() - queryStartTime);
        setHistorianData(data);

        // Map tag indices to names for labels
        const tagsLabel = selectedTags
          .map(id => tagMap[id]?.TagName || `Tag ${id}`)
          .join(', ');

        setDiagnostics({
          recordsFound: data.length,
          queryTimeMs: queryDuration,
          selectedTagsLabel: tagsLabel,
          dateRangeLabel: `${new Date(timeRange.startDate).toLocaleString()} to ${new Date(timeRange.endDate).toLocaleString()}`
        });
      } catch (err) {
        console.error("Failed to query historian data for Trends chart:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchChartData();
  }, [selectedTags, timeRange, tagMap]);

  // Filter tag configs by checklist search text AND TrendsVisible visibility flag
  const eligibleTrendsTags = useMemo(() => {
    const trendsTags = tagConfigs.filter(t => t.TrendsVisible);
    if (!tagSearchQuery) return trendsTags;
    const q = tagSearchQuery.toLowerCase();
    return trendsTags.filter(t => 
      t.TagName.toLowerCase().includes(q) || 
      `tag ${t.TagIndex}`.includes(q)
    );
  }, [tagConfigs, tagSearchQuery]);

  // Checkbox toggle logic
  const handleTagToggle = (tagIndex) => {
    if (selectedTags.includes(tagIndex)) {
      setSelectedTags(prev => prev.filter(t => t !== tagIndex));
    } else {
      if (selectedTags.length >= 10) {
        alert("To maintain visibility, you can overlay a maximum of 10 tags on the chart.");
        return;
      }
      setSelectedTags(prev => [...prev, tagIndex]);
    }
  };

  // Group data by selected tag index
  const tagSeriesData = useMemo(() => {
    const series = {};
    selectedTags.forEach(tagIdx => {
      series[tagIdx] = historianData
        .filter(r => r.TagIndex === tagIdx)
        .sort((a, b) => new Date(a.DateAndTime) - new Date(b.DateAndTime)); // chronological order
    });
    return series;
  }, [selectedTags, historianData]);

  // Global Y Bounds and X Bounds for SVG scaling
  const chartBounds = useMemo(() => {
    let yMin = Infinity;
    let yMax = -Infinity;
    let xMin = Date.parse(timeRange.startDate);
    let xMax = Date.parse(timeRange.endDate);

    let hasData = false;
    historianData.forEach(r => {
      hasData = true;
      if (r.Val < yMin) yMin = r.Val;
      if (r.Val > yMax) yMax = r.Val;
    });

    if (!hasData) {
      return { yMin: 0, yMax: 100, xMin, xMax, rangeY: 100 };
    }

    // Add 8% padding top and bottom to make chart look nicer
    const diff = yMax - yMin;
    const padding = diff === 0 ? 10 : diff * 0.08;
    yMin = yMin - padding;
    yMax = yMax + padding;

    return {
      yMin,
      yMax,
      xMin,
      xMax,
      rangeY: yMax - yMin,
      rangeX: xMax - xMin
    };
  }, [historianData, timeRange]);

  // Compute rendering points on a standard SVG canvas size of 800 x 320
  const svgWidth = 800;
  const svgHeight = 320;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  const drawWidth = svgWidth - paddingLeft - paddingRight;
  const drawHeight = svgHeight - paddingTop - paddingBottom;

  const tagSeriesPoints = useMemo(() => {
    const pointsMap = {};
    
    selectedTags.forEach(tagIdx => {
      const records = tagSeriesData[tagIdx] || [];
      pointsMap[tagIdx] = records.map(r => {
        const timeMs = Date.parse(r.DateAndTime);
        
        // Map time to X coordinate
        let pctX = 0;
        if (chartBounds.rangeX > 0) {
          pctX = (timeMs - chartBounds.xMin) / chartBounds.rangeX;
        }
        const x = paddingLeft + pctX * drawWidth;

        // Map value to Y coordinate
        let pctY = 0.5;
        if (chartBounds.rangeY > 0) {
          pctY = (r.Val - chartBounds.yMin) / chartBounds.rangeY;
        }
        const y = paddingTop + drawHeight - pctY * drawHeight;

        return { x, y, val: r.Val, timestamp: r.DateAndTime, status: r.Status };
      });
    });

    return pointsMap;
  }, [selectedTags, tagSeriesData, chartBounds, drawWidth, drawHeight]);

  // Statistical calculations for each tag
  const seriesStats = useMemo(() => {
    const statsMap = {};

    selectedTags.forEach(tagIdx => {
      const records = tagSeriesData[tagIdx] || [];
      if (records.length === 0) {
        statsMap[tagIdx] = { min: 0, max: 0, avg: 0, current: 0, count: 0, goodPct: 100, lastUpdated: 'N/A' };
        return;
      }

      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let goodCount = 0;

      records.forEach(r => {
        if (r.Val < min) min = r.Val;
        if (r.Val > max) max = r.Val;
        sum += r.Val;
        if (r.Status === 192) goodCount++;
      });

      const latestRec = records[records.length - 1];
      const dateObj = new Date(latestRec.DateAndTime);
      const lastUpdatedStr = isNaN(dateObj.getTime())
        ? latestRec.DateAndTime
        : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      statsMap[tagIdx] = {
        min,
        max,
        avg: sum / records.length,
        current: latestRec.Val,
        count: records.length,
        goodPct: (goodCount / records.length) * 100,
        lastUpdated: lastUpdatedStr
      };
    });

    return statsMap;
  }, [selectedTags, tagSeriesData]);

  // Handle SVG Mouse move for crosshair tooltip
  const handleMouseMove = (e) => {
    if (!chartRef.current || historianData.length === 0) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    const ratioX = (mouseX - paddingLeft) / drawWidth;
    const targetTimeMs = chartBounds.xMin + ratioX * chartBounds.rangeX;

    const hoverValues = [];
    let closestTimeMs = 0;
    let closestTimestamp = '';
    let minDistance = Infinity;

    selectedTags.forEach((tagIdx, idx) => {
      const records = tagSeriesData[tagIdx] || [];
      if (records.length === 0) return;

      let closestRec = records[0];
      let closestDiff = Math.abs(Date.parse(closestRec.DateAndTime) - targetTimeMs);

      for (let i = 1; i < records.length; i++) {
        const diff = Math.abs(Date.parse(records[i].DateAndTime) - targetTimeMs);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestRec = records[i];
        }
      }

      if (closestDiff < minDistance) {
        minDistance = closestDiff;
        closestTimeMs = Date.parse(closestRec.DateAndTime);
        closestTimestamp = closestRec.DateAndTime;
      }

      const config = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '' };
      hoverValues.push({
        tagIndex: tagIdx,
        name: config.TagName,
        unit: config.Unit,
        val: closestRec.Val,
        timestamp: closestRec.DateAndTime,
        color: tagColors[idx % tagColors.length]
      });
    });

    let lineX = paddingLeft;
    if (chartBounds.rangeX > 0) {
      lineX = paddingLeft + ((closestTimeMs - chartBounds.xMin) / chartBounds.rangeX) * drawWidth;
    }

    if (mouseX >= paddingLeft && mouseX <= paddingLeft + drawWidth) {
      setHoveredData({
        x: lineX,
        timestamp: closestTimestamp,
        values: hoverValues
      });
    } else {
      setHoveredData(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredData(null);
  };

  // Generate SVG Grid Tick Labels
  const gridTicks = useMemo(() => {
    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const val = chartBounds.yMin + ratio * chartBounds.rangeY;
      const y = paddingTop + drawHeight - ratio * drawHeight;
      yTicks.push({ val, y });
    }

    const xTicks = [];
    for (let i = 0; i <= 3; i++) {
      const ratio = i / 3;
      const timeMs = chartBounds.xMin + ratio * chartBounds.rangeX;
      const x = paddingLeft + ratio * drawWidth;
      const date = new Date(timeMs);
      const label = isNaN(date.getTime())
        ? ''
        : timePreset === '1h' || timePreset === '8h'
          ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      xTicks.push({ label, x });
    }

    return { yTicks, xTicks };
  }, [chartBounds, drawWidth, drawHeight, timePreset]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }} className="trends-container">
      
      {/* LEFT COLUMN: Checklist of Configured Tags */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: 'fit-content' }}>
        <h3 style={{ fontSize: '0.95rem', color: 'white', margin: 0 }}>📋 Configured Trends Tags</h3>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Lists tags configured with Trends Visible = Yes. Select channels to plot.
        </p>

        {/* Tag search bar */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search tags..."
            value={tagSearchQuery}
            onChange={(e) => setTagSearchQuery(e.target.value)}
            style={{ padding: '6px 8px 6px 26px', fontSize: '0.78rem' }}
          />
          <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', opacity: 0.5 }}>🔍</span>
        </div>

        {/* Scrollable list */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '4px', 
          maxHeight: '340px', 
          overflowY: 'auto', 
          paddingRight: '4px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px'
        }}>
          {tagConfigs.filter(t => t.TrendsVisible).length === 0 ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No tags available for trends.
            </span>
          ) : eligibleTrendsTags.length === 0 ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No matching tags found.
            </span>
          ) : (
            eligibleTrendsTags.map((tag, idx) => {
              const isChecked = selectedTags.includes(tag.TagIndex);
              const overlayIdx = selectedTags.indexOf(tag.TagIndex);
              const color = overlayIdx !== -1 ? tagColors[overlayIdx % tagColors.length] : 'transparent';
              
              return (
                <div
                  key={idx}
                  onClick={() => handleTagToggle(tag.TagIndex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isChecked ? 'rgba(255,255,255,0.02)' : 'transparent',
                    transition: 'background-color 0.1s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'}
                  onMouseOut={(e) => {
                    if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent';
                    else e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by parent onClick
                    style={{ cursor: 'pointer' }}
                  />
                  
                  {isChecked && (
                    <span style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: color,
                      display: 'inline-block'
                    }} />
                  )}

                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {tag.TagName}
                    </span>
                    <span className="font-mono text-xs text-muted" style={{ fontSize: '0.62rem' }}>
                      TAG {tag.TagIndex} {tag.Unit ? `[${tag.Unit}]` : ''}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Chart panel & Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Chart Card */}
        <div className="card" style={{ padding: '20px' }}>
          
          {/* Controls header */}
          <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', margin: 0, color: 'white' }}>📈 Process Variable Trend Plotter</h3>
              <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
                Overlay configured historian channels.
              </p>
            </div>

            {/* Time Presets buttons */}
            <div style={{ display: 'flex', gap: '4px' }} className="no-print">
              {['1h', '8h', '24h', '7d', 'custom'].map(preset => (
                <button
                  key={preset}
                  onClick={() => setTimePreset(preset)}
                  className="btn btn-secondary text-xs"
                  style={{
                    padding: '6px 10px',
                    borderColor: timePreset === preset ? 'var(--secondary)' : 'var(--border)',
                    backgroundColor: timePreset === preset ? 'rgba(0, 240, 255, 0.05)' : 'var(--surface)',
                    color: timePreset === preset ? 'var(--secondary)' : 'white'
                  }}
                >
                  {preset === '1h' ? '1 Hour' : preset === '8h' ? '8 Hours' : preset === '24h' ? '24 Hours' : preset === '7d' ? '7 Days' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Picker inputs if selected */}
          {timePreset === 'custom' && (
            <div className="card no-print" style={{ padding: '12px', display: 'flex', gap: '12px', marginBottom: '16px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <label className="form-label" style={{ fontSize: '0.68rem' }}>Start Date/Time</label>
                <input 
                  type="datetime-local" 
                  className="form-control" 
                  value={customStart} 
                  onChange={(e) => setCustomStart(e.target.value)} 
                  style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <label className="form-label" style={{ fontSize: '0.68rem' }}>End Date/Time</label>
                <input 
                  type="datetime-local" 
                  className="form-control" 
                  value={customEnd} 
                  onChange={(e) => setCustomEnd(e.target.value)} 
                  style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                />
              </div>
            </div>
          )}

          {/* DIAGNOSTICS SUB-PANEL */}
          <div className="font-mono" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            marginBottom: '16px',
            fontSize: '0.68rem'
          }}>
            <div>
              <span className="text-muted" style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.55rem' }}>Records Found</span>
              <strong style={{ color: diagnostics.recordsFound > 0 ? 'var(--secondary)' : 'var(--error)' }}>
                {diagnostics.recordsFound.toLocaleString()} rows
              </strong>
            </div>
            <div>
              <span className="text-muted" style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.55rem' }}>Query Execution</span>
              <strong style={{ color: 'white' }}>{diagnostics.queryTimeMs} ms</strong>
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span className="text-muted" style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.55rem' }}>Selected Tag</span>
              <strong style={{ color: 'white' }} title={diagnostics.selectedTagsLabel}>{diagnostics.selectedTagsLabel || 'None'}</strong>
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span className="text-muted" style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.55rem' }}>Query Date Range</span>
              <strong style={{ color: 'white' }} title={diagnostics.dateRangeLabel}>{diagnostics.dateRangeLabel}</strong>
            </div>
          </div>

          {/* MAIN SVG CHART CANVAS */}
          <div 
            style={{ position: 'relative', width: '100%', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            ref={chartRef}
          >
            {loading ? (
              <div style={{ height: `${svgHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '2px solid rgba(0, 240, 255, 0.1)',
                  borderTopColor: 'var(--secondary)',
                  animation: 'spin 0.8s linear infinite',
                  marginRight: '12px'
                }} />
                <span className="text-xs text-muted">RETRIEVING HISTORIAN ARCHIVES...</span>
              </div>
            ) : selectedTags.length === 0 ? (
              <div style={{ height: `${svgHeight}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '1.8rem', marginBottom: '6px' }}>📉</span>
                {tagConfigs.filter(t => t.TrendsVisible).length === 0 ? (
                  <span className="text-xs">No tags available for trends.</span>
                ) : (
                  <span className="text-xs">Select one or more tag channels in the Directory to construct trend paths.</span>
                )}
              </div>
            ) : historianData.length === 0 ? (
              <div style={{ height: `${svgHeight}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '1.8rem', marginBottom: '6px' }}>📁</span>
                <span className="text-sm" style={{ color: 'white', fontWeight: 600 }}>No historian records found for the selected tag and date range.</span>
                <span className="text-xs text-muted" style={{ fontSize: '0.68rem', marginTop: '4px' }}>
                  No records matched the selected tag(s) within the query date range.
                </span>
              </div>
            ) : (
              <>
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                  {/* Grid background lines */}
                  {gridTicks.yTicks.map((tick, idx) => (
                    <g key={`y-${idx}`}>
                      <line
                        x1={paddingLeft}
                        y1={tick.y}
                        x2={svgWidth - paddingRight}
                        y2={tick.y}
                        stroke="rgba(255, 255, 255, 0.035)"
                        strokeWidth="1"
                      />
                      <text
                        x={paddingLeft - 8}
                        y={tick.y + 3}
                        fill="var(--text-muted)"
                        fontSize="8.5"
                        fontFamily="var(--mono)"
                        textAnchor="end"
                      >
                        {tick.val.toFixed(1)}
                      </text>
                    </g>
                  ))}

                  {gridTicks.xTicks.map((tick, idx) => (
                    <g key={`x-${idx}`}>
                      <line
                        x1={tick.x}
                        y1={paddingTop}
                        x2={tick.x}
                        y2={paddingTop + drawHeight}
                        stroke="rgba(255, 255, 255, 0.035)"
                        strokeWidth="1"
                      />
                      <text
                        x={tick.x}
                        y={paddingTop + drawHeight + 14}
                        fill="var(--text-muted)"
                        fontSize="8.5"
                        textAnchor="middle"
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}

                  {/* Draw tag series line paths */}
                  {selectedTags.map((tagIdx, idx) => {
                    const points = tagSeriesPoints[tagIdx] || [];
                    if (points.length < 2) return null;

                    const color = tagColors[idx % tagColors.length];
                    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                    return (
                      <g key={tagIdx}>
                        {idx === 0 && (
                          <>
                            <defs>
                              <linearGradient id={`grad-${tagIdx}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <path
                              d={`${pathD} L ${points[points.length - 1].x} ${paddingTop + drawHeight} L ${points[0].x} ${paddingTop + drawHeight} Z`}
                              fill={`url(#grad-${tagIdx})`}
                            />
                          </>
                        )}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={color}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}

                  {/* Draw interactive crosshair vertical line */}
                  {hoveredData && (
                    <line
                      x1={hoveredData.x}
                      y1={paddingTop}
                      x2={hoveredData.x}
                      y2={paddingTop + drawHeight}
                      stroke="rgba(0, 240, 255, 0.4)"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                    />
                  )}
                </svg>

                {/* Interactive Tooltip Card overlay */}
                {hoveredData && (
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: hoveredData.x > svgWidth / 2 ? `${hoveredData.x * 0.85 - 190}px` : `${hoveredData.x * 0.85 + 20}px`,
                    backgroundColor: 'rgba(14, 22, 43, 0.95)',
                    border: '1px solid var(--secondary)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: '10px 12px',
                    zIndex: 10,
                    width: '200px',
                    pointerEvents: 'none'
                  }}>
                    <span className="font-mono text-xs text-muted" style={{ display: 'block', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '3px', marginBottom: '6px' }}>
                      ⏱: {new Date(hoveredData.timestamp).toLocaleTimeString()}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {hoveredData.values.map((v, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: v.color }} />
                            {v.name}
                          </span>
                          <span className="font-mono font-semibold" style={{ color: 'white' }}>
                            {v.val.toFixed(2)} {v.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* STATS COMPARISON GRID CARD */}
        {selectedTags.length > 0 && historianData.length > 0 && (
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '0.92rem', color: 'white', margin: '0 0 12px 0' }}>📋 Overlay Telemetry Statistics Summary</h3>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tag Index</th>
                    <th>Channel Parameter</th>
                    <th style={{ textAlign: 'right' }}>Current Value</th>
                    <th style={{ textAlign: 'right' }}>Min Bound</th>
                    <th style={{ textAlign: 'right' }}>Max Bound</th>
                    <th style={{ textAlign: 'right' }}>Average</th>
                    <th style={{ textAlign: 'right' }}>Last Updated</th>
                    <th style={{ textAlign: 'right' }}>Samples Count</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTags.map((tagIdx, idx) => {
                    const stats = seriesStats[tagIdx];
                    const config = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '', DecimalPlaces: 2 };
                    const color = tagColors[idx % tagColors.length];

                    return (
                      <tr key={tagIdx}>
                        <td className="font-mono font-semibold" style={{ color: color }}>Tag {tagIdx}</td>
                        <td style={{ color: 'white', fontWeight: 500 }}>{config.TagName}</td>
                        <td className="font-mono font-semibold" style={{ textAlign: 'right', color: 'white' }}>
                          {stats.count > 0 ? stats.current.toFixed(config.DecimalPlaces) : '-'} {config.Unit}
                        </td>
                        <td className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                          {stats.count > 0 ? stats.min.toFixed(config.DecimalPlaces) : '-'}
                        </td>
                        <td className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                          {stats.count > 0 ? stats.max.toFixed(config.DecimalPlaces) : '-'}
                        </td>
                        <td className="font-mono text-xs" style={{ textAlign: 'right', color: 'white' }}>
                          {stats.count > 0 ? stats.avg.toFixed(config.DecimalPlaces) : '-'}
                        </td>
                        <td className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                          {stats.lastUpdated}
                        </td>
                        <td className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                          {stats.count}
                        </td>
                        <td>
                          <span className={`badge ${stats.goodPct > 98 ? 'badge-success' : stats.goodPct > 90 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>
                            {stats.goodPct.toFixed(1)}% Good
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
