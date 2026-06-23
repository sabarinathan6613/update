// src/components/Settings.jsx
import { useState, useEffect, useCallback } from 'react';
import { 
  getSchedules, saveSchedule, deleteSchedule, 
  getPlants, getEmailLogs, getSchedulerHistory,
  getSmtpConfigurations, saveSmtpConfiguration, deleteSmtpConfiguration, setActiveSmtpConfiguration,
  getReportTemplates, saveReportTemplate, deleteReportTemplate, setDefaultReportTemplate
} from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

/* ─────────────────────────────────────────────
   SVGs & Icons
   ───────────────────────────────────────────── */
const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: 16, height: 16 }}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: 16, height: 16 }}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

function ToggleSwitch({ checked, onChange, id }) {
  return (
    <label htmlFor={id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span style={{
        position: 'relative',
        display: 'inline-block',
        width: 40,
        height: 20,
        backgroundColor: checked ? 'var(--secondary)' : 'var(--border)',
        borderRadius: 34,
        transition: 'background-color 0.25s ease',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute',
          height: 14,
          width: 14,
          left: checked ? 23 : 3,
          top: 3,
          backgroundColor: 'white',
          borderRadius: '50%',
          transition: 'left 0.25s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </span>
    </label>
  );
}

function getPlantTimeZone(plantId) {
  if (!plantId) return 'UTC';
  const cleanId = String(plantId).trim();
  switch (cleanId) {
    case 'plant-1': return 'America/New_York';
    case 'plant-2': return 'Europe/Berlin';
    case 'plant-3': return 'Asia/Tokyo';
    case 'plant-4':
    case 'plant':
    case 'Mettur':
    case 'mettur':
      return 'Asia/Kolkata';
    default: return 'UTC';
  }
}

function getTimeZoneOffsetMs(timeZone, date = new Date()) {
  try {
    const tzString = date.toLocaleString('en-US', { timeZone });
    const localDate = new Date(tzString);
    const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const utcDate = new Date(utcString);
    return localDate.getTime() - utcDate.getTime();
  } catch (e) {
    console.error("getTimeZoneOffsetMs error:", e);
    return 0;
  }
}

function convertLocalToUtcTime(localTimeStr, plantId) {
  if (!localTimeStr) return '00:00';
  const [hour, min] = localTimeStr.split(':').map(Number);
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const tz = getPlantTimeZone(plantId);
  const offsetMs = getTimeZoneOffsetMs(tz, date);
  const targetLocalDate = new Date(date);
  targetLocalDate.setUTCHours(hour, min, 0, 0);
  const targetUtcDate = new Date(targetLocalDate.getTime() - offsetMs);
  const utcHourStr = String(targetUtcDate.getUTCHours()).padStart(2, '0');
  const utcMinStr = String(targetUtcDate.getUTCMinutes()).padStart(2, '0');
  return `${utcHourStr}:${utcMinStr}`;
}

function convertUtcToLocalTime(utcTimeStr, plantId) {
  if (!utcTimeStr) return '00:00';
  const [hour, min] = utcTimeStr.split(':').map(Number);
  const date = new Date();
  date.setUTCHours(hour, min, 0, 0);
  const tz = getPlantTimeZone(plantId);
  const offsetMs = getTimeZoneOffsetMs(tz, date);
  const targetLocalDate = new Date(date.getTime() + offsetMs);
  const localHourStr = String(targetLocalDate.getUTCHours()).padStart(2, '0');
  const localMinStr = String(targetLocalDate.getUTCMinutes()).padStart(2, '0');
  return `${localHourStr}:${localMinStr}`;
}

function getTimeZoneAbbreviation(plantId) {
  const tz = getPlantTimeZone(plantId);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : tz;
  } catch {
    return tz;
  }
}

function formatTimestampToPlantTime(timestampStr, plantId) {
  if (!timestampStr) return '—';
  const tz = getPlantTimeZone(plantId);
  try {
    const date = new Date(timestampStr);
    return date.toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return timestampStr;
  }
}

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */
export default function Settings({ user }) {
  const { currentPlantId } = useSimulator();

  const isSuperAdmin = user.role === 'Super Admin';
  const isReadOnly = user.role === 'Admin';
  const targetPlantId = (isSuperAdmin || isReadOnly) ? currentPlantId : user.plantId;

  // ── Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState(() => (isSuperAdmin || isReadOnly) ? 'smtp' : 'schedules');

  // ── SMTP Configurations States
  const [smtpConfigsList, setSmtpConfigsList] = useState([]);
  const [smtpSearch, setSmtpSearch] = useState('');
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [editSmtpObj, setEditSmtpObj] = useState({
    id: '', name: '', host: '', port: 587, username: '', password: '', secure: false, security_type: 'STARTTLS', is_active: false
  });
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [isTestingSmtpId, setIsTestingSmtpId] = useState(null); // stores config.id being tested
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testingConfig, setTestingConfig] = useState(null);
  const [lastSavedSmtp, setLastSavedSmtp] = useState(null);

  // ── Report Templates States
  const [templatesList, setTemplatesList] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [editTemplateObj, setEditTemplateObj] = useState({
    id: '', name: '', report_type: 'Historian Shift Summary', subject: '', is_default: false, logo_text: '', header_color: '#0A0F1E', footer_text: '', email_body: '', summary_layout: 'standard', pdf_layout: 'standard', excel_layout: 'standard'
  });
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [lastSavedTemplate, setLastSavedTemplate] = useState(null);

  // ── Scheduled Reports States
  const [schedulesList, setSchedulesList] = useState([]);
  const [plantsList, setPlantsList] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [editSchedule, setEditSchedule] = useState({
    id: '', plantId: '', reportType: 'Historian Shift Summary',
    frequency: 'Daily', time: '08:00',
    emailRecipients: '', enabled: true,
    formatPdf: true, formatExcel: true,
  });

  // ── Email Logs States
  const [emailLogsList, setEmailLogsList] = useState([]);
  const [schedulerHistoryList, setSchedulerHistoryList] = useState([]);

  // ── Status Messages
  const [smtpStatus, setSmtpStatus] = useState(null); // { type: 'success' | 'error', text: string }
  const [templateStatus, setTemplateStatus] = useState(null);
  const [scheduleStatus, setScheduleStatus] = useState(null);

  const showSmtpStatus = (type, text) => {
    setSmtpStatus({ type, text });
    setTimeout(() => setSmtpStatus(null), 6000);
  };

  const showTemplateStatus = (type, text) => {
    setTemplateStatus({ type, text });
    setTimeout(() => setTemplateStatus(null), 6000);
  };

  const showScheduleStatus = (type, text) => {
    setScheduleStatus({ type, text });
    setTimeout(() => setScheduleStatus(null), 6000);
  };

  /* ── Load data ────────────────────────── */
  const loadData = useCallback(async () => {
    try {
      const plist = await getPlants();
      setPlantsList(plist);

      const allSchedules = await getSchedules();
      setSchedulesList((isSuperAdmin || isReadOnly) ? allSchedules : allSchedules.filter(s => s.plantId === targetPlantId));

      if (isSuperAdmin || isReadOnly) {
        const allEmailLogs = await getEmailLogs();
        setEmailLogsList(allEmailLogs);

        const history = await getSchedulerHistory();
        setSchedulerHistoryList(history);

        const smtpConfigs = await getSmtpConfigurations();
        setSmtpConfigsList(smtpConfigs);

        const templates = await getReportTemplates();
        setTemplatesList(templates);
      } else {
        // Plant Admin can also see SMTP & Templates
        const smtpConfigs = await getSmtpConfigurations();
        setSmtpConfigsList(smtpConfigs);

        const templates = await getReportTemplates();
        setTemplatesList(templates);
      }
    } catch (err) {
      console.error('Error loading settings data:', err);
    }
  }, [targetPlantId, isSuperAdmin, isReadOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  /* ── SMTP Configuration CRUD ────────────────── */
  const handleOpenSmtpEdit = (config = null) => {
    setShowSmtpPass(false);
    if (config) {
      setEditSmtpObj({
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        secure: config.secure,
        security_type: config.security_type || (config.secure ? 'SSL/TLS' : 'STARTTLS'),
        is_active: config.is_active
      });
    } else {
      setEditSmtpObj({
        id: '',
        name: '',
        host: '',
        port: 587,
        username: '',
        password: '',
        secure: false,
        security_type: 'STARTTLS',
        is_active: false
      });
    }
    setShowSmtpModal(true);
  };

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    if (!editSmtpObj.name.trim()) return alert('Please enter a configuration name.');
    if (!editSmtpObj.host.trim()) return alert('Please enter a host server.');
    if (!editSmtpObj.username.trim()) return alert('Please enter a username.');
    if (!editSmtpObj.password.trim()) return alert('Please enter a password.');

    setIsSavingSmtp(true);
    try {
      await saveSmtpConfiguration({
        ...editSmtpObj,
        secure: editSmtpObj.security_type === 'SSL/TLS' || editSmtpObj.port === 465
      });
      setLastSavedSmtp(new Date().toLocaleTimeString());
      setShowSmtpModal(false);
      showSmtpStatus('success', `SMTP Configuration "${editSmtpObj.name}" saved successfully.`);
      await loadData();
    } catch (err) {
      alert(`Error saving SMTP configuration: ${err.message}`);
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const handleDeleteSmtp = async (id, name) => {
    if (window.confirm(`Are you sure you want to permanently delete SMTP configuration "${name}"?`)) {
      try {
        await deleteSmtpConfiguration(id);
        showSmtpStatus('success', `SMTP Configuration "${name}" deleted successfully.`);
        await loadData();
      } catch (err) {
        alert(`Error deleting SMTP configuration: ${err.message}`);
      }
    }
  };

  const handleDuplicateSmtp = async (config) => {
    try {
      const copy = {
        ...config,
        id: '',
        name: `${config.name} (Copy)`,
        is_active: false
      };
      await saveSmtpConfiguration(copy);
      showSmtpStatus('success', `SMTP Configuration duplicated as "${copy.name}".`);
      await loadData();
    } catch (err) {
      alert(`Error duplicating SMTP configuration: ${err.message}`);
    }
  };

  const handleSetActiveSmtp = async (id, name) => {
    try {
      await setActiveSmtpConfiguration(id);
      showSmtpStatus('success', `SMTP configuration "${name}" activated successfully.`);
      await loadData();
    } catch (err) {
      alert(`Error activating SMTP configuration: ${err.message}`);
    }
  };

  const handleOpenTestModal = (config) => {
    setTestingConfig(config);
    setTestEmailRecipient(config.username || '');
    setShowTestModal(true);
  };

  const handleRunSmtpTest = async (e) => {
    e.preventDefault();
    if (!testEmailRecipient.trim()) return alert('Please enter a recipient email.');
    
    setIsTestingSmtpId(testingConfig.id);
    setShowTestModal(false);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            host: testingConfig.host,
            port: testingConfig.port,
            username: testingConfig.username,
            password: testingConfig.password,
            secure: testingConfig.secure
          },
          to: testEmailRecipient,
          subject: 'SKADOMATION SMTP Diagnostic Link Check',
          message: `This is an automated test verifying connection to the SMTP mail relay: ${testingConfig.name}.\n\nHost: ${testingConfig.host}\nPort: ${testingConfig.port}\nUsername: ${testingConfig.username}\nSecurity: ${testingConfig.security_type}\n\nStatus: VERIFIED SUCCESS.`
        })
      });
      const res = await response.json();
      if (!response.ok || res.error) {
        throw new Error(res.error || 'Failed to dispatch test email.');
      }
      showSmtpStatus('success', `Test email successfully dispatched using "${testingConfig.name}". Verify SMTP log feed.`);
    } catch (err) {
      alert(`SMTP Diagnostics Connection Failed: ${err.message}`);
    } finally {
      setIsTestingSmtpId(null);
      setTestingConfig(null);
    }
  };


  /* ── Report Templates CRUD ──────────────────── */
  const handleOpenTemplateEdit = (template = null) => {
    if (template) {
      setEditTemplateObj({
        id: template.id,
        name: template.name,
        report_type: template.report_type,
        subject: template.subject,
        is_default: template.is_default,
        logo_text: template.logo_text,
        header_color: template.header_color,
        footer_text: template.footer_text,
        email_body: template.email_body,
        summary_layout: template.summary_layout || 'standard',
        pdf_layout: template.pdf_layout || 'standard',
        excel_layout: template.excel_layout || 'standard'
      });
    } else {
      setEditTemplateObj({
        id: '',
        name: '',
        report_type: 'Historian Shift Summary',
        subject: 'Production Report Summary: {{reportName}}',
        is_default: false,
        logo_text: 'SKADOMATION CO',
        header_color: '#0A0F1E',
        footer_text: 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.',
        email_body: 'Dear Team,\n\nPlease find the compiled production report details attached below:\n\nReport Name: {{reportName}}\nReport Type: {{reportType}}\nShift Reference: {{shift}}\nGenerated At: {{generatedAt}}\n\nReport compilation completed successfully. Formats: PDF, Excel.',
        summary_layout: 'standard',
        pdf_layout: 'standard',
        excel_layout: 'standard'
      });
    }
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!editTemplateObj.name.trim()) return alert('Please enter a template name.');
    if (!editTemplateObj.subject.trim()) return alert('Please enter an email subject.');

    setIsSavingTemplate(true);
    try {
      await saveReportTemplate(editTemplateObj);
      setLastSavedTemplate(new Date().toLocaleTimeString());
      setShowTemplateModal(false);
      showTemplateStatus('success', `Report template "${editTemplateObj.name}" saved successfully.`);
      await loadData();
    } catch (err) {
      alert(`Error saving template: ${err.message}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id, name) => {
    if (window.confirm(`Are you sure you want to permanently delete template "${name}"?`)) {
      try {
        await deleteReportTemplate(id);
        showTemplateStatus('success', `Report template "${name}" deleted successfully.`);
        await loadData();
      } catch (err) {
        alert(`Error deleting template: ${err.message}`);
      }
    }
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      const copy = {
        ...template,
        id: '',
        name: `${template.name} (Copy)`,
        is_default: false
      };
      await saveReportTemplate(copy);
      showTemplateStatus('success', `Template duplicated as "${copy.name}".`);
      await loadData();
    } catch (err) {
      alert(`Error duplicating template: ${err.message}`);
    }
  };

  const handleSetDefaultTemplate = async (id, reportType, name) => {
    try {
      await setDefaultReportTemplate(id, reportType);
      showTemplateStatus('success', `"${name}" is now the default template for "${reportType}".`);
      await loadData();
    } catch (err) {
      alert(`Error setting default template: ${err.message}`);
    }
  };

  const handlePreviewTemplate = (template) => {
    setPreviewTemplate(template);
    setShowPreviewModal(true);
  };


  /* ── Scheduled Reports CRUD ─────────────────── */
  const handleOpenScheduleEdit = (sched = null) => {
    if (sched) {
      const localTime = convertUtcToLocalTime(sched.time, sched.plantId);
      setEditSchedule({
        id: sched.id,
        plantId: sched.plantId,
        reportType: sched.reportType,
        frequency: sched.frequency,
        time: sched.time,
        localTime: localTime,
        emailRecipients: sched.emailRecipients,
        enabled: sched.enabled,
        formatPdf: sched.formatPdf !== false,
        formatExcel: sched.formatExcel !== false,
        reportMode: sched.reportMode || 'Daily',
        shiftNumber: sched.shiftNumber || 1
      });
    } else {
      setEditSchedule({
        id: '',
        plantId: targetPlantId,
        reportType: 'Daily Production Report',
        frequency: 'Daily',
        time: '02:30',
        localTime: '08:00',
        emailRecipients: '',
        enabled: true,
        formatPdf: true,
        formatExcel: true,
        reportMode: 'Daily',
        shiftNumber: 1
      });
    }
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!editSchedule.localTime) return alert('Please enter a daily run time.');
    if (!editSchedule.emailRecipients.trim()) return alert('Please enter default recipients.');

    setIsSavingSchedule(true);
    try {
      const utcTime = convertLocalToUtcTime(editSchedule.localTime, editSchedule.plantId);
      const scheduleToSave = {
        ...editSchedule,
        time: utcTime
      };
      await saveSchedule(scheduleToSave);
      setShowScheduleModal(false);
      showScheduleStatus('success', 'Report schedule configurations updated successfully.');
      await loadData();
    } catch (err) {
      alert(`Error updating schedule: ${err.message}`);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (window.confirm('Are you sure you want to permanently delete this report schedule?')) {
      try {
        await deleteSchedule(id);
        showScheduleStatus('success', 'Report schedule configuration deleted successfully.');
        await loadData();
      } catch (err) {
        alert(`Error deleting schedule: ${err.message}`);
      }
    }
  };

  const handleToggleScheduleEnabled = async (sched) => {
    try {
      await saveSchedule({ ...sched, enabled: !sched.enabled });
      showScheduleStatus('success', `Schedule is now ${!sched.enabled ? 'Enabled' : 'Disabled'}.`);
      await loadData();
    } catch (err) {
      alert(`Error toggling schedule state: ${err.message}`);
    }
  };


  /* ─────────────────────────────────────────────
     Tab definitions
   ───────────────────────────────────────────── */
  const tabs = [
    { key: 'smtp',      label: 'SMTP Servers' },
    { key: 'templates', label: 'Report Templates' },
    { key: 'schedules', label: 'Scheduled Reports' },
    ...(isSuperAdmin ? [
      { key: 'emaillogs', label: 'Email Dispatches' },
      { key: 'schedulerhistory', label: 'Execution History' }
    ] : []),
  ];

  /* ─────────────────────────────────────────────
     Styles
   ───────────────────────────────────────────── */
  const S = {
    page: { display: 'flex', flexDirection: 'column', gap: 0 },
    header: { marginBottom: '28px' },
    headerTitle: { fontSize: '1.55rem', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' },
    headerSub: { fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0' },
    tabBar: { display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: '28px' },
    tabBtn: (active) => ({
      padding: '10px 20px',
      border: 'none',
      background: active ? 'var(--card-bg)' : 'transparent',
      color: active ? 'var(--secondary)' : 'var(--text-muted)',
      fontWeight: active ? 600 : 500,
      borderBottom: active ? '2px solid var(--secondary)' : '2px solid transparent',
      cursor: 'pointer',
      fontSize: '0.875rem',
      borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
      transition: 'color 0.2s, border-color 0.2s',
      whiteSpace: 'nowrap',
      letterSpacing: '0.01em',
    }),
    card: { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '24px 28px' },
    sectionTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' },
    sectionSub: { fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 20px' },
    divider: { borderTop: '1px solid var(--border)', margin: '20px 0' },
    formGroup: { marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' },
    label: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' },
    th: { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.02)' },
    td: { padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text)', verticalAlign: 'middle' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' },
    modalBox: (width) => ({ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: width, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }),
    modalHead: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' },
    modalTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--text)', margin: 0 },
    modalClose: { border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineBreak: 'none', lineHeight: 1 },
    modalBody: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  };

  // Filter lists based on search
  const filteredSmtp = smtpConfigsList.filter(c => 
    c.name.toLowerCase().includes(smtpSearch.toLowerCase()) || 
    c.host.toLowerCase().includes(smtpSearch.toLowerCase()) ||
    c.username.toLowerCase().includes(smtpSearch.toLowerCase())
  );

  const filteredTemplates = templatesList.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.report_type.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.subject.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <div style={S.page}>

      {/* ── Page Header ─────────────────────── */}
      <div style={S.header}>
        <h2 style={S.headerTitle}>Industrial Configuration System</h2>
        <p style={S.headerSub}>
          SCADA parameterization panel for SMTP engines, branding layouts, and automated dispatch schedules.
        </p>
      </div>

      {/* ── Tab Bar ─────────────────────────── */}
      <div style={S.tabBar} className="no-print">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSubTab(t.key)}
            style={S.tabBtn(activeSubTab === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
          TAB: SMTP SERVERS
      ═══════════════════════════════════════ */}
      {activeSubTab === 'smtp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <p style={S.sectionTitle}>SMTP Configuration Manager</p>
                <p style={{ ...S.sectionSub, marginBottom: 0 }}>
                  Manage outbound server profiles for report delivery.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search SMTP profiles..."
                  value={smtpSearch}
                  onChange={e => setSmtpSearch(e.target.value)}
                  className="form-control"
                  style={{ width: '220px', height: '36px', fontSize: '0.8rem' }}
                />
                {!isReadOnly && (
                  <button onClick={() => handleOpenSmtpEdit(null)} className="btn btn-primary btn-sm" style={{ height: '36px' }}>
                    ➕ New Server
                  </button>
                )}
              </div>
            </div>

            {smtpStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500,
                backgroundColor: smtpStatus.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: smtpStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                color: smtpStatus.type === 'success' ? '#34D399' : '#F87171', marginBottom: '16px'
              }}>
                {smtpStatus.type === 'success' ? '✓' : '✗'} {smtpStatus.text}
              </div>
            )}

            {lastSavedSmtp && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px', textAlign: 'right' }}>
                Last saved at: <strong>{lastSavedSmtp}</strong>
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={S.table} className="table responsive-table">
                <thead>
                  <tr>
                    <th style={S.th}>Configuration Name</th>
                    <th style={S.th}>SMTP Host</th>
                    <th style={S.th}>Port</th>
                    <th style={S.th}>Username</th>
                    <th style={S.th}>Security</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Active Status</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSmtp.map(config => (
                    <tr key={config.id} style={{ background: config.is_active ? 'rgba(59, 130, 246, 0.02)' : 'transparent' }}>
                      <td data-label="Configuration Name" style={{ ...S.td, fontWeight: 600 }}>{config.name}</td>
                      <td data-label="SMTP Host" style={S.td}>{config.host}</td>
                      <td data-label="Port" style={S.td}>{config.port}</td>
                      <td data-label="Username" style={S.td}>{config.username}</td>
                      <td data-label="Security" style={S.td}>
                        <span style={{ fontSize: '0.72rem', padding: '1px 6px', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 3, fontWeight: 600 }}>
                          {config.security_type || (config.secure ? 'SSL/TLS' : 'STARTTLS')}
                        </span>
                      </td>
                      <td data-label="Active Status" style={{ ...S.td, textAlign: 'center' }}>
                        {config.is_active ? (
                          <span style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: 12, fontWeight: 700 }}>
                            ● ACTIVE
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetActiveSmtp(config.id, config.name)}
                            className="btn btn-secondary btn-sm"
                            style={{ height: '22px', fontSize: '0.72rem', padding: '0 8px' }}
                          >
                            Set Active
                          </button>
                        )}
                      </td>
                      <td data-label="Actions" style={S.td}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => handleOpenTestModal(config)}
                            disabled={isTestingSmtpId === config.id}
                            className="btn btn-success btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            {isTestingSmtpId === config.id ? '⚡ Testing…' : '🔌 Test Link'}
                          </button>
                          {!isReadOnly && (<>
                          <button
                            onClick={() => handleOpenSmtpEdit(config)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicateSmtp(config)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => handleDeleteSmtp(config.id, config.name)}
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredSmtp.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ ...S.td, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No SMTP configurations found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: REPORT TEMPLATES
      ═══════════════════════════════════════ */}
      {activeSubTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <p style={S.sectionTitle}>Report Templates Designer</p>
                <p style={{ ...S.sectionSub, marginBottom: 0 }}>
                  Customize PDF/Excel layouts, branding colors, and default email notification summaries.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search templates..."
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  className="form-control"
                  style={{ width: '220px', height: '36px', fontSize: '0.8rem' }}
                />
                <button onClick={() => handleOpenTemplateEdit(null)} className="btn btn-primary btn-sm" style={{ height: '36px' }}>
                  ➕ New Template
                </button>
              </div>
            </div>

            {templateStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500,
                backgroundColor: templateStatus.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: templateStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                color: templateStatus.type === 'success' ? '#34D399' : '#F87171', marginBottom: '16px'
              }}>
                {templateStatus.type === 'success' ? '✓' : '✗'} {templateStatus.text}
              </div>
            )}

            {lastSavedTemplate && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px', textAlign: 'right' }}>
                Last saved at: <strong>{lastSavedTemplate}</strong>
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={S.table} className="table responsive-table">
                <thead>
                  <tr>
                    <th style={S.th}>Template Name</th>
                    <th style={S.th}>Report Type</th>
                    <th style={S.th}>Email Subject</th>
                    <th style={S.th}>Theme Color</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Default Status</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map(template => (
                    <tr key={template.id} style={{ background: template.is_default ? 'rgba(59, 130, 246, 0.02)' : 'transparent' }}>
                      <td data-label="Template Name" style={{ ...S.td, fontWeight: 600 }}>{template.name}</td>
                      <td data-label="Report Type" style={S.td}>{template.report_type}</td>
                      <td data-label="Email Subject" style={S.td}>{template.subject}</td>
                      <td data-label="Theme Color" style={S.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: template.header_color, border: '1px solid rgba(255,255,255,0.1)' }} />
                          <span style={{ fontFamily: 'monospace' }}>{template.header_color}</span>
                        </div>
                      </td>
                      <td data-label="Default Status" style={{ ...S.td, textAlign: 'center' }}>
                        {template.is_default ? (
                          <span style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: 12, fontWeight: 700 }}>
                            ★ DEFAULT
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetDefaultTemplate(template.id, template.report_type, template.name)}
                            className="btn btn-secondary btn-sm"
                            style={{ height: '22px', fontSize: '0.72rem', padding: '0 8px' }}
                          >
                            Set Default
                          </button>
                        )}
                      </td>
                      <td data-label="Actions" style={S.td}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => handlePreviewTemplate(template)}
                            className="btn btn-success btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            👁️ Preview
                          </button>
                          <button
                            onClick={() => handleOpenTemplateEdit(template)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicateTemplate(template)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id, template.name)}
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredTemplates.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ ...S.td, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No templates found matching your search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: SCHEDULED REPORTS
      ═══════════════════════════════════════ */}
      {activeSubTab === 'schedules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <p style={S.sectionTitle}>Automated Run Schedules</p>
                <p style={{ ...S.sectionSub, marginBottom: 0 }}>
                  Configure cron engines to auto-compile and dispatch reports.
                </p>
              </div>
              {!isReadOnly && (
                <button onClick={() => handleOpenScheduleEdit(null)} className="btn btn-primary btn-sm">
                  ➕ New Schedule
                </button>
              )}
            </div>

            {scheduleStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500,
                backgroundColor: scheduleStatus.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: scheduleStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                color: scheduleStatus.type === 'success' ? '#34D399' : '#F87171', marginBottom: '16px'
              }}>
                {scheduleStatus.type === 'success' ? '✓' : '✗'} {scheduleStatus.text}
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={S.table} className="table responsive-table">
                <thead>
                  <tr>
                    <th style={S.th}>Plant Location</th>
                    <th style={S.th}>Report Type</th>
                    <th style={S.th}>Mode</th>
                    <th style={S.th}>Shift #</th>
                    <th style={S.th}>Trigger Time</th>
                    <th style={S.th}>Format(s)</th>
                    <th style={S.th}>Last Run</th>
                    <th style={S.th}>Next Run</th>
                    <th style={S.th}>Last Status</th>
                    <th style={S.th}>Records</th>
                    <th style={S.th}>Last Sent To</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Scheduler Status</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulesList.map(sched => {
                    const plantName = plantsList.find(p => p.id === sched.plantId)?.name || sched.plantId || 'Unknown Plant';
                    const formats = [sched.formatPdf !== false ? 'PDF' : '', sched.formatExcel !== false ? 'Excel' : ''].filter(Boolean).join(', ');
                    const localTriggerTime = convertUtcToLocalTime(sched.time, sched.plantId);
                    const tzAbbr = getTimeZoneAbbreviation(sched.plantId);
                    
                    const formattedLastRun = sched.lastRunTime ? formatTimestampToPlantTime(sched.lastRunTime, sched.plantId) : '—';
                    const formattedNextRun = sched.nextRunTime ? formatTimestampToPlantTime(sched.nextRunTime, sched.plantId) : '—';
                    
                    let statusColor = 'var(--text-dim)';
                    if (sched.lastExecutionStatus === 'success') statusColor = 'var(--success)';
                    else if (sched.lastExecutionStatus && sched.lastExecutionStatus.startsWith('failed')) statusColor = 'var(--error)';
                    else if (sched.lastExecutionStatus === 'running') statusColor = 'var(--info)';

                    return (
                      <tr key={sched.id}>
                        <td data-label="Plant Location" style={{ ...S.td, fontWeight: 600 }}>{plantName}</td>
                        <td data-label="Report Type" style={S.td}>{sched.reportType}</td>
                        <td data-label="Mode" style={S.td}>{sched.reportMode || 'Daily'}</td>
                        <td data-label="Shift #" style={S.td}>{sched.reportMode === 'Shift' ? `Shift ${sched.shiftNumber || 1}` : '—'}</td>
                        <td data-label="Trigger Time" style={S.td}>{localTriggerTime} ({tzAbbr})</td>
                        <td data-label="Format(s)" style={S.td}>{formats || 'None'}</td>
                        <td data-label="Last Run" style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{formattedLastRun}</td>
                        <td data-label="Next Run" style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{formattedNextRun}</td>
                        <td data-label="Last Status" style={S.td}>
                          {sched.lastExecutionStatus ? (
                            <span style={{
                              fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                              backgroundColor: sched.lastExecutionStatus === 'success' ? 'rgba(16,185,129,0.1)' : (sched.lastExecutionStatus === 'running' ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)'),
                              color: statusColor
                            }} title={sched.lastExecutionStatus}>
                              {sched.lastExecutionStatus.toUpperCase()}
                            </span>
                          ) : '—'}
                        </td>
                        <td data-label="Records" style={{ ...S.td, textAlign: 'center' }}>{sched.recordsIncluded !== null && sched.recordsIncluded !== undefined ? sched.recordsIncluded : '—'}</td>
                        <td data-label="Last Sent To" style={{ ...S.td, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sched.lastEmailSentTo || sched.emailRecipients}>
                          {sched.lastEmailSentTo || '—'}
                        </td>
                        <td data-label="Status" style={{ ...S.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.72rem', color: sched.enabled ? 'var(--success)' : 'var(--text-dim)', fontWeight: 700 }}>
                              {sched.enabled ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <ToggleSwitch
                              id={`sched-toggle-${sched.id}`}
                              checked={sched.enabled}
                              onChange={isReadOnly ? undefined : () => handleToggleScheduleEnabled(sched)}
                              disabled={isReadOnly}
                            />
                          </div>
                        </td>
                        <td data-label="Actions" style={S.td}>
                          {isReadOnly ? (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>View Only</span>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                onClick={() => handleOpenScheduleEdit(sched)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(sched.id)}
                                className="btn btn-danger btn-sm"
                                style={{ padding: '0 8px', height: '24px', fontSize: '0.75rem' }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {schedulesList.length === 0 && (
                    <tr>
                      <td colSpan="13" style={{ ...S.td, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No report schedules configured for this plant location.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: EMAIL LOG DISPATCHES
      ═══════════════════════════════════════ */}
      {activeSubTab === 'emaillogs' && isSuperAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={S.card}>
            <p style={S.sectionTitle}>SMTP Output Logs</p>
            <p style={S.sectionSub}>
              Historian dispatch telemetry detailing report outputs, recipients, and verification status codes.
            </p>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={S.table} className="table responsive-table">
                <thead>
                  <tr>
                    <th style={S.th}>Timestamp</th>
                    <th style={S.th}>Recipients</th>
                    <th style={S.th}>Subject Name</th>
                    <th style={S.th}>Attachment Contents</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Relay Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogsList.map((log, index) => (
                    <tr key={index}>
                      <td data-label="Timestamp" style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{log.timestamp}</td>
                      <td data-label="Recipients" style={{ ...S.td, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.recipient}>
                        {log.recipient}
                      </td>
                      <td data-label="Subject Name" style={S.td}>{log.subject}</td>
                      <td data-label="Attachment Contents" style={S.td}>
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                          📄 PDF, Excel
                        </span>
                      </td>
                      <td data-label="Relay Status" style={{ ...S.td, textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          backgroundColor: log.status === 'SENT' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: log.status === 'SENT' ? 'var(--success)' : 'var(--error)'
                        }}>
                          {log.status || 'SENT'}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {emailLogsList.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ ...S.td, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No email dispatch records found in the telemetry history log.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'schedulerhistory' && isSuperAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={S.card}>
            <p style={S.sectionTitle}>Scheduler Execution History</p>
            <p style={S.sectionSub}>
              Detailed audit trail tracking automated report scheduling triggers, execution times, dispatches, and delivery status.
            </p>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={S.table} className="table responsive-table">
                <thead>
                  <tr>
                    <th style={S.th}>Schedule Name</th>
                    <th style={S.th}>Trigger Time</th>
                    <th style={S.th}>Execution Time</th>
                    <th style={S.th}>Report Period</th>
                    <th style={S.th}>Records Processed</th>
                    <th style={S.th}>Email Recipients</th>
                    <th style={S.th}>Success / Failure</th>
                    <th style={S.th}>Error Message / Context</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulerHistoryList.map((log, index) => {
                    const errorMsg = log.delivery_status === 'FAILED' ? log.type : 'None';
                    const triggerTime = log.trigger_time || '—';
                    const executionTime = formatTimestampToPlantTime(log.delivery_time || log.generated_at, log.plant_id);
                    const recordsProcessed = log.records_processed !== null && log.records_processed !== undefined ? log.records_processed : '—';
                    return (
                      <tr key={log.id || index}>
                        <td data-label="Schedule Name" style={{ ...S.td, fontWeight: 600 }}>
                          {log.name || 'Automated Shift Report'}
                        </td>
                        <td data-label="Trigger Time" style={S.td}>
                          {triggerTime}
                        </td>
                        <td data-label="Execution Time" style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                          {executionTime}
                        </td>
                        <td data-label="Report Period" style={S.td}>
                          {log.date_range || '—'}
                        </td>
                        <td data-label="Records Processed" style={{ ...S.td, textAlign: 'center' }}>
                          {recordsProcessed}
                        </td>
                        <td data-label="Email Recipients" style={{ ...S.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.recipients}>
                          {log.recipients || '—'}
                        </td>
                        <td data-label="Success / Failure" style={S.td}>
                          <span style={{
                            fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                            backgroundColor: log.delivery_status === 'SENT' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: log.delivery_status === 'SENT' ? 'var(--success)' : 'var(--error)'
                          }}>
                            {log.delivery_status === 'SENT' ? 'SUCCESS' : (log.delivery_status || 'FAILED')}
                          </span>
                        </td>
                        <td data-label="Error Message / Context" style={{ ...S.td, fontSize: '0.78rem', color: log.delivery_status === 'FAILED' ? 'var(--error)' : 'var(--text-muted)' }}>
                          {errorMsg}
                        </td>
                      </tr>
                    );
                  })}

                  {schedulerHistoryList.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ ...S.td, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No scheduler execution logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* ═══════════════════════════════════════
          MODAL: Add / Edit SMTP Configuration
      ═══════════════════════════════════════ */}
      {showSmtpModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(520)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>
                {editSmtpObj.id ? '⚙️ Edit SMTP Server Profile' : '🔌 Add SMTP Server Profile'}
              </h3>
              <button onClick={() => setShowSmtpModal(false)} style={S.modalClose}>×</button>
            </div>
            <form onSubmit={handleSaveSmtp} style={S.modalBody}>
              {/* Config Name */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="smtp-name">Configuration Name</label>
                <input
                  id="smtp-name"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Primary Gmail Server, Site Relay"
                  value={editSmtpObj.name}
                  onChange={e => setEditSmtpObj({ ...editSmtpObj, name: e.target.value })}
                  required
                />
              </div>

              {/* Server Details Grid */}
              <div className="form-grid-special-35">
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="smtp-host">SMTP Host / Server Address</label>
                  <input
                    id="smtp-host"
                    type="text"
                    className="form-control"
                    placeholder="smtp.example.com"
                    value={editSmtpObj.host}
                    onChange={e => setEditSmtpObj({ ...editSmtpObj, host: e.target.value })}
                    required
                  />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="smtp-port">Port Number</label>
                  <input
                    id="smtp-port"
                    type="number"
                    className="form-control"
                    placeholder="465"
                    value={editSmtpObj.port}
                    onChange={e => {
                      const port = parseInt(e.target.value) || '';
                      setEditSmtpObj({ 
                        ...editSmtpObj, 
                        port,
                        security_type: port === 465 ? 'SSL/TLS' : (port === 587 ? 'STARTTLS' : editSmtpObj.security_type)
                      });
                    }}
                    required
                  />
                </div>
              </div>

              {/* Username */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="smtp-user">SMTP Username / Address</label>
                <input
                  id="smtp-user"
                  type="email"
                  className="form-control"
                  placeholder="alerts@company.com"
                  value={editSmtpObj.username}
                  onChange={e => setEditSmtpObj({ ...editSmtpObj, username: e.target.value })}
                  required
                />
              </div>

              {/* Password */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="smtp-pass">SMTP Password / App Key</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="smtp-pass"
                    type={showSmtpPass ? 'text' : 'password'}
                    className="form-control"
                    placeholder="••••••••••••"
                    value={editSmtpObj.password}
                    onChange={e => setEditSmtpObj({ ...editSmtpObj, password: e.target.value })}
                    style={{ paddingRight: '40px', flex: 1 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass(!showSmtpPass)}
                    style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    {showSmtpPass ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
              </div>

              {/* Security Selection */}
              <div className="form-grid-2">
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="smtp-security">Security Connection Type</label>
                  <select
                    id="smtp-security"
                    className="form-control"
                    value={editSmtpObj.security_type}
                    onChange={e => {
                      const type = e.target.value;
                      setEditSmtpObj({ 
                        ...editSmtpObj, 
                        security_type: type,
                        port: type === 'SSL/TLS' ? 465 : (type === 'STARTTLS' ? 587 : editSmtpObj.port)
                      });
                    }}
                  >
                    <option value="SSL/TLS">SSL / TLS (Port 465)</option>
                    <option value="STARTTLS">STARTTLS (Port 587)</option>
                    <option value="None">None / Plain (Port 25 / 2525)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginTop: '20px' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>Default Active</p>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)' }}>Use this relay as default</p>
                  </div>
                  <ToggleSwitch
                    id="smtp-active-toggle"
                    checked={editSmtpObj.is_active}
                    onChange={e => setEditSmtpObj({ ...editSmtpObj, is_active: e.target.checked })}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowSmtpModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSavingSmtp} className="btn btn-primary" style={{ flex: 2 }}>
                  {isSavingSmtp ? 'Saving Server…' : (editSmtpObj.id ? 'Save Configuration' : 'Add Configuration')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Test SMTP Server
      ═══════════════════════════════════════ */}
      {showTestModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(420)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>🔌 SMTP Connection Diagnostics</h3>
              <button onClick={() => setShowTestModal(false)} style={S.modalClose}>×</button>
            </div>
            <form onSubmit={handleRunSmtpTest} style={S.modalBody}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                Test outbound connection for <strong>{testingConfig?.name}</strong>.
              </p>
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="test-recipient">Recipient Diagnostic Address</label>
                <input
                  id="test-recipient"
                  type="email"
                  className="form-control"
                  placeholder="recipient@company.com"
                  value={testEmailRecipient}
                  onChange={e => setTestEmailRecipient(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowTestModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  ⚡ Dispatch Test Mail
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Add / Edit Report Template
      ═══════════════════════════════════════ */}
      {showTemplateModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(620)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>
                {editTemplateObj.id ? '📝 Edit Branding Template' : '🎨 Create Branding Template'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)} style={S.modalClose}>×</button>
            </div>
            <form onSubmit={handleSaveTemplate} style={{ ...S.modalBody, maxHeight: '85vh', overflowY: 'auto' }}>
              
              <div className="form-grid-2">
                {/* Template Name */}
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="tmpl-name">Template Name</label>
                  <input
                    id="tmpl-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Industrial Green, High Priority Alerts"
                    value={editTemplateObj.name}
                    onChange={e => setEditTemplateObj({ ...editTemplateObj, name: e.target.value })}
                    required
                  />
                </div>

                {/* Report Type */}
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="tmpl-report-type">Associated Report Scope</label>
                  <select
                    id="tmpl-report-type"
                    className="form-control"
                    value={editTemplateObj.report_type}
                    onChange={e => setEditTemplateObj({ ...editTemplateObj, report_type: e.target.value })}
                  >
                    <option value="Historian Shift Summary">Historian Shift Summary</option>
                    <option value="Daily Production Report">Daily Production Report</option>
                    <option value="Weekly Performance Review">Weekly Performance Review</option>
                    <option value="Monthly Operations Summary">Monthly Operations Summary</option>
                    <option value="Alarm & Incident Report">Alarm & Incident Report</option>
                  </select>
                </div>
              </div>

              {/* Email Subject */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="tmpl-subject">Email Subject Header</label>
                <input
                  id="tmpl-subject"
                  type="text"
                  className="form-control"
                  placeholder="Production Log Summary: {{reportName}}"
                  value={editTemplateObj.subject}
                  onChange={e => setEditTemplateObj({ ...editTemplateObj, subject: e.target.value })}
                  required
                />
              </div>

              {/* Logo text & Color Grid */}
              <div className="form-grid-special-32">
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="tmpl-logo">Company Banner Logo Text</label>
                  <input
                    id="tmpl-logo"
                    type="text"
                    className="form-control"
                    placeholder="Acme SCADA Engine"
                    value={editTemplateObj.logo_text}
                    onChange={e => setEditTemplateObj({ ...editTemplateObj, logo_text: e.target.value })}
                  />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="tmpl-color">PDF Visual Color Theme</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      id="tmpl-color"
                      type="color"
                      value={editTemplateObj.header_color}
                      onChange={e => setEditTemplateObj({ ...editTemplateObj, header_color: e.target.value })}
                      style={{ width: '42px', padding: 0, height: '38px', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={editTemplateObj.header_color}
                      onChange={e => setEditTemplateObj({ ...editTemplateObj, header_color: e.target.value })}
                      style={{ flex: 1, fontFamily: 'monospace' }}
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              {/* PDF Footer Text */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="tmpl-footer">PDF Page Compliance Footer</label>
                <input
                  id="tmpl-footer"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Confidential Operations Audit Log"
                  value={editTemplateObj.footer_text}
                  onChange={e => setEditTemplateObj({ ...editTemplateObj, footer_text: e.target.value })}
                />
              </div>

              {/* Email Body template */}
              <div style={S.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={S.label} htmlFor="tmpl-body">Email Message Content Template</label>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    Variables: {"{{reportName}}"}, {"{{reportType}}"}, {"{{shift}}"}, {"{{dateRange}}"}, {"{{generatedAt}}"}
                  </span>
                </div>
                <textarea
                  id="tmpl-body"
                  className="form-control"
                  rows="4"
                  value={editTemplateObj.email_body}
                  onChange={e => setEditTemplateObj({ ...editTemplateObj, email_body: e.target.value })}
                  placeholder="Dear team, please find the telemetry attached..."
                  style={{ minHeight: '80px', fontSize: '0.78rem', fontFamily: 'monospace' }}
                />
              </div>

              {/* Layout Presets */}
              <div className="form-grid-3">
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="lay-table">Table Summary</label>
                  <select
                    id="lay-table"
                    className="form-control"
                    value={editTemplateObj.summary_layout}
                    onChange={e => setEditTemplateObj({ ...editTemplateObj, summary_layout: e.target.value })}
                  >
                    <option value="standard">Standard Grid</option>
                    <option value="detailed">Detailed Metrics</option>
                    <option value="compact">Compact List</option>
                  </select>
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="lay-pdf">PDF Document Style</label>
                  <select
                    id="lay-pdf"
                    className="form-control"
                    value={editTemplateObj.pdf_layout}
                    onChange={e => setEditTemplateObj({ ...editTemplateObj, pdf_layout: e.target.value })}
                  >
                    <option value="standard">Corporate Tech</option>
                    <option value="minimal">Minimal Inkjet</option>
                    <option value="industrial">Heavy Blueprint</option>
                  </select>
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="lay-excel">Excel Sheet Layout</label>
                  <select
                    id="lay-excel"
                    className="form-control"
                    value={editTemplateObj.excel_layout}
                    onChange={e => setEditTemplateObj({ ...editTemplateObj, excel_layout: e.target.value })}
                  >
                    <option value="standard">Standard Aggregated</option>
                    <option value="flat_log">Chronological Event Log</option>
                    <option value="multi_sheet">Split Multi-Tab</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>Set Default Template</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)' }}>Automatically load this template for the report scope</p>
                </div>
                <ToggleSwitch
                  id="template-default-toggle"
                  checked={editTemplateObj.is_default}
                  onChange={e => setEditTemplateObj({ ...editTemplateObj, is_default: e.target.checked })}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowTemplateModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSavingTemplate} className="btn btn-primary" style={{ flex: 2 }}>
                  {isSavingTemplate ? 'Saving Template…' : (editTemplateObj.id ? 'Save Template' : 'Create Template')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Preview Template Layout
      ═══════════════════════════════════════ */}
      {showPreviewModal && previewTemplate && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(480)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>👁️ Layout Preview: {previewTemplate.name}</h3>
              <button onClick={() => { setShowPreviewModal(false); setPreviewTemplate(null); }} style={S.modalClose}>×</button>
            </div>
            <div style={{ ...S.modalBody, padding: '20px' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: previewTemplate.header_color, padding: '16px 20px', color: 'white' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', opacity: 0.85, display: 'block', marginBottom: '2px' }}>
                    {previewTemplate.logo_text || 'LOGO BANNER'}
                  </span>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 700 }}>Telemetry Production Logs</h4>
                </div>
                {/* Content */}
                <div style={{ padding: '24px 20px', background: '#FFFFFF', color: '#0F172A', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>Subject: {previewTemplate.subject}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>Scope: {previewTemplate.report_type}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>Email Message Digest:</div>
                    <div style={{ whiteSpace: 'pre-line', background: '#F8FAFC', padding: '10px', borderRadius: '4px', border: '1px solid #E2E8F0', fontFamily: 'monospace', fontSize: '0.72rem', color: '#1E293B', lineHeight: 1.4 }}>
                      {previewTemplate.email_body}
                    </div>
                  </div>
                  <div className="form-grid-3" style={{ fontSize: '0.7rem', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                    <div>📊 Table: <strong>{previewTemplate.summary_layout}</strong></div>
                    <div>📄 PDF: <strong>{previewTemplate.pdf_layout}</strong></div>
                    <div>excel Excel: <strong>{previewTemplate.excel_layout}</strong></div>
                  </div>
                </div>
                {/* Footer */}
                <div style={{ padding: '10px', background: '#0F172A', color: 'rgba(255,255,255,0.5)', fontSize: '0.62rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {previewTemplate.footer_text || 'CONFIDENTIAL — SYSTEM DISPATCH FOOTER'}
                </div>
              </div>
              <button onClick={() => { setShowPreviewModal(false); setPreviewTemplate(null); }} className="btn btn-secondary w-full" style={{ marginTop: '10px' }}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Add / Edit Report Schedule
      ═══════════════════════════════════════ */}
      {showScheduleModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(480)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>
                {editSchedule.id ? '⚙️ Edit Automated Schedule' : '⏰ Create Automated Schedule'}
              </h3>
              <button onClick={() => setShowScheduleModal(false)} style={S.modalClose}>×</button>
            </div>
            <form onSubmit={handleSaveSchedule} style={S.modalBody}>
              {/* Plant selection */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="sched-plant">Target Plant Location</label>
                <input
                  type="text"
                  id="sched-plant"
                  className="form-control"
                  value={editSchedule.plantId}
                  onChange={e => setEditSchedule({ ...editSchedule, plantId: e.target.value })}
                  placeholder="Enter plant ID or location name (e.g. plant-1)"
                  style={{ height: '36px', fontSize: '0.85rem' }}
                />
              </div>

              {/* Report Scope & Frequency */}
              <div className="form-grid-special-12">
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="sched-report-type">Report Scope Type</label>
                  <select
                    id="sched-report-type"
                    className="form-control"
                    value={editSchedule.reportType}
                    onChange={e => setEditSchedule({ ...editSchedule, reportType: e.target.value })}
                  >
                    <option value="Historian Shift Summary">Historian Shift Summary</option>
                    <option value="Daily Production Report">Daily Production Report</option>
                    <option value="Weekly Performance Review">Weekly Performance Review</option>
                    <option value="Monthly Operations Summary">Monthly Operations Summary</option>
                    <option value="Alarm & Incident Report">Alarm & Incident Report</option>
                  </select>
                </div>

                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="sched-freq">Run Frequency</label>
                  <select
                    id="sched-freq"
                    className="form-control"
                    value={editSchedule.frequency}
                    onChange={e => setEditSchedule({ ...editSchedule, frequency: e.target.value })}
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly (Sunday)</option>
                    <option value="Monthly">Monthly (1st of Month)</option>
                  </select>
                </div>
              </div>

              {/* Report Mode & Shift Number */}
              <div className="form-grid-special-12" style={{ display: 'grid', gridTemplateColumns: editSchedule.reportMode === 'Shift' ? '1fr 1fr' : '1fr', gap: '16px' }}>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="sched-mode">Report Period Mode</label>
                  <select
                    id="sched-mode"
                    className="form-control"
                    value={editSchedule.reportMode || 'Daily'}
                    onChange={e => setEditSchedule({ ...editSchedule, reportMode: e.target.value })}
                  >
                    <option value="Daily">Daily Report (24h)</option>
                    <option value="Shift">Shift Report (12h)</option>
                  </select>
                </div>

                {editSchedule.reportMode === 'Shift' && (
                  <div style={S.formGroup}>
                    <label style={S.label} htmlFor="sched-shift-number">Shift Number</label>
                    <select
                      id="sched-shift-number"
                      className="form-control"
                      value={editSchedule.shiftNumber || 1}
                      onChange={e => setEditSchedule({ ...editSchedule, shiftNumber: parseInt(e.target.value) || 1 })}
                    >
                      <option value={1}>Shift 1 (06:00 - 18:00)</option>
                      <option value={2}>Shift 2 (18:00 - 06:00)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Run Time */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="sched-local-time">Dispatch Trigger Time ({getTimeZoneAbbreviation(editSchedule.plantId)} local time)</label>
                <input
                  type="time"
                  id="sched-local-time"
                  className="form-control"
                  value={editSchedule.localTime || ''}
                  onChange={e => setEditSchedule({ ...editSchedule, localTime: e.target.value })}
                  style={{ height: '36px', fontSize: '0.85rem' }}
                />
              </div>

              {/* Formats Selection */}
              <div style={{ display: 'flex', gap: '20px', background: 'var(--background)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    id="chk-pdf"
                    checked={editSchedule.formatPdf}
                    onChange={e => setEditSchedule({ ...editSchedule, formatPdf: e.target.checked })}
                  />
                  <label htmlFor="chk-pdf" style={{ cursor: 'pointer', color: 'var(--text)' }}>Include PDF Attachment</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    id="chk-excel"
                    checked={editSchedule.formatExcel}
                    onChange={e => setEditSchedule({ ...editSchedule, formatExcel: e.target.checked })}
                  />
                  <label htmlFor="chk-excel" style={{ cursor: 'pointer', color: 'var(--text)' }}>Include Excel Attachment</label>
                </div>
              </div>

              {/* Default Recipients */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="sched-recipients">Email Recipients (comma-separated list)</label>
                <input
                  id="sched-recipients"
                  type="text"
                  className="form-control"
                  placeholder="manager@plant.com, staff@plant.com"
                  value={editSchedule.emailRecipients}
                  onChange={e => setEditSchedule({ ...editSchedule, emailRecipients: e.target.value })}
                  required
                />
              </div>

              {/* Scheduler Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Schedule Enabled</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Keep schedule processing running</p>
                </div>
                <ToggleSwitch
                  id="schedule-active-toggle"
                  checked={editSchedule.enabled}
                  onChange={e => setEditSchedule({ ...editSchedule, enabled: e.target.checked })}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowScheduleModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSavingSchedule} className="btn btn-primary" style={{ flex: 2 }}>
                  {isSavingSchedule ? 'Saving…' : (editSchedule.id ? 'Save Changes' : 'Create Run Schedule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
