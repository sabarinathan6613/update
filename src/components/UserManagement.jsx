// src/components/UserManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { getUsers, saveUser, deleteUser, getPlants } from '../utils/db';
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
  const { currentPlantId, syncTrigger } = useSimulator();
  const [activeTab, setActiveTab]       = useState('directory');
  const [usersList, setUsersList]       = useState([]);
  const [plantsList, setPlantsList]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

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

  const isSuperAdmin = user?.role === 'Super Admin';

  /* ─── Load ───────────────────────────────────────────────────────── */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const [plist, allUsers] = await Promise.all([getPlants(), getUsers()]);
      setPlantsList(plist || []);
      const visible = isSuperAdmin
        ? allUsers
        : allUsers.filter(u => u.plantId === user.plantId && u.role !== 'Super Admin');
      setUsersList(visible);
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
  }, [isSuperAdmin, user?.plantId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, currentPlantId, syncTrigger]);

  /* ─── Open add/edit modal ────────────────────────────────────────── */
  const openAdd = () => {
    setEditUserObj({
      id: '', email: '', name: '', password: '',
      role: 'Operator',
      plantId: isSuperAdmin ? (currentPlantId || '') : (user?.plantId || ''),
      active: true
    });
    setSaveError('');
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (target) => {
    setEditUserObj({ ...target, password: target.password || '' });
    setSaveError('');
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
      await saveUser(editUserObj);
      addAudit(`${editUserObj.id ? 'Updated' : 'Created'} account for ${editUserObj.email}`);
      setShowModal(false);
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
  const inactiveCount = usersList.length - activeCount;
  const adminCount    = usersList.filter(u => ['Super Admin','Plant Admin'].includes(u.role)).length;

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
                  {isSuperAdmin ? 'Full visibility — all plants and roles.' : `Plant-scoped view — ${plantsList.find(p => p.id === user?.plantId)?.name || 'your plant'}.`}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PlusIcon /> Add User
              </button>
            </div>

            {/* Table */}
            <div className="table-responsive" style={{ maxHeight: 'none', border: 'none', borderRadius: 0 }}>
              <table className="table">
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
                        <td style={{ color: 'var(--text)', fontWeight: 600 }}>
                          {item.name}
                          {isMe && <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>YOU</span>}
                        </td>
                        <td className="font-mono" style={{ fontSize: '0.82rem' }}>{item.email}</td>
                        <td><RoleBadge role={item.role} /></td>
                        <td style={{ fontSize: '0.85rem' }}>{plantName}</td>
                        <td>
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
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: '20px' }}>
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
          <div className="grid-3" style={{ gap: '16px' }}>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Active Users</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)', lineHeight: 1 }}>{activeCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Suspended</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: inactiveCount > 0 ? 'var(--error)' : 'var(--text-muted)', lineHeight: 1 }}>{inactiveCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Session Actions</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{auditLogs.length}</div>
            </div>
          </div>

          {/* Audit table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)', fontWeight: 700, fontSize: '0.875rem' }}>
              🛡️ Session Audit Trail
            </div>
            <div className="table-responsive" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Performed By</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty-state">
                          <div className="empty-state-icon"><ShieldIcon /></div>
                          <h4>No actions recorded</h4>
                          <p>Actions taken in this session will appear here.</p>
                        </div>
                      </td>
                    </tr>
                  ) : auditLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.ts}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>{log.by}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{log.action}</td>
                    </tr>
                  ))}
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
                  <label className="form-label">Password *</label>
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
