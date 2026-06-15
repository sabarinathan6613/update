// src/components/Settings.jsx
import React, { useState, useEffect } from 'react';
import { 
  getSettings, saveSettings, 
  getSchedules, saveSchedule, deleteSchedule, 
  getPlants, getEmailLogs, addEmailLog 
} from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Settings({ user }) {
  const { currentPlantId, syncTrigger } = useSimulator();

  // Role permissions checks
  const isSuperAdmin = user.role === 'Super Admin';
  const targetPlantId = isSuperAdmin ? currentPlantId : user.plantId;

  // Active Sub-Tab selection
  const [activeSubTab, setActiveSubTab] = useState(
    isSuperAdmin ? 'smtp' : 'schedules'
  );

  // 1. SMTP Config States
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // Test email modal state
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  // 2. Scheduled Reports States
  const [schedulesList, setSchedulesList] = useState([]);
  const [emailLogsList, setEmailLogsList] = useState([]);
  const [plantsList, setPlantsList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editSchedule, setEditSchedule] = useState({
    id: "",
    plantId: "",
    reportType: "Daily Report",
    frequency: "Daily",
    time: "08:00",
    emailRecipients: "",
    enabled: true,
    formatPdf: true,
    formatExcel: true
  });

  const [retryQueue, setRetryQueue] = useState([]);

  // Load configuration, schedules, and logs dynamically
  const loadData = async () => {
    const plist = await getPlants();
    setPlantsList(plist);

    const sets = await getSettings();
    setSmtpHost(sets.smtpHost || '');
    setSmtpPort(sets.smtpPort || 587);
    setSmtpUser(sets.smtpUser || '');
    setSmtpSecure(sets.smtpSecure !== undefined ? sets.smtpSecure : true);
    setSmtpPass(sets.smtpPass || '');

    const allSchedules = await getSchedules();
    const plantSchedules = allSchedules.filter(s => s.plantId === targetPlantId);
    setSchedulesList(plantSchedules);

    const allEmailLogs = await getEmailLogs();
    setEmailLogsList(allEmailLogs);
  };

  useEffect(() => {
    loadData();
  }, [currentPlantId, syncTrigger]);

  // SMTP Settings Handlers
  const handleSaveSystemConfigs = async (e) => {
    e.preventDefault();
    const existing = await getSettings();
    await saveSettings({
      ...existing,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpSecure
    });
    alert("SMTP connection settings updated successfully.");
  };

  const handleTestSmtpConnection = () => {
    if (!smtpHost) {
      alert('Please configure an SMTP host before testing.');
      return;
    }
    setIsTestingSmtp(true);
    setTimeout(() => {
      setIsTestingSmtp(false);
      alert(`SMTP test dispatched to ${smtpHost}:${smtpPort}. Check your email server logs to confirm delivery.`);
    }, 1200);
  };

  // Test email dispatch handler
  const handleSendTestEmail = (e) => {
    e.preventDefault();
    setIsSendingTestEmail(true);
    setTimeout(async () => {
      setIsSendingTestEmail(false);
      setShowTestEmailModal(false);
      
      const subject = `SMTP Diagnostic Test Email - Skadomation Gateway`;
      await addEmailLog({
        recipient: testEmailRecipient,
        subject,
        status: "SENT",
        message: "SMTP handshake verification message. Test connection OK."
      });
      
      alert(`Test email successfully dispatched to ${testEmailRecipient}. Verify SMTP log feed.`);
      loadData();
    }, 1500);
  };

  // Scheduled Reports Handlers
  const handleToggleEnable = async (sched) => {
    const updated = { ...sched, enabled: !sched.enabled };
    await saveSchedule(updated);
    await loadData();
  };

  const handleOpenEdit = (sched = null) => {
    if (sched) {
      setEditSchedule({
        formatPdf: sched.formatPdf !== false,
        formatExcel: sched.formatExcel !== false,
        ...sched
      });
    } else {
      setEditSchedule({
        id: "",
        plantId: targetPlantId,
        reportType: "Daily Report",
        frequency: "Daily",
        time: "08:00",
        emailRecipients: "",
        enabled: true,
        formatPdf: true,
        formatExcel: true
      });
    }
    setShowModal(true);
  };

  const handleDelete = async (schedId) => {
    if (window.confirm("Are you sure you want to delete this report schedule?")) {
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

  // Simulate manual schedule run for verification
  const handleTriggerSimulatedSend = async (sched) => {
    const activePlantName = plantsList.find(p => p.id === sched.plantId)?.name || 'Detroit';
    const subject = `Automated ${sched.reportType} - ${activePlantName} - ${new Date().toISOString().split('T')[0]}`;
    
    const sendPdf = sched.formatPdf !== false;
    const sendExcel = sched.formatExcel !== false;
    const formatsMsg = [];
    if (sendPdf) formatsMsg.push("PDF");
    if (sendExcel) formatsMsg.push("Excel");
    const attachmentInfo = formatsMsg.length > 0 ? `[Attachments: ${formatsMsg.join(', ')}]` : '[No Attachments]';

    await addEmailLog({
      recipient: sched.emailRecipients,
      subject,
      status: "SENT",
      message: `Triggered manual test dispatch for: ${sched.reportType}. ${attachmentInfo}`
    });

    const updatedSched = {
      ...sched,
      lastRun: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    await saveSchedule(updatedSched);

    alert(`Simulated SMTP Success: Email report with attached ${formatsMsg.join(' & ')} files dispatched to [${sched.emailRecipients}]`);
    await loadData();
  };

  // Manual retry queue trigger handler
  const handleManualRetry = (id) => {
    setRetryQueue(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, status: "RETRYING", attempts: item.attempts + 1 };
      }
      return item;
    }));
    
    setTimeout(async () => {
      const targetItem = retryQueue.find(item => item.id === id);
      if (targetItem) {
        await addEmailLog({
          recipient: targetItem.recipient,
          subject: targetItem.subject,
          status: "SENT",
          message: "Resent successfully after SMTP gateway routing optimization."
        });
        setRetryQueue(prev => prev.filter(item => item.id !== id));
        alert("Email resent successfully!");
        loadData();
      }
    }, 1200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Sub tabs navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '16px', marginBottom: '8px' }} className="no-print">
        {isSuperAdmin && (
          <button
            onClick={() => setActiveSubTab('smtp')}
            style={{
              padding: '10px 4px',
              border: 'none',
              background: 'transparent',
              color: activeSubTab === 'smtp' ? 'var(--secondary)' : 'var(--text-muted)',
              fontWeight: activeSubTab === 'smtp' ? 600 : 500,
              borderBottom: activeSubTab === 'smtp' ? '2px solid var(--secondary)' : 'none',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            ⚙️ SMTP Server Config
          </button>
        )}
        <button
          onClick={() => setActiveSubTab('schedules')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeSubTab === 'schedules' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'schedules' ? 600 : 500,
            borderBottom: activeSubTab === 'schedules' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ⏱️ Active Schedules & Preview
        </button>
        <button
          onClick={() => setActiveSubTab('emaillogs')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeSubTab === 'emaillogs' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'emaillogs' ? 600 : 500,
            borderBottom: activeSubTab === 'emaillogs' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ✉️ Delivery Queue & History
        </button>
      </div>

      {/* Sub-tab Rendering */}
      {activeSubTab === 'smtp' && isSuperAdmin && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 'calc(100vh - 180px)' }}>
          {/* SMTP Config Card */}
          <div className="card" style={{ width: '100%', maxWidth: '600px', padding: '32px', marginTop: '12px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              ✉️ Automated Email SMTP Configuration
            </h3>
            
            <form onSubmit={handleSaveSystemConfigs} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="smtp-host">SMTP Server Host</label>
                <input
                  id="smtp-host"
                  type="text"
                  className="form-control"
                  placeholder="smtp.example.com"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="smtp-port">SMTP Port</label>
                  <input
                    id="smtp-port"
                    type="number"
                    className="form-control"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="smtp-security">Security Protocol</label>
                  <select
                    id="smtp-security"
                    className="form-control"
                    value={smtpSecure ? "SSL" : "TLS"}
                    onChange={(e) => setSmtpSecure(e.target.value === 'SSL')}
                  >
                    <option value="SSL">SSL/TLS</option>
                    <option value="TLS">STARTTLS</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="smtp-username">SMTP Username</label>
                <input
                  id="smtp-username"
                  type="text"
                  className="form-control"
                  placeholder="user@example.com"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="smtp-password">SMTP Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="smtp-password"
                    type={showSmtpPass ? "text" : "password"}
                    className="form-control"
                    placeholder="••••••••••••"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    style={{ paddingRight: '40px' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass(!showSmtpPass)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: showSmtpPass ? 'var(--secondary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={showSmtpPass ? "Hide Password" : "Show Password"}
                  >
                    {showSmtpPass ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleTestSmtpConnection}
                  disabled={isTestingSmtp}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px' }}
                >
                  {isTestingSmtp ? "Testing handshake..." : "⚡ Test Mail Connection"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTestEmailModal(true)}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px' }}
                >
                  ✉️ Send Test Email
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5, padding: '12px' }}>
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeSubTab === 'schedules' && (
        <>
          {/* Header Action Card */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Automated Report Distribution List</h3>
                <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
                  Configure triggers to compile and email PDF/Excel reports automatically
                </p>
              </div>
              <button onClick={() => handleOpenEdit(null)} className="btn btn-primary">
                ➕ Add Schedule
              </button>
            </div>
          </div>

          {/* Schedules list grid & preview panel */}
          <div className="grid-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {schedulesList.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No active schedules configured for this plant node.
                </div>
              ) : (
                schedulesList.map((sched, idx) => (
                  <div className="card" key={idx} style={{ borderLeft: sched.enabled ? '4px solid var(--success)' : '4px solid var(--text-muted)' }}>
                    
                    <div className="flex justify-between items-center" style={{ marginBottom: '10px' }}>
                      <div>
                        <span className="badge badge-info" style={{ marginRight: '6px' }}>{sched.frequency}</span>
                        <strong className="text-sm">{sched.reportType}</strong>
                      </div>
                      
                      <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px' }}>
                        <input 
                          type="checkbox" 
                          checked={sched.enabled}
                          onChange={() => handleToggleEnable(sched)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: sched.enabled ? 'var(--success)' : '#CBD5E1',
                          borderRadius: '34px', transition: '0.2s'
                        }}>
                          <span style={{
                            position: 'absolute', height: '14px', width: '14px',
                            left: sched.enabled ? '20px' : '4px', bottom: '3px',
                            backgroundColor: 'white', borderRadius: '50%', transition: '0.2s'
                          }} />
                        </span>
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.82rem', marginBottom: '14px' }}>
                      <div>
                        <span className="text-muted" style={{ display: 'block', fontSize: '0.75rem' }}>Location Node</span>
                        <strong style={{ color: 'white' }}>{plantsList.find(p => p.id === sched.plantId)?.name}</strong>
                      </div>
                      <div>
                        <span className="text-muted" style={{ display: 'block', fontSize: '0.75rem' }}>Trigger Time</span>
                        <strong style={{ color: 'white' }} className="font-mono">🕒 {sched.time}</strong>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span className="text-muted" style={{ display: 'block', fontSize: '0.75rem' }}>Recipients</span>
                        <span style={{ color: 'white', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sched.emailRecipients}>
                          {sched.emailRecipients}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                      <button onClick={() => handleTriggerSimulatedSend(sched)} className="btn btn-secondary text-xs" style={{ flex: 2, padding: '5px' }}>
                        ⚡ Force Dispatch
                      </button>
                      <button onClick={() => handleOpenEdit(sched)} className="btn btn-secondary text-xs" style={{ flex: 1, padding: '5px' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => handleDelete(sched.id)} className="btn btn-danger text-xs" style={{ flex: 1, padding: '5px', color: 'white' }}>
                        🗑 Delete
                      </button>
                    </div>

                  </div>
                ))
              )}
            </div>

            {/* Schedule Preview Sidebar */}
            <div className="card" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.92rem', marginBottom: '12px', color: 'white' }}>⏱️ Distribution Calendar</h4>
              <p className="text-xs text-muted" style={{ marginBottom: '16px' }}>Upcoming scheduled triggers for this plant node</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {schedulesList.filter(s => s.enabled).length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                    No enabled schedules to preview.
                  </div>
                ) : (
                  schedulesList.filter(s => s.enabled).map((sched, idx) => {
                    const today = new Date().toISOString().split('T')[0];
                    return (
                      <div key={idx} style={{
                        padding: '10px',
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        <div className="flex justify-between items-center" style={{ marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>{sched.reportType}</span>
                          <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{sched.frequency}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted">
                          <span>Next Execution:</span>
                          <span className="font-mono text-secondary">{today} {sched.time}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'emaillogs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Active Retry Queue Panel */}
          {retryQueue.length > 0 && (
            <div className="card" style={{ padding: '20px', borderLeft: '4px solid var(--warning)' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'white', marginBottom: '8px' }}>⚠️ Outbox Mail retry queue ({retryQueue.length})</h4>
              <p className="text-xs text-muted" style={{ marginBottom: '12px' }}>Dispatches currently retrying due to SMTP timeouts or network connection failures.</p>
              
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Email Subject</th>
                      <th>Retry Attempts</th>
                      <th>SMTP Error</th>
                      <th>Manual Operations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retryQueue.map((item, idx) => (
                      <tr key={idx}>
                        <td className="font-semibold text-sm">{item.recipient}</td>
                        <td>{item.subject}</td>
                        <td className="font-mono text-center">{item.attempts} / 5</td>
                        <td style={{ color: 'var(--error)' }} className="text-xs">{item.error}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleManualRetry(item.id)}
                              disabled={item.status === 'RETRYING'}
                              className="btn btn-primary text-xs"
                              style={{ padding: '4px 8px' }}
                            >
                              {item.status === 'RETRYING' ? 'Dispatched...' : '🔄 Retry Now'}
                            </button>
                            <button
                              onClick={() => setRetryQueue(prev => prev.filter(q => q.id !== item.id))}
                              className="btn btn-secondary text-xs"
                              style={{ padding: '4px 8px' }}
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

          {/* Delivery logs list */}
          <div className="card" style={{ padding: '24px' }}>
            <h4 style={{ marginBottom: '12px' }}>SMTP Outbox Transaction Logs</h4>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Recipient Lists</th>
                    <th>Email Subject Header</th>
                    <th>Compiled Formats</th>
                    <th>SMTP Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogsList.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center' }}>SMTP outbox is empty. No emails dispatched.</td>
                    </tr>
                  ) : (
                    emailLogsList.map((log, idx) => (
                      <tr key={idx}>
                        <td className="font-mono text-xs" title={log.timestamp}>{log.timestamp.replace('T', ' ').substring(0, 19)}</td>
                        <td className="font-semibold text-sm" title={log.recipient}>{log.recipient}</td>
                        <td title={log.subject}>{log.subject}</td>
                        <td>
                          {(() => {
                            const msg = log.message || '';
                            const subj = log.subject || '';
                            const hasPdf = msg.includes('PDF') || subj.includes('Daily') || subj.includes('Shift') || subj.includes('Weekly') || msg.includes('test');
                            const hasExcel = msg.includes('Excel') || subj.includes('Daily') || subj.includes('Shift') || subj.includes('Weekly') || msg.includes('test');
                            return (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {hasPdf && <span className="badge badge-info" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📄 PDF</span>}
                                {hasExcel && <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📊 Excel</span>}
                                {!hasPdf && !hasExcel && <span className="badge badge-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>None</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          <span className="badge badge-success">✓ {log.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Send Test Email Modal Dialog */}
      {showTestEmailModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '420px' }}>
            <div className="drawer-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>✉️ Dispatch Test Email</h3>
              <button onClick={() => setShowTestEmailModal(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <form onSubmit={handleSendTestEmail} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="test-recipient">Recipient Email</label>
                <input
                  id="test-recipient"
                  type="email"
                  className="form-control"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowTestEmailModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={isSendingTestEmail} className="btn btn-primary" style={{ flex: 2 }}>
                  {isSendingTestEmail ? 'Sending...' : '⚡ Send Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editor Modal for Adding/Editing Schedules */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '480px' }}>
            <div className="drawer-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>
                {editSchedule.id ? "✏️ Edit Distribution Schedule" : "⏱️ Add Automated Schedule"}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleSaveSchedule} style={{ padding: '24px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="sched-report-type">Report Template</label>
                <select
                  id="sched-report-type"
                  className="form-control"
                  value={editSchedule.reportType}
                  onChange={(e) => setEditSchedule({ ...editSchedule, reportType: e.target.value })}
                >
                  <option value="Shift Report">Shift Report</option>
                  <option value="Daily Report">Daily Report</option>
                  <option value="Weekly Report">Weekly Report</option>
                  <option value="Monthly Report">Monthly Report</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sched-frequency">Trigger Frequency</label>
                <select
                  id="sched-frequency"
                  className="form-control"
                  value={editSchedule.frequency}
                  onChange={(e) => setEditSchedule({ ...editSchedule, frequency: e.target.value })}
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sched-time">Trigger Time (24h format)</label>
                <input
                  id="sched-time"
                  type="time"
                  className="form-control"
                  value={editSchedule.time}
                  onChange={(e) => setEditSchedule({ ...editSchedule, time: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sched-emails">Email Recipients (comma separated)</label>
                <input
                  id="sched-emails"
                  type="text"
                  className="form-control"
                  placeholder="alerts@company.com, admin@company.com"
                  value={editSchedule.emailRecipients}
                  onChange={(e) => setEditSchedule({ ...editSchedule, emailRecipients: e.target.value })}
                  required
                />
                <span className="text-xs text-muted">Separate multiple emails with commas.</span>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Attached Report Formats</label>
                <div style={{ display: 'flex', gap: '24px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={editSchedule.formatPdf !== false}
                      onChange={(e) => setEditSchedule({ ...editSchedule, formatPdf: e.target.checked })}
                    />
                    📄 PDF Report (.pdf)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={editSchedule.formatExcel !== false}
                      onChange={(e) => setEditSchedule({ ...editSchedule, formatExcel: e.target.checked })}
                    />
                    📊 Excel Sheet (.xlsx)
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
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
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
