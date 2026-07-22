// src/components/TagConfig.jsx - Build trigger 2026-07-22 15:53
import { useState, useEffect, useRef } from 'react';
import { getTagConfigs, saveTagConfigs, getSettings, saveSettings, getHistorianData, getSampleStationMappings, upsertSampleStationMapping, deleteSampleStationMapping } from '../utils/db';
import { getSupabaseClient, getSupabaseConfig } from '../utils/supabaseClient';
import { useSimulator } from '../utils/SimulatorContext';
import { getLatestRecord } from '../utils/historianService';
import ScrollableTagList from './ScrollableTagList';

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
function ToggleSwitch({ id, checked, onChange, disabled, loading }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <label className="toggle-switch" htmlFor={id} style={{ opacity: loading ? 0.5 : disabled ? 0.55 : 1, cursor: (disabled || loading) ? 'not-allowed' : 'pointer' }}>
        <input id={id} type="checkbox" checked={checked} onChange={(disabled || loading) ? undefined : onChange} disabled={disabled || loading} />
        <span className="toggle-track" />
      </label>
      {loading && (
        <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <SavingSpinner />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function TagConfig({ user, isActive }) {
  const { refreshTrigger, dbConnectionStatus, setRefreshTrigger } = useSimulator();
  const tableContainerRef = useRef(null);
  const initialScrollSetRef = useRef(false);
  const isSuperAdmin = user?.role === 'Super Admin';
  const isAdmin = user?.role === 'Admin';
  const canAddOrDelete = isSuperAdmin;
  const canEditOrToggle = isSuperAdmin || isAdmin;
  const isReadOnly = !canEditOrToggle;
  const [activeTab, setActiveTab]     = useState('tags');
  const [tagConfigs, setTagConfigs]   = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dashboardTags, setDashboardTags] = useState([]);
  const [showModal, setShowModal]     = useState(false);
  const [editingTag, setEditingTag]   = useState(null);

  const [statuses, setStatuses]       = useState({});
  const [previews, setPreviews]       = useState({});
  const [recordsCounts, setRecordsCounts] = useState({});
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [settings, setSettings]       = useState({});

  // Interactive visibility toggles states
  const [savingKeys, setSavingKeys] = useState(new Set());
  const [saveStatusMsg, setSaveStatusMsg] = useState(null);

  // UI helper states (used in JSX)
  const [dbError, setDbError] = useState(null);
  const [savingToggleId, setSavingToggleId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testingMappingId, setTestingMappingId] = useState(null);
  const [viewingHistoryTag, setViewingHistoryTag] = useState(null);
  const [allRecentRecords, setAllRecentRecords] = useState([]);
  const [loadingHistoryId, setLoadingHistoryId] = useState(null);

  // ── Sample Station Mapping State (final architecture) ─────────────────────
  // ssMappings: rows from sample_station_mappings cloud table
  // Each row: { id, tag_id, equipment_name, circuit, role }
  const [ssMappings, setSsMappings] = useState([]);
  // rowEdits: live unsaved edits per tag_id: { [tagId]: { circuit, role } }
  const [rowEdits, setRowEdits] = useState({});
  const [rowSaving, setRowSaving] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [rowSuccess, setRowSuccess] = useState({});

  /* ── Load data ──────────────────────────────────────────────────── */
  useEffect(() => {
    const loadConfigData = async () => {
      setDbError(null);
      try {
        const configs  = await getTagConfigs({ forceRefresh: true });
        setTagConfigs(configs.sort((a, b) => a.TagIndex - b.TagIndex));
        const sysSettings = await getSettings();
        setSettings(sysSettings);

        // Load saved sample station mappings from cloud table (final architecture)
        try {
          const mappings = await getSampleStationMappings();
          setSsMappings(mappings || []);
          // Initialise rowEdits from persisted data so dropdowns show saved values
          const edits = {};
          (mappings || []).forEach(m => {
            edits[Number(m.tag_id)] = { circuit: m.circuit, role: m.role };
          });
          setRowEdits(edits);
        } catch (ssErr) {
          console.warn('[TagConfig] Failed to load sample station mappings:', ssErr);
        }

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
      } finally {
        setIsLoadingData(false);
      }
    };

    loadConfigData();
  }, [refreshTrigger]);

  useEffect(() => {
    if (!isActive) return;
    const checkTagStatuses = async () => {
      if (tagConfigs.length === 0) return;
      const newStatuses = {};
      const newPreviews = {};
      const newCounts = {};

      try {
        const isConnected = getSupabaseConfig() !== null;
        const supabase = getSupabaseClient();
        if (isConnected && supabase && settings) {
          const tableName = settings.selectedTable || 'Database';
          const tagCol = settings.columnMappings?.tagCol || 'TagIndex';

          for (const tag of tagConfigs) {
            const index = tag.TagIndex;
            if (index === undefined || index === null || isNaN(index) || index < 0) {
              newStatuses[index] = 'Invalid TagIndex';
              continue;
            }

            const strIdx = String(index).trim();
            const targetIndexes = [index, strIdx, `T${strIdx}`, `t${strIdx}`];
            if (!isNaN(index)) {
              targetIndexes.push(parseInt(index, 10));
            }
            const uniqueIndexes = [...new Set(targetIndexes)].filter(x => x !== null && x !== undefined && x !== '');

            // 1. Query latest record from the actual database
            const latestRecord = await getLatestRecord(supabase, tableName, index, settings.columnMappings || {}, false, settings);

            // 2. Query exact count of rows for this tag index
            const { count, error: countErr } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true })
              .in(tagCol, uniqueIndexes);

            if (countErr) {
              console.warn(`[TagConfig Status Check] Count query failed for TagIndex ${index}:`, countErr);
            }

            if (latestRecord) {
              newPreviews[index] = {
                val: latestRecord.Val,
                timestamp: latestRecord.DateAndTime,
                status: latestRecord.Status
              };
              const recTime = new Date(latestRecord.DateAndTime).getTime();
              const ageSeconds = (Date.now() - recTime) / 1000;
              if (latestRecord.Status === 0) {
                newStatuses[index] = 'Sync Error';
              } else if (ageSeconds <= 60) {
                newStatuses[index] = 'Active';
              } else {
                newStatuses[index] = 'Connected';
              }
            } else {
              newStatuses[index] = 'No Data Found';
            }

            newCounts[index] = count || 0;
          }
        }
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
  }, [tagConfigs, refreshTrigger, settings, isActive]);

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
      SampleDatalog: false,
      DowntimeDatalog: false,
      IncludeInPDF: true,
      IncludeInExcel: true,
      ActiveStatus: true,
      isNew: true
    });
    setShowModal(true);
  };

  const handleSaveTag = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (editingTag.isNew) {
      if (!canAddOrDelete) {
        alert('Unauthorized: You do not have permission to add new tags.');
        return;
      }
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
        DashboardVisible: editingTag.DashboardVisible ?? false,
        TrendsVisible: editingTag.TrendsVisible ?? false,
        ReportsVisible: editingTag.ReportsVisible ?? false,
        SampleDatalog: editingTag.SampleDatalog ?? false,
        DowntimeDatalog: editingTag.DowntimeDatalog ?? false,
        IncludeInPDF: editingTag.IncludeInPDF ?? true,
        IncludeInExcel: editingTag.IncludeInExcel ?? true,
        ActiveStatus: editingTag.ActiveStatus ?? true
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
    if (isReadOnly) return;
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

  const handleSampleColumnChange = async (tagIndex, columnName) => {
    if (isReadOnly) return;
    const updatedConfigs = tagConfigs.map(t => {
      if (t.TagIndex === tagIndex) {
        return { ...t, SampleColumn: columnName };
      }
      return t;
    });
    setTagConfigs(updatedConfigs);
    setSavingToggleId(`${tagIndex}-SampleColumn`);
    setSaveStatusMsg(null);

    try {
      await saveTagConfigs(updatedConfigs);
      setSavingToggleId(null);
      setSaveStatusMsg({
        type: 'success',
        text: `Updated Sample Column for Tag #${tagIndex} to "${columnName}".`
      });
      setTimeout(() => {
        setSaveStatusMsg(prev => (prev && prev.text.includes(tagIndex.toString()) && prev.text.includes('Sample Column')) ? null : prev);
      }, 3000);
    } catch (err) {
      console.error("Failed to save Sample Column:", err);
      setSavingToggleId(null);
      setSaveStatusMsg({
        type: 'error',
        text: `Failed to update Sample Column for Tag #${tagIndex}.`
      });
      setTimeout(() => {
        setSaveStatusMsg(prev => (prev && prev.text.includes(tagIndex.toString())) ? null : prev);
      }, 4000);
    }
  };



  // ── Sample Station Mapping Helpers (final architecture) ──────────────────

  // Read the live (possibly unsaved) circuit for a tag from rowEdits
  const getCircuitForTag = (tagIndex) => {
    const idx = Number(tagIndex);
    return rowEdits[idx]?.circuit || '';
  };

  // Read the live (possibly unsaved) role for a tag from rowEdits
  const getRoleForTag = (tagIndex) => {
    const idx = Number(tagIndex);
    return rowEdits[idx]?.role || 'none';
  };

  // Read persisted circuit from ssMappings (cloud DB snapshot)
  const getCircuitForTagFromObj = (_obj, tagIndex) => {
    const idx = Number(tagIndex);
    return ssMappings.find(m => Number(m.tag_id) === idx)?.circuit || '';
  };

  // Read persisted role from ssMappings (cloud DB snapshot)
  const getRoleForTagFromObj = (_obj, tagIndex) => {
    const idx = Number(tagIndex);
    return ssMappings.find(m => Number(m.tag_id) === idx)?.role || 'none';
  };

  const handleCircuitSelect = (tag, value) => {
    const idx = Number(tag.TagIndex);
    setRowEdits(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] || { role: 'none' }), circuit: value }
    }));
  };

  const handleRoleSelect = (tag, value) => {
    const idx = Number(tag.TagIndex);
    setRowEdits(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] || { circuit: '' }), role: value }
    }));
  };

  const handleSaveRow = async (tag) => {
    const idx = Number(tag.TagIndex);
    const edit = rowEdits[idx] || {};
    const circuit = edit.circuit || '';
    const role = edit.role || 'none';

    // ── Step 1: Log the click ──────────────────────────────────────────
    console.log('%c[SAMPLE-STATION-SAVE] CLICK', 'color:#00d4ff;font-weight:bold',
      `tag_id=${idx} TagName="${tag.TagName}"`);

    // Validate: both circuit and a real role must be set
    if (!circuit || role === 'none') {
      console.warn('[SAMPLE-STATION-SAVE] VALIDATION FAILED — circuit or role not selected',
        { circuit, role });
      setRowErrors(prev => ({ ...prev, [idx]: 'Select Circuit and Role first' }));
      setTimeout(() => setRowErrors(prev => { const n = { ...prev }; delete n[idx]; return n; }), 3000);
      return;
    }

    // ── Step 2: Log the exact payload that will be sent ────────────────
    const payload = {
      tag_id: idx,
      equipment_name: tag.TagName,
      circuit,
      role
    };
    console.log('%c[SAMPLE-STATION-SAVE] PAYLOAD', 'color:#00d4ff;font-weight:bold', payload);

    setRowSaving(prev => ({ ...prev, [idx]: true }));
    setRowErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setRowSuccess(prev => { const n = { ...prev }; delete n[idx]; return n; });

    try {
      // ── Step 3: Start the DB request ─────────────────────────────────
      console.log('%c[SAMPLE-STATION-SAVE] REQUEST START', 'color:#00d4ff;font-weight:bold',
        '→ calling upsertSampleStationMapping...');

      const saved = await upsertSampleStationMapping(payload);

      // ── Step 4: Log the returned DB row ──────────────────────────────
      console.log('%c[SAMPLE-STATION-SAVE] DATA (upsert returned)', 'color:#00ff88;font-weight:bold', saved);

      // ── Step 5: Read back ALL rows from cloud to confirm persistence ──
      console.log('%c[SAMPLE-STATION-SAVE] READBACK — querying public.sample_station_mappings...', 'color:#00d4ff;font-weight:bold');
      const freshMappings = await getSampleStationMappings();

      console.log('%c[SAMPLE-STATION-SAVE] READBACK RESULT', 'color:#00ff88;font-weight:bold',
        `${freshMappings.length} row(s) in cloud table:`,
        freshMappings.map(m => `tag_id=${m.tag_id} "${m.equipment_name}" → ${m.circuit}/${m.role}`));

      // Verify the saved record appears in the readback
      const confirmedRow = freshMappings.find(m => Number(m.tag_id) === idx);
      if (!confirmedRow) {
        throw new Error(
          `READBACK MISMATCH: upsert returned data but tag_id=${idx} is NOT in the fresh table read.` +
          ` Table has ${freshMappings.length} row(s). This indicates an RLS or permission issue.`
        );
      }

      console.log('%c[SAMPLE-STATION-SAVE] READBACK CONFIRMED', 'color:#00ff88;font-weight:bold',
        `tag_id=${confirmedRow.tag_id} circuit=${confirmedRow.circuit} role=${confirmedRow.role}`);

      // ── Step 6: Update UI state with ground-truth from DB ─────────────
      setSsMappings(freshMappings);
      setRowEdits(prev => ({
        ...prev,
        [idx]: { circuit: confirmedRow.circuit, role: confirmedRow.role }
      }));

      // rowSuccess is ONLY used for a brief ✅ icon — NOT for STATUS badge
      setRowSuccess(prev => ({ ...prev, [idx]: 'Saved' }));
      setTimeout(() => setRowSuccess(prev => { const n = { ...prev }; delete n[idx]; return n; }), 2500);

    } catch (err) {
      // ── Step 7: Log the real error clearly ───────────────────────────
      console.error('%c[SAMPLE-STATION-SAVE] ERROR', 'color:#ff4444;font-weight:bold', err.message);
      console.error('[SAMPLE-STATION-SAVE] Full error object:', err);
      setRowErrors(prev => ({ ...prev, [idx]: err.message || 'Save failed — see console' }));
      setTimeout(() => setRowErrors(prev => { const n = { ...prev }; delete n[idx]; return n; }), 8000);
    } finally {
      setRowSaving(prev => { const n = { ...prev }; delete n[idx]; return n; });
    }
  };




  const handleDeleteTag = async (tagIndex) => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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

  const renderToggle = (tag, field) => {
    const isSaving = savingToggleId === `${tag.TagIndex}-${field}`;
    if (isSaving) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '24px' }}>
          <SavingSpinner />
        </div>
      );
    }
    let checked = false;
    if (field === 'DashboardKPI') {
      checked = tag.DashboardKPI !== undefined ? tag.DashboardKPI : !!tag.DashboardVisible;
    } else if (field === 'IncludeInPDF') {
      checked = tag.IncludeInPDF !== undefined ? tag.IncludeInPDF : !!tag.ReportsVisible;
    } else if (field === 'IncludeInExcel') {
      checked = tag.IncludeInExcel !== undefined ? tag.IncludeInExcel : !!tag.ReportsVisible;
    } else if (field === 'ActiveStatus') {
      checked = tag.ActiveStatus !== undefined ? tag.ActiveStatus : true;
    } else if (field === 'DashboardVisible') {
      checked = !!tag.DashboardVisible;
    } else {
      checked = !!tag[field];
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <ToggleSwitch
          id={`tbl-${field}-${tag.TagIndex}`}
          checked={checked}
          onChange={() => handleToggleVisibility(tag.TagIndex, field)}
          disabled={isReadOnly}
        />
      </div>
    );
  };

  const renderSampleDatalogCell = (tag) => {
    const isSaving = savingToggleId === `${tag.TagIndex}-SampleDatalog`;
    const isSavingCol = savingToggleId === `${tag.TagIndex}-SampleColumn`;

    if (isSaving) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '24px' }}>
          <SavingSpinner />
        </div>
      );
    }

    const checked = !!tag.SampleDatalog;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
        <ToggleSwitch
          id={`tbl-SampleDatalog-${tag.TagIndex}`}
          checked={checked}
          onChange={() => handleToggleVisibility(tag.TagIndex, 'SampleDatalog')}
          disabled={isReadOnly}
        />
        {isSavingCol ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '28px' }}>
            <SavingSpinner />
          </div>
        ) : (
          <select
            className="form-control"
            style={{
              fontSize: '0.78rem',
              padding: '4px 8px',
              height: '28px',
              minWidth: '160px',
              marginTop: '4px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--card-bg)',
              color: 'var(--text)',
              opacity: checked ? 1 : 0.5,
              cursor: checked ? 'pointer' : 'not-allowed',
              textAlignLast: 'center'
            }}
            value={checked ? (tag.SampleColumn || 'Not Assigned') : 'Not Assigned'}
            disabled={!checked || isReadOnly}
            onChange={async (e) => {
              await handleSampleColumnChange(tag.TagIndex, e.target.value);
            }}
          >
            <option value="Not Assigned">Not Assigned</option>
            <option value="Shift ID">Shift ID</option>
            <option value="Shift Cumulative Tonnes">Shift Cumulative Tonnes</option>
            <option value="Stockpile Tonnes">Stockpile Tonnes</option>
            <option value="FingerID">FingerID</option>
            <option value="CutID">CutID</option>
            <option value="Material">Material</option>
          </select>
        )}
      </div>
    );
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
              {canAddOrDelete && (
                <button
                  onClick={handleAddNewOpen}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}
                >
                  <PlusIcon /> Add Tag
                </button>
              )}
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
            {isLoadingData ? (
              <div style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                padding:        '72px 24px',
                gap:            '14px',
                textAlign:      'center',
              }}>
                <SavingSpinner />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Loading tag configurations...
                </span>
              </div>
            ) : tagConfigs.length === 0 ? (
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
                {canAddOrDelete && (
                  <button
                    onClick={handleAddNewOpen}
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '4px' }}
                  >
                    <PlusIcon /> Add First Tag
                  </button>
                )}
              </div>
            ) : (
              /* Data table */
              <ScrollableTagList className="table-responsive" style={{ overflowX: 'auto', width: '100%', maxHeight: '550px', background: 'var(--card-bg)' }}>
                <table className="table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1350px' }}>
                  <thead>
                    <tr>
                      {[
                        { name: 'INDEX', align: 'left', width: '70px' },
                        { name: 'TAG NAME', align: 'left', width: '200px' },
                        { name: 'UNIT', align: 'left', width: '75px' },
                        { name: 'DESCRIPTION', align: 'left', width: '200px' },
                        { name: 'LAST VALUE', align: 'right', width: '100px' },
                        { name: 'LAST TIMESTAMP', align: 'left', width: '130px' },
                        { name: 'QUALITY', align: 'left', width: '130px' },
                        { name: 'STATUS', align: 'left', width: '110px' },
                        { name: 'DATABASE MAPPING', align: 'left', width: '160px' },
                        { name: 'RECORDS COUNT', align: 'right', width: '110px' },
                        { name: 'DASHBOARD', align: 'center', width: '90px' },
                        { name: 'SAMPLE STATION', align: 'center', width: '120px' },
                        { name: 'DOWNTIME', align: 'center', width: '95px' },
                        { name: 'TRENDS', align: 'center', width: '80px' },
                        { name: 'REPORTS', align: 'center', width: '80px' },
                        { name: 'ACTIVE', align: 'center', width: '80px' },
                        { name: 'ACTIONS', align: 'right', width: '160px' }
                      ].map(col => (
                        <th
                          key={col.name}
                          style={{
                            padding:         '12px 10px',
                            fontSize:        '0.67rem',
                            fontWeight:      700,
                            letterSpacing:   '0.06em',
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
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          <span className="tag-pill">#{tag.TagIndex}</span>
                        </td>

                        {/* NAME */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {tag.TagName}
                        </td>

                        {/* UNIT */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'left' }}>
                          {tag.Unit || <span style={{ opacity: 0.35 }}>—</span>}
                        </td>

                        {/* DESCRIPTION */}
                        <td style={{
                          padding:      '10px 10px',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize:     '0.78rem',
                          color:        'var(--text-muted)',
                          maxWidth:     '200px',
                          whiteSpace:   'nowrap',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          textAlign:    'left'
                        }} title={tag.Description}>
                          {tag.Description || <span style={{ opacity: 0.35 }}>—</span>}
                        </td>

                        {/* LAST VALUE */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {previews[tag.TagIndex] !== undefined && previews[tag.TagIndex].val !== null && previews[tag.TagIndex].val !== undefined ? (
                            typeof previews[tag.TagIndex].val === 'number' ? (
                              `${previews[tag.TagIndex].val.toFixed(tag.DecimalPlaces ?? 2)}`
                            ) : (
                              `${previews[tag.TagIndex].val}`
                            )
                          ) : (
                            <span style={{ opacity: 0.35 }}>—</span>
                          )}
                        </td>

                        {/* LAST TIMESTAMP */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {previews[tag.TagIndex] !== undefined && previews[tag.TagIndex].timestamp ? (
                            new Date(previews[tag.TagIndex].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          ) : (
                            <span style={{ opacity: 0.35 }}>—</span>
                          )}
                        </td>

                        {/* QUALITY */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          {renderQuality(tag.TagIndex)}
                        </td>

                        {/* STATUS */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          {(() => {
                            const status = statuses[tag.TagIndex] || 'Checking...';
                            let bg = 'rgba(59, 130, 246, 0.1)';
                            let color = 'var(--secondary)';
                            let border = '1px solid rgba(59, 130, 246, 0.25)';

                            if (status === 'Active') {
                              bg = 'rgba(16, 185, 129, 0.1)';
                              color = 'var(--success)';
                              border = '1px solid rgba(16, 185, 129, 0.25)';
                            } else if (status === 'No Data Found' || status.startsWith('No records')) {
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
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          <code style={{ fontFamily: 'var(--mono)', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                            {settings.selectedTable || 'Database'}.{settings.columnMappings?.valueCol || 'Val'}
                          </code>
                        </td>

                        {/* RECORDS COUNT */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
                          {recordsCounts[tag.TagIndex] !== undefined ? recordsCounts[tag.TagIndex] : 0}
                        </td>

                        {/* DASHBOARD visibility toggle */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-DashboardVisible` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-dash-${tag.TagIndex}`}
                              checked={tag.DashboardVisible}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'DashboardVisible')}
                              disabled={isReadOnly}
                            />
                          )}
                        </td>

                        {/* SAMPLE STATION toggle */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-SampleDatalog` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-sample-${tag.TagIndex}`}
                              checked={tag.SampleDatalog || tag.sample_station_enabled}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'SampleDatalog')}
                              disabled={isReadOnly}
                            />
                          )}
                        </td>

                        {/* DOWNTIME toggle */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-DowntimeDatalog` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-down-${tag.TagIndex}`}
                              checked={tag.DowntimeDatalog || tag.downtime_datalog_enabled}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'DowntimeDatalog')}
                              disabled={isReadOnly}
                            />
                          )}
                        </td>

                        {/* TRENDS visibility toggle */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-TrendsVisible` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-trend-${tag.TagIndex}`}
                              checked={tag.TrendsVisible}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'TrendsVisible')}
                              disabled={isReadOnly}
                            />
                          )}
                        </td>

                        {/* REPORTS visibility toggle */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-ReportsVisible` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-rep-${tag.TagIndex}`}
                              checked={tag.ReportsVisible}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'ReportsVisible')}
                              disabled={isReadOnly}
                            />
                          )}
                        </td>

                        {/* ACTIVE STATUS toggle */}
                        <td style={{ padding: '10px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                          {savingToggleId === `${tag.TagIndex}-ActiveStatus` ? (
                            <SavingSpinner />
                          ) : (
                            <ToggleSwitch
                              id={`tbl-act-${tag.TagIndex}`}
                              checked={tag.ActiveStatus !== false}
                              onChange={() => handleToggleVisibility(tag.TagIndex, 'ActiveStatus')}
                              disabled={isReadOnly}
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

                            {!isReadOnly && (
                              <>
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
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTagList>
            )}
          </div>
          
          {/* ── Sample Station Mapping Table ─────────────────── */}
          {tagConfigs.some(t => t.SampleDatalog || t.sample_datalog_enabled || t.sample_station) && (
            <div className="card" style={{ marginTop: '24px', padding: '20px', overflow: 'visible' }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📋 SAMPLE STATION MAPPING
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Assign roles to Sample Station-enabled tags. Multiple tags can be assigned as Sample Tags.
                </p>
              </div>

              {(() => {
                const enabledSampleTags = tagConfigs.filter(t => (t.ActiveStatus !== false) && (t.SampleDatalog || t.sample_datalog_enabled || t.sample_station));

                if (enabledSampleTags.length === 0) {
                  return (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>
                      No Sample Station tags enabled. Enable the Sample Station toggle for historian tags in the table above to configure roles.
                    </div>
                  );
                }

                return (
                  <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>TAG</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>CIRCUIT</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>ROLE</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>STATUS</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enabledSampleTags.map((tag) => {
                          const currentRole = getRoleForTag(tag.TagIndex);
                          const currentCircuit = getCircuitForTag(tag.TagIndex);

                          const savedRole = getRoleForTagFromObj(null, tag.TagIndex);
                          const savedCircuit = getCircuitForTagFromObj(null, tag.TagIndex);

                          // Enable save button only when row has unsaved modifications
                          const hasRowChanges = (currentRole !== savedRole) || (currentCircuit !== savedCircuit);
                          const numIdx = Number(tag.TagIndex);

                          // STATUS is ground-truth: read ONLY from ssMappings (cloud DB snapshot)
                          // rowSuccess is used ONLY for the inline ✅ indicator, NOT for STATUS badge
                          const dbRecord = ssMappings.find(m => Number(m.tag_id) === Number(tag.TagIndex));
                          const isSavedComplete = !!(dbRecord && dbRecord.circuit && dbRecord.role && dbRecord.role !== 'none');
                          let statusText = isSavedComplete ? 'Saved' : (dbRecord ? 'Incomplete' : 'Unassigned');
                          let statusColor = isSavedComplete ? 'var(--success)' : 'var(--text-muted)';
                          if (rowSaving[numIdx]) {
                            statusText = 'Saving...';
                            statusColor = 'var(--accent)';
                          } else if (rowErrors[numIdx]) {
                            statusText = 'Failed';
                            statusColor = 'var(--error)';
                          } else if (hasRowChanges) {
                            statusText = 'Unsaved';
                            statusColor = '#94A3B8';
                          }

                          return (
                            <tr key={tag.TagIndex} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td style={{ padding: '10px 14px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '6px' }}>[{tag.TagIndex}]</span>
                                {tag.TagName}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <select
                                  value={currentCircuit}
                                  onChange={(e) => handleCircuitSelect(tag, e.target.value)}
                                  disabled={isReadOnly || rowSaving[numIdx]}
                                  style={{
                                    height: '30px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    maxWidth: '130px',
                                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                    borderRadius: '4px',
                                    padding: '0 8px',
                                    background: currentCircuit === 'lump'
                                      ? 'rgba(22,163,74,0.12)'
                                      : currentCircuit === 'fines'
                                        ? 'rgba(245,158,11,0.12)'
                                        : 'var(--surface)',
                                    color: currentCircuit === 'lump'
                                      ? '#16A34A'
                                      : currentCircuit === 'fines'
                                        ? '#F59E0B'
                                        : 'var(--text-muted)',
                                    border: `1px solid ${currentCircuit === 'lump'
                                      ? 'rgba(22,163,74,0.35)'
                                      : currentCircuit === 'fines'
                                        ? 'rgba(245,158,11,0.35)'
                                        : 'var(--border)'}`
                                  }}
                                >
                                  <option value="">Select Circuit</option>
                                  <option value="lump">LUMP</option>
                                  <option value="fines">FINES</option>
                                </select>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <select
                                  className="form-control"
                                  value={currentRole}
                                  onChange={(e) => handleRoleSelect(tag, e.target.value)}
                                  disabled={isReadOnly || rowSaving[numIdx]}
                                  style={{ height: '32px', fontSize: '0.78rem', maxWidth: '240px', cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
                                >
                                  <option value="none">Unassigned</option>
                                  <option value="sample_tag">Sample Tag</option>
                                  <option value="shift_id">Shift ID</option>
                                  <option value="shift_cumulative_tonnes">Shift Cumulative Tonnes</option>
                                  <option value="stockpile_tonnes">Stockpile Tonnes</option>
                                </select>
                              </td>
                              <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {statusText}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <button
                                    onClick={() => handleSaveRow(tag)}
                                    disabled={!hasRowChanges || rowSaving[numIdx] || isReadOnly}
                                    className="btn btn-primary"
                                    style={{
                                      padding: '4px 12px',
                                      fontSize: '0.72rem',
                                      fontWeight: 'bold',
                                      cursor: (!hasRowChanges || rowSaving[numIdx]) ? 'not-allowed' : 'pointer',
                                      opacity: (!hasRowChanges || rowSaving[numIdx]) ? 0.55 : 1
                                    }}
                                  >
                                    {rowSaving[numIdx] ? 'Saving...' : 'Save'}
                                  </button>
                                  {rowSuccess[numIdx] && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>
                                      ✅ {rowSuccess[numIdx]}
                                    </span>
                                  )}
                                  {rowErrors[numIdx] && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--error)', fontWeight: 600 }}>
                                      ⚠️ {rowErrors[numIdx]}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>


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

              {/* Unit + Material Type + Decimal Places */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
                  <label className="form-label" htmlFor="modal-tag-material">Material Type</label>
                  <select
                    id="modal-tag-material"
                    className="form-control"
                    value={editingTag.MaterialType || 'None'}
                    onChange={e => setEditingTag({ ...editingTag, MaterialType: e.target.value })}
                  >
                    <option value="None">None</option>
                    <option value="Lump">Lump</option>
                    <option value="Fines">Fines</option>
                  </select>
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
                    { label: 'Dashboard',      key: 'DashboardVisible', id: 'modal-vis-dash' },
                    { label: 'Sample Station', key: 'SampleDatalog',    id: 'modal-vis-sample' },
                    { label: 'Downtime',       key: 'DowntimeDatalog',  id: 'modal-vis-downtime' },
                    { label: 'Trends',         key: 'TrendsVisible',    id: 'modal-vis-trends' },
                    { label: 'Reports',        key: 'ReportsVisible',   id: 'modal-vis-reports' },
                    { label: 'Active',         key: 'ActiveStatus',     id: 'modal-vis-active' },
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

              {/* Sample Column Mapping — only when Sample Datalog is ON */}
              {editingTag.SampleDatalog && (
                <div style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(14,165,233,0.35)',
                  background: 'rgba(14,165,233,0.04)',
                }}>
                  <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Sample Station Column Mapping
                  </p>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="modal-sample-col">
                      Map this tag to Sample Station column
                    </label>
                    <select
                      id="modal-sample-col"
                      className="form-control"
                      value={editingTag.SampleColumn || 'Not Assigned'}
                      onChange={e => setEditingTag({ ...editingTag, SampleColumn: e.target.value })}
                    >
                      <option value="Not Assigned">Not Assigned</option>
                      <option value="Shift ID">Shift ID</option>
                      <option value="Shift Cumulative Tonnes">Shift Cumulative Tonnes</option>
                      <option value="Stockpile Tonnes">Stockpile Tonnes</option>
                      <option value="FingerID">FingerID</option>
                      <option value="CutID">CutID</option>
                      <option value="Material">Material</option>
                    </select>
                    <p style={{ margin: '6px 0 0', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      This tag's value will populate the selected column in the Sample Station Datalog table.
                    </p>
                  </div>
                </div>
              )}


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
          background: saveStatusMsg.type === 'success' ? '#0d2a1f' : saveStatusMsg.type === 'info' ? '#07253d' : '#2d1414',
          border: saveStatusMsg.type === 'success' ? '1px solid var(--success)' : saveStatusMsg.type === 'info' ? '1px solid var(--secondary, #0EA5E9)' : '1px solid var(--error)',
          color: saveStatusMsg.type === 'success' ? 'var(--success)' : saveStatusMsg.type === 'info' ? 'var(--secondary, #0EA5E9)' : 'var(--error)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'slideIn 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          <span>{saveStatusMsg.type === 'success' ? '✅' : saveStatusMsg.type === 'info' ? 'ℹ️' : '❌'}</span>
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
