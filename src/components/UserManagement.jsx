// src/components/UserManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { getUsers, saveUser, deleteUser, getPlants, getAuditLogs, deleteAuditLogs, addAuditLog } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

/* ─── Icons ─────────────────────────────────────────────────────────── */
const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
    <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

/* ─── Role badge helper ──────────────────────────────────────────────── */
function RoleBadge({ role }) {
  const map = {
    'Super Admin': { cls: 'badge-error',   icon: '🔴' },
    'Plant Admin': { cls: 'badge-warning', icon: '🟡' },
    'Operator':    { cls: 'badge-info',    icon: '🔵' },
    'Viewer':      { cls: 'badge-neutral', icon: '⚪' },
  };
  const { cls, icon } = map[role] || map['Viewer'];
  return <span className={`badge ${cls}`}>{icon} {role}</span>;
}

/* ─── Confirm Dialog ─────────────────────────────────────────────────── */
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-container" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 style={{ color: 'var(--error)', margin: 0, fontSize: '1rem' }}>⚠ Confirm Action</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer" style={{ gap: '10px' }}>
          <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} style={{ flex: 1 }}>Yes, Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function UserManagement({ user }) {
  const { currentPlantId } = useSimulator();
  const [activeTab, setActiveTab]       = useState('directory');
  const [usersList, setUsersList]       = useState([]);
  const [plantsList, setPlantsList]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /* ─── Modal state ────────────────────────────────────────────────── */
  const [showModal, setShowModal]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editUserObj, setEditUserObj]   = useState({
    id: '', email: '', name: '', password: '', role: 'Operator', plantId: '', active: true
  });

  /* ─── Delete confirm state ───────────────────────────────────────── */
  const [confirmTarget, setConfirmTarget] = useState(null); // { id, email }

  /* ─── Audit log (session-only) ───────────────────────────────────── */
  const [auditLogs, setAuditLogs] = useState([]);
  const [dbError, setDbError] = useState(null);

  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditPlantFilter, setAuditPlantFilter] = useState('all');

  const isSuperAdmin = user?.role === 'Super Admin';
  const isReadOnly = user?.role === 'Admin';

  /* ─── Load ───────────────────────────────────────────────────────── */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const [plist, allUsers, allLogs] = await Promise.all([getPlants(), getUsers(), getAuditLogs()]);
      setPlantsList(plist || []);
      const visible = (isSuperAdmin || isReadOnly)
        ? allUsers
        : allUsers.filter(u => u.plantId === user.plantId && u.role !== 'Super Admin');
      setUsersList(visible);

      const visibleLogs = (isSuperAdmin || isReadOnly)
        ? allLogs
        : allLogs.filter(log => log.plantId === user.plantId && log.role !== 'Super Admin');
      setAuditLogs(visibleLogs);
    } catch (err) {
      console.error('loadUsers error:', err);
      if (err.message && err.message.toLowerCase().includes('relation') && err.message.toLowerCase().includes('does not exist')) {
        setDbError('The database table "profiles" or "plants" is missing from the Supabase project. Please run the database migration script.');
      } else {
        setDbError('Failed to load user management details: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, isReadOnly, user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  /* ─── Open add/edit modal ────────────────────────────────────────── */
  const openAdd = () => {
    setEditUserObj({
      id: '', email: '', name: '', password: '',
      role: 'Operator',
      plantId: isSuperAdmin ? (currentPlantId || '') : (user?.plantId || ''),
      active: true
    });
    setSaveError('');
    setSuccessMessage('');
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (target) => {
    setEditUserObj({ ...target, password: target.password || '' });
    setSaveError('');
    setSuccessMessage('');
    setShowPassword(false);
    setShowModal(true);
  };

  /* ─── Save ───────────────────────────────────────────────────────── */
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');

    if (!editUserObj.name.trim()) { setSaveError('Name is required.'); return; }
    if (!editUserObj.email.trim()) { setSaveError('Email is required.'); return; }
    if (!editUserObj.password || editUserObj.password.length < 4) {
      setSaveError('Password must be at least 4 characters.'); return;
    }

    // Security validation for non-super-admins
    if (!isSuperAdmin) {
      if (editUserObj.role !== 'Operator') {
        setSaveError('Plant Admins can only create Operator accounts.'); return;
      }
      const existing = usersList.find(u => u.id === editUserObj.id);
      if (existing?.role === 'Super Admin') {
        setSaveError('You cannot modify a Super Admin profile.'); return;
      }
    }

    setSaving(true);
    try {
      const isNew = !editUserObj.id;
      await saveUser(editUserObj);
      addAudit(`${isNew ? 'Created' : 'Updated'} account for ${editUserObj.email}`);
      setShowModal(false);
      if (isNew) {
        setSuccessMessage(`User account created successfully. Email: ${editUserObj.email} | Password: ${editUserObj.password}`);
      } else {
        setSuccessMessage(`User account updated successfully.`);
      }
      await loadUsers();
    } catch (err) {
      setSaveError(err.message || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Toggle active ──────────────────────────────────────────────── */
  const handleToggleStatus = async (target) => {
    if (target.email === user?.email) {
      alert('You cannot deactivate your own account.');
      return;
    }
    if (target.role === 'Super Admin' && !isSuperAdmin) {
      alert('You are not authorized to modify a Super Admin.'); return;
    }
    const updated = { ...target, active: !target.active };
    await saveUser(updated);
    addAudit(`${updated.active ? 'Activated' : 'Suspended'} account: ${target.email}`);
    await loadUsers();
  };

  /* ─── Delete flow — two step ─────────────────────────────────────── */
  const handleDeleteRequest = (target) => {
    if (target.email === user?.email) {
      alert('You cannot delete your own account.'); return;
    }
    if (target.role === 'Super Admin' && !isSuperAdmin) {
      alert('You are not authorized to delete a Super Admin.'); return;
    }
    setConfirmTarget({ id: target.id, email: target.email });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmTarget) return;
    try {
      await deleteUser(confirmTarget.id);
      addAudit(`Deleted account: ${confirmTarget.email}`);
      setConfirmTarget(null);
      await loadUsers();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      setConfirmTarget(null);
    }
  };

  /* ─── Audit helper ───────────────────────────────────────────────── */
  const addAudit = (action) => {
    setAuditLogs(prev => [{
      ts: new Date().toISOString().replace('T', ' ').substring(0, 19),
      by: user?.email || 'system',
      action
    }, ...prev.slice(0, 49)]);
  };

  /* ─── Stats ──────────────────────────────────────────────────────── */
  const activeCount   = usersList.filter(u => u.active).length;
  const adminCount    = usersList.filter(u => ['Super Admin','Plant Admin'].includes(u.role)).length;

  // Audit trail statistics
  const totalActions = auditLogs.length;
  const loginHistoryCount = auditLogs.filter(l => l.action === 'Login' || l.action === 'Logout').length;
  const failedLoginsCount = auditLogs.filter(l => l.action === 'Failed Login Attempt').length;
  const userMgmtCount = auditLogs.filter(l => ['User Creation', 'User Modification', 'User Deletion'].includes(l.action)).length;

  // Filter audit logs
  const filteredLogs = auditLogs.filter(log => {
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      const matchBy = (log.by || '').toLowerCase().includes(q);
      const matchAction = (log.action || '').toLowerCase().includes(q);
      const matchDetails = (log.details || '').toLowerCase().includes(q);
      if (!matchBy && !matchAction && !matchDetails) return false;
    }
    
    if (auditActionFilter !== 'all') {
      if (auditActionFilter === 'login' && log.action !== 'Login' && log.action !== 'Logout') return false;
      if (auditActionFilter === 'failed_login' && log.action !== 'Failed Login Attempt') return false;
      if (auditActionFilter === 'user_mgmt' && !['User Creation', 'User Modification', 'User Deletion'].includes(log.action)) return false;
      if (auditActionFilter === 'configs' && !['Tag Configuration Update', 'Email & System Configuration Update', 'Plant Configuration Update'].includes(log.action)) return false;
      if (auditActionFilter === 'reports' && !['Report Generation', 'Report Deletion', 'Report Send', 'Scheduled Report Dispatch'].includes(log.action)) return false;
      if (auditActionFilter === 'sync' && log.action !== 'Cloud Synchronization') return false;
    }
    
    if (isSuperAdmin && auditPlantFilter !== 'all') {
      if (log.plantId !== auditPlantFilter) return false;
    }
    
    return true;
  });

  const handleExportAuditLogs = () => {
    try {
      const headers = ['Timestamp', 'Performed By', 'Role', 'Plant ID', 'Action', 'Details'];
      const rows = filteredLogs.map(log => [
        log.ts,
        log.by,
        log.role,
        log.plantId || 'System',
        log.action,
        log.details
      ]);
      
      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `skadomation_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to export logs: ' + err.message);
    }
  };

  const handleDeleteAuditLogs = async () => {
    if (!window.confirm('WARNING: Are you sure you want to permanently delete ALL audit logs from the database? This action cannot be undone.')) return;
    try {
      await deleteAuditLogs();
      await addAuditLog(null, null, null, 'Audit Log Deletion', 'Cleared all audit log records from database.');
      await loadUsers();
    } catch (err) {
      alert('Failed to delete logs: ' + err.message);
    }
  };

  /* ═══════════════════════════════════ RENDER ════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {dbError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.22)',
          borderRadius: '8px',
          padding: '12px 16px',
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

      {/* ── Tab bar ── */}
      <div className="sub-tabs">
        <button className={`sub-tab ${activeTab === 'directory' ? 'active' : ''}`} onClick={() => setActiveTab('directory')}>
          <UsersIcon /> Operator Directory
          <span className="sub-tab-count">{usersList.length}</span>
        </button>
        <button className={`sub-tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
          <ShieldIcon /> Audit Trail
          {auditLogs.length > 0 && <span className="sub-tab-count">{auditLogs.length}</span>}
        </button>
      </div>

      {/* ══════════════════════ DIRECTORY TAB ══════════════════════════ */}
      {activeTab === 'directory' && (
        <>
          {successMessage && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '8px',
              color: '#A7F3D0',
              fontSize: '0.86rem',
              fontWeight: 500,
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#A7F3D0',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Stat strip */}
          <div className="grid-3" style={{ gap: '16px' }}>
            {[
              { label: 'Total Accounts', value: usersList.length, color: 'var(--accent)' },
              { label: 'Active Users',   value: activeCount,       color: 'var(--success)' },
              { label: 'Administrators', value: adminCount,         color: 'var(--warning)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{s.label}</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Table card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'var(--surface-raised)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>Account Directory</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {(isSuperAdmin || isReadOnly) ? 'Full visibility — all plants and roles.' : `Plant-scoped view — ${plantsList.find(p => p.id === user?.plantId)?.name || 'your plant'}.`}
                </div>
              </div>
              {!isReadOnly && (
                <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PlusIcon /> Add User
                </button>
              )}
            </div>

            {/* Table */}
            <div className="table-responsive" style={{ maxHeight: 'none', border: 'none', borderRadius: 0 }}>
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Plant</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        Loading accounts…
                      </td>
                    </tr>
                  )}
                  {!loading && usersList.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <div className="empty-state-icon"><UsersIcon /></div>
                          <h4>No user accounts found</h4>
                          <p>Click "Add User" to create the first account.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loading && usersList.map((item) => {
                    const isMe = item.email === user?.email;
                    const plantName = item.plantId === 'all'
                      ? 'All Plants'
                      : (plantsList.find(p => p.id === item.plantId)?.name || item.plantId || '—');
                    return (
                      <tr key={item.id} style={{ opacity: item.active ? 1 : 0.55 }}>
                        <td data-label="Name" style={{ color: 'var(--text)', fontWeight: 600 }}>
                          {item.name}
                          {isMe && <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>YOU</span>}
                        </td>
                        <td data-label="Email" className="font-mono" style={{ fontSize: '0.82rem' }}>{item.email}</td>
                        <td data-label="Role"><RoleBadge role={item.role} /></td>
                        <td data-label="Plant" style={{ fontSize: '0.85rem' }}>{plantName}</td>
                        <td data-label="Status">
                          {isReadOnly ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              padding: '4px 10px', borderRadius: '6px',
                              fontSize: '0.75rem', fontWeight: 700,
                              background: item.active ? 'var(--success-bg)' : 'var(--error-bg)',
                              color: item.active ? 'var(--success)' : 'var(--error)'
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                              {item.active ? 'Active' : 'Suspended'}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(item)}
                              disabled={isMe}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '4px 10px', borderRadius: '6px', border: 'none',
                                fontSize: '0.75rem', fontWeight: 700, cursor: isMe ? 'not-allowed' : 'pointer',
                                background: item.active ? 'var(--success-bg)' : 'var(--error-bg)',
                                color: item.active ? 'var(--success)' : 'var(--error)',
                                opacity: isMe ? 0.5 : 1,
                                transition: 'opacity 0.15s'
                              }}
                              title={isMe ? 'Cannot change your own status' : `Click to ${item.active ? 'suspend' : 'activate'}`}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                              {item.active ? 'Active' : 'Suspended'}
                            </button>
                          )}
                        </td>
                        <td data-label="Actions" style={{ textAlign: 'right', paddingRight: '20px' }}>
                          {isReadOnly ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>View Only</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEdit(item)}
                                title="Edit user"
                                style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                              >
                                <EditIcon /> Edit
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteRequest(item)}
                                disabled={isMe}
                                title={isMe ? 'Cannot delete your own account' : 'Delete user'}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', opacity: isMe ? 0.4 : 1 }}
                              >
                                <TrashIcon /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════ AUDIT TAB ══════════════════════════════ */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stat strip */}
          <div className="grid-4" style={{ gap: '16px' }}>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Total Actions</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{totalActions}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Login History</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)', lineHeight: 1 }}>{loginHistoryCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Failed Logins</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: failedLoginsCount > 0 ? 'var(--error)' : 'var(--text-muted)', lineHeight: 1 }}>{failedLoginsCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>User Management</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--warning)', lineHeight: 1 }}>{userMgmtCount}</div>
            </div>
          </div>

          {/* Audit Controls & Filters */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1, minWidth: '280px' }}>
                {/* Search */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search logs by user, action, details..."
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                  />
                </div>
                
                {/* Action Filter */}
                <div style={{ minWidth: '150px' }}>
                  <select
                    className="form-control"
                    value={auditActionFilter}
                    onChange={e => setAuditActionFilter(e.target.value)}
                  >
                    <option value="all">All Actions</option>
                    <option value="login">Logins & Logouts</option>
                    <option value="failed_login">Failed Logins</option>
                    <option value="user_mgmt">User Management</option>
                    <option value="configs">Configurations</option>
                    <option value="reports">Reports</option>
                    <option value="sync">Data Syncs</option>
                  </select>
                </div>

                {/* Plant Filter (Super Admin only) */}
                {isSuperAdmin && (
                  <div style={{ minWidth: '150px' }}>
                    <select
                      className="form-control"
                      value={auditPlantFilter}
                      onChange={e => setAuditPlantFilter(e.target.value)}
                    >
                      <option value="all">All Plants</option>
                      {plantsList.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Action Buttons for Super Admin */}
              {(isSuperAdmin || isReadOnly) && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleExportAuditLogs} className="btn btn-secondary" style={{ padding: '0 12px', height: '36px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    📥 Export CSV
                  </button>
                  {!isReadOnly && (
                    <button onClick={handleDeleteAuditLogs} className="btn btn-secondary" style={{ padding: '0 12px', height: '36px', fontSize: '0.8rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#EF4444', cursor: 'pointer' }}>
                      🗑️ Clear Audit Trail
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Audit table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)', fontWeight: 700, fontSize: '0.875rem' }}>
              🛡️ Database Audit Trail ({filteredLogs.length} matching)
            </div>
            <div className="table-responsive" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Plant</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <div className="empty-state-icon"><ShieldIcon /></div>
                          <h4>No actions recorded</h4>
                          <p>No audit trail logs match your query filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredLogs.map((log, idx) => {
                    const plantObj = plantsList.find(p => p.id === log.plantId);
                    const plantName = log.plantId === 'all' ? 'System-wide' : (plantObj ? plantObj.name : (log.plantId || 'System'));
                    return (
                      <tr key={log.id || idx}>
                        <td data-label="Timestamp" className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.ts}</td>
                        <td data-label="User" style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>{log.by}</td>
                        <td data-label="Role" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: log.role === 'Super Admin' ? 'rgba(14, 165, 233, 0.12)' : (log.role === 'Plant Admin' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)'),
                            color: log.role === 'Super Admin' ? '#0EA5E9' : (log.role === 'Plant Admin' ? '#F59E0B' : '#10B981'),
                            border: log.role === 'Super Admin' ? '1px solid rgba(14, 165, 233, 0.25)' : (log.role === 'Plant Admin' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)')
                          }}>
                            {log.role}
                          </span>
                        </td>
                        <td data-label="Plant" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{plantName}</td>
                        <td data-label="Action" style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600 }}>{log.action}</td>
                        <td data-label="Details" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{log.details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ ADD/EDIT MODAL ═════════════════════════ */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1rem' }}>
                {editUserObj.id ? '✏️ Edit Account' : '👥 Create User Account'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {saveError && (
                  <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--error)', fontSize: '0.85rem' }}>
                    ⚠ {saveError}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Employee full name"
                    value={editUserObj.name}
                    onChange={e => setEditUserObj({ ...editUserObj, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="name@company.com"
                    value={editUserObj.email}
                    onChange={e => setEditUserObj({ ...editUserObj, email: e.target.value })}
                    disabled={!!editUserObj.id}
                    style={{ opacity: editUserObj.id ? 0.6 : 1 }}
                  />
                  {editUserObj.id && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>Email cannot be changed after account creation.</div>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Password *</label>
                    {!editUserObj.id && (
                      <button
                        type="button"
                        onClick={() => {
                          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
                          let pass = '';
                          for (let i = 0; i < 10; i++) {
                            pass += chars.charAt(Math.floor(Math.random() * chars.length));
                          }
                          setEditUserObj({ ...editUserObj, password: pass });
                          setShowPassword(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent, #0EA5E9)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        ⚡ Generate Password
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control"
                      placeholder={editUserObj.id ? 'Enter new password (min 4 chars)' : 'Choose a password'}
                      value={editUserObj.password}
                      onChange={e => setEditUserObj({ ...editUserObj, password: e.target.value })}
                      style={{ paddingRight: '44px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: showPassword ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Role</label>
                    <select
                      className="form-control"
                      value={editUserObj.role}
                      onChange={e => {
                        const role = e.target.value;
                        setEditUserObj({ ...editUserObj, role, plantId: role === 'Super Admin' ? 'all' : (editUserObj.plantId || '') });
                      }}
                      disabled={!isSuperAdmin}
                    >
                      {isSuperAdmin && <option value="Super Admin">Super Admin</option>}
                      {isSuperAdmin && <option value="Admin">Admin (Read-Only)</option>}
                      <option value="Plant Admin">Plant Admin</option>
                      <option value="Operator">Operator</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Plant Assignment</label>
                    {editUserObj.role === 'Super Admin' ? (
                      <input className="form-control" value="All Plants" disabled style={{ opacity: 0.6 }} />
                    ) : (
                      <select
                        className="form-control"
                        value={editUserObj.plantId}
                        onChange={e => setEditUserObj({ ...editUserObj, plantId: e.target.value })}
                        disabled={!isSuperAdmin}
                      >
                        {plantsList.length === 0 && <option value="">No plants configured</option>}
                        {plantsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Active toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-raised)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>Account Active</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inactive users cannot log in</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={editUserObj.active}
                      onChange={e => setEditUserObj({ ...editUserObj, active: e.target.checked })}
                    />
                    <span className="toggle-track" />
                  </label>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1 }} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Saving…' : (editUserObj.id ? 'Update Account' : 'Create Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ DELETE CONFIRM ═════════════════════════ */}
      {confirmTarget && (
        <ConfirmDialog
          message={`Permanently delete the account for "${confirmTarget.email}"? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

    </div>
  );
}
