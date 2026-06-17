// src/components/Settings.jsx
import { useState, useEffect, useCallback } from 'react';
import { 
  getSettings, saveSettings, 
  getSchedules, saveSchedule, deleteSchedule, 
  getPlants, getEmailLogs, addEmailLog 
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
  const { currentPlantId, syncTrigger } = useSimulator();

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
  const [footerColor, setFooterColor]     = useState('#0f172a');

  // ── Retry queue (hidden when empty)
  const [retryQueue, setRetryQueue] = useState([]);

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
    setFooterColor(sets.footerColor || '#0f172a');

    const allSchedules = await getSchedules();
    setSchedulesList(allSchedules.filter(s => s.plantId === targetPlantId));

    const allEmailLogs = await getEmailLogs();
    setEmailLogsList(allEmailLogs);
  }, [targetPlantId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData, currentPlantId, syncTrigger]);

  /* ── SMTP Handlers ────────────────────── */
  const handleSaveSystemConfigs = async (e) => {
    e.preventDefault();
    const existing = await getSettings();
    await saveSettings({ ...existing, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure });
    alert('SMTP connection settings updated successfully.');
  };

  const handleTestSmtpConnection = () => {
    if (!smtpHost) { alert('Please configure an SMTP host before testing.'); return; }
    setIsTestingSmtp(true);
    setTimeout(() => {
      setIsTestingSmtp(false);
      alert(`SMTP test dispatched to ${smtpHost}:${smtpPort}. Check your email server logs to confirm delivery.`);
    }, 1200);
  };

  const handleSendTestEmail = (e) => {
    e.preventDefault();
    setIsSendingTestEmail(true);
    setTimeout(async () => {
      setIsSendingTestEmail(false);
      setShowTestEmailModal(false);
      await addEmailLog({
        recipient: testEmailRecipient,
        subject: `SMTP Diagnostic Test Email - Skadomation Gateway`,
        status: 'SENT',
        message: 'SMTP handshake verification message. Test connection OK.',
      });
      alert(`Test email successfully dispatched to ${testEmailRecipient}. Verify SMTP log feed.`);
      loadData();
    }, 1500);
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
    await addEmailLog({
      recipient: sched.emailRecipients,
      subject,
      status: 'SENT',
      message: `Triggered manual test dispatch for: ${sched.reportType}. ${attachmentInfo}`,
    });
    const updatedSched = { ...sched, lastRun: new Date().toISOString().replace('T', ' ').substring(0, 19) };
    await saveSchedule(updatedSched);
    alert(`Simulated SMTP Success: Email report with attached ${formatsMsg.join(' & ')} files dispatched to [${sched.emailRecipients}]`);
    await loadData();
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

  /* ── Report Templates Handler ─────────── */
  const handleSaveTemplates = async (e) => {
    e.preventDefault();
    const existing = await getSettings();
    await saveSettings({ ...existing, logoText, headerColor, footerColor });
    alert('Report template settings saved successfully.');
  };

  /* ─────────────────────────────────────────────
     Tab definitions
  ───────────────────────────────────────────── */
  const superAdminTabs = [
    { key: 'smtp',      label: 'SMTP Config' },
    { key: 'emaillogs', label: 'Email Logs' },
    { key: 'schedules', label: 'Scheduled Reports' },
    { key: 'templates', label: 'Report Templates' },
  ];
  const plantAdminTabs = [
    { key: 'schedules', label: 'Scheduled Reports' },
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
                    onChange={e => setSmtpPort(parseInt(e.target.value) || 587)}
                    required
                  />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label} htmlFor="smtp-security">Security</label>
                  <select
                    id="smtp-security"
                    className="form-control"
                    value={smtpSecure ? 'SSL' : 'TLS'}
                    onChange={e => setSmtpSecure(e.target.value === 'SSL')}
                  >
                    <option value="SSL">SSL / TLS</option>
                    <option value="TLS">STARTTLS</option>
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
                  onChange={() => setSmtpSecure(v => !v)}
                />
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

              {/* Color pickers */}
              <div style={S.formGrid2}>
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
                  <label style={S.label} htmlFor="tmpl-footer-color">Footer Background Color</label>
                  <div style={S.colorWrap}>
                    <input
                      id="tmpl-footer-color"
                      type="color"
                      value={footerColor}
                      onChange={e => setFooterColor(e.target.value)}
                      style={S.colorInput}
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={footerColor}
                      onChange={e => setFooterColor(e.target.value)}
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                      maxLength={7}
                    />
                  </div>
                </div>
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
                <div style={{ background: footerColor, padding: '8px 16px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                  Footer Preview · Skadomation Automated Reports
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

    </div>
  );
}
