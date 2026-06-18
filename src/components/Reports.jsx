// src/components/Reports.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { getHistorianData, getTagConfigs, getSettings, saveSettings, addEmailLog, getReportsList, saveReportRecord, deleteReportRecord, compileReportData, getRecipients } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Reports({ user }) {
  const { refreshTrigger } = useSimulator();

  // Tab State: 'workspace', 'history', 'settings'
  const [activeTab, setActiveTab] = useState('workspace');

  // Configuration state
  const [tagConfigs, setTagConfigs] = useState([]);
  const [settings, setSettings] = useState({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpSecure: true,
    templateLogoText: '',
    templateHeaderColor: '#0A0F1E',
    templateFooterText: '',
    emailRecipients: ''
  });

  // Report Builder Form State
  const [reportTitle, setReportTitle] = useState('');
  const [reportType, setReportType] = useState('Historian Shift Summary');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedReportTags, setSelectedReportTags] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReportCompiling, setIsReportCompiling] = useState(false);

  // Active compiled report in workspace preview
  const [selectedReport, setSelectedReport] = useState(null);

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
  const [emailSuccessToast, setEmailSuccessToast] = useState(false);

  const didInitRef = useRef(false);
  const isConfigAllowed = ['Super Admin', 'Plant Admin'].includes(user?.role || '');

  // Load configuration and initialize inputs
  useEffect(() => {
    const loadReportConfigs = async () => {
      const configs = await getTagConfigs();
      const sortedConfigs = configs.sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(sortedConfigs);

      const s = await getSettings();
      setSettings(s);

      // Load saved reports list from Supabase
      const savedReports = await getReportsList();
      setReportsList(savedReports);

      // Load recipients from Supabase
      const recs = await getRecipients();
      setRecipientsList(recs);

      if (!didInitRef.current) {
        // Default select tags configured as ReportsVisible
        const reportVisibleTags = sortedConfigs.filter(t => t.ReportsVisible).map(t => t.TagIndex);
        setSelectedReportTags(reportVisibleTags);

        // Default range: last 24 hours
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
        setCustomStart(yesterday);
        setCustomEnd(new Date().toISOString().slice(0, 16));
        didInitRef.current = true;
      }
    };
    loadReportConfigs();
  }, [refreshTrigger]);

  // Tag dictionary mapping
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => {
      map[c.TagIndex] = c;
    });
    return map;
  }, [tagConfigs]);

  // Filter tag configs for checkboxes
  const eligibleReportTags = useMemo(() => {
    return tagConfigs.filter(t => t.ReportsVisible);
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
    if (selectedReportTags.length === 0) {
      alert('Please select at least one tag to include in the report.');
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
      const start = new Date(customStart).toISOString();
      const end = new Date(customEnd).toISOString();
      const dateInfo = `${customStart.replace('T', ' ')} to ${customEnd.replace('T', ' ')}`;
      const name = reportTitle.trim() || `${reportType} — ${dateInfo}`;

      const newReport = {
        id: 'rep-' + Date.now(),
        name,
        type: reportType,
        dateInfo,
        startDate: start,
        endDate: end,
        tags: [...selectedReportTags],
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
    }, 800);
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

  // Refresh the currently selected report if refreshTrigger changes (in the background)
  useEffect(() => {
    if (!selectedReport) return;
    const refreshActiveReport = async () => {
      try {
        const freshData = await compileReportData(selectedReport.meta);
        setSelectedReport(prev => prev ? { ...prev, data: freshData } : null);
      } catch (err) {
        console.error("Failed to refresh active report data:", err);
      }
    };
    refreshActiveReport();
  }, [refreshTrigger]);

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

    csvContent += '\r\nCHRONOLOGICAL TELEMETRY EVENT LOG (TOP 300)\r\n';
    csvContent += 'Timestamp,Millitm,TagIndex,TagName,Value,Status,Marker\r\n';
    compiled.data.rows.forEach(r => {
      const config = tagMap[r.TagIndex] || { TagName: `Tag ${r.TagIndex}` };
      csvContent += `"${r.DateAndTime}",${r.Millitm},${r.TagIndex},"${config.TagName}",${r.Val},${r.Status},"${r.Marker || ''}"\r\n`;
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
    const category = getReportCategory(selectedReport.meta.type);
    const initialSelection = {};
    recipientsList.forEach(rec => {
      if (rec.active) {
        const subbedTypes = (rec.report_types || '').split(',').map(x => x.trim()).filter(Boolean);
        if (subbedTypes.includes(category)) {
          initialSelection[rec.email] = 'to';
        } else {
          initialSelection[rec.email] = 'none';
        }
      }
    });
    setSelectedRecipients(initialSelection);
    setCustomRecipients([]);
    setCustomEmail('');
    setCustomType('to');
    setShowEmailPrompt(true);
  };

  const handleEmailReportSubmit = async (e) => {
    e.preventDefault();
    const toList = [];
    const ccList = [];
    const bccList = [];

    Object.entries(selectedRecipients).forEach(([email, role]) => {
      if (role === 'to') toList.push(email);
      else if (role === 'cc') ccList.push(email);
      else if (role === 'bcc') bccList.push(email);
    });

    customRecipients.forEach(cr => {
      if (cr.type === 'to') toList.push(cr.email);
      else if (cr.type === 'cc') ccList.push(cr.email);
      else if (cr.type === 'bcc') bccList.push(cr.email);
    });

    if (toList.length === 0) {
      alert('Please select at least one recipient for the "To" field.');
      return;
    }

    setIsSendingEmail(true);
    try {
      const sets = await getSettings();
      if (!sets.smtpHost || !sets.smtpUser || !sets.smtpPass) {
        throw new Error('SMTP credentials are not configured. Please complete configuration in Settings page first.');
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            host: sets.smtpHost,
            port: sets.smtpPort,
            username: sets.smtpUser,
            password: sets.smtpPass,
            secure: sets.smtpSecure,
            logoText: sets.templateLogoText || sets.logoText,
            headerColor: sets.templateHeaderColor || sets.headerColor,
            footerText: sets.templateFooterText || sets.footerColor
          },
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: `Skadomation Production Report: ${selectedReport.meta.name}`,
          message: `Dear Team,\n\nPlease find the compiled production report details attached below:\n\nReport Name: ${selectedReport.meta.name}\nReport Type: ${selectedReport.meta.type}\nShift Reference: ${selectedReport.meta.shift}\nGenerated At: ${new Date(selectedReport.meta.generatedAt).toLocaleString()}\n\nMonitored Tags: ${selectedReport.meta.tags.length}\nTotal Telemetry Records: ${selectedReport.data.totalRowsCount}\n\nReport compilation completed successfully. Formats: PDF, Excel.`,
          reportData: {
            meta: selectedReport.meta,
            data: selectedReport.data
          }
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to dispatch report email.');
      }

      const recipientSummaryString = [
        toList.length > 0 ? `To: ${toList.join(', ')}` : '',
        ccList.length > 0 ? `CC: ${ccList.join(', ')}` : '',
        bccList.length > 0 ? `BCC: ${bccList.join(', ')}` : ''
      ].filter(Boolean).join(' | ');

      await addEmailLog({
        recipient: recipientSummaryString,
        subject: `Skadomation Production Report: ${selectedReport.meta.name}`,
        message: `Historian telemetry report compiled. Dispatched to ${toList.length + ccList.length + bccList.length} total recipients.`,
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

  // Settings tab save handler
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    const current = await getSettings();
    await saveSettings({
      ...current,
      smtpHost: settings.smtpHost.trim(),
      smtpPort: parseInt(settings.smtpPort) || 587,
      smtpUser: settings.smtpUser.trim(),
      smtpPass: settings.smtpPass,
      smtpSecure: settings.smtpSecure,
      templateLogoText: settings.templateLogoText.trim(),
      templateHeaderColor: settings.templateHeaderColor,
      templateFooterText: settings.templateFooterText.trim(),
      emailRecipients: settings.emailRecipients.trim()
    });
    alert("Template & delivery configurations updated successfully.");
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
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '8px', marginBottom: '20px' }} className="no-print">
        <button onClick={() => setActiveTab('workspace')} style={tabStyle(activeTab === 'workspace')}>
          📊 Report Workspace
        </button>
        <button onClick={() => setActiveTab('history')} style={tabStyle(activeTab === 'history')}>
          📜 Saved Reports
        </button>
        {isConfigAllowed && (
          <button onClick={() => setActiveTab('settings')} style={tabStyle(activeTab === 'settings')}>
            ⚙️ Template & Delivery Settings
          </button>
        )}
      </div>

      {/* ── Tab Contents ── */}
      <div style={{ flex: 1, minHeight: 0 }} className="no-print-padding">

        {/* TAB 1: Report Workspace */}
        {activeTab === 'workspace' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>

            {/* Panel 1: Top Input parameters */}
            <div className="card" style={{ padding: '16px 20px' }} data-testid="top-parameters">
              <span className="section-label">Report Parameters</span>
              <form onSubmit={handleGenerate} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1.3fr auto', gap: '20px', alignItems: 'end' }}>
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
                      <option value="Alarm & Incident Log">Alarm & Incident Log</option>
                      <option value="Full Process Audit">Full Process Audit</option>
                    </select>
                  </div>
                </div>

                {/* Column 2: Date presets & pickers */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[['today', 'Today'], ['yesterday', 'Yest'], ['7d', '7D'], ['30d', '30D']].map(([k, label]) => (
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
                    <label className="form-label">Tags Selection</label>
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
                    maxHeight: '82px',
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
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', opacity: 0.6 }}>[{t.TagIndex}]</span>
                            {t.TagName}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 4: Compile Button */}
                <div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isGenerating}
                    style={{ height: '38px', padding: '0 20px', minWidth: '130px' }}
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
                    <div style={{ borderBottom: `2.5px solid ${settings.templateHeaderColor || '#0F172A'}`, paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        {settings.templateLogoText && (
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: settings.templateHeaderColor || '#2563EB', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                            {settings.templateLogoText}
                          </div>
                        )}
                        <h2 style={{ fontSize: '1.25rem', margin: '0 0 4px', color: '#0F172A', fontWeight: 800 }}>
                          {selectedReport.meta.name}
                        </h2>
                        <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0 }}>
                          <strong>Reporting Period:</strong>{' '}
                          {new Date(selectedReport.meta.startDate).toLocaleString()} &mdash;{' '}
                          {new Date(selectedReport.meta.endDate).toLocaleString()}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#475569', fontFamily: 'monospace', lineHeight: 1.6 }}>
                        <div><strong>Report ID:</strong> {selectedReport.meta.id}</div>
                        <div><strong>Generated At:</strong> {selectedReport.meta.generatedAt}</div>
                        <div><strong>Scope Tags:</strong> {selectedReport.meta.tags.length} Mapped</div>
                      </div>
                    </div>

                    {/* Report Data Body */}
                    {selectedReport.data.totalRowsCount === 0 ? (
                      <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748B' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
                        <h4 style={{ fontSize: '0.92rem', margin: '0 0 4px', color: '#0F172A', fontWeight: 700 }}>No telemetry records available.</h4>
                        <p style={{ fontSize: '0.8rem', margin: 0 }}>No historian logs matched these parameters in the selected window.</p>
                      </div>
                    ) : (
                      <>
                        {/* Statistics summaries */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '8px', borderBottom: '1px solid #CBD5E1', paddingBottom: '3px' }}>
                          Parameter Summary Table
                        </h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', marginBottom: '24px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #0F172A' }}>
                              {['Index', 'Tag Name', 'Unit', 'Current', 'Min', 'Max', 'Average', 'Samples', 'Quality', 'Trend'].map(h => (
                                <th key={h} style={{ padding: '6px 8px', textAlign: ['Current', 'Min', 'Max', 'Average', 'Samples'].includes(h) ? 'right' : 'left', color: '#0F172A', fontWeight: 700 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedReport.data.summaries.map((s, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{s.tagIndex}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{s.tagName}</td>
                                <td style={{ padding: '6px 8px', color: '#64748B' }}>{s.unit || '—'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{s.count > 0 ? s.current.toFixed(s.decimalPlaces) : '—'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{s.count > 0 ? s.min.toFixed(s.decimalPlaces) : '—'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{s.count > 0 ? s.max.toFixed(s.decimalPlaces) : '—'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{s.count > 0 ? s.avg.toFixed(s.decimalPlaces) : '—'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{s.count}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 700, color: s.goodPct > 98 ? '#16A34A' : '#D97706' }}>{s.goodPct.toFixed(1)}%</td>
                                <td style={{ padding: '2px 8px', textAlign: 'center' }}>{generateReportSparkline(s.sparkPoints)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Incidents Table */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '8px', borderBottom: '1px solid #CBD5E1', paddingBottom: '3px' }}>
                          Quality Dropped &amp; Fault Log
                        </h4>
                        {selectedReport.data.incidents.length === 0 ? (
                          <p style={{ fontSize: '0.76rem', fontStyle: 'italic', color: '#64748B', marginBottom: '24px' }}>
                            Zero anomalies or system failures recorded in this reporting range.
                          </p>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', marginBottom: '24px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#FEF9F1', borderBottom: '1px solid #D97706' }}>
                                {['Timestamp', 'Tag Reference', 'Value', 'Quality Status', 'Message Flag'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Value' ? 'right' : 'left', color: '#0F172A', fontWeight: 700 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedReport.data.incidents.map((inc, iIdx) => (
                                <tr key={iIdx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                  <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{new Date(inc.timestamp).toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px' }}>Tag {inc.tagIndex}: {inc.tagName}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{inc.val}</td>
                                  <td style={{ padding: '5px 8px', color: inc.status === 192 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                                    {inc.status === 192 ? 'Good' : `Bad (${inc.status})`}
                                  </td>
                                  <td style={{ padding: '5px 8px' }}>
                                    <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, fontSize: '0.66rem' }}>
                                      {inc.marker}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* Chronological Table */}
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F172A', marginBottom: '8px', borderBottom: '1px solid #CBD5E1', paddingBottom: '3px' }}>
                          Telemetry Event Stream <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#64748B' }}>(limit 300 rows)</span>
                        </h4>
                        <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '4px' }} className="no-scroll-print">
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                              <tr>
                                {['Timestamp', 'Index', 'Tag Name', 'Value', 'Quality', 'Flag'].map(h => (
                                  <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Value' ? 'right' : 'left', color: '#0F172A', fontWeight: 700 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedReport.data.rows.map((row, rIdx) => {
                                const cfg = tagMap[row.TagIndex] || { TagName: `Tag ${row.TagIndex}`, DecimalPlaces: 2 };
                                return (
                                  <tr key={rIdx} style={{ borderBottom: '1px solid #F1F5F9', background: rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                    <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{new Date(row.DateAndTime).toLocaleString()}</td>
                                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{row.TagIndex}</td>
                                    <td style={{ padding: '4px 8px' }}>{cfg.TagName}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{row.Val.toFixed(cfg.DecimalPlaces)}</td>
                                    <td style={{ padding: '4px 8px', color: row.Status === 192 ? '#16A34A' : '#DC2626', fontWeight: 500 }}>
                                      {row.Status === 192 ? 'Good' : 'Bad'}
                                    </td>
                                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#64748B' }}>{row.Marker || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {/* Document Footer */}
                    <div style={{ marginTop: '36px', paddingTop: '10px', borderTop: `1.5px solid ${settings.templateHeaderColor || '#0F172A'}`, textAlign: 'center', fontSize: '0.67rem', color: '#64748B' }}>
                      {settings.templateFooterText || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.'}
                    </div>
                  </div>

                  {/* Panel 3: Bottom Action buttons */}
                  <div className="card" style={{ marginTop: '16px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Ready to distribute: <strong>{selectedReport.meta.name}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handlePrint} className="btn btn-secondary">
                        🖨️ Export PDF / Print
                      </button>
                      <button onClick={() => handleExportCSV(selectedReport.meta)} className="btn btn-secondary">
                        📥 Download CSV
                      </button>
                      <button onClick={handleOpenEmailPrompt} className="btn btn-primary">
                        ✉️ Email Report
                      </button>
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
              <table className="table">
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
                        <td className="font-semibold" style={{ color: 'var(--text)' }}>{item.name}</td>
                        <td style={{ fontSize: '0.82rem' }}>{item.type || 'Historian Shift Summary'}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.dateInfo}</td>
                        <td className="font-mono text-xs">{item.generatedAt}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button onClick={() => handleViewReport(item)} className="btn btn-secondary btn-sm">
                              👁️ View Workspace
                            </button>
                            <button onClick={() => handleExportCSV(item)} className="btn btn-secondary btn-sm">
                              📥 CSV
                            </button>
                            <button onClick={() => handleDeleteReport(item.id)} className="btn btn-danger btn-sm">
                              🗑️
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
        )}

        {/* TAB 3: Template & Delivery Settings */}
        {activeTab === 'settings' && isConfigAllowed && (
          <div className="card" style={{ padding: '28px', maxWidth: '800px', margin: '0 auto' }}>
            <span className="section-label">Template & Delivery Configurations</span>
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Delivery Configurations */}
              <div>
                <h4 style={{ fontSize: '0.88rem', color: 'var(--text)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                  📧 Report Delivery & Recipients
                </h4>
                <div className="form-group">
                  <label className="form-label" htmlFor="email-recipients">Default Recipients (comma-separated)</label>
                  <input
                    id="email-recipients"
                    className="form-control"
                    placeholder="recipient1@plant.com, recipient2@plant.com"
                    value={settings.emailRecipients}
                    onChange={(e) => setSettings({ ...settings, emailRecipients: e.target.value })}
                  />
                  <span className="form-hint">These recipients will receive the compiled documents by default upon dispatch triggers.</span>
                </div>
              </div>

              {/* Template Configurations */}
              <div>
                <h4 style={{ fontSize: '0.88rem', color: 'var(--text)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                  📄 PDF Template Logo & Footer
                </h4>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="logo-text">Company / Plant Logo Header</label>
                    <input
                      id="logo-text"
                      className="form-control"
                      placeholder="DETROIT INDUSTRIAL HISTORIAN INC"
                      value={settings.templateLogoText}
                      onChange={(e) => setSettings({ ...settings, templateLogoText: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="header-color">PDF Theme Color</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="header-color"
                        type="color"
                        className="form-control"
                        value={settings.templateHeaderColor || '#0A0F1E'}
                        onChange={(e) => setSettings({ ...settings, templateHeaderColor: e.target.value })}
                        style={{ width: '48px', padding: '0 2px', height: '42px', cursor: 'pointer' }}
                      />
                      <input
                        className="form-control"
                        value={settings.templateHeaderColor || '#0A0F1E'}
                        onChange={(e) => setSettings({ ...settings, templateHeaderColor: e.target.value })}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="footer-text">PDF Footer Compliance Text</label>
                  <textarea
                    id="footer-text"
                    className="form-control"
                    placeholder="This report contains confidential process logs. System compliance code..."
                    value={settings.templateFooterText}
                    onChange={(e) => setSettings({ ...settings, templateFooterText: e.target.value })}
                    style={{ minHeight: '60px' }}
                  />
                </div>
              </div>

              {/* SMTP Configurations */}
              <div>
                <h4 style={{ fontSize: '0.88rem', color: 'var(--text)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                  ⚙️ Global SMTP Mail Server Config
                </h4>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label" htmlFor="smtp-host">SMTP Relay Host</label>
                    <input
                      id="smtp-host"
                      className="form-control"
                      placeholder="smtp.industrialcloud.com"
                      value={settings.smtpHost}
                      onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" htmlFor="smtp-port">Relay Port</label>
                    <input
                      id="smtp-port"
                      type="number"
                      className="form-control"
                      placeholder="587"
                      value={settings.smtpPort}
                      onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="smtp-user">Auth Username</label>
                    <input
                      id="smtp-user"
                      className="form-control"
                      placeholder="alerts@industrialcloud.com"
                      value={settings.smtpUser}
                      onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="smtp-pass">Auth Password</label>
                    <input
                      id="smtp-pass"
                      type="password"
                      className="form-control"
                      placeholder="••••••••••••"
                      value={settings.smtpPass}
                      onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <input
                      type="checkbox"
                      checked={settings.smtpSecure}
                      onChange={(e) => {
                        const isSecure = e.target.checked;
                        setSettings({
                          ...settings,
                          smtpSecure: isSecure,
                          smtpPort: isSecure ? 465 : 587
                        });
                      }}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--secondary)' }}
                    />
                    Enable Direct SSL/TLS Encryption (Port 465) instead of STARTTLS (Port 587)
                  </label>
                </div>
              </div>

              {/* Submit Action */}
              <div style={{ marginTop: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px' }}>
                  💾 Save Template & Delivery Settings
                </button>
              </div>

            </form>
          </div>
        )}

      </div>

      {/* ── Email dispatch simulation dialog ── */}
      {showEmailPrompt && selectedReport && (
        <div className="modal-overlay" style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(5, 8, 17, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ maxWidth: '580px', width: '95%', padding: '24px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 10px', color: 'var(--text)' }}>Email Historian Report</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
              Send a copy of the compiled report <strong>{selectedReport.meta.name}</strong> as an email attachment.
            </p>
            
            {/* Recipient selection list */}
            <div style={{ marginBottom: '18px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>Configured Recipients</label>
              
              <div style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: '180px', overflowY: 'auto', padding: '8px' }}>
                {recipientsList.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No recipients configured in Settings.
                  </div>
                ) : (
                  recipientsList.map(rec => {
                    const isSelected = selectedRecipients[rec.email] && selectedRecipients[rec.email] !== 'none';
                    const currentRole = selectedRecipients[rec.email] || 'none';
                    return (
                      <div key={rec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '180px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedRecipients(prev => ({
                                ...prev,
                                [rec.email]: e.target.checked ? 'to' : 'none'
                              }));
                            }}
                          />
                          <div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: rec.active ? 'var(--text)' : 'var(--text-muted)' }}>{rec.name}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>{rec.email}</span>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {['to', 'cc', 'bcc'].map(type => (
                            <button
                              key={type}
                              type="button"
                              disabled={!isSelected}
                              onClick={() => {
                                setSelectedRecipients(prev => ({
                                  ...prev,
                                  [rec.email]: type
                                }));
                              }}
                              style={{
                                padding: '2px 8px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                borderRadius: '3px',
                                border: '1px solid',
                                cursor: isSelected ? 'pointer' : 'default',
                                background: currentRole === type ? 'var(--secondary)' : 'transparent',
                                color: currentRole === type ? '#fff' : 'var(--text-muted)',
                                borderColor: currentRole === type ? 'var(--secondary)' : 'var(--border)',
                                opacity: isSelected ? 1 : 0.4
                              }}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Custom recipients builder */}
            <div style={{ marginBottom: '18px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>Add Custom Recipient</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  className="form-control"
                  placeholder="custom.user@plant.com"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  style={{ flex: 1, height: '34px', fontSize: '0.8rem' }}
                />
                <select
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  className="form-control"
                  style={{ width: '80px', height: '34px', fontSize: '0.8rem', padding: '0 4px' }}
                >
                  <option value="to">To</option>
                  <option value="cc">CC</option>
                  <option value="bcc">BCC</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddCustomRecipient}
                  className="btn btn-secondary"
                  style={{ height: '34px', fontSize: '0.8rem', padding: '0 12px' }}
                >
                  ➕ Add
                </button>
              </div>
              
              {/* Custom recipients list */}
              {customRecipients.length > 0 && (
                <div style={{ marginTop: '8px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {customRecipients.map(cr => (
                    <div key={cr.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text)' }}>
                        <strong style={{ color: 'var(--secondary)', marginRight: '6px', textTransform: 'uppercase' }}>[{cr.type}]</strong>
                        {cr.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomRecipient(cr.email)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recipient summary badge counts */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '18px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Recipients Selected:</span>
              <div style={{ display: 'flex', gap: '8px', fontWeight: 600 }}>
                <span style={{ color: toCount > 0 ? 'var(--secondary)' : 'var(--text-dim)' }}>To: {toCount}</span>
                <span style={{ color: ccCount > 0 ? 'var(--success)' : 'var(--text-dim)' }}>CC: {ccCount}</span>
                <span style={{ color: bccCount > 0 ? 'var(--warning)' : 'var(--text-dim)' }}>BCC: {bccCount}</span>
                <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: '8px', color: 'var(--text)' }}>Total: {totalSelectedCount}</span>
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
          bottom: '24px',
          right: '24px',
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
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Report email dispatched successfully! Logged to System Server Feed.</span>
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
