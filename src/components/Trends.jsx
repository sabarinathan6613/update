/* eslint-disable react-hooks/preserve-manual-memoization */
// src/components/Trends.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { getHistorianData, getTagConfigs, getSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';
import { getSupabaseClient } from '../utils/supabaseClient';

/* ─── colour palette for overlaid tag series ─── */
const TAG_COLORS = [
  '#00E5FF', // cyan
  '#69FF47', // lime
  '#FFB300', // amber
  '#FF4B6E', // rose
  '#B388FF', // lavender
  '#FF7043', // deep-orange
  '#40C4FF', // light-blue
  '#E040FB', // purple
  '#00E676', // green
  '#FFCA28', // yellow
];

/* ─── tiny utility: format a Date for datetime-local input ─── */
function toLocalInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}



export default function Trends() {
  const { refreshTrigger, dbConnectionStatus, localBuffer } = useSimulator();

  /* ── tag configs & selection ── */
  const [tagConfigs, setTagConfigs]       = useState([]);
  const [selectedTags, setSelectedTags]   = useState([]);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [compareMode, setCompareMode]     = useState(false);
  const [focusedTagIdx, setFocusedTagIdx] = useState(null);
  const lastQueryRef = useRef({ selectedTags: [], timePreset: '' });

  /* ── time preset ── */
  const [timePreset, setTimePreset]   = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  /* ── data ── */
  const [historianData, setHistorianData] = useState([]);
  const historianDataRef                  = useRef(historianData);
  useEffect(() => {
    historianDataRef.current = historianData;
  }, [historianData]);
  const [loading, setLoading]             = useState(false);

  /* ── diagnostics ── */
  const [diagnostics, setDiagnostics] = useState({
    recordsFound: 0,
    queryTimeMs:  0,
    selectedTagsLabel: '',
    dateRangeLabel:    '',
  });

  /* ── tooltip / crosshair ── */
  const [hoveredData, setHoveredData] = useState(null);
  const didInitRef = useRef(false);
  const chartRef = useRef(null);

  /* ════════════════════════════════════════════
     Load tag configurations
  ════════════════════════════════════════════ */
  useEffect(() => {
    const load = async () => {
      const configs = await getTagConfigs();
      const sorted  = configs.sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(sorted);

      if (!didInitRef.current) {
        const visible = sorted.filter(t => t.TrendsVisible);
        if (visible.length > 0) {
          const firstTag = visible[0].TagIndex;
          setSelectedTags([firstTag]);
          setFocusedTagIdx(firstTag);
        }
        didInitRef.current = true;
      }
    };
    load();
  }, [refreshTrigger]);

  // Keep focusedTagIdx in sync with selectedTags
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedTags.length > 0) {
        if (focusedTagIdx === null || !selectedTags.includes(focusedTagIdx)) {
          setFocusedTagIdx(selectedTags[0]);
        }
      } else {
        if (focusedTagIdx !== null) {
          setFocusedTagIdx(null);
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedTags, focusedTagIdx]);

  // Temporary diagnostics loop to log query status to server
  useEffect(() => {
    const runDiagnostics = async () => {
      try {
        const s = await getSettings();
        const configs = await getTagConfigs();
        const rawHistory = await getHistorianData({ limit: 10 });
        
        let rawSupabaseRows = [];
        const supabase = getSupabaseClient();
        if (supabase) {
          const tableName = s.selectedTable || 'Database';
          const { data } = await supabase.from(tableName).select('*').limit(5);
          rawSupabaseRows = data || [];
        }

        await fetch('/api/log-diagnostics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: s,
            configs,
            rawHistory,
            rawSupabaseRows,
            localTime: new Date().toString(),
            timePreset,
            customStart,
            customEnd,
            selectedTags,
            dbConnectionStatus,
            localBufferLength: localBuffer.length
          })
        });
      } catch (err) {
        console.error("Failed to run diagnostics:", err);
      }
    };
    runDiagnostics();
  }, [refreshTrigger, selectedTags, timePreset, customStart, customEnd, dbConnectionStatus, localBuffer.length]);

  /* ════════════════════════════════════════════
     Computed time range with Zoom and Pan state
  ════════════════════════════════════════════ */
  const [chartStart, setChartStart] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const [chartEnd, setChartEnd] = useState(() => new Date().toISOString());

  const timeRange = useMemo(() => {
    return { startDate: chartStart, endDate: chartEnd };
  }, [chartStart, chartEnd]);

  /* ─── Pre-populate custom datetime picker inputs on selection ─── */
  useEffect(() => {
    if (timePreset === 'custom') {
      const timer = setTimeout(() => {
        if (!customStart) {
          setCustomStart(toLocalInput(new Date(chartStart)));
        }
        if (!customEnd) {
          setCustomEnd(toLocalInput(new Date(chartEnd)));
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [timePreset, customStart, customEnd, chartStart, chartEnd]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (timePreset === 'custom') {
        const now = new Date();
        const start = customStart ? new Date(customStart).toISOString() : new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const end = customEnd ? new Date(customEnd).toISOString() : now.toISOString();
        setChartStart(start);
        setChartEnd(end);
      } else if (timePreset !== 'zoomed') {
        const now = new Date();
        let start;
        let end   = now;
        switch (timePreset) {
          case '1h':  start = new Date(now.getTime() - 1  * 60 * 60 * 1000); break;
          case '6h':  start = new Date(now.getTime() - 6  * 60 * 60 * 1000); break;
          case '24h': start = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '7d':  start = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); break;
          case '30d': start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
          default: start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        setChartStart(start.toISOString());
        setChartEnd(end.toISOString());
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [timePreset, customStart, customEnd, refreshTrigger]);

  const handleZoom = (factor) => {
    const tStart = Date.parse(chartStart);
    const tEnd = Date.parse(chartEnd);
    if (isNaN(tStart) || isNaN(tEnd)) return;
    const duration = tEnd - tStart;
    const center = tStart + duration / 2;
    const nextDuration = duration * factor;
    if (nextDuration < 60 * 1000 || nextDuration > 365 * 24 * 60 * 60 * 1000) return;
    setChartStart(new Date(center - nextDuration / 2).toISOString());
    setChartEnd(new Date(center + nextDuration / 2).toISOString());
    setTimePreset('zoomed');
  };

  const handlePan = (direction) => {
    const tStart = Date.parse(chartStart);
    const tEnd = Date.parse(chartEnd);
    if (isNaN(tStart) || isNaN(tEnd)) return;
    const duration = tEnd - tStart;
    const shift = duration * 0.2 * direction;
    setChartStart(new Date(tStart + shift).toISOString());
    setChartEnd(new Date(tEnd + shift).toISOString());
    setTimePreset('zoomed');
  };

  const handleZoomReset = () => {
    setTimePreset('24h');
  };

  const handleExportCSV = () => {
    if (selectedTags.length === 0 || historianData.length === 0) {
      alert("No data available to export.");
      return;
    }
    let csvContent = 'Timestamp,Tag Index,Tag Name,Value,Unit,Quality Status,Marker\r\n';
    selectedTags.forEach(tagIdx => {
      const records = tagSeriesData[tagIdx] || [];
      records.forEach(row => {
        const config = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '' };
        const statusText = row.Status === 192 ? 'Good' : row.Status === 128 ? 'Uncertain' : 'Bad';
        csvContent += `"${row.DateAndTime}",${row.TagIndex},"${config.TagName}",${row.Val},"${config.Unit}","${statusText}","${row.Marker || ''}"\r\n`;
      });
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Skadomation_Trends_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  /* ════════════════════════════════════════════
     Tag map lookup
  ════════════════════════════════════════════ */
  const tagMap = useMemo(() => {
    const m = {};
    tagConfigs.forEach(c => { m[c.TagIndex] = c; });
    return m;
  }, [tagConfigs]);

  /* ════════════════════════════════════════════
     Fetch historian data
  ════════════════════════════════════════════ */
  useEffect(() => {
    const fetch = async () => {
      if (selectedTags.length === 0) {
        setHistorianData([]);
        setDiagnostics(p => ({
          ...p,
          recordsFound: 0,
          queryTimeMs:  0,
          selectedTagsLabel: 'None Selected',
          dateRangeLabel: `${new Date(timeRange.startDate).toLocaleString()} → ${new Date(timeRange.endDate).toLocaleString()}`,
        }));
        setLoading(false);
        return;
      }

      // Silent updates for background sync updates to prevent flickering
      const tagsChanged = JSON.stringify(selectedTags) !== JSON.stringify(lastQueryRef.current.selectedTags);
      const presetChanged = timePreset !== lastQueryRef.current.timePreset;
      const needsLoader = historianDataRef.current.length === 0 || tagsChanged || presetChanged;

      if (needsLoader) {
        setLoading(true);
      }

      const t0 = performance.now();
      try {
        // Query records belonging to the selected TagIndex within the selected time range
        const data = await getHistorianData({
          tagIndexes: selectedTags,
          startDate: timeRange.startDate,
          endDate: timeRange.endDate,
          sort: 'asc'
        });
        const ms = Math.round(performance.now() - t0);
        setHistorianData(data);
        
        lastQueryRef.current = {
          selectedTags: [...selectedTags],
          timePreset
        };

        // Audit logging as requested
        console.log(`[Trend Range Audit] Preset/Trigger: ${timePreset || 'custom'}`);
        console.log(`* Start Date: ${timeRange.startDate}`);
        console.log(`* End Date:   ${timeRange.endDate}`);
        console.log(`* TagIndexes: ${selectedTags.join(', ')}`);
        console.log(`* Total Records Returned: ${data.length}`);
        selectedTags.forEach(tagIdx => {
          const count = data.filter(r => r.TagIndex === tagIdx).length;
          console.log(`  - TagIndex ${tagIdx} (${tagMap[tagIdx]?.TagName || 'Unknown'}): ${count} records`);
        });

        setDiagnostics(prev => ({
          ...prev,
          queryTimeMs:  ms,
          selectedTagsLabel: selectedTags.map(id => tagMap[id]?.TagName || `Tag ${id}`).join(', '),
        }));
      } catch (err) {
        console.error('Trends: historian query failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [selectedTags, tagMap, timeRange.startDate, timeRange.endDate, refreshTrigger, timePreset]);

  /* ════════════════════════════════════════════
     Filtered tag list for left panel
  ════════════════════════════════════════════ */
  const eligibleTrendsTags = useMemo(() => {
    const visible = tagConfigs.filter(t => t.TrendsVisible);
    if (!tagSearchQuery) return visible;
    const q = tagSearchQuery.toLowerCase();
    return visible.filter(t =>
      t.TagName.toLowerCase().includes(q) ||
      String(t.TagIndex).includes(q)
    );
  }, [tagConfigs, tagSearchQuery]);

  /* ════════════════════════════════════════════
     Toggle tag selection
  ════════════════════════════════════════════ */
  const handleTagToggle = tagIndex => {
    if (compareMode) {
      if (selectedTags.includes(tagIndex)) {
        const next = selectedTags.filter(t => t !== tagIndex);
        setSelectedTags(next);
        if (focusedTagIdx === tagIndex) {
          setFocusedTagIdx(next.length > 0 ? next[0] : null);
        }
      } else {
        if (selectedTags.length >= 10) {
          alert('Maximum 10 tags can be overlaid on the chart simultaneously.');
          return;
        }
        setSelectedTags(prev => [...prev, tagIndex]);
        if (focusedTagIdx === null) {
          setFocusedTagIdx(tagIndex);
        }
      }
    } else {
      // Single Tag Mode: selects only this tag
      setSelectedTags([tagIndex]);
      setFocusedTagIdx(tagIndex);
    }
  };

  const handleCompareModeToggle = enabled => {
    setCompareMode(enabled);
    if (!enabled && selectedTags.length > 1) {
      const activeTag = focusedTagIdx !== null && selectedTags.includes(focusedTagIdx)
        ? focusedTagIdx
        : selectedTags[0];
      setSelectedTags([activeTag]);
      setFocusedTagIdx(activeTag);
    }
  };

  /* ════════════════════════════════════════════
     Chart data derivation (Filtered in-memory by Start Date and End Date)
  ════════════════════════════════════════════ */
  const tagSeriesData = useMemo(() => {
    const series = {};
    const startMs = Date.parse(timeRange.startDate);
    const endMs = Date.parse(timeRange.endDate);

    selectedTags.forEach(idx => {
      const seenTimes = new Set();
      series[idx] = historianData
        .filter(r => {
          if (r.TagIndex !== idx) return false;
          const tMs = Date.parse(r.DateAndTime);
          if (isNaN(tMs)) return false;
          return tMs >= startMs && tMs <= endMs;
        })
        .sort((a, b) => new Date(a.DateAndTime) - new Date(b.DateAndTime))
        .filter(r => {
          const tMs = new Date(r.DateAndTime).getTime();
          if (seenTimes.has(tMs)) {
            return false;
          }
          seenTimes.add(tMs);
          return true;
        });
    });
    return series;
  }, [selectedTags, historianData, timeRange]);

  // Update recordsFound count and date range diagnostics when range changes
  useEffect(() => {
    let totalCount = 0;
    selectedTags.forEach(idx => {
      totalCount += (tagSeriesData[idx] || []).length;
    });
    const timer = setTimeout(() => {
      setDiagnostics(prev => ({
        ...prev,
        recordsFound: totalCount,
        dateRangeLabel: `${new Date(timeRange.startDate).toLocaleString()} → ${new Date(timeRange.endDate).toLocaleString()}`,
      }));
    }, 0);
    return () => clearTimeout(timer);
  }, [tagSeriesData, selectedTags, timeRange]);

  const chartBounds = useMemo(() => {
    const xMin = Date.parse(timeRange.startDate);
    const xMax = Date.parse(timeRange.endDate);
    return { xMin, xMax, rangeX: xMax - xMin };
  }, [timeRange]);

  const localBounds = useMemo(() => {
    const bounds = {};
    selectedTags.forEach(idx => {
      let yMin = Infinity;
      let yMax = -Infinity;
      const records = tagSeriesData[idx] || [];

      records.forEach(r => {
        if (r.Val < yMin) yMin = r.Val;
        if (r.Val > yMax) yMax = r.Val;
      });

      if (yMin === Infinity) {
        bounds[idx] = { yMin: 0, yMax: 100, rangeY: 100 };
      } else {
        const diff = yMax - yMin;
        const padding = diff === 0 ? 10 : diff * 0.08;
        yMin -= padding;
        yMax += padding;
        bounds[idx] = { yMin, yMax, rangeY: yMax - yMin };
      }
    });
    return bounds;
  }, [tagSeriesData, selectedTags]);

  /* ── SVG canvas constants ── */
  const svgWidth     = 800;
  const svgHeight    = 320;
  const paddingLeft  = 58;
  const paddingRight = 20;
  const paddingTop   = 20;
  const paddingBottom = 44;
  const drawWidth    = svgWidth  - paddingLeft - paddingRight;
  const drawHeight   = svgHeight - paddingTop  - paddingBottom;

  const tagSeriesPoints = useMemo(() => {
    const pts = {};
    selectedTags.forEach(idx => {
      const records = tagSeriesData[idx] || [];
      const bounds = localBounds[idx] || { yMin: 0, yMax: 100, rangeY: 100 };
      // Plot every valid historical record scaled independently to fill vertical space
      pts[idx] = records.map(r => {
        const ms  = Date.parse(r.DateAndTime);
        const pX  = chartBounds.rangeX > 0 ? (ms - chartBounds.xMin) / chartBounds.rangeX : 0;
        const pY  = bounds.rangeY > 0 ? (r.Val - bounds.yMin) / bounds.rangeY : 0.5;
        return {
          x: paddingLeft + pX * drawWidth,
          y: paddingTop  + drawHeight - pY * drawHeight,
          val: r.Val,
          timestamp: r.DateAndTime,
          status: r.Status,
        };
      });
    });
    return pts;
  }, [selectedTags, tagSeriesData, chartBounds, localBounds, drawWidth, drawHeight]);

  /* ── Series statistics ── */
  const seriesStats = useMemo(() => {
    const map = {};
    selectedTags.forEach(idx => {
      const records = tagSeriesData[idx] || [];
      if (records.length === 0) {
        map[idx] = { min: 0, max: 0, avg: 0, current: 0, count: 0, goodPct: 100, lastUpdated: 'N/A' };
        return;
      }
      let min = Infinity, max = -Infinity, sum = 0, good = 0;
      records.forEach(r => {
        if (r.Val < min) min = r.Val;
        if (r.Val > max) max = r.Val;
        sum += r.Val;
        if (r.Status === 192) good++;
      });
      const latest = records[records.length - 1];
      const d      = new Date(latest.DateAndTime);
      map[idx] = {
        min, max,
        avg: sum / records.length,
        current: latest.Val,
        count: records.length,
        goodPct: (good / records.length) * 100,
        lastUpdated: isNaN(d.getTime())
          ? latest.DateAndTime
          : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    });
    return map;
  }, [selectedTags, tagSeriesData]);

  /* ── Grid ticks ── */
  const gridTicks = useMemo(() => {
    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4;
      const focusedBounds = localBounds[focusedTagIdx] || { yMin: 0, rangeY: 100 };
      return {
        val: focusedBounds.yMin + ratio * focusedBounds.rangeY,
        y:   paddingTop + drawHeight - ratio * drawHeight,
      };
    });
    const xTicks = Array.from({ length: 4 }, (_, i) => {
      const ratio  = i / 3;
      const timeMs = chartBounds.xMin + ratio * chartBounds.rangeX;
      const x      = paddingLeft + ratio * drawWidth;
      const date   = new Date(timeMs);
      const label  = isNaN(date.getTime()) ? '' :
        (timePreset === '1h' || timePreset === '6h')
          ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
            date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { label, x };
    });
    return { yTicks, xTicks };
  }, [chartBounds, localBounds, focusedTagIdx, drawWidth, drawHeight, timePreset]);

  /* ── Mouse interactions ── */
  const handleMouseMove = e => {
    if (!chartRef.current || historianData.length === 0) return;
    const rect    = chartRef.current.getBoundingClientRect();
    const mouseX  = e.clientX - rect.left;
    const ratioX  = (mouseX - paddingLeft) / drawWidth;
    const targetMs = chartBounds.xMin + ratioX * chartBounds.rangeX;

    const hoverValues = [];
    let closestTimeMs = 0, closestTimestamp = '', minDist = Infinity;

    selectedTags.forEach((tagIdx, i) => {
      const records = tagSeriesData[tagIdx] || [];
      if (!records.length) return;
      let best = records[0], bestDiff = Math.abs(Date.parse(records[0].DateAndTime) - targetMs);
      for (let j = 1; j < records.length; j++) {
        const d = Math.abs(Date.parse(records[j].DateAndTime) - targetMs);
        if (d < bestDiff) { bestDiff = d; best = records[j]; }
      }
      if (bestDiff < minDist) {
        minDist = bestDiff;
        closestTimeMs = Date.parse(best.DateAndTime);
        closestTimestamp = best.DateAndTime;
      }
      const cfg = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '' };
      hoverValues.push({ tagIndex: tagIdx, name: cfg.TagName, unit: cfg.Unit, val: best.Val, color: TAG_COLORS[i % TAG_COLORS.length] });
    });

    const lineX = chartBounds.rangeX > 0
      ? paddingLeft + ((closestTimeMs - chartBounds.xMin) / chartBounds.rangeX) * drawWidth
      : paddingLeft;

    if (mouseX >= paddingLeft && mouseX <= paddingLeft + drawWidth) {
      setHoveredData({ x: lineX, timestamp: closestTimestamp, values: hoverValues });
    } else {
      setHoveredData(null);
    }
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  const visibleTagsTotal = tagConfigs.filter(t => t.TrendsVisible).length;

  const PRESET_BUTTONS = [
    { key: '1h',     label: '1H'     },
    { key: '6h',     label: '6H'     },
    { key: '24h',    label: '24H'    },
    { key: '7d',     label: '7D'     },
    { key: '30d',    label: '30D'    },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="trends-container">

      {/* ═══════════════════════════════════════
          LEFT PANEL – Tag Directory
      ═══════════════════════════════════════ */}
      <div className="trends-left-panel">

        {/* Sticky Header & Search Wrapper */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '12px 16px 10px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Tag Directory
                </span>
              </div>
              {/* Compare Mode Toggle Switch */}
              <label className="toggle-switch" style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                <input 
                  type="checkbox" 
                  checked={compareMode}
                  onChange={(e) => handleCompareModeToggle(e.target.checked)} 
                />
                <div className="toggle-track"></div>
                <span>Compare</span>
              </label>
            </div>
            <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {visibleTagsTotal} tag{visibleTagsTotal !== 1 ? 's' : ''} available · {selectedTags.length} selected
            </p>
          </div>

          {/* Search */}
          <div style={{ padding: '10px 12px', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="form-control"
                placeholder="Search tags..."
                value={tagSearchQuery}
                onChange={e => setTagSearchQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                style={{ paddingLeft: '28px', fontSize: '0.76rem', height: '32px' }}
              />
            </div>
          </div>
        </div>

        {/* Tag list */}
        <div style={{ padding: '6px 8px' }}>
          {visibleTagsTotal === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '10px', opacity: 0.4 }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                No tags configured for trends.<br />
                Configure tags in <strong style={{ color: 'var(--text)' }}>Tag Configuration</strong>.
              </p>
            </div>
          ) : eligibleTrendsTags.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                No tags match &ldquo;{tagSearchQuery}&rdquo;
              </p>
            </div>
          ) : (
            eligibleTrendsTags.map(tag => {
              const isChecked  = selectedTags.includes(tag.TagIndex);
              const colorIdx   = selectedTags.indexOf(tag.TagIndex);
              const lineColor  = colorIdx !== -1 ? TAG_COLORS[colorIdx % TAG_COLORS.length] : null;

              return (
                <div
                  key={tag.TagIndex}
                  onClick={() => handleTagToggle(tag.TagIndex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginBottom: '2px',
                    border: isChecked ? `1px solid ${lineColor}28` : '1px solid transparent',
                    backgroundColor: isChecked ? `${lineColor}10` : 'transparent',
                    transition: 'background-color 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => {
                    if (!isChecked) e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = isChecked ? `${lineColor}10` : 'transparent';
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: 'pointer', accentColor: lineColor || 'var(--secondary)', flexShrink: 0 }}
                  />

                  {/* Tag index badge */}
                  <span style={{
                    flexShrink: 0,
                    fontSize: '0.58rem',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: isChecked ? `${lineColor}22` : 'var(--primary)',
                    color: isChecked ? lineColor : 'var(--text-muted)',
                    border: isChecked ? `1px solid ${lineColor}44` : '1px solid transparent',
                    letterSpacing: '0.03em',
                  }}>
                    {tag.TagIndex}
                  </span>

                  {/* Tag info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: isChecked ? 'var(--text)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {tag.TagName}
                    </span>
                    {tag.Unit && (
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        {tag.Unit}
                      </span>
                    )}
                  </div>

                  {/* Colour swatch when selected */}
                  {isChecked && lineColor && (
                    <span style={{
                      flexShrink: 0,
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: lineColor,
                      boxShadow: `0 0 5px ${lineColor}88`,
                    }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          RIGHT PANEL – Chart Area
      ═══════════════════════════════════════ */}
      <div className="trends-right-panel">

        {/* ── Time range controls ── */}
        <div style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          backgroundColor: 'var(--surface-raised)',
        }}>

          {/* Label */}
          <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
            Time Range
          </span>

          {/* Preset buttons */}
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {PRESET_BUTTONS.map(({ key, label }) => {
              const active = timePreset === key;
              return (
                <button
                  key={key}
                  onClick={() => setTimePreset(key)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    fontFamily: 'var(--mono)',
                    borderRadius: '5px',
                    border: active ? '1px solid var(--secondary)' : '1px solid var(--border)',
                    backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
                    color: active ? 'var(--secondary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    letterSpacing: '0.04em',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--secondary)'; e.currentTarget.style.color = 'var(--text)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Custom pickers */}
          {timePreset === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>From</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.73rem', height: '30px', width: '180px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>To</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.73rem', height: '30px', width: '180px' }}
                />
              </div>
            </div>
          )}

          {/* Zoom/Pan/Export Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: '10px' }}>
            <button
              onClick={() => handlePan(-1)}
              title="Pan Left (Shift 20% Earlier)"
              style={{
                width: '30px', height: '30px', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)',
                fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary)'; e.currentTarget.style.color = 'var(--secondary)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface)'; }}
            >
              ◀
            </button>
            <button
              onClick={() => handleZoom(0.7)}
              title="Zoom In (Decrease Time Span)"
              style={{
                width: '30px', height: '30px', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)',
                fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary)'; e.currentTarget.style.color = 'var(--secondary)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface)'; }}
            >
              ＋
            </button>
            <button
              onClick={() => handleZoom(1.3)}
              title="Zoom Out (Increase Time Span)"
              style={{
                width: '30px', height: '30px', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)',
                fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary)'; e.currentTarget.style.color = 'var(--secondary)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface)'; }}
            >
              －
            </button>
            <button
              onClick={() => handlePan(1)}
              title="Pan Right (Shift 20% Later)"
              style={{
                width: '30px', height: '30px', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)',
                fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary)'; e.currentTarget.style.color = 'var(--secondary)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface)'; }}
            >
              ▶
            </button>
            <button
              onClick={handleZoomReset}
              title="Reset Zoom & Pan to default"
              style={{
                width: '30px', height: '30px', borderRadius: '5px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)',
                fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary)'; e.currentTarget.style.color = 'var(--secondary)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface)'; }}
            >
              ↺
            </button>
            <button
              onClick={handleExportCSV}
              title="Export Current View Data to CSV"
              style={{
                height: '30px', padding: '0 10px', borderRadius: '5px', border: '1px solid rgba(37,99,235,0.25)',
                background: 'rgba(37,99,235,0.08)', color: 'var(--secondary)',
                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                transition: 'all 0.15s', marginLeft: '6px'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.15)'; e.currentTarget.style.borderColor = 'var(--secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.25)'; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          </div>

          {/* Diagnostics pill strip */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
            <DiagPill label="Records" value={`${diagnostics.recordsFound.toLocaleString()} rows`} highlight={diagnostics.recordsFound > 0} />
            <DiagPill label="Query" value={`${diagnostics.queryTimeMs} ms`} />
          </div>
        </div>

        {/* ── Selected tag pills ── */}
        {selectedTags.length > 0 && (
          <div style={{
            flexShrink: 0,
            padding: '8px 20px',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--surface-raised)',
          }}>
            <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600, marginRight: '2px' }}>
              Plotting:
            </span>
            {selectedTags.map((tagIdx, i) => {
              const cfg   = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '' };
              const color = TAG_COLORS[i % TAG_COLORS.length];
              return (
                <span
                  key={tagIdx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px 3px 6px',
                    borderRadius: '20px',
                    fontSize: '0.71rem',
                    fontWeight: 600,
                    border: `1px solid ${color}55`,
                    backgroundColor: `${color}12`,
                    color: color,
                  }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: `0 0 4px ${color}99` }} />
                  {cfg.TagName}
                  {cfg.Unit && <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontFamily: 'var(--mono)' }}>{cfg.Unit}</span>}
                  <button
                    onClick={() => handleTagToggle(tagIdx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                      color: color,
                      fontSize: '0.8rem',
                      marginLeft: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: 0.7
                    }}
                    title={`Remove ${cfg.TagName}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* ── Chart & Statistics Container ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 20px 20px', minHeight: 0, overflow: 'hidden' }}>

          {/* Chart Wrapper */}
          <div
            style={{ 
              position: 'relative', 
              width: '100%', 
              cursor: 'crosshair', 
              flex: 1.2, 
              minHeight: '200px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{ position: 'relative', width: '100%', cursor: 'crosshair', flex: 1, minHeight: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredData(null)}
              ref={chartRef}
            >
              {/* ── Loading state ── */}
              {loading ? (
                <ChartPlaceholder>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      border: '2px solid rgba(0,229,255,0.15)',
                      borderTopColor: 'var(--secondary)',
                      animation: 'spin 0.75s linear infinite',
                    }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
                      RETRIEVING HISTORIAN ARCHIVES…
                    </span>
                  </div>
                </ChartPlaceholder>

              /* ── No tag selected ── */
              ) : selectedTags.length === 0 ? (
                <ChartPlaceholder>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.2" style={{ marginBottom: '12px' }}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                    {visibleTagsTotal === 0
                      ? 'No tags configured for trends.\nConfigure tags in Tag Configuration.'
                      : 'Select a tag from the directory\nto view its trend.'}
                  </p>
                </ChartPlaceholder>

              /* ── No data found ── */
              ) : historianData.length === 0 ? (
                <ChartPlaceholder>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.2" style={{ marginBottom: '12px' }}>
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                    No historian records found for selected tag and date range.
                  </p>
                </ChartPlaceholder>

              /* ── SVG Chart ── */
              ) : (
                <>
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    style={{ width: '100%', height: '100%', overflow: 'visible', display: 'block' }}
                  >
                    {/* Chart background */}
                    <rect x={paddingLeft} y={paddingTop} width={drawWidth} height={drawHeight}
                      fill="var(--surface-raised)" rx="2" />

                    {/* Y-axis focused tag scale label */}
                    {focusedTagIdx !== null && (
                      <text
                        x={paddingLeft}
                        y={paddingTop - 7}
                        fill={TAG_COLORS[selectedTags.indexOf(focusedTagIdx) % TAG_COLORS.length] || 'var(--text-muted)'}
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="start"
                      >
                        Scale: {tagMap[focusedTagIdx]?.TagName || `Tag ${focusedTagIdx}`} ({tagMap[focusedTagIdx]?.Unit || 'No Unit'})
                      </text>
                    )}

                    {/* Y grid lines & labels */}
                    {gridTicks.yTicks.map((tick, i) => (
                      <g key={`y-${i}`}>
                        <line
                          x1={paddingLeft} y1={tick.y}
                          x2={paddingLeft + drawWidth} y2={tick.y}
                          stroke={i === 0 ? 'var(--border)' : 'var(--border-subtle)'}
                          strokeWidth="1"
                        />
                        <text
                          x={paddingLeft - 7} y={tick.y + 3.5}
                          fill="var(--text-muted)" fontSize="8.5"
                          fontFamily="var(--mono)" textAnchor="end"
                        >
                          {tick.val.toFixed(1)}
                        </text>
                      </g>
                    ))}

                    {/* X grid lines & labels */}
                    {gridTicks.xTicks.map((tick, i) => (
                      <g key={`x-${i}`}>
                        <line
                          x1={tick.x} y1={paddingTop}
                          x2={tick.x} y2={paddingTop + drawHeight}
                          stroke="var(--border-subtle)" strokeWidth="1"
                        />
                        <text
                          x={tick.x} y={paddingTop + drawHeight + 16}
                          fill="var(--text-muted)" fontSize="8"
                          textAnchor="middle"
                        >
                          {tick.label}
                        </text>
                      </g>
                    ))}

                    {/* Tag series paths */}
                    {selectedTags.map((tagIdx, i) => {
                      const pts   = tagSeriesPoints[tagIdx] || [];
                      if (pts.length < 2) return null;
                      const color = TAG_COLORS[i % TAG_COLORS.length];
                      const pathD = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
                      const gradId = `tg-grad-${tagIdx}`;

                      return (
                        <g key={tagIdx}>
                          <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor={color} stopOpacity={i === 0 ? '0.18' : '0.06'} />
                              <stop offset="100%" stopColor={color} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {/* Area fill */}
                          <path
                            d={`${pathD} L${pts[pts.length-1].x.toFixed(2)},${(paddingTop+drawHeight).toFixed(2)} L${pts[0].x.toFixed(2)},${(paddingTop+drawHeight).toFixed(2)} Z`}
                            fill={`url(#${gradId})`}
                          />
                          {/* Line */}
                          <path
                            d={pathD}
                            fill="none"
                            stroke={color}
                            strokeWidth={i === 0 ? '2.2' : '1.8'}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: `drop-shadow(0 0 3px ${color}55)` }}
                          />
                        </g>
                      );
                    })}

                    {/* Crosshair vertical line */}
                    {hoveredData && (
                      <line
                        x1={hoveredData.x} y1={paddingTop}
                        x2={hoveredData.x} y2={paddingTop + drawHeight}
                        stroke="rgba(0,229,255,0.5)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Axis border */}
                    <rect
                      x={paddingLeft} y={paddingTop}
                      width={drawWidth} height={drawHeight}
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="1"
                      rx="2"
                    />
                  </svg>

                  {/* Tooltip */}
                  {hoveredData && hoveredData.values.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '24px',
                      left: hoveredData.x > svgWidth * 0.6
                        ? `calc(${(hoveredData.x / svgWidth * 100).toFixed(1)}% - 215px)`
                        : `calc(${(hoveredData.x / svgWidth * 100).toFixed(1)}% + 14px)`,
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-md)',
                      padding: '10px 14px',
                      zIndex: 20,
                      minWidth: '200px',
                      pointerEvents: 'none',
                      backdropFilter: 'blur(8px)',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderBottom: '1px solid var(--border-subtle)',
                        paddingBottom: '7px',
                        marginBottom: '8px',
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--mono)', color: 'var(--secondary)', letterSpacing: '0.04em' }}>
                          {new Date(hoveredData.timestamp).toLocaleString([], {
                            month: 'short', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {hoveredData.values.map((v, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.71rem', color: 'var(--text-muted)', minWidth: 0 }}>
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: v.color, flexShrink: 0, boxShadow: `0 0 4px ${v.color}` }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.73rem', color: v.color, whiteSpace: 'nowrap' }}>
                              {v.val.toFixed(2)}{v.unit ? ` ${v.unit}` : ''}
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

          {/* ── Statistics table ── */}
          {selectedTags.length > 0 && historianData.length > 0 && (
            <div className="card" style={{ flex: 0.8, minHeight: '130px', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--surface-raised)',
                flexShrink: 0
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Telemetry Statistics
                </span>
              </div>

              <div className="table-responsive" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="table responsive-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: '16px' }}>Tag</th>
                      <th>Parameter</th>
                      <th style={{ textAlign: 'right' }}>Current</th>
                      <th style={{ textAlign: 'right' }}>Min</th>
                      <th style={{ textAlign: 'right' }}>Max</th>
                      <th style={{ textAlign: 'right' }}>Average</th>
                      <th style={{ textAlign: 'right' }}>Samples</th>
                      <th style={{ textAlign: 'right' }}>Last Update</th>
                      <th>Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTags.map((tagIdx, i) => {
                      const stats  = seriesStats[tagIdx];
                      const cfg    = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '', DecimalPlaces: 2 };
                      const color  = TAG_COLORS[i % TAG_COLORS.length];
                      const dp     = cfg.DecimalPlaces ?? 2;
                      const isFocused = focusedTagIdx === tagIdx;

                      return (
                        <tr 
                          key={tagIdx}
                          onClick={() => setFocusedTagIdx(tagIdx)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isFocused ? 'var(--accent-dim)' : 'transparent',
                            borderLeft: isFocused ? `4px solid ${color}` : '4px solid transparent',
                            transition: 'background-color 0.15s, border-left-color 0.15s'
                          }}
                        >
                          <td data-label="Tag" style={{ paddingLeft: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: `0 0 5px ${color}88` }} />
                              <span className="font-mono" style={{ fontSize: '0.72rem', color, fontWeight: 700 }}>T{tagIdx}</span>
                            </div>
                          </td>
                          <td data-label="Parameter" style={{ color: 'var(--text)', fontWeight: 500 }}>{cfg.TagName}</td>
                          <td data-label="Current" className="font-mono font-semibold" style={{ textAlign: 'right', color: 'var(--text)' }}>
                            {stats.count > 0 ? `${stats.current.toFixed(dp)} ${cfg.Unit || ''}` : '—'}
                          </td>
                          <td data-label="Min" className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                            {stats.count > 0 ? stats.min.toFixed(dp) : '—'}
                          </td>
                          <td data-label="Max" className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                            {stats.count > 0 ? stats.max.toFixed(dp) : '—'}
                          </td>
                          <td data-label="Average" className="font-mono text-xs" style={{ textAlign: 'right', color: 'var(--text)' }}>
                            {stats.count > 0 ? stats.avg.toFixed(dp) : '—'}
                          </td>
                          <td data-label="Samples" className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                            {stats.count.toLocaleString()}
                          </td>
                          <td data-label="Last Update" className="font-mono text-xs text-muted" style={{ textAlign: 'right' }}>
                            {stats.lastUpdated}
                          </td>
                          <td data-label="Quality">
                            <span className={`badge ${stats.goodPct > 98 ? 'badge-success' : stats.goodPct > 90 ? 'badge-warning' : 'badge-danger'}`}
                              style={{ fontSize: '0.63rem' }}>
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
    </div>
  );
}

/* ═══════════════════════════════
   Sub-components
═══════════════════════════════ */

function ChartPlaceholder({ children }) {
  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--surface-raised)',
      borderRadius: '8px',
      border: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}

function DiagPill({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{label}</span>
      <span style={{ fontSize: '0.7rem', fontFamily: 'var(--mono)', fontWeight: 700, color: highlight ? 'var(--secondary)' : 'var(--text-muted)' }}>{value}</span>
    </div>
  );
}
