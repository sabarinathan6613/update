// src/components/UserManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { getUsers, saveUser, deleteUser, getAuditLogs, deleteAuditLogs, addAuditLog } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';
import { useRefresh } from '../utils/useRefresh';
import RefreshButton from './RefreshButton';

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

/* ─── Role badge helper ──────────────────────────────────────────────── */
function RoleBadge({ role }) {
  const map = {
    'Super Admin': { cls: 'badge-error',   icon: '🔴' },
    'Admin':       { cls: 'badge-warning', icon: '🟡' },
    'Operator':    { cls: 'badge-info',    icon: '🔵' },
  };
  const { cls, icon } = map[role] || { cls: 'badge-info', icon: '🔵' };
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
  const [usersList, setUsersList]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /* ─── Modal state ────────────────────────────────────────────────── */
  const [showModal, setShowModal]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editUserObj, setEditUserObj]   = useState({
    id: '', email: '', name: '', password: '', role: 'Operator', active: true
  });

  /* ─── Delete confirm state ───────────────────────────────────────── */
  const [confirmTarget, setConfirmTarget] = useState(null); // { id, email }
  const [dbError, setDbError] = useState(null);
  const isSuperAdmin = user?.role === 'Super Admin';
  const isAdmin = user?.role === 'Admin';

  const canModifyUser = (target) => {
    if (target.email === user?.email) return false; // Cannot modify self (deactivate/delete)
    if (isSuperAdmin) return true;
    if (isAdmin) {
      // Admin can modify Admin, Operator (but not Super Admin)
      return target.role !== 'Super Admin';
    }
    return false;
  };

  /* ─── Load ───────────────────────────────────────────────────────── */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const allUsers = await getUsers();
      
      let visible = [];
      if (isSuperAdmin) {
        visible = allUsers;
      } else if (isAdmin) {
        // Admin sees everyone EXCEPT Super Admin
        visible = allUsers.filter(u => u.role !== 'Super Admin');
      }
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
  }, [isSuperAdmin, isAdmin]);

  const { isRefreshing, refreshToast, handleRefresh } = useRefresh(loadUsers, 'UserManagement');

  useEffect(() => {
    loadUsers().catch(() => {});
  }, [loadUsers]);

  const openAdd = () => {
    let defaultRole = 'Operator';
    if (isAdmin) defaultRole = 'Operator';
    
    setEditUserObj({
      id: '', email: '', name: '', password: '',
      role: defaultRole,
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

    // Role-based validation checks on save
    if (!isSuperAdmin) {
      if (editUserObj.role === 'Super Admin') {
        setSaveError('You are not authorized to assign the Super Admin role.'); return;
      }
      
      if (isAdmin) {
        // Admin cannot modify a Super Admin
        const existing = usersList.find(u => u.id === editUserObj.id);
        if (existing?.role === 'Super Admin') {
          setSaveError('You cannot modify a Super Admin profile.'); return;
        }
      }
    }

    setSaving(true);
    try {
      const isNew = !editUserObj.id;
      let existing = null;
      if (!isNew) {
        existing = usersList.find(u => u.id === editUserObj.id);
      }
      await saveUser(editUserObj);
      
      if (isNew) {
        await addAuditLog(user.email, user.role, null, 'User Created', {
          targetUser: editUserObj.email,
          status: 'Success',
          message: `Created user account for ${editUserObj.email} with role ${editUserObj.role}`
        });
      } else {
        if (existing) {
          if (existing.role !== editUserObj.role) {
            await addAuditLog(user.email, user.role, null, 'Role Changed', {
              targetUser: editUserObj.email,
              status: 'Success',
              message: `Role changed from ${existing.role} to ${editUserObj.role}`
            });
          }
          if (existing.active !== editUserObj.active) {
            await addAuditLog(user.email, user.role, null, 'Account Enabled/Disabled', {
              targetUser: editUserObj.email,
              status: 'Success',
              message: `Account set to ${editUserObj.active ? 'Active' : 'Suspended'}`
            });
          }
          if (editUserObj.password) {
            await addAuditLog(user.email, user.role, null, 'Password Reset', {
              targetUser: editUserObj.email,
              status: 'Success',
              message: `Password updated for ${editUserObj.email}`
            });
          }
        }
        await addAuditLog(user.email, user.role, null, 'User Updated', {
          targetUser: editUserObj.email,
          status: 'Success',
          message: `Updated account details for ${editUserObj.email}`
        });
      }

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
    if (!canModifyUser(target)) {
      alert('You are not authorized to modify this user account.'); return;
    }
    const updated = { ...target, active: !target.active };
    await saveUser(updated);
    await addAuditLog(user.email, user.role, null, 'Account Enabled/Disabled', {
      targetUser: target.email,
      status: 'Success',
      message: `Account set to ${updated.active ? 'Active' : 'Suspended'}`
    });
    await loadUsers();
  };

  /* ─── Delete flow ────────────────────────────────────────────────── */
  const handleDeleteRequest = (target) => {
    if (target.email === user?.email) {
      alert('You cannot delete your own account.'); return;
    }
    if (!canModifyUser(target)) {
      alert('You are not authorized to delete this user account.'); return;
    }
    setConfirmTarget({ id: target.id, email: target.email, name: target.name, role: target.role });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmTarget) return;
    try {
      await deleteUser(confirmTarget.id);
      await addAuditLog(user.email, user.role, null, 'User Deleted', {
        targetUser: confirmTarget.email,
        status: 'Success',
        message: `Deleted account for ${confirmTarget.email}`
      });
      setConfirmTarget(null);
      await loadUsers();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      await addAuditLog(user.email, user.role, null, 'User Deleted', {
        targetUser: confirmTarget.email,
        status: 'Failed',
        message: `Delete failed: ${err.message}`
      });
      setConfirmTarget(null);
    }
  };

  /* ─── Stats ──────────────────────────────────────────────────────── */
  const activeCount   = usersList.filter(u => u.active).length;
  const adminCount    = usersList.filter(u => ['Super Admin','Admin'].includes(u.role)).length;

  const renderUserSection = (title, users, isViewOnly = false) => {
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
            {title} ({users.length})
          </div>
          {isViewOnly && (
            <span style={{ fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
              VIEW ONLY
            </span>
          )}
        </div>
        <div className="table-responsive" style={{ maxHeight: 'none', border: 'none', borderRadius: 0 }}>
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No accounts registered in this role.
                  </td>
                </tr>
              ) : (
                users.map(item => {
                  const isMe = item.email === user?.email;
                  const canEdit = !isViewOnly && canModifyUser(item);
                  return (
                    <tr key={item.id} style={{ opacity: item.active ? 1 : 0.55 }}>
                      <td data-label="Name" style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {item.name}
                        {isMe && <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>YOU</span>}
                      </td>
                      <td data-label="Email" className="font-mono" style={{ fontSize: '0.82rem' }}>{item.email}</td>
                      <td data-label="Status">
                        {canEdit ? (
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
                        ) : (
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
                        )}
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right', paddingRight: '20px' }}>
                        {canEdit ? (
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
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>View Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════ RENDER ════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Page Header ─────────────────────── */}
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Operator & User Management</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            SCADA operator directory, access control roles, and administrative security audit logs.
          </p>
        </div>
        <div className="page-header-actions">
          <RefreshButton
            isRefreshing={isRefreshing}
            onClick={handleRefresh}
            toast={refreshToast}
            id="refresh-btn-usermanagement"
          />
        </div>
      </div>

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

      {/* Grouped directory user sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PlusIcon /> Add User
          </button>
        </div>
        
        {(() => {
          if (loading) {
            return (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading accounts directory…
              </div>
            );
          }

          const superAdminsList = usersList.filter(u => u.role === 'Super Admin');
          const adminsList = usersList.filter(u => u.role === 'Admin');
          const operatorsList = usersList.filter(u => u.role === 'Operator' || u.role === 'User' || u.role === 'Viewer');

          return (
            <>
              {isSuperAdmin && renderUserSection('• Super Administrators', superAdminsList, false)}
              {(isSuperAdmin || isAdmin) && renderUserSection('• Administrators', adminsList, false)}
              {renderUserSection('• Operators', operatorsList, false)}
            </>
          );
        })()}
      </div>

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

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <select
                    className="form-control"
                    value={editUserObj.role}
                    onChange={e => {
                      const role = e.target.value;
                      setEditUserObj({ ...editUserObj, role });
                    }}
                    disabled={editUserObj.id === user?.id}
                  >
                    {isSuperAdmin && <option value="Super Admin">Super Admin</option>}
                    {(isSuperAdmin || isAdmin) && <option value="Admin">Admin</option>}
                    <option value="Operator">Operator</option>
                  </select>
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
          message={`Are you sure you want to permanently delete the user account for "${confirmTarget.name}" with the role "${confirmTarget.role}" (${confirmTarget.email})? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

    </div>
  );
}
