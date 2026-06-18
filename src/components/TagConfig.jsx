// src/components/TagConfig.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { getTagConfigs, saveTagConfigs, getSettings, saveSettings, getHistorianData } from '../utils/db';
import { getSupabaseClient, getSupabaseConfig } from '../utils/supabaseClient';
import { useSimulator } from '../utils/SimulatorContext';

/* ─── SVG Icon Components ─────────────────────────────────────────── */
const EditIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const TagEmptyIcon = () => (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
    strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const TestIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const SavingSpinner = () => (
  <svg className="animate-spin" style={{ width: '14px', height: '14px', color: 'var(--secondary)', display: 'inline-block' }} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

/* ─── ToggleSwitch helper ─────────────────────────────────────────── */
function ToggleSwitch({ id, checked, onChange }) {
  return (
    <label className="toggle-switch" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-track" />
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function TagConfig() {
  const { refreshTrigger, dbConnectionStatus } = useSimulator();
  const [activeTab, setActiveTab]     = useState('tags');
  const [tagConfigs, setTagConfigs]   = useState([]);
  const [dashboardTags, setDashboardTags] = useState([]);
  const [showModal, setShowModal]     = useState(false);
  const [editingTag, setEditingTag]   = useState(null);

  const [statuses, setStatuses]       = useState({});
  const [previews, setPreviews]       = useState({});
  const [recordsCounts, setRecordsCounts] = useState({});
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [settings, setSettings]       = useState({});

  // Interactive visibility toggles states
  const [savingToggleId, setSavingToggleId] = useState(null);
  const [saveStatusMsg, setSaveStatusMsg] = useState(null);

  // History and Test mapping modal states
  const [viewingHistoryTag, setViewingHistoryTag] = useState(null);
  const [allRecentRecords, setAllRecentRecords] = useState([]);
  const [loadingHistoryId, setLoadingHistoryId] = useState(null);
  const [testingMappingId, setTestingMappingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const [dbError, setDbError] = useState(null);

  /* ── Load data ──────────────────────────────────────────────────── */
  useEffect(() => {
    const loadConfigData = async () => {
      setDbError(null);
      try {
        const configs  = await getTagConfigs();
        setTagConfigs(configs.sort((a, b) => a.TagIndex - b.TagIndex));
        const sysSettings = await getSettings();
        setSettings(sysSettings);
        setDashboardTags(sysSettings.dashboardTags || []);

        const isConnected = getSupabaseConfig() !== null;
        const supabase = getSupabaseClient();
        if (isConnected && supabase) {
          const { error } = await supabase.from('tag_configurations').select('tag_index').limit(1);
          if (error && error.message && error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('does not exist')) {
            setDbError('The database table "tag_configurations" is missing from the Supabase project. Please run the database migration script.');
          }
        }
      } catch (err) {
        console.error('loadConfigData error:', err);
      }
    };
    loadConfigData();
  }, [refreshTrigger]);

  useEffect(() => {
    const checkTagStatuses = async () => {
      if (tagConfigs.length === 0) return;
      const newStatuses = {};
      const newPreviews = {};
      const newCounts = {};

      try {
        const allData = await getHistorianData();
        const latestRecordByTag = {};

        allData.forEach(r => {
          if (r.TagIndex !== undefined && r.TagIndex !== null) {
            newCounts[r.TagIndex] = (newCounts[r.TagIndex] || 0) + 1;
            if (!latestRecordByTag[r.TagIndex]) {
              latestRecordByTag[r.TagIndex] = r;
            }
          }
        });

        const now = Date.now();
        tagConfigs.forEach(tag => {
          const index = tag.TagIndex;
          if (index === undefined || index === null || isNaN(index) || index < 0) {
            newStatuses[index] = 'Invalid TagIndex';
            return;
          }

          const record = latestRecordByTag[index];
          if (!record) {
            newStatuses[index] = 'No Data Found';
          } else {
            newPreviews[index] = {
              val: record.Val,
              timestamp: record.DateAndTime,
              status: record.Status
            };
            const recTime = new Date(record.DateAndTime).getTime();
            const ageSeconds = (now - recTime) / 1000;
            if (record.Status === 0) {
              newStatuses[index] = 'Sync Error';
            } else if (ageSeconds <= 60) {
              newStatuses[index] = 'Active';
            } else {
              newStatuses[index] = 'Connected';
            }
          }
        });
      } catch (err) {
        console.error("Error checking tag statuses:", err);
        tagConfigs.forEach(tag => {
          newStatuses[tag.TagIndex] = 'Sync Error';
        });
      }
      setStatuses(newStatuses);
      setPreviews(newPreviews);
      setRecordsCounts(newCounts);
      setLastSyncTime(new Date());
    };
    checkTagStatuses();
  }, [tagConfigs, refreshTrigger]);

  /* ── Handlers ───────────────────────────────────────────────────── */
  const handleEditOpen = (tag) => {
    setEditingTag({ ...tag, isNew: false });
    setShowModal(true);
  };

  const handleAddNewOpen = () => {
    setEditingTag({
      TagIndex: '',
      TagName: '',
      Unit: '',
      Description: '',
      DecimalPlaces: 2,
      DashboardVisible: false,
      TrendsVisible: false,
      ReportsVisible: false,
      isNew: true
    });
    setShowModal(true);
  };

  const handleSaveTag = async (e) => {
    e.preventDefault();
    if (editingTag.isNew) {
      const indexNum = parseInt(editingTag.TagIndex);
      if (isNaN(indexNum)) { alert('Tag Index must be a valid number.'); return; }
      if (tagConfigs.some(t => t.TagIndex === indexNum)) {
        alert(`Tag Index ${indexNum} is already configured. Please choose a unique Tag Index.`);
        return;
      }
      const newTag = {
        TagIndex: indexNum,
        TagName: editingTag.TagName,
        Unit: editingTag.Unit,
        Description: editingTag.Description,
        DecimalPlaces: editingTag.DecimalPlaces,
        DashboardVisible: editingTag.DashboardVisible,
        TrendsVisible: editingTag.TrendsVisible,
        ReportsVisible: editingTag.ReportsVisible
      };
      const updatedConfigs = [...tagConfigs, newTag].sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(updatedConfigs);
      await saveTagConfigs(updatedConfigs);
      
      setSaveStatusMsg({
        type: 'success',
        text: `Created configuration for Tag Index #${newTag.TagIndex} successfully.`
      });
      setTimeout(() => setSaveStatusMsg(null), 3000);
    } else {
      const updatedConfigs = tagConfigs.map(t => t.TagIndex === editingTag.TagIndex ? editingTag : t);
      setTagConfigs(updatedConfigs);
      await saveTagConfigs(updatedConfigs);
      if (!editingTag.DashboardVisible && dashboardTags.includes(editingTag.TagIndex)) {
        const updatedDashboardTags = dashboardTags.filter(id => id !== editingTag.TagIndex);
        setDashboardTags(updatedDashboardTags);
        const currentSettings = await getSettings();
        await saveSettings({ ...currentSettings, dashboardTags: updatedDashboardTags });
      }
      
      setSaveStatusMsg({
        type: 'success',
        text: `Updated configurations for Tag Index #${editingTag.TagIndex} successfully.`
      });
      setTimeout(() => setSaveStatusMsg(null), 3000);
    }
    setShowModal(false);
  };

  const handleToggleVisibility = async (tagIndex, field) => {
    const originalConfigs = [...tagConfigs];
    const toggledTag = tagConfigs.find(t => t.TagIndex === tagIndex);
    if (!toggledTag) return;
    const originalValue = toggledTag[field];
    const newValue = !originalValue;

    const toggleKey = `${tagIndex}-${field}`;

    // Optimistic UI update
    const updatedConfigs = tagConfigs.map(t => {
      if (t.TagIndex === tagIndex) {
        return { ...t, [field]: newValue };
      }
      return t;
    });
    setTagConfigs(updatedConfigs);
    setSavingToggleId(toggleKey);
    setSaveStatusMsg(null);

    try {
      await saveTagConfigs(updatedConfigs);

      // If DashboardVisible is toggled off, sync with settings.dashboardTags if selected as a KPI
      if (field === 'DashboardVisible' && !newValue && dashboardTags.includes(tagIndex)) {
        const updatedDashboardTags = dashboardTags.filter(id => id !== tagIndex);
        setDashboardTags(updatedDashboardTags);
        const currentSettings = await getSettings();
        await saveSettings({ ...currentSettings, dashboardTags: updatedDashboardTags });
      }

      setSavingToggleId(null);
      setSaveStatusMsg({
        type: 'success',
        text: `Updated ${field} for Tag #${tagIndex} successfully.`
      });
      setTimeout(() => {
        setSaveStatusMsg(prev => (prev && prev.text.includes(tagIndex.toString()) && prev.text.includes(field)) ? null : prev);
      }, 3000);
    } catch (err) {
      console.error("Failed to save toggle visibility:", err);
      setTagConfigs(originalConfigs);
      setSavingToggleId(null);
      setSaveStatusMsg({
        type: 'error',
        text: `Failed to update ${field} for Tag #${tagIndex}. Reverted changes.`
      });
      setTimeout(() => {
        setSaveStatusMsg(prev => (prev && prev.text.includes(tagIndex.toString())) ? null : prev);
      }, 4000);
    }
  };

  const handleDeleteTag = async (tagIndex) => {
    if (!window.confirm(`Are you sure you want to delete the configuration for Tag Index ${tagIndex}?`)) return;
    const updatedConfigs = tagConfigs.filter(t => t.TagIndex !== tagIndex);
    setTagConfigs(updatedConfigs);
    await saveTagConfigs(updatedConfigs);
    if (dashboardTags.includes(tagIndex)) {
      const updatedDashboardTags = dashboardTags.filter(id => id !== tagIndex);
      setDashboardTags(updatedDashboardTags);
      const currentSettings = await getSettings();
      await saveSettings({ ...currentSettings, dashboardTags: updatedDashboardTags });
    }
    
    setSaveStatusMsg({
      type: 'success',
      text: `Tag configuration for Index #${tagIndex} deleted successfully.`
    });
    setTimeout(() => setSaveStatusMsg(null), 3000);
  };

  const handleKpiToggle = (tagIndex) => {
    if (dashboardTags.includes(tagIndex)) {
      setDashboardTags(prev => prev.filter(id => id !== tagIndex));
    } else {
      setDashboardTags(prev => [...prev, tagIndex]);
    }
  };

  const handleSaveDashboardKpis = async () => {
    const currentSettings = await getSettings();
    await saveSettings({ ...currentSettings, dashboardTags });
    setSaveStatusMsg({
      type: 'success',
      text: 'Dashboard KPI annunciators updated successfully!'
    });
    setTimeout(() => setSaveStatusMsg(null), 3000);
  };

  const handleHistoryOpen = async (tag) => {
    setLoadingHistoryId(tag.TagIndex);
    try {
      const records = await getHistorianData({ tagIndexes: [tag.TagIndex], limit: 20 });
      setAllRecentRecords(records);
      setViewingHistoryTag(tag);
    } catch (err) {
      console.error("Error loading tag history:", err);
      alert("Failed to load ingestion history: " + (err.message || err));
    } finally {
      setLoadingHistoryId(null);
    }
  };

  const handleTestMapping = async (tagIndex) => {
    setTestingMappingId(tagIndex);
    const startTime = performance.now();
    const activeTableName = settings.selectedTable || 'Database';
    try {
      const records = await getHistorianData({ tagIndexes: [tagIndex], limit: 1 });
      const duration = (performance.now() - startTime).toFixed(1);

      if (records && records.length > 0) {
        setTestResult({
          tagIndex,
          table: activeTableName,
          status: 'success',
          duration,
          message: `Mapping test successful! Decoded 1 row from table [${activeTableName}].`,
          details: records[0]
        });
      } else {
        setTestResult({
          tagIndex,
          table: activeTableName,
          status: 'success',
          duration,
          message: `Mapping test successful! Table [${activeTableName}] is accessible, but no records exist for Tag Index #${tagIndex} yet.`,
          details: null
        });
      }
    } catch (err) {
      const duration = (performance.now() - startTime).toFixed(1);
      setTestResult({
        tagIndex,
        table: activeTableName,
        status: 'error',
        duration,
        message: `Connection test failed: ${err.message || err}`,
        details: null
      });
    } finally {
      setTestingMappingId(null);
    }
  };

  const eligibleKpiTags = tagConfigs.filter(t => t.DashboardVisible);

  /* ── Quality render helper ──────────────────────────────────────── */
  const renderQuality = (tagIndex) => {
    const status = statuses[tagIndex];
    const preview = previews[tagIndex];

    if (status === 'No Data Found') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-dim)' }} />
          Uncertain (No Data)
        </span>
      );
    }

    if (status === 'Sync Error' || (preview && preview.status === 0)) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--error)', fontSize: '0.8rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--error)' }} />
          Bad (Error)
        </span>
      );
    }

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--success)', fontSize: '0.8rem' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
        Good
      </span>
    );
  };

  /* ── Styles ─────────────────────────────────────────────────────── */
  const iconBtnBase = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '32px',
    height:         '32px',
    borderRadius:   '8px',
    border:         '1px solid var(--border)',
    background:     'transparent',
    cursor:         'pointer',
    transition:     'all 0.18s ease',
    flexShrink:     0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

      {dbError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.22)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginTop: '10px',
          marginBottom: '20px',
          color: '#F87171',
          fontSize: '0.87rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{dbError}</span>
        </div>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* ── Sub-tab navigation ──────────────────────────────────────── */}
      <div
        className="no-print"
        style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '4px', marginBottom: '24px' }}
      >
        {[
          { key: 'tags', label: '⚙️ Tag Configuration Parameters' },
          {
            key: 'kpis',
            label: `📊 Dashboard KPI Selection (${dashboardTags.filter(id => eligibleKpiTags.some(t => t.TagIndex === id)).length} Selected)`
          }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding:       '10px 16px',
              border:        'none',
              borderBottom:  activeTab === tab.key ? '2px solid var(--secondary)' : '2px solid transparent',
              background:    'transparent',
              color:         activeTab === tab.key ? 'var(--secondary)' : 'var(--text-muted)',
              fontWeight:    activeTab === tab.key ? 600 : 500,
              cursor:        'pointer',
              fontSize:      '0.875rem',
              transition:    'color 0.15s',
              whiteSpace:    'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1 — Tag Configuration
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'tags' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Tag Configuration Management
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                Configure primary telemetry parameters, database schema mappings, and view historians.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Database Connection Status */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-raised)',
                fontSize: '0.78rem',
                color: 'var(--text-muted)'
              }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
                  DB LINK:
                </span>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: dbConnectionStatus === 'Connected' ? '#22c55e' : dbConnectionStatus === 'Syncing' ? '#f59e0b' : '#ef4444',
                  boxShadow: `0 0 6px ${dbConnectionStatus === 'Connected' ? '#22c55e' : dbConnectionStatus === 'Syncing' ? '#f59e0b' : '#ef4444'}`
                }} />
                <span style={{ fontWeight: 600, color: dbConnectionStatus === 'Connected' ? '#22c55e' : dbConnectionStatus === 'Syncing' ? '#f59e0b' : '#ef4444' }}>
                  {dbConnectionStatus}
                </span>
              </div>
              <button
                onClick={handleAddNewOpen}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}
              >
                <PlusIcon /> Add Tag
              </button>
            </div>
          </div>

          {/* ── KPI Summary Cards ────────────────────────────────────── */}
          <div className="grid-6" style={{ marginBottom: '4px' }}>
            {/* Card 1: Total Configured */}
            <div className="stat-card">
              <div className="stat-card-label">Total Configured</div>
              <div className="stat-card-value">
                {tagConfigs.length}
                <span className="stat-card-unit">Tags</span>
              </div>
              <div className="stat-card-meta">All configured SCADA points</div>
            </div>

            {/* Card 2: Dashboard Tags */}
            <div className="stat-card">
              <div className="stat-card-label">Dashboard Tags</div>
              <div className="stat-card-value">
                {tagConfigs.filter(t => t.DashboardVisible).length}
                <span className="stat-card-unit">Visible</span>
              </div>
              <div className="stat-card-meta">KPI-eligible channels</div>
            </div>

            {/* Card 3: Trend Tags */}
            <div className="stat-card">
              <div className="stat-card-label">Trend Tags</div>
              <div className="stat-card-value">
                {tagConfigs.filter(t => t.TrendsVisible).length}
                <span className="stat-card-unit">Charts</span>
              </div>
              <div className="stat-card-meta">Plotted in Trend viewer</div>
            </div>

            {/* Card 4: Report Tags */}
            <div className="stat-card">
              <div className="stat-card-label">Report Tags</div>
              <div className="stat-card-value">
                {tagConfigs.filter(t => t.ReportsVisible).length}
                <span className="stat-card-unit">Active</span>
              </div>
              <div className="stat-card-meta">Included in PDF reports</div>
            </div>

            {/* Card 5: Active Tags */}
            <div className="stat-card">
              <div className="stat-card-label">Active Tags</div>
              <div className="stat-card-value" style={{ color: 'var(--success)' }}>
                {tagConfigs.filter(t => statuses[t.TagIndex] === 'Active').length}
                <span className="stat-card-unit" style={{ color: 'var(--success)' }}>Active</span>
              </div>
              <div className="stat-card-meta">Telemetry in last 60s</div>
            </div>

            {/* Card 6: Database Connected */}
            <div className="stat-card">
              <div className="stat-card-label">DB Connected</div>
              <div className="stat-card-value" style={{ color: 'var(--accent)' }}>
                {tagConfigs.filter(t => (recordsCounts[t.TagIndex] || 0) > 0).length}
                <span className="stat-card-unit" style={{ color: 'var(--accent)' }}>Linked</span>
              </div>
              <div className="stat-card-meta">With database records</div>
            </div>
          </div>

          {/* ── Database Mapping Schema Banner ─────────────────────── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(14, 165, 233, 0.04)',
            border: '1px dashed rgba(14, 165, 233, 0.25)',
            marginBottom: '4px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem' }}>🔗</span>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Database Mapping Schema
                </span>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 500, marginTop: '2px' }}>
                  Table: <code style={{ color: 'var(--accent)', background: 'rgba(14, 165, 233, 0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--mono)' }}>{settings.selectedTable || 'Database'}</code>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Tag Index', col: settings.columnMappings?.tagCol || 'TagIndex' },
                { label: 'Value', col: settings.columnMappings?.valueCol || 'Val' },
                { label: 'Timestamp', col: settings.columnMappings?.timestampCol || 'DateAndTime' },
                { label: 'Status', col: settings.columnMappings?.statusCol || 'Status' }
              ].map((m, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label} Column</span>
                  <code style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{m.col}</code>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block' }}>
                Link Status
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: dbConnectionStatus === 'Connected' || dbConnectionStatus === 'Syncing' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: dbConnectionStatus === 'Connected' || dbConnectionStatus === 'Syncing' ? 'var(--success)' : 'var(--error)',
                border: dbConnectionStatus === 'Connected' || dbConnectionStatus === 'Syncing' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.03em'
              }}>
                <span style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: dbConnectionStatus === 'Connected' || dbConnectionStatus === 'Syncing' ? 'var(--success)' : 'var(--error)'
                }} />
                {dbConnectionStatus === 'Connected' || dbConnectionStatus === 'Syncing' ? 'ACTIVE DASHBOARD LINK' : 'LOCAL BUFFER'}
              </span>
            </div>
          </div>

          {/* Table card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {tagConfigs.length === 0 ? (
              /* Empty state */
              <div style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                padding:        '72px 24px',
                gap:            '14px',
                textAlign:      'center',
              }}>
                <TagEmptyIcon />
                <div>
                  <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
                    No Tags Configured
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '340px' }}>
                    Add your first tag to begin mapping historian data channels.
                  </p>
                </div>
                <button
                  onClick={handleAddNewOpen}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '4px' }}
                >
                  <PlusIcon /> Add First Tag
                </button>
              </div>
            ) : (
              /* Data table */
              <div className="table-responsive" style={{ overflowX: 'auto', width: '100%', maxHeight: '550px', background: 'var(--card-bg)' }}>
                <table className="table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1350px' }}>
                  <thead>
                    <tr>
                      {[
                        { name: 'INDEX', align: 'left', width: '80px' },
                        { name: 'TAG NAME', align: 'left', width: '220px' },
                        { name: 'UNIT', align: 'left', width: '90px' },
                        { name: 'DESCRIPTION', align: 'left', width: '240px' },
                        { name: 'LAST VALUE', align: 'right', width: '120px' },
                        { name: 'LAST TIMESTAMP', align: 'left', width: '140px' },
                        { name: 'QUALITY', align: 'left', width: '150px' },
                        { name: 'STATUS', align: 'left', width: '130px' },
                        { name: 'DATABASE MAPPING', align: 'left', width: '220px' },
                        { name: 'RECORDS COUNT', align: 'right', width: '130px' },
                        { name: 'LAST SYNC', align: 'left', width: '120px' },
                        { name: 'DASHBOARD', align: 'center', width: '100px' },
                        { name: 'TRENDS', align: 'center', width: '90px' },
                        { name: 'REPORTS', align: 'center', width: '90px' },
                        { name: 'ACTIONS', align: 'right', width: '180px' }
                      ].map(col => (
                        <th
                          key={col.name}
                          style={{
                            padding:         '12px 14px',
                            fontSize:        '0.68rem',
                            fontWeight:      700,
                            letterSpacing:   '0.07em',
                            color:           'var(--text-muted)',
                            textAlign:       col.align,
                            background:      'var(--surface)',
                            borderBottom:    '1px solid var(--border)',
                            whiteSpace:      'nowrap',
                            position:        'sticky',
                            top:             0,
                            zIndex:          1,
                            width:           col.width
                          }}
                        >
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tagConfigs.map((tag, idx) => (
                      <tr
                        key={tag.TagIndex}
                        style={{
                          background:  idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                          transition:  'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(14,165,233,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
                      >
                        {/* TAG INDEX */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          <span className="tag-pill">#{tag.TagIndex}</span>
                        </td>

                        {/* NAME */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {tag.TagName}
                        </td>

                        {/* UNIT */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'left' }}>
                          {tag.Unit || <span style={{ opacity: 0.35 }}>—</span>}
                        </td>

                        {/* DESCRIPTION */}
                        <td style={{
                          padding:      '12px 14px',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize:     '0.8rem',
                          color:        'var(--text-muted)',
                          maxWidth:     '240px',
                          whiteSpace:   'nowrap',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          textAlign:    'left'
                        }} title={tag.Description}>
                          {tag.Description || <span style={{ opacity: 0.35 }}>—</span>}
                        </td>

                        {/* LAST VALUE */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {previews[tag.TagIndex] !== undefined && previews[tag.TagIndex].val !== null ? (
                            `${previews[tag.TagIndex].val.toFixed(tag.DecimalPlaces ?? 2)}`
                          ) : (
                            <span style={{ opacity: 0.35 }}>—</span>
                          )}
                        </td>

                        {/* LAST TIMESTAMP */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {previews[tag.TagIndex] !== undefined && previews[tag.TagIndex].timestamp ? (
                            new Date(previews[tag.TagIndex].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          ) : (
                            <span style={{ opacity: 0.35 }}>—</span>
                          )}
                        </td>

                        {/* QUALITY */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          {renderQuality(tag.TagIndex)}
                        </td>

                        {/* STATUS */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          {(() => {
                            const status = statuses[tag.TagIndex] || 'Checking...';
                            let bg = 'rgba(59, 130, 246, 0.1)';
                            let color = 'var(--secondary)';
                            let border = '1px solid rgba(59, 130, 246, 0.25)';

                            if (status === 'Active') {
                              bg = 'rgba(16, 185, 129, 0.1)';
                              color = 'var(--success)';
                              border = '1px solid rgba(16, 185, 129, 0.25)';
                            } else if (status === 'No Data Found') {
                              bg = 'rgba(245, 158, 11, 0.1)';
                              color = 'var(--warning)';
                              border = '1px solid rgba(245, 158, 11, 0.25)';
                            } else if (status === 'Invalid TagIndex' || status === 'Sync Error') {
                              bg = 'rgba(239, 68, 68, 0.1)';
                              color = 'var(--error)';
                              border = '1px solid rgba(239, 68, 68, 0.25)';
                            }

                            return (
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                background: bg,
                                color: color,
                                border: border,
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em'
                              }}>
                                {status}
                              </span>
                            );
                          })()}
                        </td>

                        {/* DATABASE MAPPING */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {settings.selectedTable || 'Database'}.{settings.columnMappings?.valueCol || 'Val'}
                          </code>
                        </td>

                        {/* RECORDS COUNT */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
                          {recordsCounts[tag.TagIndex] !== undefined ? recordsCounts[tag.TagIndex] : 0}
                        </td>

                        {/* LAST SYNC TIME */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {(statuses[tag.TagIndex] === 'Active' || statuses[tag.TagIndex] === 'Connected') && lastSyncTime ? (
                            lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          ) : (
                            <span style={{ opacity: 0.35 }}>—</span>
                          )}
                        </td>

                        {/* DASHBOARD visibility toggle */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-DashboardVisible` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-dash-${tag.TagIndex}`}
                              checked={tag.DashboardVisible}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'DashboardVisible')}
                            />
                          )}
                        </td>

                        {/* TRENDS visibility toggle */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-TrendsVisible` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-trend-${tag.TagIndex}`}
                              checked={tag.TrendsVisible}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'TrendsVisible')}
                            />
                          )}
                        </td>

                        {/* REPORTS visibility toggle */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-ReportsVisible` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-rep-${tag.TagIndex}`}
                              checked={tag.ReportsVisible}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'ReportsVisible')}
                            />
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleHistoryOpen(tag)}
                              title="View Ingestion History (Last 20 records)"
                              disabled={loadingHistoryId !== null || testingMappingId !== null}
                              style={iconBtnBase}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; e.currentTarget.style.background = 'rgba(14,165,233,0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                            >
                              {loadingHistoryId === tag.TagIndex ? (
                                <SavingSpinner />
                              ) : (
                                <HistoryIcon />
                              )}
                            </button>

                            <button
                              onClick={() => handleTestMapping(tag.TagIndex)}
                              title="Test Database Mapping Connection"
                              disabled={loadingHistoryId !== null || testingMappingId !== null}
                              style={iconBtnBase}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--success)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'; e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                            >
                              {testingMappingId === tag.TagIndex ? (
                                <SavingSpinner />
                              ) : (
                                <TestIcon />
                              )}
                            </button>

                            <button
                              onClick={() => handleEditOpen(tag)}
                              title="Edit tag configuration"
                              style={iconBtnBase}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--secondary)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                            >
                              <EditIcon />
                            </button>

                            <button
                              onClick={() => handleDeleteTag(tag.TagIndex)}
                              title="Delete tag configuration"
                              style={iconBtnBase}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2 — Dashboard KPI Selection
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'kpis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Dashboard KPI Annunciators
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                Select up to 5 dashboard-visible tags to display as KPI cards.
              </p>
            </div>
            <button onClick={handleSaveDashboardKpis} className="btn btn-primary" style={{ flexShrink: 0 }}>
              💾 Save KPI Selection
            </button>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            {eligibleKpiTags.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text)', margin: 0 }}>No dashboard-visible tags found.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Go to "Tag Configuration Parameters" and enable Dashboard visibility on at least one tag.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {eligibleKpiTags.map((tag) => {
                  const isSelected = dashboardTags.includes(tag.TagIndex);
                  return (
                    <div
                      key={tag.TagIndex}
                      onClick={() => handleKpiToggle(tag.TagIndex)}
                      style={{
                        padding:         '16px',
                        borderRadius:    'var(--radius-sm)',
                        border:          isSelected ? '1.5px solid var(--secondary)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'rgba(14,165,233,0.06)' : 'var(--background)',
                        cursor:          'pointer',
                        transition:      'all 0.15s',
                        display:         'flex',
                        alignItems:      'center',
                        justifyContent:  'space-between',
                      }}
                    >
                      <div>
                        <span className="tag-pill" style={{ marginBottom: '6px', display: 'inline-block' }}>
                          #{tag.TagIndex}
                        </span>
                        <strong style={{ display: 'block', color: 'var(--text)', fontSize: '0.9rem', marginTop: '4px' }}>
                          {tag.TagName}
                        </strong>
                        {tag.Unit && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tag.Unit}</span>
                        )}
                      </div>
                      <span style={{ fontSize: '1.1rem', color: isSelected ? 'var(--secondary)' : 'var(--border)', flexShrink: 0 }}>
                        {isSelected ? '✓' : '○'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL — Add / Edit Tag
      ══════════════════════════════════════════════════════════════ */}
      {showModal && editingTag && (
        <div className="modal-overlay">
          <div
            className="modal-container"
            style={{ maxWidth: '480px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
          >
            {/* Modal header */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '18px 24px',
              borderBottom:   '1px solid var(--border)',
              background:     'var(--surface)',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                  {editingTag.isNew ? 'Add Tag' : `Edit Tag: ${editingTag.TagName}`}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {editingTag.isNew
                    ? 'Define a new historian tag mapping.'
                    : `Editing Tag Index #${editingTag.TagIndex}`}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleSaveTag} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', background: 'var(--card-bg)' }}>

              {/* Tag Index — only when adding */}
              {editingTag.isNew && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="modal-tag-index">Tag Index</label>
                  <input
                    id="modal-tag-index"
                    type="number"
                    min="0"
                    className="form-control"
                    value={editingTag.TagIndex}
                    onChange={e => setEditingTag({ ...editingTag, TagIndex: e.target.value })}
                    required
                    placeholder="e.g. 22"
                  />
                </div>
              )}

              {/* Tag Name */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="modal-tag-name">Tag Name</label>
                <input
                  id="modal-tag-name"
                  type="text"
                  className="form-control"
                  value={editingTag.TagName}
                  onChange={e => setEditingTag({ ...editingTag, TagName: e.target.value })}
                  required
                  placeholder="e.g. Reactor Temperature"
                />
              </div>

              {/* Unit + Decimal Places */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="modal-tag-unit">Unit</label>
                  <input
                    id="modal-tag-unit"
                    type="text"
                    className="form-control"
                    placeholder="e.g. °C, bar, RPM"
                    value={editingTag.Unit}
                    onChange={e => setEditingTag({ ...editingTag, Unit: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="modal-tag-decimals">Decimal Places</label>
                  <input
                    id="modal-tag-decimals"
                    type="number"
                    min="0"
                    max="6"
                    className="form-control"
                    value={editingTag.DecimalPlaces}
                    onChange={e => setEditingTag({ ...editingTag, DecimalPlaces: parseInt(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="modal-tag-desc">Description</label>
                <input
                  id="modal-tag-desc"
                  type="text"
                  className="form-control"
                  value={editingTag.Description || ''}
                  onChange={e => setEditingTag({ ...editingTag, Description: e.target.value })}
                  placeholder="Brief description of this data channel"
                />
              </div>

              {/* Visibility toggles */}
              <div style={{
                padding:      '16px',
                borderRadius: 'var(--radius-sm)',
                border:       '1px solid var(--border)',
                background:   'var(--surface-raised)',
              }}>
                <p style={{ margin: '0 0 14px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Visibility
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {[
                    { label: 'Dashboard', key: 'DashboardVisible', id: 'modal-vis-dash' },
                    { label: 'Trends',    key: 'TrendsVisible',    id: 'modal-vis-trends' },
                    { label: 'Reports',   key: 'ReportsVisible',   id: 'modal-vis-reports' },
                  ].map(({ label, key, id }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label
                        htmlFor={id}
                        style={{ fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}
                      >
                        {label}
                      </label>
                      <ToggleSwitch
                        id={id}
                        checked={editingTag[key]}
                        onChange={e => setEditingTag({ ...editingTag, [key]: e.target.checked })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal footer */}
              <div style={{
                display:       'flex',
                gap:           '10px',
                paddingTop:    '4px',
                borderTop:     '1px solid var(--border)',
                marginTop:     '2px',
              }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                >
                  {editingTag.isNew ? 'Add Tag' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL — Recent Ingestion History
      ══════════════════════════════════════════════════════════════ */}
      {viewingHistoryTag && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '640px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                  Recent Ingestion History
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Showing last 20 telemetry values for <strong>{viewingHistoryTag.TagName}</strong> (Index #{viewingHistoryTag.TagIndex})
                </p>
              </div>
              <button
                onClick={() => setViewingHistoryTag(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '24px', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {allRecentRecords.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text)', margin: 0 }}>No records found in database.</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Ensure the sync gateway is running and writing telemetry.
                  </p>
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '350px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
                  <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>TIMESTAMP</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>VALUE</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>STATUS</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>QUALITY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRecentRecords.map((r, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)' }}>
                            {new Date(r.DateAndTime).toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)' }}>
                            {r.Val !== undefined && r.Val !== null ? r.Val.toFixed(viewingHistoryTag.DecimalPlaces ?? 2) : '—'}
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: '4px' }}>{viewingHistoryTag.Unit}</span>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)' }}>
                            {r.Status !== undefined ? r.Status : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                            {r.Status === 1 ? (
                              <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600 }}>Good</span>
                            ) : (
                              <span style={{ color: 'var(--error)', fontSize: '0.75rem', fontWeight: 600 }}>Bad ({r.Status === 0 ? 'Sync Error' : 'Unknown'})</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={() => setViewingHistoryTag(null)} className="btn btn-secondary" style={{ minWidth: '100px' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL — Database Mapping Test Result
      ══════════════════════════════════════════════════════════════ */}
      {testResult && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '540px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                  Database Mapping Test Result
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Diagnostics for Tag Index #{testResult.tagIndex}
                </p>
              </div>
              <button
                onClick={() => setTestResult(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '24px', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Test Status</span>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: testResult.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: testResult.status === 'success' ? 'var(--success)' : 'var(--error)',
                  border: testResult.status === 'success' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                }}>
                  {testResult.status === 'success' ? 'PASSED' : 'FAILED'}
                </span>
              </div>

              <div className="info-row">
                <span className="info-row-label">Target Table</span>
                <span className="info-row-value font-mono">{testResult.table}</span>
              </div>
              <div className="info-row">
                <span className="info-row-label">Response Time</span>
                <span className="info-row-value font-mono">{testResult.duration} ms</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Diagnosis Message</span>
                <div style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  fontSize: '0.82rem',
                  color: 'var(--text)'
                }}>
                  {testResult.message}
                </div>
              </div>

              {testResult.details && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Latest Decoded Database Record</span>
                  <pre style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-xs)',
                    background: '#040810',
                    border: '1px solid var(--border)',
                    fontSize: '0.78rem',
                    color: '#34d399',
                    fontFamily: 'var(--mono)',
                    overflowX: 'auto',
                    maxHeight: '160px'
                  }}>
                    {JSON.stringify(testResult.details, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={() => setTestResult(null)} className="btn btn-secondary" style={{ minWidth: '100px' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ──────────────────────────────────────── */}
      {saveStatusMsg && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          padding: '12px 18px',
          borderRadius: 'var(--radius-sm)',
          background: saveStatusMsg.type === 'success' ? '#0d2a1f' : '#2d1414',
          border: saveStatusMsg.type === 'success' ? '1px solid var(--success)' : '1px solid var(--error)',
          color: saveStatusMsg.type === 'success' ? 'var(--success)' : 'var(--error)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'slideIn 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          <span>{saveStatusMsg.type === 'success' ? '✅' : '❌'}</span>
          <span>{saveStatusMsg.text}</span>
          <button
            onClick={() => setSaveStatusMsg(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              marginLeft: '10px'
            }}
          >
            ×
          </button>
        </div>
      )}

    </div>
  );
}
