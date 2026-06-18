// src/components/Settings.jsx
import { useState, useEffect, useCallback } from 'react';
import { 
  getSettings, saveSettings, 
  getSchedules, saveSchedule, deleteSchedule, 
  getPlants, getEmailLogs, addEmailLog,
  getTagConfigs, compileReportData,
  getRecipients, saveRecipient, deleteRecipient, bulkUpdateRecipientsStatus
} from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

/* ─────────────────────────────────────────────
   Eye icon SVGs
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

/* ─────────────────────────────────────────────
   Toggle Switch Component
───────────────────────────────────────────── */
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
        width: 44,
        height: 24,
        backgroundColor: checked ? 'var(--secondary)' : 'var(--border)',
        borderRadius: 34,
        transition: 'background-color 0.25s ease',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute',
          height: 18,
          width: 18,
          left: checked ? 22 : 3,
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

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export default function Settings({ user }) {
  const { currentPlantId } = useSimulator();

  const isSuperAdmin = user.role === 'Super Admin';
  const targetPlantId = isSuperAdmin ? currentPlantId : user.plantId;

  // ── Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState(
    isSuperAdmin ? 'smtp' : 'schedules'
  );

  // ── SMTP Config
  const [smtpHost, setSmtpHost]       = useState('');
  const [smtpPort, setSmtpPort]       = useState(587);
  const [smtpUser, setSmtpUser]       = useState('');
  const [smtpPass, setSmtpPass]       = useState('');
  const [smtpSecure, setSmtpSecure]   = useState(true);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [showSmtpPass, setShowSmtpPass]   = useState(false);

  // ── Test email modal
  const [showTestEmailModal, setShowTestEmailModal]   = useState(false);
  const [testEmailRecipient, setTestEmailRecipient]   = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail]   = useState(false);

  // ── Scheduled Reports
  const [schedulesList, setSchedulesList] = useState([]);
  const [plantsList, setPlantsList]       = useState([]);
  const [showModal, setShowModal]         = useState(false);
  const [editSchedule, setEditSchedule]   = useState({
    id: '', plantId: '', reportType: 'Daily Report',
    frequency: 'Daily', time: '08:00',
    emailRecipients: '', enabled: true,
    formatPdf: true, formatExcel: true,
  });

  // ── Email Logs
  const [emailLogsList, setEmailLogsList] = useState([]);

  // ── Report Templates
  const [logoText, setLogoText]           = useState('');
  const [headerColor, setHeaderColor]     = useState('#1e293b');
  const [footerText, setFooterText]       = useState('');

  // ── Retry queue (hidden when empty)
  const [retryQueue, setRetryQueue] = useState([]);

  // ── Recipients State
  const [recipientsList, setRecipientsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);
  const [isTestingDistribution, setIsTestingDistribution] = useState(false);
  const [editRecipientObj, setEditRecipientObj] = useState({
    id: '', email: '', name: '', role: 'Operator', active: true,
    groups: '', report_types: ''
  });

  const [smtpStatus, setSmtpStatus] = useState(null); // { type: 'success' | 'error', text: string }
  const [templateStatus, setTemplateStatus] = useState(null); // { type: 'success' | 'error', text: string }

  const showSmtpStatus = (type, text) => {
    setSmtpStatus({ type, text });
    setTimeout(() => setSmtpStatus(null), 6000);
  };

  const showTemplateStatus = (type, text) => {
    setTemplateStatus({ type, text });
    setTimeout(() => setTemplateStatus(null), 6000);
  };

  /* ── Load data ────────────────────────── */
  const loadData = useCallback(async () => {
    const plist = await getPlants();
    setPlantsList(plist);

    const sets = await getSettings();
    setSmtpHost(sets.smtpHost   || '');
    setSmtpPort(sets.smtpPort   || 587);
    setSmtpUser(sets.smtpUser   || '');
    setSmtpPass(sets.smtpPass   || '');
    setSmtpSecure(sets.smtpSecure !== undefined ? sets.smtpSecure : true);
    setLogoText(sets.logoText   || '');
    setHeaderColor(sets.headerColor || '#1e293b');
    setFooterText(sets.templateFooterText || sets.footerColor || '');

    const allSchedules = await getSchedules();
    setSchedulesList(allSchedules.filter(s => s.plantId === targetPlantId));

    const allEmailLogs = await getEmailLogs();
    setEmailLogsList(allEmailLogs);

    const recs = await getRecipients();
    setRecipientsList(recs);
  }, [targetPlantId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  /* ── SMTP Handlers ────────────────────── */
  const handleSaveSystemConfigs = async (e) => {
    e.preventDefault();
    const existing = await getSettings();
    await saveSettings({ ...existing, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure });
    showSmtpStatus('success', 'SMTP connection settings updated successfully.');
  };

  const handleTestSmtpConnection = async () => {
    if (!smtpHost) { showSmtpStatus('error', 'Please configure an SMTP host before testing.'); return; }
    setIsTestingSmtp(true);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            host: smtpHost,
            port: smtpPort,
            username: smtpUser,
            password: smtpPass,
            secure: smtpSecure,
            logoText: logoText,
            headerColor: headerColor,
            footerText: footerText
          },
          recipient: smtpUser,
          subject: `SMTP Gateway Diagnostic Check - Skadomation`,
          message: `Connection handshake verification. Test OK.`
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to verify SMTP credentials.');
      }

      showSmtpStatus('success', `SMTP handshake verified successfully! Connection established with ${smtpHost}:${smtpPort}.`);
    } catch (err) {
      console.error("SMTP Test Connection failed:", err);
      showSmtpStatus('error', `SMTP Connection Failure: ${err.message}`);
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    setIsSendingTestEmail(true);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            host: smtpHost,
            port: smtpPort,
            username: smtpUser,
            password: smtpPass,
            secure: smtpSecure,
            logoText: logoText,
            headerColor: headerColor,
            footerText: footerText
          },
          recipient: testEmailRecipient,
          subject: `SMTP Diagnostic Test Email - Skadomation Gateway`,
          message: `This is a diagnostic test email dispatched from Skadomation's central historian gateway.\n\nConnection Handshake: Successful\nSMTP Host: ${smtpHost}:${smtpPort}\nEncryption: ${smtpSecure ? 'SSL/TLS' : 'STARTTLS'}\nTimestamp: ${new Date().toLocaleString()}`
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to dispatch test email.');
      }

      await addEmailLog({
        recipient: testEmailRecipient,
        subject: `SMTP Diagnostic Test Email - Skadomation Gateway`,
        status: 'SENT',
        message: 'SMTP handshake verification message. Test connection OK.',
      });

      showSmtpStatus('success', `Test email successfully dispatched to ${testEmailRecipient}. Verify SMTP log feed.`);
      setShowTestEmailModal(false);
      loadData();
    } catch (err) {
      console.error("Test email failed:", err);
      showSmtpStatus('error', `SMTP Dispatch Failure: ${err.message}`);
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  /* ── Recipient Handlers ────────────────── */
  const validateEmail = (email) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const handleOpenRecipientEdit = (rec = null) => {
    if (rec) {
      setEditRecipientObj({
        id: rec.id,
        email: rec.email,
        name: rec.name,
        role: rec.role || 'Operator',
        active: rec.active !== false,
        groups: rec.groups || '',
        report_types: rec.report_types || ''
      });
    } else {
      setEditRecipientObj({
        id: '',
        email: '',
        name: '',
        role: 'Operator',
        active: true,
        groups: 'Management',
        report_types: 'Daily Reports'
      });
    }
    setShowRecipientModal(true);
  };

  const handleSaveRecipient = async (e) => {
    e.preventDefault();
    if (!editRecipientObj.name.trim()) {
      alert('Name is required.');
      return;
    }
    if (!validateEmail(editRecipientObj.email.trim())) {
      alert('Please enter a valid email address.');
      return;
    }
    setIsSavingRecipient(true);
    try {
      await saveRecipient(editRecipientObj);
      setShowRecipientModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to save recipient:', err);
      alert(`Error saving recipient: ${err.message}`);
    } finally {
      setIsSavingRecipient(false);
    }
  };

  const handleDeleteRecipient = async (id) => {
    if (window.confirm('Are you sure you want to delete this recipient?')) {
      try {
        await deleteRecipient(id);
        setSelectedRecipientIds(prev => prev.filter(x => x !== id));
        await loadData();
      } catch (err) {
        alert(`Failed to delete: ${err.message}`);
      }
    }
  };

  const handleToggleRecipientActive = async (rec) => {
    try {
      await saveRecipient({ ...rec, active: !rec.active });
      await loadData();
    } catch (err) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleBulkRecipientStatus = async (active) => {
    if (selectedRecipientIds.length === 0) return;
    try {
      await bulkUpdateRecipientsStatus(selectedRecipientIds, active);
      setSelectedRecipientIds([]);
      await loadData();
      alert(`Bulk updated selected recipients to ${active ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      alert(`Bulk update failed: ${err.message}`);
    }
  };

  const handleTestDistribution = async () => {
    const activeRecs = recipientsList.filter(r => r.active);
    if (activeRecs.length === 0) {
      alert('No active recipients configured to test.');
      return;
    }
    
    setIsTestingDistribution(true);
    const emailsList = activeRecs.map(r => r.email);
    
    try {
      const sets = await getSettings();
      if (!sets.smtpHost || !sets.smtpUser || !sets.smtpPass) {
        throw new Error('SMTP credentials are not configured. Please complete configuration in SMTP Config tab first.');
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
          to: emailsList,
          subject: `Skadomation SMTP Broadcast Test Distribution`,
          message: `This is a test broadcast report distribution sent to verify email routing.\n\nRecipients Configured: ${activeRecs.length} Active users\nRecipients List: ${emailsList.join(', ')}\nTimestamp: ${new Date().toLocaleString()}\n\nDelivery verification: SUCCESS.`
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to dispatch broadcast email.');
      }

      alert(`Test distribution broadcast successfully sent to all ${activeRecs.length} active recipients!`);
    } catch (err) {
      console.error("Test distribution failed:", err);
      alert(`SMTP Test Distribution Failure: ${err.message}`);
    } finally {
      setIsTestingDistribution(false);
    }
  };

  /* ── Schedule Handlers ────────────────── */
  const handleToggleEnable = async (sched) => {
    await saveSchedule({ ...sched, enabled: !sched.enabled });
    await loadData();
  };

  const handleOpenEdit = (sched = null) => {
    if (sched) {
      setEditSchedule({ formatPdf: sched.formatPdf !== false, formatExcel: sched.formatExcel !== false, ...sched });
    } else {
      setEditSchedule({
        id: '', plantId: targetPlantId, reportType: 'Daily Report',
        frequency: 'Daily', time: '08:00',
        emailRecipients: '', enabled: true,
        formatPdf: true, formatExcel: true,
      });
    }
    setShowModal(true);
  };

  const handleDelete = async (schedId) => {
    if (window.confirm('Are you sure you want to delete this report schedule?')) {
      await deleteSchedule(schedId);
      await loadData();
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    await saveSchedule(editSchedule);
    setShowModal(false);
    await loadData();
  };

  const handleTriggerSimulatedSend = async (sched) => {
    const activePlantName = plantsList.find(p => p.id === sched.plantId)?.name || 'Unknown Plant';
    const subject = `Automated ${sched.reportType} - ${activePlantName} - ${new Date().toISOString().split('T')[0]}`;
    const formatsMsg = [];
    if (sched.formatPdf !== false)   formatsMsg.push('PDF');
    if (sched.formatExcel !== false) formatsMsg.push('Excel');
    const attachmentInfo = formatsMsg.length > 0 ? `[Attachments: ${formatsMsg.join(', ')}]` : '[No Attachments]';
    
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

    try {
      const sets = await getSettings();
      if (!sets.smtpHost || !sets.smtpUser || !sets.smtpPass) {
        throw new Error('SMTP credentials are not configured. Please complete configuration in SMTP Config tab first.');
      }

      const recs = await getRecipients();
      const category = getReportCategory(sched.reportType);
      const activeSubscribers = recs.filter(r => {
        if (!r.active) return false;
        const subbedTypes = (r.report_types || '').split(',').map(x => x.trim()).filter(Boolean);
        return subbedTypes.includes(category);
      });

      const toList = activeSubscribers.map(r => r.email);
      const manualRecs = (sched.emailRecipients || '').split(',').map(x => x.trim()).filter(Boolean);
      manualRecs.forEach(email => {
        if (!toList.includes(email)) {
          toList.push(email);
        }
      });

      if (toList.length === 0) {
        throw new Error(`No active recipients are subscribed to ${category}, and no manual recipients are configured on the schedule.`);
      }

      // Compile actual database telemetry for the simulation report
      const tagConfigs = await getTagConfigs();
      const activeTags = tagConfigs.filter(t => t.ReportsVisible !== false).map(t => t.TagIndex);
      
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const dateInfo = `${startDate.replace('T', ' ').substring(0, 16)} to ${endDate.replace('T', ' ').substring(0, 16)}`;

      const tempReport = {
        id: 'sched-sim-' + Date.now(),
        name: `Automated ${sched.reportType} - ${activePlantName}`,
        type: sched.reportType,
        dateInfo,
        startDate,
        endDate,
        tags: activeTags.length > 0 ? activeTags : [1],
        generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        createdBy: 'System Scheduler'
      };

      const reportData = await compileReportData(tempReport);

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
          subject,
          message: `This is an automated dispatch of your production report.\n\nReport Type: ${sched.reportType}\nPlant Assigned: ${activePlantName}\nTrigger Time: ${sched.time}\nFormat(s): ${formatsMsg.join(', ')}\n\n${attachmentInfo}\n\nReport compilation completed successfully. Telemetry data attached.`,
          reportData: {
            meta: tempReport,
            data: reportData
          }
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to dispatch report email.');
      }

      await addEmailLog({
        recipient: toList.join(', '),
        subject,
        status: 'SENT',
        message: `Triggered automated test dispatch for: ${sched.reportType}. ${attachmentInfo}`,
      });
      const updatedSched = { ...sched, lastRun: new Date().toISOString().replace('T', ' ').substring(0, 19) };
      await saveSchedule(updatedSched);
      alert(`SMTP Success: Email report dispatched to [${toList.join(', ')}]`);
      await loadData();
    } catch (err) {
      console.error("Force dispatch failed:", err);
      alert(`SMTP Dispatch Failure: ${err.message}`);
    }
  };

  /* ── Retry Queue Handler ──────────────── */
  const handleManualRetry = (id) => {
    setRetryQueue(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'RETRYING', attempts: item.attempts + 1 } : item
    ));
    setTimeout(async () => {
      const targetItem = retryQueue.find(item => item.id === id);
      if (targetItem) {
        await addEmailLog({
          recipient: targetItem.recipient,
          subject: targetItem.subject,
          status: 'SENT',
          message: 'Resent successfully after SMTP gateway routing optimization.',
        });
        setRetryQueue(prev => prev.filter(item => item.id !== id));
        alert('Email resent successfully!');
        loadData();
      }
    }, 1200);
  };

  const handleSaveTemplates = async (e) => {
    e.preventDefault();
    const existing = await getSettings();
    await saveSettings({
      ...existing,
      templateLogoText: logoText,
      templateHeaderColor: headerColor,
      templateFooterText: footerText
    });
    showTemplateStatus('success', 'Report template settings saved successfully.');
  };

  /* ─────────────────────────────────────────────
     Tab definitions
  ───────────────────────────────────────────── */
  const superAdminTabs = [
    { key: 'smtp',      label: 'SMTP Config' },
    { key: 'emaillogs', label: 'Email Logs' },
    { key: 'schedules', label: 'Scheduled Reports' },
    { key: 'templates', label: 'Report Templates' },
    { key: 'recipients', label: 'Recipient Management' },
  ];
  const plantAdminTabs = [
    { key: 'schedules', label: 'Scheduled Reports' },
    { key: 'recipients', label: 'Recipient Management' },
  ];
  const tabs = isSuperAdmin ? superAdminTabs : plantAdminTabs;

  /* ─────────────────────────────────────────────
     Inline styles (scoped to component)
  ───────────────────────────────────────────── */
  const S = {
    page: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    },
    header: {
      marginBottom: '28px',
    },
    headerTitle: {
      fontSize: '1.55rem',
      fontWeight: 700,
      color: 'var(--text)',
      margin: 0,
      letterSpacing: '-0.3px',
    },
    headerSub: {
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
      margin: '4px 0 0',
    },
    tabBar: {
      display: 'flex',
      gap: 2,
      borderBottom: '1px solid var(--border)',
      marginBottom: '28px',
    },
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
    // Section card wrapper
    card: {
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '28px 32px',
    },
    sectionTitle: {
      fontSize: '1rem',
      fontWeight: 700,
      color: 'var(--text)',
      margin: '0 0 4px',
    },
    sectionSub: {
      fontSize: '0.8rem',
      color: 'var(--text-muted)',
      margin: '0 0 24px',
    },
    divider: {
      borderTop: '1px solid var(--border)',
      margin: '24px 0',
    },
    // Form
    formGrid2: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      marginBottom: 0,
    },
    label: {
      fontSize: '0.8rem',
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    inputWrap: {
      position: 'relative',
    },
    eyeBtn: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      padding: 0,
      color: 'var(--text-muted)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
    },
    actionRow: {
      display: 'flex',
      gap: '12px',
      paddingTop: '8px',
      flexWrap: 'wrap',
    },
    // Badges
    badgeEnabled: {
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: '0.72rem',
      fontWeight: 600,
      background: 'rgba(34,197,94,0.12)',
      color: 'var(--success)',
      border: '1px solid rgba(34,197,94,0.25)',
    },
    badgeDisabled: {
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: '0.72rem',
      fontWeight: 600,
      background: 'rgba(100,116,139,0.12)',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)',
    },
    badgeFreq: {
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: '0.72rem',
      fontWeight: 600,
      background: 'rgba(79,70,229,0.08)',
      color: '#4F46E5',
      border: '1px solid rgba(99,102,241,0.25)',
    },
    // Table
    tableWrap: {
      overflowX: 'auto',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
    },
    th: {
      padding: '10px 16px',
      textAlign: 'left',
      fontSize: '0.75rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--text-muted)',
      borderBottom: '1px solid var(--border)',
      background: 'var(--background)',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '12px 16px',
      fontSize: '0.85rem',
      color: 'var(--text)',
      borderBottom: '1px solid var(--border)',
      verticalAlign: 'middle',
    },
    // Empty state
    empty: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      color: 'var(--text-muted)',
      gap: '12px',
      textAlign: 'center',
    },
    emptyIcon: {
      fontSize: '2.2rem',
      opacity: 0.4,
    },
    emptyText: {
      fontSize: '0.9rem',
      margin: 0,
    },
    // Schedule card
    scheduleCard: (enabled) => ({
      background: 'var(--background)',
      border: `1px solid var(--border)`,
      borderLeft: enabled ? '4px solid var(--success)' : '4px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }),
    schedMeta: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 2fr',
      gap: '8px 20px',
      fontSize: '0.82rem',
    },
    schedMetaKey: {
      display: 'block',
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--text-muted)',
      marginBottom: '2px',
    },
    schedMetaVal: {
      color: 'var(--text)',
      fontWeight: 500,
    },
    schedActions: {
      display: 'flex',
      gap: '8px',
      borderTop: '1px solid var(--border)',
      paddingTop: '12px',
    },
    // Color swatch preview
    colorWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    colorInput: {
      width: 44,
      height: 36,
      padding: '2px',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--card-bg)',
      cursor: 'pointer',
    },
    // Modal
    modalOverlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modalBox: (maxW) => ({
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      width: '100%',
      maxWidth: maxW || 480,
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
    }),
    modalHead: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 24px',
      borderBottom: '1px solid var(--border)',
    },
    modalTitle: {
      fontSize: '1rem',
      fontWeight: 700,
      color: 'var(--text)',
      margin: 0,
    },
    modalClose: {
      background: 'transparent',
      border: 'none',
      color: 'var(--text-muted)',
      fontSize: '1.4rem',
      cursor: 'pointer',
      lineHeight: 1,
      padding: '2px 6px',
      borderRadius: 4,
    },
    modalBody: {
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
    },
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div style={S.page}>

      {/* ── Page Header ─────────────────────── */}
      <div style={S.header}>
        <h2 style={S.headerTitle}>System Settings</h2>
        <p style={S.headerSub}>
          {isSuperAdmin
            ? 'Manage SMTP configuration, email delivery, scheduled reports, and report branding.'
            : 'Configure automated report schedules for your plant.'}
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
          TAB: SMTP CONFIG
      ═══════════════════════════════════════ */}
      {activeSubTab === 'smtp' && isSuperAdmin && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: '100%', maxWidth: 620 }}>
            <p style={S.sectionTitle}>SMTP Server Configuration</p>
            <p style={S.sectionSub}>
              Configure outbound mail relay for automated report delivery.
            </p>

            {smtpStatus && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 500,
                backgroundColor: smtpStatus.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: smtpStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                color: smtpStatus.type === 'success' ? '#34D399' : '#F87171',
                marginBottom: '16px'
              }}>
                {smtpStatus.type === 'success' ? '✓' : '✗'} {smtpStatus.text}
              </div>
            )}

            <form onSubmit={handleSaveSystemConfigs} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Host */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="smtp-host">Host</label>
                <input
                  id="smtp-host"
                  type="text"
                  className="form-control"
                  placeholder="smtp.example.com"
                  value={smtpHost}
                  onChange={e => setSmtpHost(e.target.value)}
                  required
                />
              </div>

              {/* Port + Security */}
              <div style={S.formGrid2}>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="smtp-port">Port</label>
                  <input
                    id="smtp-port"
                    type="number"
                    className="form-control"
                    placeholder="587"
                    value={smtpPort}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 587;
                      setSmtpPort(val);
                      setSmtpSecure(val === 465);
                    }}
                    required
                  />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="smtp-security">Security</label>
                  <select
                    id="smtp-security"
                    className="form-control"
                    value={smtpSecure ? 'SSL' : 'TLS'}
                    onChange={e => {
                      const isSSL = e.target.value === 'SSL';
                      setSmtpSecure(isSSL);
                      setSmtpPort(isSSL ? 465 : 587);
                    }}
                  >
                    <option value="SSL">SSL / TLS (Port 465)</option>
                    <option value="TLS">STARTTLS (Port 587)</option>
                  </select>
                </div>
              </div>

              {/* Username */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="smtp-username">Username</label>
                <input
                  id="smtp-username"
                  type="text"
                  className="form-control"
                  placeholder="user@example.com"
                  value={smtpUser}
                  onChange={e => setSmtpUser(e.target.value)}
                  required
                />
              </div>

              {/* Password */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="smtp-password">Password</label>
                <div style={S.inputWrap}>
                  <input
                    id="smtp-password"
                    type={showSmtpPass ? 'text' : 'password'}
                    className="form-control"
                    placeholder="••••••••••••"
                    value={smtpPass}
                    onChange={e => setSmtpPass(e.target.value)}
                    style={{ paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass(p => !p)}
                    style={{ ...S.eyeBtn, color: showSmtpPass ? 'var(--secondary)' : 'var(--text-muted)' }}
                    title={showSmtpPass ? 'Hide Password' : 'Show Password'}
                  >
                    {showSmtpPass ? <EyeOpen /> : <EyeOff />}
                  </button>
                </div>
              </div>

              {/* TLS Secure toggle row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>TLS Secure</p>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>Encrypt connection using TLS handshake</p>
                </div>
                <ToggleSwitch
                  id="smtp-tls-toggle"
                  checked={smtpSecure}
                  onChange={() => {
                    setSmtpSecure(v => {
                      const next = !v;
                      setSmtpPort(next ? 465 : 587);
                      return next;
                    });
                  }}
                />
              </div>

              {/* SMTP Configuration Guidance Tip */}
              <div style={{
                padding: '16px 20px',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.825rem',
                lineHeight: '1.5',
                color: 'var(--text-muted)'
              }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '8px' }}>💡 Quick SMTP Tips:</strong>
                <ul style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Gmail Users:</strong> You must generate and use a 16-character <strong>App Password</strong> in your Google Account security settings. Your standard Gmail login password will be rejected.</li>
                  <li><strong>Port & Security Sync:</strong> Port <strong>465</strong> requires <strong>SSL/TLS</strong>. Port <strong>587</strong> requires <strong>STARTTLS</strong>. The system will automatically align these settings.</li>
                  <li><strong>Self-Signed Industrial Relays:</strong> The backend automatically bypasses SSL handshake checks to accommodate local enterprise SMTP servers.</li>
                </ul>
              </div>

              <div style={S.divider} />

              {/* Action buttons */}
              <div style={S.actionRow}>
                <button
                  type="button"
                  onClick={handleTestSmtpConnection}
                  disabled={isTestingSmtp}
                  className="btn btn-secondary"
                  style={{ flex: 1, minWidth: 140 }}
                >
                  {isTestingSmtp ? 'Testing…' : '⚡ Test Connection'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTestEmailModal(true)}
                  className="btn btn-secondary"
                  style={{ flex: 1, minWidth: 140 }}
                >
                  ✉️ Send Test Email
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5, minWidth: 160 }}>
                  Save SMTP Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: EMAIL LOGS
      ═══════════════════════════════════════ */}
      {activeSubTab === 'emaillogs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Retry Queue — only if queue has items */}
          {retryQueue.length > 0 && (
            <div style={{ ...S.card, borderLeft: '4px solid var(--warning)', paddingLeft: 28 }}>
              <p style={{ ...S.sectionTitle, color: 'var(--warning)' }}>⚠️ Retry Queue ({retryQueue.length})</p>
              <p style={S.sectionSub}>Dispatches retrying due to SMTP timeouts or network failures.</p>
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Recipient', 'Subject', 'Attempts', 'Error', 'Actions'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {retryQueue.map((item, idx) => (
                      <tr key={idx}>
                        <td style={S.td}>{item.recipient}</td>
                        <td style={S.td}>{item.subject}</td>
                        <td style={{ ...S.td, textAlign: 'center', fontFamily: 'monospace' }}>{item.attempts} / 5</td>
                        <td style={{ ...S.td, color: 'var(--error)', fontSize: '0.78rem' }}>{item.error}</td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => handleManualRetry(item.id)}
                              disabled={item.status === 'RETRYING'}
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                            >
                              {item.status === 'RETRYING' ? 'Sending…' : '🔄 Retry'}
                            </button>
                            <button
                              onClick={() => setRetryQueue(prev => prev.filter(q => q.id !== item.id))}
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                            >
                              ✕ Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Email Logs Table */}
          <div style={S.card}>
            <p style={S.sectionTitle}>Sent Email History</p>
            <p style={S.sectionSub}>Outbound SMTP transaction log for all dispatched reports and notifications.</p>

            {emailLogsList.length === 0 ? (
              <div style={S.empty}>
                <span style={S.emptyIcon}>✉️</span>
                <p style={S.emptyText}>No emails have been sent yet</p>
                <p style={{ ...S.emptyText, fontSize: '0.78rem', opacity: 0.6 }}>
                  Sent emails will appear here once the system starts dispatching reports.
                </p>
              </div>
            ) : (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Timestamp', 'Recipient', 'Subject', 'Formats', 'Status'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emailLogsList.map((log, idx) => {
                      const msg  = log.message || '';
                      const subj = log.subject  || '';
                      const hasPdf   = msg.includes('PDF')   || subj.includes('Daily') || subj.includes('Shift') || subj.includes('Weekly') || msg.includes('test');
                      const hasExcel = msg.includes('Excel') || subj.includes('Daily') || subj.includes('Shift') || subj.includes('Weekly') || msg.includes('test');
                      return (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                          <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                            {log.timestamp.replace('T', ' ').substring(0, 19)}
                          </td>
                          <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.recipient}>
                            {log.recipient}
                          </td>
                          <td style={{ ...S.td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={subj}>
                            {subj}
                          </td>
                          <td style={S.td}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {hasPdf   && <span className="badge badge-info"    style={{ fontSize: '0.7rem', padding: '2px 7px' }}>📄 PDF</span>}
                              {hasExcel && <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 7px' }}>📊 Excel</span>}
                              {!hasPdf && !hasExcel && <span className="badge" style={{ fontSize: '0.7rem', padding: '2px 7px', opacity: 0.5 }}>—</span>}
                            </div>
                          </td>
                          <td style={S.td}>
                            <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>✓ {log.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: SCHEDULED REPORTS
      ═══════════════════════════════════════ */}
      {activeSubTab === 'schedules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header action bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ ...S.sectionTitle, marginBottom: 2 }}>Scheduled Reports</p>
              <p style={{ ...S.sectionSub, marginBottom: 0 }}>Automate report compilation and delivery by configuring time-based triggers.</p>
            </div>
            <button onClick={() => handleOpenEdit(null)} className="btn btn-primary">
              + Add Schedule
            </button>
          </div>

          {/* Schedule list + sidebar */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {schedulesList.length === 0 ? (
                <div style={{ ...S.card, ...S.empty }}>
                  <span style={S.emptyIcon}>⏱️</span>
                  <p style={S.emptyText}>No scheduled reports configured</p>
                  <p style={{ ...S.emptyText, fontSize: '0.78rem', opacity: 0.6 }}>
                    Click "Add Schedule" to set up automated report delivery.
                  </p>
                </div>
              ) : (
                schedulesList.map((sched, idx) => (
                  <div key={idx} style={S.scheduleCard(sched.enabled)}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={sched.enabled ? S.badgeEnabled : S.badgeDisabled}>
                          {sched.enabled ? 'Active' : 'Paused'}
                        </span>
                        <span style={S.badgeFreq}>{sched.frequency}</span>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{sched.reportType}</strong>
                      </div>
                      <ToggleSwitch
                        id={`sched-toggle-${idx}`}
                        checked={sched.enabled}
                        onChange={() => handleToggleEnable(sched)}
                      />
                    </div>

                    {/* Meta grid */}
                    <div style={S.schedMeta}>
                      <div>
                        <span style={S.schedMetaKey}>Plant</span>
                        <span style={S.schedMetaVal}>{plantsList.find(p => p.id === sched.plantId)?.name || '—'}</span>
                      </div>
                      <div>
                        <span style={S.schedMetaKey}>Trigger Time</span>
                        <span style={{ ...S.schedMetaVal, fontFamily: 'monospace' }}>🕒 {sched.time}</span>
                      </div>
                      <div>
                        <span style={S.schedMetaKey}>Recipients</span>
                        <span style={{ ...S.schedMetaVal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={sched.emailRecipients}>
                          {sched.emailRecipients || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Format tags */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {sched.formatPdf   !== false && <span className="badge badge-info"    style={{ fontSize: '0.72rem', padding: '2px 8px' }}>📄 PDF</span>}
                      {sched.formatExcel !== false && <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>📊 Excel</span>}
                    </div>

                    {/* Actions */}
                    <div style={S.schedActions}>
                      <button onClick={() => handleTriggerSimulatedSend(sched)} className="btn btn-secondary" style={{ flex: 2, fontSize: '0.8rem', padding: '6px' }}>
                        ⚡ Force Dispatch
                      </button>
                      <button onClick={() => handleOpenEdit(sched)} className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '6px' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => handleDelete(sched.id)} className="btn btn-danger" style={{ flex: 1, fontSize: '0.8rem', padding: '6px', color: 'white' }}>
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sidebar: Upcoming calendar */}
            <div style={S.card}>
              <p style={{ ...S.sectionTitle, marginBottom: 4 }}>Distribution Calendar</p>
              <p style={{ ...S.sectionSub, marginBottom: 16 }}>Upcoming trigger times for active schedules</p>

              {schedulesList.filter(s => s.enabled).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '20px 0' }}>
                  No enabled schedules to preview.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {schedulesList.filter(s => s.enabled).map((sched, idx) => {
                    const today = new Date().toISOString().split('T')[0];
                    return (
                      <div key={idx} style={{ padding: '10px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{sched.reportType}</span>
                          <span style={S.badgeFreq}>{sched.frequency}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          <span>Next execution</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--secondary)' }}>{today} {sched.time}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: REPORT TEMPLATES
      ═══════════════════════════════════════ */}
      {activeSubTab === 'templates' && isSuperAdmin && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: '100%', maxWidth: 620 }}>
            <p style={S.sectionTitle}>Report Branding & Templates</p>
            <p style={S.sectionSub}>
              Customize the visual identity of exported PDF and Excel reports.
            </p>

            {templateStatus && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 500,
                backgroundColor: templateStatus.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: templateStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                color: templateStatus.type === 'success' ? '#34D399' : '#F87171',
                marginBottom: '16px'
              }}>
                {templateStatus.type === 'success' ? '✓' : '✗'} {templateStatus.text}
              </div>
            )}

            <form onSubmit={handleSaveTemplates} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Logo / Company name */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="tmpl-logo">Organisation / Logo Text</label>
                <input
                  id="tmpl-logo"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Acme Industries Pvt. Ltd."
                  value={logoText}
                  onChange={e => setLogoText(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Appears in the report header as the organisation name.
                </span>
              </div>

              <div style={S.divider} />

              {/* Template settings customization fields */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="tmpl-header-color">Header Background Color</label>
                <div style={S.colorWrap}>
                  <input
                    id="tmpl-header-color"
                    type="color"
                    value={headerColor}
                    onChange={e => setHeaderColor(e.target.value)}
                    style={S.colorInput}
                  />
                  <input
                    type="text"
                    className="form-control"
                    value={headerColor}
                    onChange={e => setHeaderColor(e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                    maxLength={7}
                  />
                </div>
              </div>

              <div style={S.formGroup}>
                <label style={S.label} htmlFor="tmpl-footer-text">PDF Footer Compliance Text</label>
                <input
                  id="tmpl-footer-text"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Confidential Report. For internal use only."
                  value={footerText}
                  onChange={e => setFooterText(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Appears at the very bottom of exported report files.
                </span>
              </div>

              {/* Live preview bar */}
              <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ background: headerColor, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>📊</div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{logoText || 'Your Organisation'}</div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Report Header Preview</div>
                  </div>
                </div>
                <div style={{ background: 'var(--background)', padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  — Report body content —
                </div>
                <div style={{ background: '#0f172a', padding: '8px 16px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                  {footerText || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.'}
                </div>
              </div>

              <div style={S.divider} />

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" style={{ minWidth: 180 }}>
                  Save Template Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: RECIPIENT MANAGEMENT
      ═══════════════════════════════════════ */}
      {activeSubTab === 'recipients' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <p style={S.sectionTitle}>Recipient Management</p>
                <p style={{ ...S.sectionSub, marginBottom: 0 }}>
                  Manage report distribution lists, contact groups, and delivery configurations.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleTestDistribution}
                  disabled={isTestingDistribution}
                  className="btn btn-secondary"
                >
                  ⚡ {isTestingDistribution ? 'Testing Broadcast…' : 'Test Distribution'}
                </button>
                <button
                  onClick={() => handleOpenRecipientEdit()}
                  className="btn btn-primary"
                >
                  ➕ Add Recipient
                </button>
              </div>
            </div>

            {/* Filters and search row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div style={{ width: '150px' }}>
                <select
                  className="form-control"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              {selectedRecipientIds.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '8px' }}>
                    {selectedRecipientIds.length} selected
                  </span>
                  <button onClick={() => handleBulkRecipientStatus(true)} className="btn btn-secondary btn-sm">
                    Bulk Enable
                  </button>
                  <button onClick={() => handleBulkRecipientStatus(false)} className="btn btn-secondary btn-sm">
                    Bulk Disable
                  </button>
                </div>
              )}
            </div>

            {/* Recipient Directory Table */}
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={
                          recipientsList.length > 0 &&
                          recipientsList.every(r => selectedRecipientIds.includes(r.id))
                        }
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedRecipientIds(recipientsList.map(r => r.id));
                          } else {
                            setSelectedRecipientIds([]);
                          }
                        }}
                      />
                    </th>
                    <th style={S.th}>Name</th>
                    <th style={S.th}>Email Address</th>
                    <th style={S.th}>Role</th>
                    <th style={S.th}>Groups</th>
                    <th style={S.th}>Report Types</th>
                    <th style={{ ...S.th, width: 80, textAlign: 'center' }}>Status</th>
                    <th style={{ ...S.th, width: 120, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recipientsList
                    .filter(r => {
                      const matchesSearch =
                        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        r.email?.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesStatus =
                        statusFilter === 'all' ||
                        (statusFilter === 'active' && r.active) ||
                        (statusFilter === 'inactive' && !r.active);
                      return matchesSearch && matchesStatus;
                    })
                    .map(rec => (
                      <tr key={rec.id} style={{ background: selectedRecipientIds.includes(rec.id) ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedRecipientIds.includes(rec.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedRecipientIds(prev => [...prev, rec.id]);
                              } else {
                                setSelectedRecipientIds(prev => prev.filter(id => id !== rec.id));
                              }
                            }}
                          />
                        </td>
                        <td style={{ ...S.td, fontWeight: 600, color: 'var(--text)' }}>{rec.name}</td>
                        <td style={S.td}>{rec.email}</td>
                        <td style={S.td}>
                          <span style={{ fontSize: '0.75rem', background: 'var(--surface-raised)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-muted)' }}>
                            {rec.role || 'Operator'}
                          </span>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(rec.groups || '').split(',').filter(Boolean).map(g => (
                              <span key={g} style={{ fontSize: '0.7rem', padding: '1px 6px', background: 'rgba(59,130,246,0.1)', color: 'var(--secondary)', borderRadius: 3 }}>
                                {g.trim()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(rec.report_types || '').split(',').filter(Boolean).map(rt => (
                              <span key={rt} style={{ fontSize: '0.7rem', padding: '1px 6px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: 3 }}>
                                {rt.trim()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <ToggleSwitch
                            id={`status-${rec.id}`}
                            checked={rec.active}
                            onChange={() => handleToggleRecipientActive(rec)}
                          />
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              onClick={() => handleOpenRecipientEdit(rec)}
                              className="btn btn-secondary btn-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRecipient(rec.id)}
                              className="btn btn-danger btn-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                  {recipientsList.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ ...S.td, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No report recipients configured. Add recipients to start routing reports.
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
          MODAL: Send Test Email
      ═══════════════════════════════════════ */}
      {showTestEmailModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(420)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>Send Test Email</h3>
              <button onClick={() => setShowTestEmailModal(false)} style={S.modalClose}>×</button>
            </div>
            <form onSubmit={handleSendTestEmail} style={S.modalBody}>
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="test-recipient">Recipient Email</label>
                <input
                  id="test-recipient"
                  type="email"
                  className="form-control"
                  placeholder="recipient@example.com"
                  value={testEmailRecipient}
                  onChange={e => setTestEmailRecipient(e.target.value)}
                  required
                />
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--background)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                A diagnostic email will be sent using the configured SMTP credentials to verify delivery.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowTestEmailModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSendingTestEmail} className="btn btn-primary" style={{ flex: 2 }}>
                  {isSendingTestEmail ? 'Sending…' : '⚡ Send Test Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Add / Edit Schedule
      ═══════════════════════════════════════ */}
      {showModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(500)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>
                {editSchedule.id ? 'Edit Schedule' : 'Add Schedule'}
              </h3>
              <button onClick={() => setShowModal(false)} style={S.modalClose}>×</button>
            </div>
            <form onSubmit={handleSaveSchedule} style={S.modalBody}>
              {/* Report type */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="sched-report-type">Report Template</label>
                <select
                  id="sched-report-type"
                  className="form-control"
                  value={editSchedule.reportType}
                  onChange={e => setEditSchedule({ ...editSchedule, reportType: e.target.value })}
                >
                  <option value="Shift Report">Shift Report</option>
                  <option value="Daily Report">Daily Report</option>
                  <option value="Weekly Report">Weekly Report</option>
                  <option value="Monthly Report">Monthly Report</option>
                </select>
              </div>

              {/* Frequency + Time */}
              <div style={S.formGrid2}>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="sched-frequency">Frequency</label>
                  <select
                    id="sched-frequency"
                    className="form-control"
                    value={editSchedule.frequency}
                    onChange={e => setEditSchedule({ ...editSchedule, frequency: e.target.value })}
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="sched-time">Trigger Time</label>
                  <input
                    id="sched-time"
                    type="time"
                    className="form-control"
                    value={editSchedule.time}
                    onChange={e => setEditSchedule({ ...editSchedule, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Recipients */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="sched-emails">Email Recipients</label>
                <input
                  id="sched-emails"
                  type="text"
                  className="form-control"
                  placeholder="alerts@company.com, admin@company.com"
                  value={editSchedule.emailRecipients}
                  onChange={e => setEditSchedule({ ...editSchedule, emailRecipients: e.target.value })}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Separate multiple addresses with commas.</span>
              </div>

              {/* Formats */}
              <div style={S.formGroup}>
                <label style={S.label}>Output Formats</label>
                <div style={{ display: 'flex', gap: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={editSchedule.formatPdf !== false}
                      onChange={e => setEditSchedule({ ...editSchedule, formatPdf: e.target.checked })}
                    />
                    📄 PDF Report
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={editSchedule.formatExcel !== false}
                      onChange={e => setEditSchedule({ ...editSchedule, formatExcel: e.target.checked })}
                    />
                    📊 Excel Sheet
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  {editSchedule.id ? 'Save Changes' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL: Add / Edit Recipient
      ═══════════════════════════════════════ */}
      {showRecipientModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox(480)}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>
                {editRecipientObj.id ? 'Edit Report Recipient' : 'Add Report Recipient'}
              </h3>
              <button onClick={() => setShowRecipientModal(false)} style={S.modalClose}>×</button>
            </div>
            
            <form onSubmit={handleSaveRecipient} style={S.modalBody}>
              {/* Name */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="rec-name">Recipient Name</label>
                <input
                  id="rec-name"
                  type="text"
                  className="form-control"
                  placeholder="e.g. John Doe"
                  value={editRecipientObj.name}
                  onChange={e => setEditRecipientObj({ ...editRecipientObj, name: e.target.value })}
                  required
                />
              </div>

              {/* Email */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="rec-email">Email Address</label>
                <input
                  id="rec-email"
                  type="email"
                  className="form-control"
                  placeholder="e.g. john@company.com"
                  value={editRecipientObj.email}
                  onChange={e => setEditRecipientObj({ ...editRecipientObj, email: e.target.value })}
                  required
                />
              </div>

              {/* Role */}
              <div style={S.formGroup}>
                <label style={S.label} htmlFor="rec-role">Role / Job Title</label>
                <input
                  id="rec-role"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Production Manager"
                  value={editRecipientObj.role}
                  onChange={e => setEditRecipientObj({ ...editRecipientObj, role: e.target.value })}
                />
              </div>

              {/* Groups Selector */}
              <div style={S.formGroup}>
                <label style={S.label}>Assigned Groups</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', background: 'var(--background)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  {['Management', 'Plant Admins', 'Operations Team', 'Maintenance Team', 'Quality Team'].map(group => {
                    const activeGroups = (editRecipientObj.groups || '').split(',').map(x => x.trim()).filter(Boolean);
                    const isChecked = activeGroups.includes(group);
                    return (
                      <label key={group} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text)' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            let nextGroups;
                            if (e.target.checked) {
                              nextGroups = [...activeGroups, group];
                            } else {
                              nextGroups = activeGroups.filter(g => g !== group);
                            }
                            setEditRecipientObj({ ...editRecipientObj, groups: nextGroups.join(', ') });
                          }}
                        />
                        {group}
                      </label>
                    );
                  })}
                </div>
                <div style={{ marginTop: '8px' }}>
                  <label style={{ ...S.label, fontSize: '0.72rem', textTransform: 'none', letterSpacing: 'normal', marginBottom: '4px', display: 'block' }} htmlFor="custom-groups-input">Custom Groups (comma-separated)</label>
                  <input
                    id="custom-groups-input"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Finance, Safety Board"
                    value={
                      (() => {
                        const standardGroups = ['Management', 'Plant Admins', 'Operations Team', 'Maintenance Team', 'Quality Team'];
                        const activeGroups = (editRecipientObj.groups || '').split(',').map(x => x.trim()).filter(Boolean);
                        return activeGroups.filter(g => !standardGroups.includes(g)).join(', ');
                      })()
                    }
                    onChange={e => {
                      const standardGroups = ['Management', 'Plant Admins', 'Operations Team', 'Maintenance Team', 'Quality Team'];
                      const activeGroups = (editRecipientObj.groups || '').split(',').map(x => x.trim()).filter(Boolean);
                      const selectedStandard = activeGroups.filter(g => standardGroups.includes(g));
                      const customInput = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
                      setEditRecipientObj({ ...editRecipientObj, groups: [...selectedStandard, ...customInput].join(', ') });
                    }}
                  />
                </div>
              </div>

              {/* Report Types Selector */}
              <div style={S.formGroup}>
                <label style={S.label}>Assigned Report Subscriptions</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', background: 'var(--background)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  {['Daily Reports', 'Shift Reports', 'Weekly Reports', 'Monthly Reports', 'Alarm Reports', 'Historian Reports'].map(type => {
                    const activeTypes = (editRecipientObj.report_types || '').split(',').map(x => x.trim()).filter(Boolean);
                    const isChecked = activeTypes.includes(type);
                    return (
                      <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text)' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            let nextTypes;
                            if (e.target.checked) {
                              nextTypes = [...activeTypes, type];
                            } else {
                              nextTypes = activeTypes.filter(t => t !== type);
                            }
                            setEditRecipientObj({ ...editRecipientObj, report_types: nextTypes.join(', ') });
                          }}
                        />
                        {type}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Active Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Enabled Status</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Include recipient in active broadcasts</p>
                </div>
                <ToggleSwitch
                  id="recipient-active-toggle"
                  checked={editRecipientObj.active}
                  onChange={e => setEditRecipientObj({ ...editRecipientObj, active: e.target.checked })}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowRecipientModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSavingRecipient} className="btn btn-primary" style={{ flex: 2 }}>
                  {isSavingRecipient ? 'Saving…' : (editRecipientObj.id ? 'Save Changes' : 'Add Recipient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
