// src/components/Reports.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { getHistorianData, getTagConfigs, getSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Reports() {
  const { syncTrigger } = useSimulator();
  
  // Settings & configurations state
  const [tagConfigs, setTagConfigs] = useState([]);
  const [dashboardTags, setDashboardTags] = useState([22, 23, 24, 34, 35]);
  const [settings, setSettings] = useState({ templateLogoText: 'SKADOMATION SYSTEM', templateFooterText: '' });
  
  // Selection states in compilation form
  const [genReportType, setGenReportType] = useState('Daily Report');
  const [genDate, setGenDate] = useState('');
  const [genShift, setGenShift] = useState('All Shifts');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedReportTags, setSelectedReportTags] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Reports lists state
  const [reportsList, setReportsList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);

  // Load configuration and initialize date pickers
  useEffect(() => {
    const loadReportConfigs = async () => {
      const configs = await getTagConfigs();
      const sortedConfigs = configs.sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(sortedConfigs);
      
      const s = await getSettings();
      setSettings(s);
      
      // Default select the tags configured as ReportsVisible
      const reportVisibleTags = sortedConfigs.filter(t => t.ReportsVisible).map(t => t.TagIndex);
      setSelectedReportTags(reportVisibleTags);

      // Initialize date inputs
      const today = new Date().toISOString().split('T')[0];
      setGenDate(today);
      
      // Default custom start (24h ago) and end (now)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      setCustomStart(yesterday);
      setCustomEnd(new Date().toISOString().slice(0, 16));

      // Add initial pre-compiled reports - EMPTY
      setReportsList([]);
    };
    loadReportConfigs();
  }, [syncTrigger]);

  // Tag dictionary mapping TagIndex to details
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => {
      map[c.TagIndex] = c;
    });
    return map;
  }, [tagConfigs]);

  // Filter tag configs for checkboxes: only those where ReportsVisible = Yes
  const eligibleReportTags = useMemo(() => {
    return tagConfigs.filter(t => t.ReportsVisible);
  }, [tagConfigs]);

  // Select all configured reports-visible tags
  const handleSelectAllConfigured = () => {
    const allConfiguredIds = eligibleReportTags.map(t => t.TagIndex);
    setSelectedReportTags(allConfiguredIds);
  };

  // Clear selections
  const handleClearSelection = () => {
    setSelectedReportTags([]);
  };

  // Calculate start/end timestamps based on the selection
  const compileTimeBoundaries = (type, dateStr, shiftStr) => {
    if (type === 'Custom Range') {
      return {
        start: new Date(customStart).toISOString(),
        end: new Date(customEnd).toISOString(),
        dateInfo: `${customStart.replace('T',' ')} to ${customEnd.replace('T',' ')}`
      };
    }

    const baseDate = new Date(dateStr);
    let start = new Date(baseDate);
    let end = new Date(baseDate);

    if (type === 'Daily Report') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString(), dateInfo: dateStr };
    }

    if (type === 'Shift Report') {
      if (shiftStr === 'Shift A') {
        start.setHours(6, 0, 0, 0);
        end.setHours(14, 0, 0, 0);
      }
      else if (shiftStr === 'Shift B') {
        start.setHours(14, 0, 0, 0);
        end.setHours(22, 0, 0, 0);
      }
      else if (shiftStr === 'Shift C') {
        start.setHours(22, 0, 0, 0);
        end = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        end.setHours(6, 0, 0, 0);
      }
      else {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      }
      return { start: start.toISOString(), end: end.toISOString(), dateInfo: `${dateStr} (${shiftStr})` };
    }

    if (type === 'Weekly Report') {
      start = new Date(baseDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString(), dateInfo: `${start.toISOString().split('T')[0]} to ${dateStr}` };
    }

    if (type === 'Monthly Report') {
      start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthName = baseDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      return { start: start.toISOString(), end: end.toISOString(), dateInfo: monthName };
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString(), dateInfo: dateStr };
  };

  // Compile report stats from actual database records
  const compileReportData = async (report) => {
    const rawData = await getHistorianData({
      tagIndexes: report.tags,
      startDate: report.startDate,
      endDate: report.endDate,
      limit: 3000
    });

    const chronRows = [...rawData].sort((a, b) => new Date(a.DateAndTime) - new Date(b.DateAndTime));

    // Stats calculations for each tag
    const tagSummaries = report.tags.map(tagIdx => {
      const records = chronRows.filter(r => r.TagIndex === tagIdx);
      const config = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '', DecimalPlaces: 2 };

      if (records.length === 0) {
        return {
          tagIndex: tagIdx,
          tagName: config.TagName,
          unit: config.Unit,
          decimalPlaces: config.DecimalPlaces,
          min: 0,
          max: 0,
          avg: 0,
          current: 0,
          count: 0,
          goodPct: 100,
          sparkPoints: []
        };
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

      const sparkPoints = records.slice(-20).map(r => r.Val); // last 20 points for sparkline

      return {
        tagIndex: tagIdx,
        tagName: config.TagName,
        unit: config.Unit,
        decimalPlaces: config.DecimalPlaces,
        min,
        max,
        avg: sum / records.length,
        current: records[records.length - 1].Val,
        count: records.length,
        goodPct: (goodCount / records.length) * 100,
        sparkPoints
      };
    });

    // Incidents/Alarms in report boundary
    const incidents = chronRows
      .filter(r => r.Status !== 192 || r.Marker !== '')
      .map(r => {
        const config = tagMap[r.TagIndex] || { TagName: `Tag Index ${r.TagIndex}` };
        return {
          timestamp: r.DateAndTime,
          tagIndex: r.TagIndex,
          tagName: config.TagName,
          val: r.Val,
          status: r.Status,
          marker: r.Marker || 'ANOMALY'
        };
      });

    return {
      rows: chronRows.slice(-300),
      totalRowsCount: chronRows.length,
      summaries: tagSummaries,
      incidents: incidents.slice(0, 50)
    };
  };

  // Compile & append report
  const handleGenerate = (e) => {
    e.preventDefault();
    if (selectedReportTags.length === 0) {
      alert("Please select at least one tag to include in the report.");
      return;
    }

    setIsGenerating(true);
    
    setTimeout(async () => {
      const bounds = compileTimeBoundaries(genReportType, genDate, genShift);
      const name = `${genReportType} - ${bounds.dateInfo}`;
      
      const newReport = {
        id: "rep-" + Date.now(),
        name,
        type: genReportType,
        dateInfo: bounds.dateInfo,
        shift: genShift,
        startDate: bounds.start,
        endDate: bounds.end,
        tags: [...selectedReportTags],
        generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };

      setReportsList(prev => [newReport, ...prev]);
      setIsGenerating(false);
      
      // Auto-open compiled report modal
      await handleViewReport(newReport);
    }, 1000);
  };

  // Open modal viewer
  const handleViewReport = async (report) => {
    const data = await compileReportData(report);
    setSelectedReport({
      meta: report,
      data
    });
  };

  // Tag checkbox selector toggler in Form
  const handleFormTagToggle = (tagIdx) => {
    if (selectedReportTags.includes(tagIdx)) {
      setSelectedReportTags(prev => prev.filter(t => t !== tagIdx));
    } else {
      setSelectedReportTags(prev => [...prev, tagIdx]);
    }
  };

  // Export compiled report to CSV
  const handleExportCSV = async (report) => {
    const compiled = await compileReportData(report);
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `SKADOMATION SYSTEM HISTORIAN REPORT - ${report.name.toUpperCase()}\r\n`;
    csvContent += `Generated At: ${report.generatedAt}\r\n`;
    csvContent += `Time Scope: ${report.startDate} to ${report.endDate}\r\n\r\n`;
    
    // Stats Summary Table
    csvContent += "TAG STATS SUMMARY\r\n";
    csvContent += "TagIndex,TagName,CurrentValue,Unit,Min,Max,Average,SamplesCount,QualityIndex\r\n";
    compiled.summaries.forEach(s => {
      csvContent += `${s.tagIndex},"${s.tagName}",${s.current.toFixed(s.decimalPlaces)},"${s.unit}",${s.min.toFixed(s.decimalPlaces)},${s.max.toFixed(s.decimalPlaces)},${s.avg.toFixed(s.decimalPlaces)},${s.count},${s.goodPct.toFixed(1)}%\r\n`;
    });
    
    csvContent += "\r\nINCIDENTS LOG\r\n";
    csvContent += "Timestamp,TagIndex,TagName,Value,Status,Marker\r\n";
    compiled.incidents.forEach(inc => {
      csvContent += `"${inc.timestamp}",${inc.tagIndex},"${inc.tagName}",${inc.val},${inc.status},"${inc.marker}"\r\n`;
    });

    csvContent += "\r\nCHRONOLOGICAL TELEMETRY EVENT LOG (TOP 300)\r\n";
    csvContent += "Timestamp,Millitm,TagIndex,TagName,Value,Status,Marker\r\n";
    compiled.rows.forEach(r => {
      const config = tagMap[r.TagIndex] || { TagName: `Tag ${r.TagIndex}` };
      csvContent += `"${r.DateAndTime}",${r.Millitm},${r.TagIndex},"${config.TagName}",${r.Val},${r.Status},"${r.Marker || ''}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${report.name.replace(/\s+/g, '_')}_compiled.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Sparkline generator inside Modal report table
  const generateReportSparkline = (points) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 80;
    const height = 18;
    const pointsStr = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - 2 - ((val - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return (
      <svg width={width} height={height} style={{ overflow: 'visible', opacity: 0.85 }}>
        <polyline
          fill="none"
          stroke="#0F172A" // dark color for printing
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointsStr}
        />
      </svg>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Report Compiler Card */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '14px', fontSize: '1.1rem', color: 'white' }}>📋 Compile SCADA Historian Report</h3>
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
            
            {/* Report Type */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="report-type">Time Scope Classification</label>
              <select
                id="report-type"
                className="form-control"
                value={genReportType}
                onChange={(e) => setGenReportType(e.target.value)}
                style={{ padding: '8px 10px', fontSize: '0.85rem' }}
              >
                <option value="Daily Report">Daily Report (24 hours)</option>
                <option value="Shift Report">Shift Report (8 hours)</option>
                <option value="Weekly Report">Weekly Report (7 days)</option>
                <option value="Monthly Report">Monthly Report (Calendar Month)</option>
                <option value="Custom Range">Custom Range (Date boundaries)</option>
              </select>
            </div>

            {/* Target Date Picker (Hidden if custom) */}
            {genReportType !== 'Custom Range' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="report-date">Target Date</label>
                <input
                  id="report-date"
                  type="date"
                  className="form-control"
                  value={genDate}
                  onChange={(e) => setGenDate(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                  required
                />
              </div>
            )}

            {/* Custom Range picker inputs */}
            {genReportType === 'Custom Range' && (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="custom-start">Start Time</label>
                  <input
                    id="custom-start"
                    type="datetime-local"
                    className="form-control"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="custom-end">End Time</label>
                  <input
                    id="custom-end"
                    type="datetime-local"
                    className="form-control"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                    required
                  />
                </div>
              </>
            )}

            {/* Shift Picker */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="report-shift">Shift Selection</label>
              <select
                id="report-shift"
                className="form-control"
                value={genShift}
                onChange={(e) => setGenShift(e.target.value)}
                disabled={genReportType !== 'Shift Report'}
                style={{ padding: '8px 10px', fontSize: '0.85rem' }}
              >
                <option value="All Shifts">All Shifts (24hr)</option>
                <option value="Shift A">Shift A (Morning: 06:00 - 14:00)</option>
                <option value="Shift B">Shift B (Afternoon: 14:00 - 22:00)</option>
                <option value="Shift C">Shift C (Night: 22:00 - 06:00)</option>
              </select>
            </div>
            
          </div>

          {/* Checklist of Tags to Include */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ fontSize: '0.78rem', margin: 0 }}>
                Select Mapped Tags in Report (Reports Visible = Yes)
              </label>
              <div style={{ display: 'flex', gap: '8px' }} className="no-print">
                <button
                  type="button"
                  onClick={handleSelectAllConfigured}
                  className="btn btn-secondary text-xs"
                  style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                >
                  ☑️ [ Select All Configured Tags ]
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="btn btn-secondary text-xs"
                  style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                >
                  ☐ [ Clear Selection ]
                </button>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '8px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              maxHeight: '130px',
              overflowY: 'auto',
              backgroundColor: 'rgba(0,0,0,0.1)'
            }}>
              {eligibleReportTags.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center' }}>
                  No reports-visible tags configured. Enable "Reports Visible" in configuration.
                </span>
              ) : (
                eligibleReportTags.map((t, i) => {
                  const isChecked = selectedReportTags.includes(t.TagIndex);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }} onClick={() => handleFormTagToggle(t.TagIndex)}>
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => {}} // handled by parent div click
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: isChecked ? 'white' : 'var(--text-muted)', fontWeight: isChecked ? 600 : 400, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={t.TagName}>
                        Tag {t.TagIndex}: {t.TagName}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isGenerating}
            style={{ width: 'fit-content', alignSelf: 'flex-end', minWidth: '160px' }}
          >
            {isGenerating ? "Compiling stats..." : "🛠 Compile & Add Report"}
          </button>
        </form>
      </div>

      {/* 2. Compiled Reports Directory List */}
      <div className="card" style={{ padding: '24px' }}>
        <h4 style={{ marginBottom: '14px', color: 'white' }}>Production Reports Directory</h4>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Report Filename</th>
                <th>Classification Scope</th>
                <th>Time Bound Period</th>
                <th>Included Tags</th>
                <th>Generated Timestamp</th>
                <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reportsList.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No reports compiled in current scope.</td>
                </tr>
              ) : (
                reportsList.map((rep, idx) => (
                  <tr key={idx}>
                    <td className="font-semibold" style={{ color: 'white' }}>
                      📄 {rep.name}
                    </td>
                    <td>
                      <span className="badge badge-secondary">{rep.type}</span>
                    </td>
                    <td className="font-mono text-xs" style={{ color: 'white' }}>{rep.dateInfo}</td>
                    <td className="font-mono text-xs text-muted">{rep.tags.length} channels</td>
                    <td className="text-muted text-xs">{rep.generatedAt}</td>
                    <td className="no-print" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => handleViewReport(rep)}
                          className="btn btn-secondary text-xs" 
                          style={{ padding: '6px 10px' }}
                        >
                          🔍 View Document
                        </button>
                        <button 
                          onClick={() => handleExportCSV(rep)}
                          className="btn btn-secondary text-xs"
                          style={{ padding: '6px 10px' }}
                        >
                          📥 Export Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Detailed Report View Overlay Modal */}
      {selectedReport && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '900px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header Controls */}
            <div className="drawer-header no-print" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.05rem' }}>📄 Process Historian Report Document</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handlePrint}
                  className="btn btn-secondary text-xs"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'white' }}
                >
                  🖨 Print / PDF Export
                </button>
                <button 
                  onClick={() => handleExportCSV(selectedReport.meta)}
                  className="btn btn-secondary text-xs"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'white' }}
                >
                  📥 Download CSV
                </button>
                <button 
                  onClick={() => setSelectedReport(null)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', marginLeft: '8px' }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Printable Content Body */}
            <div style={{ padding: '30px 40px', overflowY: 'auto', flex: 1, backgroundColor: '#FFFFFF', color: '#0F172A' }} id="printable-area">
              
              {/* Document Banner */}
              <div style={{ borderBottom: '2.5px solid #0F172A', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {settings.templateLogoText}
                  </span>
                  <h2 style={{ fontSize: '1.4rem', margin: '4px 0 0', color: '#0F172A', fontWeight: 800 }}>{selectedReport.meta.name}</h2>
                  <p style={{ fontSize: '0.8rem', color: '#475569', margin: '2px 0 0' }}>
                    Report Date Range: <strong style={{ color: '#0F172A' }}>{new Date(selectedReport.meta.startDate).toLocaleString()}</strong> to <strong style={{ color: '#0F172A' }}>{new Date(selectedReport.meta.endDate).toLocaleString()}</strong>
                  </p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#475569', fontFamily: 'var(--mono)' }}>
                  <strong>Report ID:</strong> {selectedReport.meta.id}<br />
                  <strong>Generated:</strong> {selectedReport.meta.generatedAt}<br />
                  <strong>Author Sync:</strong> SSL Cloud Gateway
                </div>
              </div>

              {selectedReport.data.totalRowsCount === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#475569' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>⚠️</span>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 6px 0', color: '#0F172A', fontWeight: 700 }}>
                    No report data available for the selected period.
                  </h3>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>
                    No historian records were retrieved matching the specified date boundaries and selected tag indexes.
                  </p>
                </div>
              ) : (
                <>
                  {/* Tag statistics summary table */}
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '8px', borderBottom: '1.5px solid #475569', paddingBottom: '3px', textTransform: 'uppercase', color: '#0F172A', fontWeight: 700 }}>
                    📊 Telemetry Parameter Aggregate Summary
                  </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: '28px' }} className="print-table">
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #0F172A' }}>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'black', fontWeight: 700 }}>Index</th>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'black', fontWeight: 700 }}>Tag Name</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'black', fontWeight: 700 }}>Current Value</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'black', fontWeight: 700 }}>Min Bound</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'black', fontWeight: 700 }}>Max Bound</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'black', fontWeight: 700 }}>Average</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'black', fontWeight: 700 }}>Total Samples</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'black', fontWeight: 700 }}>Quality Index</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', color: 'black', fontWeight: 700 }}>Trend Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.summaries.map((s, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, fontFamily: 'var(--mono)' }}>Tag {s.tagIndex}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 500 }}>{s.tagName}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>
                        {s.count > 0 ? s.current.toFixed(s.decimalPlaces) : '-'} <span style={{ fontSize: '0.7rem', color: '#475569' }}>{s.unit}</span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#475569' }}>
                        {s.count > 0 ? s.min.toFixed(s.decimalPlaces) : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#475569' }}>
                        {s.count > 0 ? s.max.toFixed(s.decimalPlaces) : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 500 }}>
                        {s.count > 0 ? s.avg.toFixed(s.decimalPlaces) : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#475569' }}>
                        {s.count}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: s.goodPct > 98 ? '#16A34A' : '#D97706' }}>
                        {s.goodPct.toFixed(1)}% Good
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {generateReportSparkline(s.sparkPoints)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Incidents Section */}
              <h3 style={{ fontSize: '0.9rem', marginBottom: '8px', borderBottom: '1.5px solid #475569', paddingBottom: '3px', textTransform: 'uppercase', color: '#0F172A', fontWeight: 700 }}>
                🚨 Out-of-Bounds & Bad Quality Incidents Log
              </h3>
              {selectedReport.data.incidents.length === 0 ? (
                <p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#475569', marginBottom: '28px' }}>
                  Zero anomalies or connection drops logged during this reporting period.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', marginBottom: '28px' }} className="print-table">
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #475569' }}>
                      <th style={{ padding: '6px 6px', textAlign: 'left', color: 'black' }}>Timestamp</th>
                      <th style={{ padding: '6px 6px', textAlign: 'left', color: 'black' }}>Tag Channel</th>
                      <th style={{ padding: '6px 6px', textAlign: 'right', color: 'black' }}>Value</th>
                      <th style={{ padding: '6px 6px', textAlign: 'left', color: 'black' }}>Quality Code</th>
                      <th style={{ padding: '6px 6px', textAlign: 'left', color: 'black' }}>Marker code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.data.incidents.map((inc, iIdx) => (
                      <tr key={iIdx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '6px 6px' }} className="font-mono">{new Date(inc.timestamp).toLocaleString()}</td>
                        <td style={{ padding: '6px 6px' }}>Tag {inc.tagIndex}: {inc.tagName}</td>
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>{inc.val}</td>
                        <td style={{ padding: '6px 6px' }}>
                          <span style={{ color: inc.status === 192 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                            {inc.status === 192 ? 'Good (192)' : `Bad (${inc.status})`}
                          </span>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '1px 4px', borderRadius: '2px', fontWeight: 600 }}>
                            {inc.marker}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Detailed chronology table */}
              <h3 style={{ fontSize: '0.9rem', marginBottom: '8px', borderBottom: '1.5px solid #475569', paddingBottom: '3px', textTransform: 'uppercase', color: '#0F172A', fontWeight: 700 }}>
                📜 Chronological Event Log Preview (Top 300 Rows)
              </h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '4px' }} className="no-scroll-print">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }} className="print-table">
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                    <tr>
                      <th style={{ padding: '6px', textAlign: 'left', color: 'black' }}>Timestamp</th>
                      <th style={{ padding: '6px', textAlign: 'left', color: 'black' }}>Index</th>
                      <th style={{ padding: '6px', textAlign: 'left', color: 'black' }}>TagName</th>
                      <th style={{ padding: '6px', textAlign: 'right', color: 'black' }}>Value</th>
                      <th style={{ padding: '6px', textAlign: 'left', color: 'black' }}>Quality</th>
                      <th style={{ padding: '6px', textAlign: 'left', color: 'black' }}>Marker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.data.rows.map((row, rIdx) => {
                      const config = tagMap[row.TagIndex] || { TagName: `Tag ${row.TagIndex}`, DecimalPlaces: 2 };
                      return (
                        <tr key={rIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '5px 6px' }} className="font-mono">{new Date(row.DateAndTime).toLocaleString()}</td>
                          <td style={{ padding: '5px 6px', fontWeight: 600 }}>Tag {row.TagIndex}</td>
                          <td style={{ padding: '5px 6px' }}>{config.TagName}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 600 }}>{row.Val.toFixed(config.DecimalPlaces)}</td>
                          <td style={{ padding: '5px 6px', color: row.Status === 192 ? '#16A34A' : '#DC2626', fontWeight: 500 }}>
                            {row.Status === 192 ? 'Good (192)' : `Bad (${row.Status})`}
                          </td>
                          <td style={{ padding: '5px 6px', fontFamily: 'var(--mono)' }}>{row.Marker || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                </>
              )}

              {/* Document footer */}
              <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1.5px solid #0F172A', textAlign: 'center', fontSize: '0.7rem', color: '#64748B' }}>
                {settings.templateFooterText || 'CONFIDENTIAL AUTOMATED REPORT GENERATED BY CLOUD SYSTEM.'}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CSS for print-styling inside view */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            background-color: white !important;
            color: black !important;
          }
          #printable-area, #printable-area * {
            visibility: visible;
          }
          #printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            overflow: visible !important;
          }
          .modal-overlay {
            position: absolute;
            background-color: white !important;
            padding: 0 !important;
          }
          .modal-container {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            max-height: 100% !important;
            overflow: visible !important;
          }
          .no-print {
            display: none !important;
          }
          .no-scroll-print {
            max-height: none !important;
            overflow: visible !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #CBD5E1 !important;
          }
        }
      `}</style>

    </div>
  );
}
