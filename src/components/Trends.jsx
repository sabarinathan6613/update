/* eslint-disable react-hooks/preserve-manual-memoization */
// src/components/Trends.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getHistorianData, getTagConfigs, getSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';
import { formatTimestampToPlantTime, parseTimestampToMs } from '../utils/timeService';
import { normalizeTagIndex } from '../utils/historianService';
import ScrollableTagList from './ScrollableTagList';

const TAG_COLORS = [
  '#2563EB', // Professional blue
  '#0D9488', // Teal
  '#16A34A', // Green
  '#D97706', // Amber/Orange
  '#4F46E5', // Indigo
  '#7C3AED', // Violet
  '#0891B2', // Cyan-blue
  '#DB2777', // Muted pink
  '#475569', // Slate
  '#1E3A5F', // Dark blue
];

/* ─── tiny utility: format a Date for datetime-local input ─── */
function toLocalInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const tagIndexMatch = (a, b) => normalizeTagIndex(a) === normalizeTagIndex(b);

// 1. Min-Max Decimation Algorithm to prevent dense visual clutter and vertical blobs
function decimatePoints(records, chartBounds, drawWidth) {
  if (records.length <= 1000) return records; // Only decimate if we have dense datasets

  // Divide the X range into drawWidth buckets (1 bucket per pixel column)
  const numBuckets = Math.min(drawWidth, 800);
  const buckets = Array.from({ length: numBuckets }, () => []);
  const xMin = chartBounds.xMin;
  const rangeX = chartBounds.rangeX;

  if (rangeX <= 0) return records;

  records.forEach(r => {
    const ms = parseTimestampToMs(r.DateAndTime);
    const pct = (ms - xMin) / rangeX;
    let bIdx = Math.floor(pct * numBuckets);
    if (bIdx < 0) bIdx = 0;
    if (bIdx >= numBuckets) bIdx = numBuckets - 1;
    buckets[bIdx].push(r);
  });

  const decimated = [];
  buckets.forEach(bucketRecs => {
    if (bucketRecs.length === 0) return;
    if (bucketRecs.length <= 2) {
      decimated.push(...bucketRecs);
      return;
    }

    // Find min and max records in this bucket column to preserve peaks & valleys
    let minRec = bucketRecs[0];
    let maxRec = bucketRecs[0];
    let minVal = Number(minRec.Val);
    let maxVal = Number(maxRec.Val);

    for (let i = 1; i < bucketRecs.length; i++) {
      const v = Number(bucketRecs[i].Val);
      if (!isNaN(v)) {
        if (v < minVal) {
          minVal = v;
          minRec = bucketRecs[i];
        }
        if (v > maxVal) {
          maxVal = v;
          maxRec = bucketRecs[i];
        }
      }
    }

    const minMs = parseTimestampToMs(minRec.DateAndTime);
    const maxMs = parseTimestampToMs(maxRec.DateAndTime);

    if (minMs < maxMs) {
      decimated.push(minRec);
      if (minRec !== maxRec) {
        decimated.push(maxRec);
      }
    } else {
      decimated.push(maxRec);
      if (minRec !== maxRec) {
        decimated.push(minRec);
      }
    }
  });

  return decimated;
}

// 2. Dynamic Sampling Gap Threshold based on 3x the median interval of the dataset
function getSamplingGapThreshold(records) {
  if (records.length <= 2) return 24 * 60 * 60 * 1000;
  
  const diffs = [];
  for (let i = 1; i < records.length; i++) {
    const prevMs = parseTimestampToMs(records[i - 1].DateAndTime);
    const currMs = parseTimestampToMs(records[i].DateAndTime);
    const d = currMs - prevMs;
    if (d > 0) {
      diffs.push(d);
    }
  }
  
  if (diffs.length === 0) return 24 * 60 * 60 * 1000;
  
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)];
  
  // Return 3x the median sampling interval, min 15 seconds to prevent noise
  return Math.max(15000, median * 3);
}



export default function Trends({ isActive }) {
  const { refreshTrigger, dbConnectionStatus, localBuffer } = useSimulator();
  const isRefreshing = false;

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
  const [liveScroll, setLiveScroll]       = useState(true);
  const [freezeTime, setFreezeTime]       = useState(null);
  const [scaleMode, setScaleMode]         = useState('auto');
  const [manualMin, setManualMin]         = useState('0');
  const [manualMax, setManualMax]         = useState('100');

  // Double-buffering states to prevent chart flashing blank during loading
  const [renderedSelectedTags, setRenderedSelectedTags] = useState([]);
  const [renderedHistorianData, setRenderedHistorianData] = useState([]);
  const [renderedFocusedTagIdx, setRenderedFocusedTagIdx] = useState(null);

  useEffect(() => {
    if (!loading) {
      setRenderedSelectedTags(selectedTags);
      setRenderedHistorianData(historianData);
      setRenderedFocusedTagIdx(focusedTagIdx);
    }
  }, [selectedTags, historianData, focusedTagIdx, loading]);

  const [chartStart, setChartStart] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const [chartEnd, setChartEnd] = useState(() => new Date().toISOString());

  const [activeChartStart, setActiveChartStart] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const [activeChartEnd, setActiveChartEnd] = useState(() => new Date().toISOString());

  // Debounced effect to sync UI zoom/pan/custom bounds to active query range
  useEffect(() => {
    const handler = setTimeout(() => {
      setActiveChartStart(chartStart);
      setActiveChartEnd(chartEnd);
    }, 450);
    return () => clearTimeout(handler);
  }, [chartStart, chartEnd]);

  /* ── diagnostics ── */
  const [diagnostics, setDiagnostics] = useState({
    recordsFound: 0,
    queryTimeMs:  0,
    selectedTagsLabel: '',
    dateRangeLabel:    '',
  });
  const [debugInfo, setDebugInfo] = useState(null);

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



  /* ════════════════════════════════════════════
     Computed time range with Zoom and Pan state
  ════════════════════════════════════════════ */

  const timeRange = useMemo(() => {
    return { startDate: activeChartStart, endDate: activeChartEnd };
  }, [activeChartStart, activeChartEnd]);

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
          case '12h': start = new Date(now.getTime() - 12 * 60 * 60 * 1000); break;
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
    const tStart = parseTimestampToMs(activeChartStart);
    const tEnd = parseTimestampToMs(activeChartEnd);
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
    const tStart = parseTimestampToMs(activeChartStart);
    const tEnd = parseTimestampToMs(activeChartEnd);
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
    let csvContent = 'Timestamp,Tag Index,Equipment Name,Value,Unit,Quality Status,Marker\r\n';
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
      if (!isActive) return;
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
        const supabase = getSupabaseClient();
        const settings = await getSettings();
        const tableName = settings?.selectedTable || 'Database';
        const mappings = settings?.columnMappings || {};
        const isAlarmInt = settings?.selectedTable === 'Database';

        const data = await getRecordsInRange(
          supabase,
          tableName,
          selectedTags,
          timeRange.startDate,
          timeRange.endDate,
          mappings,
          'asc',
          isAlarmInt,
          settings,
          3000 // Server-side cap of 3000 rows max to save egress
        );
        const ms = Math.round(performance.now() - t0);
        setHistorianData(data);
        
        lastQueryRef.current = {
          selectedTags: [...selectedTags],
          timePreset
        };

        // Audit logging as requested
        const sortedDesc = [...data].sort((a, b) => parseTimestampToMs(b.DateAndTime) - parseTimestampToMs(a.DateAndTime));
        const latestTime = sortedDesc.length > 0 ? sortedDesc[0].DateAndTime : 'None';
        const latestId = sortedDesc.length > 0 ? sortedDesc[0].ID : 'N/A';

        console.log(`[Trend Refresh Audit]
  - Query Table: "Database" (or custom mapped table)
  - Start Date: "${timeRange.startDate}"
  - End Date: "${timeRange.endDate}"
  - TagIndexes: ${selectedTags.join(', ')}
  - Row Count: ${data.length}
  - Latest Timestamp: "${latestTime}"
  - Latest ID: ${latestId}`);
        selectedTags.forEach(tagIdx => {
          const count = data.filter(r => tagIndexMatch(r.TagIndex, tagIdx)).length;
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
  }, [selectedTags, tagMap, timeRange.startDate, timeRange.endDate, refreshTrigger, timePreset, isActive]);

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
      if (selectedTags.includes(tagIndex)) {
        setSelectedTags([]);
        setFocusedTagIdx(null);
      } else {
        setSelectedTags([tagIndex]);
        setFocusedTagIdx(tagIndex);
      }
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
          if (!tagIndexMatch(r.TagIndex, idx)) return false;
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
    const xMin = parseTimestampToMs(timeRange.startDate);
    const xMax = parseTimestampToMs(timeRange.endDate);
    return { xMin, xMax, rangeX: xMax - xMin };
  }, [timeRange]);

  const localBounds = useMemo(() => {
    const bounds = {};
    renderedSelectedTags.forEach(idx => {
      if (scaleMode === 'manual') {
        const minVal = parseFloat(manualMin) || 0;
        const maxVal = parseFloat(manualMax) || 100;
        const range = maxVal - minVal;
        bounds[idx] = { yMin: minVal, yMax: maxVal, rangeY: range > 0 ? range : 100 };
      } else {
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
          const padding = diff === 0 ? (Math.abs(yMin) === 0 ? 1.0 : Math.abs(yMin) * 0.1) : diff * 0.08;
          const finalMin = yMin - padding;
          const finalMax = yMax + padding;
          bounds[idx] = { yMin: finalMin, yMax: finalMax, rangeY: finalMax - finalMin };
        }
      }
    });
    return bounds;
  }, [tagSeriesData, renderedSelectedTags, scaleMode, manualMin, manualMax]);

  /* ── SVG canvas constants ── */
  const svgWidth     = 800;
  const svgHeight    = 380;
  const paddingLeft  = 68;
  const paddingRight = 30;
  const paddingTop   = 30;
  const paddingBottom = 50;
  const drawWidth    = svgWidth  - paddingLeft - paddingRight;
  const drawHeight   = svgHeight - paddingTop  - paddingBottom;

  const maxGapMs = useMemo(() => {
    switch (timePreset) {
      case '1h':  return 5 * 60 * 1000;       // 5 mins
      case '6h':  return 30 * 60 * 1000;      // 30 mins
      case '24h': return 2 * 60 * 60 * 1000;  // 2 hours
      case '7d':  return 12 * 60 * 60 * 1000; // 12 hours
      case '30d': return 48 * 60 * 60 * 1000; // 48 hours
      default: {
        const diff = chartBounds.rangeX;
        return diff > 0 ? diff * 0.1 : 24 * 60 * 60 * 1000; // 10% of custom duration
      }
    }
  }, [timePreset, chartBounds]);

  const tagSeriesPoints = useMemo(() => {
    const pts = {};
    selectedTags.forEach(idx => {
      const records = tagSeriesData[idx] || [];
      const bounds = localBounds[idx] || { yMin: 0, yMax: 100, rangeY: 100 };
      
      // Decimate dataset for display (draws the Min-Max envelope keeping peaks visible)
      const visibleRecords = decimatePoints(records, chartBounds, drawWidth, timePreset);

      pts[idx] = visibleRecords.map(r => {
        const ms  = parseTimestampToMs(r.DateAndTime);
        const pX  = chartBounds.rangeX > 0 ? (ms - chartBounds.xMin) / chartBounds.rangeX : 0;
        const pY  = bounds.rangeY > 0 ? (r.Val - bounds.yMin) / bounds.rangeY : 0.5;
        const offset = 8;
        return {
          x: paddingLeft + offset + pX * (drawWidth - 2 * offset),
          y: paddingTop  + drawHeight - pY * drawHeight,
          val: r.Val,
          timestamp: r.DateAndTime,
          status: r.Status,
          record: r
        };
      });
    });
    return pts;
  }, [selectedTags, tagSeriesData, chartBounds, localBounds, drawWidth, drawHeight, timePreset]);

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
    const yTicks = Array.from({ length: 7 }, (_, i) => {
      const ratio = i / 6;
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
    const rect = chartRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const mouseX = (e.clientX - rect.left) * (800 / rect.width);

    // Get the range of plotted points across all selected tags
    let earliestX = paddingLeft;
    let latestX = paddingLeft + drawWidth;
    let hasPoints = false;

    selectedTags.forEach(tagIdx => {
      const pts = tagSeriesPoints[tagIdx] || [];
      if (pts.length > 0) {
        hasPoints = true;
        const x1 = pts[0].x;
        const x2 = pts[pts.length - 1].x;
        if (x1 < earliestX) earliestX = x1;
        if (x2 > latestX) latestX = x2;
      }
    });

    if (!hasPoints) {
      setHoveredData(null);
      return;
    }

    // 1. If mouse is outside the bounds of plotted data, hide the tooltip immediately
    if (mouseX < earliestX - 5 || mouseX > latestX + 5) {
      setHoveredData(null);
      return;
    }

    // 2. Search all plotted points across all selected tags to find the closest one to the cursor X position
    let bestPt = null;
    let minDx = Infinity;

    selectedTags.forEach(tagIdx => {
      const pts = tagSeriesPoints[tagIdx] || [];
      pts.forEach(p => {
        const dx = Math.abs(p.x - mouseX);
        if (dx < minDx) {
          minDx = dx;
          bestPt = p;
        }
      });
    });

    if (!bestPt) {
      setHoveredData(null);
      return;
    }

    // 3. Find corresponding records for all tags at/near this snapped timestamp
    const hoverValues = [];
    const targetMs = parseTimestampToMs(bestPt.timestamp);

    selectedTags.forEach((tagIdx, i) => {
      const records = tagSeriesData[tagIdx] || [];
      if (!records.length) return;
      
      let bestRec = records[0];
      let bestRecIndex = 0;
      let minDiff = Math.abs(parseTimestampToMs(records[0].DateAndTime) - targetMs);
      
      for (let j = 1; j < records.length; j++) {
        const diff = Math.abs(parseTimestampToMs(records[j].DateAndTime) - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          bestRec = records[j];
          bestRecIndex = j;
        }
      }

      const bounds = localBounds[tagIdx] || { yMin: 0, yMax: 100, rangeY: 100 };
      const pY = bounds.rangeY > 0 ? (bestRec.Val - bounds.yMin) / bounds.rangeY : 0.5;
      const yCoord = paddingTop + drawHeight - pY * drawHeight;

      const cfg = tagConfigs.find(t => normalizeTagIndex(t.TagIndex) === normalizeTagIndex(tagIdx)) || { TagName: `Tag ${tagIdx}`, Unit: '' };
      const statusLabel = bestRec.Status === 192 ? 'GOOD' : `BAD (${bestRec.Status || 0})`;
      
      hoverValues.push({
        tagIndex: `T${tagIdx}`,
        name: cfg.TagName || cfg.tagName || `Tag ${tagIdx}`,
        unit: cfg.Unit || cfg.unit || '',
        val: bestRec.Val,
        time: formatTimestampToPlantTime(bestRec.DateAndTime, currentPlantId),
        quality: statusLabel,
        color: TAG_COLORS[i % TAG_COLORS.length],
        y: yCoord,
        index: bestRecIndex + 1,
        recordId: bestRec.id || bestRec.Id || 'N/A'
      });
    });

    setHoveredData({
      x: bestPt.x,
      timestamp: bestPt.timestamp,
      values: hoverValues,
      empty: false
    });
  };

  const handleMouseLeave = () => {
    setHoveredData(null);
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  const visibleTagsTotal = tagConfigs.filter(t => t.TrendsVisible).length;

  const PRESET_BUTTONS = [
    { key: '1h',     label: '1 Hour'   },
    { key: '12h',    label: '12 Hours' },
    { key: '24h',    label: '24 Hours' },
    { key: 'custom', label: 'Custom Range' },
  ];

  return (
    <div className="trends-container">

      {/* ═══════════════════════════════════════
          LEFT PANEL – Tag Directory
      ═══════════════════════════════════════ */}
      <div className="trends-left-panel">

        {/* Container 1: Header, Compare, Count, Search */}
        <div style={{
          flexShrink: 0,
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '60px',
            padding: '0 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            gap: '16px'
          }}>
            {/* Title section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Trends
              </span>
            </div>
            
            {/* Compare Toggle Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Compare</span>
              <label className="toggle-switch" style={{ margin: 0 }}>
                <input 
                  type="checkbox" 
                  checked={compareMode}
                  onChange={(e) => handleCompareModeToggle(e.target.checked)} 
                />
                <div className="toggle-track"></div>
              </label>
            </div>
          </div>

          {/* Status Text (with 12px margin below header) */}
          <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>
              {visibleTagsTotal} equipment item{visibleTagsTotal !== 1 ? 's' : ''} available · {selectedTags.length} selected
            </p>
          </div>

          {/* Search */}
          <div style={{ padding: '12px 16px', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="form-control"
                placeholder="Search equipment..."
                value={tagSearchQuery}
                onChange={e => setTagSearchQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                style={{ 
                  paddingLeft: '34px', 
                  fontSize: '0.8rem', 
                  height: '40px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: 'var(--surface)',
                  width: '100%',
                  transition: 'all 0.15s ease'
                }}
              />
            </div>
          </div>
        </div>

        {/* Container 2: Tag cards (ONLY this area scrolls) */}
        <ScrollableTagList style={{ padding: '6px 16px 16px' }}>
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
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    marginBottom: '8px',
                    border: isChecked ? '1px solid rgba(37,99,235,0.08)' : '1px solid #E5E7EB',
                    borderLeft: isChecked ? `4px solid ${lineColor}` : '4px solid transparent',
                    backgroundColor: isChecked ? `${lineColor}0a` : 'var(--surface)',
                    boxShadow: isChecked ? '0 2px 4px rgba(37,99,235,0.02)' : 'none',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.04)';
                    if (!isChecked) {
                      e.currentTarget.style.borderColor = '#D1D5DB';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = isChecked ? '0 2px 4px rgba(37,99,235,0.02)' : 'none';
                    if (!isChecked) {
                      e.currentTarget.style.borderColor = '#E5E7EB';
                    }
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    style={{ 
                      cursor: 'pointer', 
                      accentColor: lineColor || 'var(--secondary)', 
                      flexShrink: 0,
                      width: '15px',
                      height: '15px',
                      marginTop: '1px'
                    }}
                  />

                  {/* Tag index badge */}
                  <div style={{
                    flexShrink: 0,
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.74rem',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    borderRadius: '6px',
                    backgroundColor: isChecked ? lineColor : '#F3F4F6',
                    color: isChecked ? '#FFFFFF' : '#6B7280',
                    transition: 'all 150ms ease'
                  }}>
                    {tag.TagIndex}
                  </div>

                  {/* Tag info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isChecked ? 'var(--text)' : '#374151',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {tag.TagName}
                    </span>
                    {tag.Unit && (
                      <span style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginTop: '2px' }}>
                        Unit: {tag.Unit}
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
        </ScrollableTagList>
      </div>

      {/* ═══════════════════════════════════════
          RIGHT PANEL – Chart Area
      ═══════════════════════════════════════ */}
      <div className="trends-right-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Time Preset Bar */}
        <div style={{
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--surface-raised)',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '6px' }}>Time Range:</span>
            {PRESET_BUTTONS.map(({ key, label }) => {
              const active = timePreset === key;
              return (
                <button
                  key={key}
                  onClick={() => setTimePreset(key)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: active ? '1px solid var(--secondary)' : '1px solid var(--border)',
                    backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
                    color: active ? 'var(--secondary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.1s'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          
          {timePreset === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>From</span>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.72rem', border: '1px solid var(--border)', borderRadius: '4px', height: '28px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>To</span>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.72rem', border: '1px solid var(--border)', borderRadius: '4px', height: '28px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Selected tag pills (Legend) ── */}
        {selectedTags.length > 0 && (
          <div style={{
            flexShrink: 0,
            padding: '12px 20px',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-subtle)'
          }}>
            <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>
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
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.71rem',
                    fontWeight: 600,
                    border: `1px solid ${color}45`,
                    backgroundColor: `${color}0d`,
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
                      marginLeft: '4px',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 20px 20px', flex: 1, minHeight: 0 }}>

          {/* Chart Wrapper */}
          <div
            style={{ 
              position: 'relative', 
              width: '100%', 
              cursor: 'crosshair', 
              flex: 2, 
              minHeight: '340px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{ position: 'relative', width: '100%', cursor: 'crosshair', flex: 1, minHeight: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              ref={chartRef}
            >
              {/* Inline loading overlay that does not block or clear the axes */}
              {(loading || isRefreshing) && renderedHistorianData.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  boxShadow: 'var(--shadow-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  zIndex: 10,
                  pointerEvents: 'none'
                }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '2px solid rgba(0, 0, 0, 0.1)',
                    borderTopColor: 'var(--secondary)',
                    animation: 'spin 0.6s linear infinite'
                  }} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Updating Trend...
                  </span>
                </div>
              )}
              {/* ── Loading state ── */}
              {/* ── Loading state ── */}
              {(loading || isRefreshing) && renderedHistorianData.length === 0 ? (
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
              ) : renderedSelectedTags.length === 0 ? (
                <ChartPlaceholder>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.2" style={{ marginBottom: '12px' }}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>No equipment selected.</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, maxWidth: '280px' }}>
                    Select one or more equipment items from the directory to display historical trends.
                  </p>
                </ChartPlaceholder>
 
              /* ── No data found ── */
              ) : renderedHistorianData.length === 0 ? (
                <ChartPlaceholder>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.2" style={{ marginBottom: '12px' }}>
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                    No historical data available for the selected time range.
                  </p>
                </ChartPlaceholder>
 
              /* ── SVG Chart ── */
              ) : (
                <>
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    style={{ width: '100%', height: '100%', overflow: 'visible', display: 'block' }}
                  >
                    {/* Chart background - pure white for industrial historian feel */}
                    <rect x={paddingLeft} y={paddingTop} width={drawWidth} height={drawHeight}
                      fill="#ffffff" rx="2" />

                    {/* Subtle inline loading indicator at top-right of chart */}
                    {(loading || isRefreshing) && (
                      <text
                        x={paddingLeft + drawWidth}
                        y={paddingTop - 12}
                        fill="var(--secondary)"
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="var(--mono)"
                        letterSpacing="0.05em"
                        textAnchor="end"
                      >
                        ↻ REFRESHING...
                      </text>
                    )}

                    {/* Y-axis focused tag scale label */}
                    {focusedTagIdx !== null && (
                      <text
                        x={paddingLeft}
                        y={paddingTop - 7}
                        fill={TAG_COLORS[selectedTags.indexOf(focusedTagIdx) % TAG_COLORS.length] || '#4b5563'}
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="Inter, sans-serif"
                        textAnchor="start"
                      >
                        Scale: {tagMap[focusedTagIdx]?.TagName || `Tag ${focusedTagIdx}`} ({tagMap[focusedTagIdx]?.Unit || 'No Unit'})
                      </text>
                    )}

                    {/* Y grid lines & labels - clearly visible at 40% opacity for value reading */}
                    {gridTicks.yTicks.map((tick, i) => (
                      <g key={`y-${i}`}>
                        {/* Horizontal grid line */}
                        <line
                          x1={paddingLeft} y1={tick.y}
                          x2={paddingLeft + drawWidth} y2={tick.y}
                          stroke={i === 0 ? 'var(--border)' : 'rgba(226, 232, 240, 0.4)'}
                          strokeWidth="1"
                        />
                        {/* Y-axis tick mark */}
                        <line
                          x1={paddingLeft - 5} y1={tick.y}
                          x2={paddingLeft} y2={tick.y}
                          stroke="#9ca3af" strokeWidth="1"
                        />
                        <text
                          x={paddingLeft - 9} y={tick.y + 4}
                          fill="#0F172A" fontSize="11"
                          fontFamily="Inter, sans-serif"
                          fontWeight="500"
                          textAnchor="end"
                        >
                          {tick.val.toFixed(1)}
                        </text>
                      </g>
                    ))}

                    {/* X grid lines & labels - lighter than horizontal (22% opacity) */}
                    {gridTicks.xTicks.map((tick, i) => (
                      <g key={`x-${i}`}>
                        {/* Vertical grid line */}
                        <line
                          x1={tick.x} y1={paddingTop}
                          x2={tick.x} y2={paddingTop + drawHeight}
                          stroke="rgba(226, 232, 240, 0.3)" strokeWidth="1"
                        />
                        {/* X-axis tick mark */}
                        <line
                          x1={tick.x} y1={paddingTop + drawHeight}
                          x2={tick.x} y2={paddingTop + drawHeight + 5}
                          stroke="#9ca3af" strokeWidth="1"
                        />
                        <text
                          x={tick.x} y={paddingTop + drawHeight + 17}
                          fill="#374151" fontSize="11"
                          fontFamily="Inter, sans-serif"
                          fontWeight="500"
                          textAnchor="middle"
                        >
                          {tick.label}
                        </text>
                      </g>
                    ))}

                    {/* Tag series paths with smooth loading opacity transition */}
                    <g style={{ opacity: loading || isRefreshing ? 0.55 : 1, transition: 'opacity 0.22s ease-in-out' }}>
                    {renderedSelectedTags.map((tagIdx, i) => {
                      const pts   = tagSeriesPoints[tagIdx] || [];
                      if (pts.length === 0) return null;
                      const color = TAG_COLORS[i % TAG_COLORS.length];
                      
                      // Split pts into segments based on maxGapMs to prevent drawing straight lines across missing data
                      const segments = [];
                      let currentSegment = [];
                      
                      if (pts.length > 0) {
                        currentSegment.push(pts[0]);
                        for (let j = 1; j < pts.length; j++) {
                          const prevMs = parseTimestampToMs(pts[j - 1].timestamp);
                          const currMs = parseTimestampToMs(pts[j].timestamp);
                          if (currMs - prevMs > maxGapMs) {
                            segments.push(currentSegment);
                            currentSegment = [pts[j]];
                          } else {
                            currentSegment.push(pts[j]);
                          }
                        }
                        segments.push(currentSegment);
                      }

                      const lineSegments = [];
                      const singlePoints = [];

                      segments.forEach(seg => {
                        if (seg.length === 0) return;
                        if (seg.length === 1) {
                          singlePoints.push(seg[0]);
                        } else {
                          const segD = getBezierPath(seg);
                          lineSegments.push(segD);
                        }
                      });

                      const pathD = lineSegments.join(' ');

                      return (
                        <g key={tagIdx}>
                          {/* Clean, thin trend line (no gradients or area fills) */}
                          {pathD && (
                            <path
                              d={pathD}
                              fill="none"
                              stroke={color}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              shapeRendering="geometricPrecision"
                            />
                          )}
                          {/* Single isolated points */}
                          {singlePoints.map((pt, sIdx) => (
                            <circle
                              key={sIdx}
                              cx={pt.x.toFixed(2)}
                              cy={pt.y.toFixed(2)}
                              r="3.5"
                              fill={color}
                              stroke="#ffffff"
                              strokeWidth="1.2"
                            />
                          ))}
                        </g>
                      );
                    })}

                    {/* Snap markers while hovering over a data point */}
                    {hoveredData && !hoveredData.empty && hoveredData.values.map((v, idx) => (
                      <circle
                        key={`hover-marker-${idx}`}
                        cx={hoveredData.x}
                        cy={v.y}
                        r="4"
                        fill={v.color}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
                      />
                    ))}

                    {/* Crosshair vertical line */}
                    {hoveredData && !hoveredData.empty && (
                      <line
                        x1={hoveredData.x} y1={paddingTop}
                        x2={hoveredData.x} y2={paddingTop + drawHeight}
                        stroke="rgba(0,180,216,0.4)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Axis border - thin light gray */}
                    <rect
                      x={paddingLeft} y={paddingTop}
                      width={drawWidth} height={drawHeight}
                      fill="none"
                      stroke="rgba(0, 0, 0, 0.1)"
                      strokeWidth="1"
                      rx="2"
                    />
                  </g>
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

          {/* ── Diagnostic Debug Panel ── */}
          {debugInfo && (
            <div style={{
              marginTop: '15px',
              padding: '12px 16px',
              backgroundColor: 'var(--surface-raised)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.72rem',
              fontFamily: 'var(--mono)',
              lineHeight: '1.6',
              boxShadow: 'var(--shadow-sm)',
              flexShrink: 0
            }}>
              <div style={{ fontWeight: 700, color: 'var(--secondary)', marginBottom: '8px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Trend Query Diagnostics
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 16px' }}>
                {debugInfo.error ? (
                  <div style={{ color: 'var(--error)', gridColumn: '1 / -1' }}><strong>Error:</strong> {debugInfo.error}</div>
                ) : (
                  <>
                    <div><strong>Table:</strong> {debugInfo.tableName}</div>
                    <div><strong>Selected Tags:</strong> {debugInfo.selectedTags}</div>
                    <div><strong>Target Indexes:</strong> {debugInfo.targetIndexes}</div>
                    <div><strong>Latest DB Timestamp:</strong> {debugInfo.latestTs}</div>
                    <div><strong>Query Start Bound:</strong> {debugInfo.startStr}</div>
                    <div><strong>Query End Bound:</strong> {debugInfo.endStr}</div>
                    <div><strong>X-Axis Start:</strong> {debugInfo.activeChartStart}</div>
                    <div><strong>X-Axis End:</strong> {debugInfo.activeChartEnd}</div>
                    <div><strong>Raw Rows Returned:</strong> {debugInfo.recordCount}</div>
                    <div><strong>Validated Rows:</strong> {debugInfo.validatedCount}</div>
                    <div><strong>Timestamp Col:</strong> {debugInfo.tsCol}</div>
                    <div><strong>Tag Col:</strong> {debugInfo.tagCol}</div>
                  </>
                )}
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
function DiagPill({ label, value, highlight, icon }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '8px 12px', 
      borderRadius: '10px', 
      border: '1px solid #E5E7EB',
      background: 'var(--surface)',
      minWidth: '110px',
      height: '52px',
      boxShadow: 'var(--shadow-xs)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {icon && (
          <span style={{ color: highlight ? 'var(--success)' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
            {icon}
          </span>
        )}
        <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <span style={{ 
        fontSize: '15px', 
        fontFamily: 'var(--mono)', 
        fontWeight: 600, 
        color: highlight ? 'var(--success)' : '#1F2937', 
        marginTop: '4px' 
      }}>
        {value}
      </span>
    </div>
  );
}
