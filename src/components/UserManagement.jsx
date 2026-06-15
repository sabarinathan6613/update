// src/components/UserManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { getUsers, saveUser, deleteUser, getPlants } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function UserManagement({ user }) {
  const { currentPlantId, syncTrigger } = useSimulator();
  const [activeSubTab, setActiveSubTab] = useState('directory'); // directory, audit
  const [usersList, setUsersList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [editUserObj, setEditUserObj] = useState({
    id: "",
    email: "",
    name: "",
    password: "",
    role: "User",
    active: true
  });

  const [plantsList, setPlantsList] = useState([]);
  const isSuperAdmin = user.role === 'Super Admin';

  const [auditLogs, setAuditLogs] = useState([]);

  const [loginHistory, setLoginHistory] = useState([]);

  const loadUsers = async () => {
    const plist = await getPlants();
    setPlantsList(plist);

    const allUsers = await getUsers();
    if (isSuperAdmin) {
      setUsersList(allUsers);
    } else {
      const filtered = allUsers.filter(u => u.plantId === user.plantId);
      setUsersList(filtered);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [currentPlantId, syncTrigger]);

  const handleOpenEdit = (targetUser = null) => {
    if (targetUser) {
      setEditUserObj(targetUser);
    } else {
      setEditUserObj({
        id: "",
        email: "",
        name: "",
        password: "",
        role: "User",
        plantId: isSuperAdmin ? currentPlantId : user.plantId,
        active: true
      });
    }
    setShowPassword(false); // Reset password visibility toggle when modal opens
    setShowModal(true);
  };

  const handleToggleStatus = async (target) => {
    if (target.email === user.email) {
      alert("Security override: You cannot deactivate your own active session!");
      return;
    }
    const updated = { ...target, active: !target.active };
    await saveUser(updated);
    
    // Add audit log entry
    setAuditLogs(prev => [
      { timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), user: user.email, action: `${updated.active ? 'Activated' : 'Suspended'} user ${target.email}`, ip: "127.0.0.1" },
      ...prev
    ]);

    await loadUsers();
  };

  const handleDelete = async (targetId, targetEmail) => {
    if (targetEmail === user.email) {
      alert("Security override: You cannot delete your own active account!");
      return;
    }
    if (window.confirm("Are you sure you want to permanently delete this user account?")) {
      await deleteUser(targetId);
      
      // Add audit log entry
      setAuditLogs(prev => [
        { timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), user: user.email, action: `Deleted user profile ${targetEmail}`, ip: "127.0.0.1" },
        ...prev
      ]);

      await loadUsers();
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editUserObj.name || !editUserObj.email) return;

    try {
      await saveUser(editUserObj);
      setShowModal(false);
      
      // Add audit log entry
      setAuditLogs(prev => [
        { timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), user: user.email, action: `Saved profile configuration for user ${editUserObj.email}`, ip: "127.0.0.1" },
        ...prev
      ]);

      await loadUsers();
    } catch (err) {
      console.error("Save User Profile Error:", err);
      alert(`Failed to save user profile: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Sub tabs navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '16px', marginBottom: '8px' }} className="no-print">
        <button
          onClick={() => setActiveSubTab('directory')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeSubTab === 'directory' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'directory' ? 600 : 500,
            borderBottom: activeSubTab === 'directory' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          👥 Operator Directory
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeSubTab === 'audit' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'audit' ? 600 : 500,
            borderBottom: activeSubTab === 'audit' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          🛡️ Security & Audit Logs
        </button>
      </div>

      {activeSubTab === 'directory' && (
        <>
          {/* Header Banner */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Active Operator & Administrator Directory</h3>
                <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
                  {isSuperAdmin 
                    ? "Full administrative control: create, modify, or terminate accounts across all nodes."
                    : `Local plant control: managing user accounts restricted to: ${plantsList.find(p => p.id === user.plantId)?.name || 'Detroit'}.`}
                </p>
              </div>
              <button onClick={() => handleOpenEdit(null)} className="btn btn-primary">
                ➕ Add New User
              </button>
            </div>
          </div>

          {/* Directory Table */}
          <div className="card" style={{ padding: '24px' }}>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email Address</th>
                    <th>Role Assignment</th>
                    <th>Assigned Plant Node</th>
                    <th>Account Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((item, idx) => (
                    <tr key={idx} style={{ opacity: item.active ? 1 : 0.6 }}>
                      <td className="font-semibold" style={{ color: 'white' }}>{item.name} {item.email === user.email && " (You)"}</td>
                      <td className="font-mono text-xs">{item.email}</td>
                      <td>
                        <span className={`badge ${
                          item.role === 'Super Admin' ? 'badge-error' : 
                          item.role === 'Plant Admin' ? 'badge-warning' : 'badge-info'
                        }`}>
                          {item.role}
                        </span>
                      </td>
                      <td>
                        {item.plantId === 'all' ? 'All Plants' : (plantsList.find(p => p.id === item.plantId)?.name || 'N/A')}
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className="btn text-xs"
                          style={{
                            padding: '4px 8px',
                            backgroundColor: item.active ? 'var(--success-bg)' : 'var(--error-bg)',
                            color: item.active ? 'var(--success)' : 'var(--error)',
                            border: 'none',
                            cursor: item.email === user.email ? 'not-allowed' : 'pointer'
                          }}
                          disabled={item.email === user.email}
                        >
                          {item.active ? 'Active' : 'Suspended'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => handleOpenEdit(item)}
                          className="btn btn-secondary text-xs" 
                          style={{ padding: '6px 10px' }}
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id, item.email)}
                          className="btn btn-danger text-xs"
                          style={{ padding: '6px 10px', color: 'white' }}
                          disabled={item.email === user.email}
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Active Sessions Overview */}
          <div className="grid-3">
            <div className="card" style={{ padding: '16px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '8px' }}>Active Sessions</span>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--success)', margin: 0 }}>3 Operators</h3>
              <p className="text-xs text-muted" style={{ marginTop: '4px' }}>Real-time user terminals currently connected.</p>
            </div>
            <div className="card" style={{ padding: '16px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '8px' }}>Security State</span>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--success)', margin: 0 }}>Optimal</h3>
              <p className="text-xs text-muted" style={{ marginTop: '4px' }}>Zero failed login thresholds exceeded.</p>
            </div>
            <div className="card" style={{ padding: '16px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '8px' }}>Logging Standard</span>
              <h3 style={{ fontSize: '1.4rem', color: 'white', margin: 0 }}>ISO 27001</h3>
              <p className="text-xs text-muted" style={{ marginTop: '4px' }}>System actions compliant with industrial audit specs.</p>
            </div>
          </div>

          <div className="grid-2">
            {/* Audit Trail logs */}
            <div className="card" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.92rem', marginBottom: '12px', color: 'white' }}>🛡️ Operation Audit Trail</h4>
              <div className="table-responsive" style={{ maxHeight: '250px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Terminal IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="font-mono text-xs">{log.timestamp}</td>
                        <td className="font-semibold text-xs">{log.user}</td>
                        <td style={{ color: 'white' }} className="text-xs">{log.action}</td>
                        <td className="font-mono text-xs">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Login history logs */}
            <div className="card" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.92rem', marginBottom: '12px', color: 'white' }}>🔑 Login & Authentication History</h4>
              <div className="table-responsive" style={{ maxHeight: '250px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Terminal IP</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.map((log, idx) => (
                      <tr key={idx}>
                        <td className="font-mono text-xs">{log.timestamp}</td>
                        <td className="font-semibold text-xs">{log.user}</td>
                        <td className="font-mono text-xs">{log.ip}</td>
                        <td>
                          <span className={`badge ${log.status.startsWith('SUCCESS') ? 'badge-success' : 'badge-error'}`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Editor Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '460px' }}>
            <div className="drawer-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>
                {editUserObj.id ? "✏️ Edit Account Profile" : "👥 Create User Profile"}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleSave} style={{ padding: '24px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="user-name">Full Name</label>
                <input
                  id="user-name"
                  type="text"
                  className="form-control"
                  placeholder="Employee Name"
                  value={editUserObj.name}
                  onChange={(e) => setEditUserObj({ ...editUserObj, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-email">Email Address</label>
                <input
                  id="user-email"
                  type="email"
                  className="form-control"
                  placeholder="name@company.com"
                  value={editUserObj.email}
                  onChange={(e) => setEditUserObj({ ...editUserObj, email: e.target.value })}
                  required
                  disabled={!!editUserObj.id}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-password">Secret Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="user-password"
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    placeholder="Enter user password"
                    value={editUserObj.password}
                    onChange={(e) => setEditUserObj({ ...editUserObj, password: e.target.value })}
                    style={{ paddingRight: '40px' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: showPassword ? 'var(--secondary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={showPassword ? "Hide Password" : "Show Password"}
                  >
                    {showPassword ? (
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

              <div className="form-group">
                <label className="form-label" htmlFor="user-role">System Role Assignment</label>
                {isSuperAdmin ? (
                  <select
                    id="user-role"
                    className="form-control"
                    value={editUserObj.role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      const nextPlantId = nextRole === 'Super Admin' ? 'all' : currentPlantId;
                      setEditUserObj({ ...editUserObj, role: nextRole, plantId: nextPlantId });
                    }}
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Plant Admin">Plant Admin</option>
                    <option value="User">User (Operator)</option>
                  </select>
                ) : (
                  <select
                    id="user-role"
                    className="form-control"
                    value={editUserObj.role}
                    onChange={(e) => setEditUserObj({ ...editUserObj, role: e.target.value })}
                  >
                    <option value="Plant Admin">Plant Admin</option>
                    <option value="User">User (Operator)</option>
                  </select>
                )}
              </div>

              {isSuperAdmin && editUserObj.role !== 'Super Admin' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="user-plant">Scope Plant Assignment</label>
                  <select
                    id="user-plant"
                    className="form-control"
                    value={editUserObj.plantId}
                    onChange={(e) => setEditUserObj({ ...editUserObj, plantId: e.target.value })}
                  >
                    {plantsList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
