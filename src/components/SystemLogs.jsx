// src/components/SystemLogs.jsx
import { useState, useEffect, useCallback } from 'react';
import { getAuditLogs, deleteAuditLogs, addAuditLog } from '../utils/db';

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const RefreshButton = ({ isRefreshing, onClick }) => (
  <button
    className="btn btn-secondary btn-sm"
    onClick={onClick}
    disabled={isRefreshing}
    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      className={isRefreshing ? 'spin' : ''}
    >
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
    Refresh
  </button>
);

export default function SystemLogs({ user }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditUserFilter, setAuditUserFilter] = useState('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState('all');
  const [auditRoleFilter, setAuditRoleFilter] = useState('all');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');
  const [auditSubView, setAuditSubView] = useState('logs');

  const isSuperAdmin = user?.role === 'Super Admin';

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const logs = await getAuditLogs();
      setAuditLogs(logs || []);
    } catch (err) {
      setDbError('Failed to fetch system logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadLogs();
    } finally {
      setIsRefreshing(false);
    }
  };

  const parseLogDetails = (details) => {
    try {
      if (details && (details.startsWith('{') || details.startsWith('['))) {
        const parsed = JSON.parse(details);
        return {
          targetUser: parsed.targetUser || '—',
          ipAddress: parsed.ipAddress || '—',
          status: parsed.status || 'Success',
          message: parsed.message || '—'
        };
      }
    } catch (e) {
      // ignore
    }
    return {
      targetUser: '—',
      ipAddress: '—',
      status: 'Success',
      message: details || '—'
    };
  };

  // User sessions map
  const userSessions = {};
  auditLogs.forEach(log => {
    const userEmail = log.by;
    if (!userEmail || userEmail === 'system' || userEmail === 'anonymous') return;
    if (userSessions[userEmail]) return;

    if (log.action === 'Login') {
      const loginTime = new Date(log.ts);
      const diffMs = Date.now() - loginTime.getTime();
      const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      const durationStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;

      userSessions[userEmail] = {
        username: userEmail,
        role: log.role,
        loginTime: log.ts,
        duration: durationStr,
        status: 'Online'
      };
    } else if (log.action === 'Logout') {
      const parsed = parseLogDetails(log.details);
      userSessions[userEmail] = {
        username: userEmail,
        role: log.role,
        loginTime: '—',
        duration: parsed.message || '—',
        status: 'Offline'
      };
    }
  });

  const totalActions = auditLogs.length;
  const successLoginsCount = auditLogs.filter(l => l.action === 'Login').length;
  const failedLoginsCount = auditLogs.filter(l => l.action === 'Failed Login' || l.action === 'Failed Login Attempt').length;
  const activeSessionsCount = Object.values(userSessions).filter(s => s.status === 'Online').length;
  const userMgmtCount = auditLogs.filter(l => [
    'Create User', 'Edit User', 'Delete User', 'Password Reset', 'Role Changed', 'Account Enabled', 'Account Disabled',
    'User Creation', 'User Modification', 'User Deletion', 'User Created', 'User Updated', 'User Deleted', 'Account Enabled/Disabled'
  ].includes(l.action)).length;

  const filteredLogs = auditLogs.filter(log => {
    const parsed = parseLogDetails(log.details);
    
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      const matchBy = (log.by || '').toLowerCase().includes(q);
      const matchAction = (log.action || '').toLowerCase().includes(q);
      const matchDetails = (parsed.message || '').toLowerCase().includes(q);
      const matchTarget = (parsed.targetUser || '').toLowerCase().includes(q);
      const matchIp = (parsed.ipAddress || '').toLowerCase().includes(q);
      if (!matchBy && !matchAction && !matchDetails && !matchTarget && !matchIp) return false;
    }
    
    if (auditActionFilter !== 'all') {
      const logActionLower = (log.action || '').toLowerCase();
      if (auditActionFilter === 'login' && logActionLower !== 'login' && logActionLower !== 'logout') return false;
      if (auditActionFilter === 'failed_login' && logActionLower !== 'failed login' && logActionLower !== 'failed login attempt') return false;
      if (auditActionFilter === 'user_mgmt' && !['user creation', 'user modification', 'user deletion', 'create user', 'edit user', 'delete user', 'user created', 'user updated', 'user deleted', 'password reset', 'role changed', 'account enabled', 'account disabled', 'account enabled/disabled'].includes(logActionLower)) return false;
      if (auditActionFilter === 'configs' && !['tag configuration update', 'email & system configuration update', 'plant configuration update', 'smtp configuration save', 'smtp configuration deletion'].includes(logActionLower)) return false;
      if (auditActionFilter === 'reports' && !['report generation', 'report deletion', 'report send', 'scheduled report dispatch'].includes(logActionLower)) return false;
      if (auditActionFilter === 'sync' && logActionLower !== 'cloud synchronization') return false;
    }

    if (auditUserFilter !== 'all') {
      if (log.by !== auditUserFilter) return false;
    }

    if (auditStatusFilter !== 'all') {
      const logStatus = (parsed.status || 'Success').toLowerCase();
      if (auditStatusFilter === 'success' && logStatus !== 'success') return false;
      if (auditStatusFilter === 'failed' && logStatus !== 'failed') return false;
    }

    if (auditRoleFilter !== 'all') {
      if (log.role !== auditRoleFilter) return false;
    }

    if (auditStartDate) {
      const logDate = new Date(log.ts);
      const startDate = new Date(auditStartDate + 'T00:00:00');
      if (logDate < startDate) return false;
    }
    if (auditEndDate) {
      const logDate = new Date(log.ts);
      const endDate = new Date(auditEndDate + 'T23:59:59');
      if (logDate > endDate) return false;
    }
    
    return true;
  });

  const handleExportLogs = () => {
    try {
      const headers = ['Timestamp', 'User', 'Role', 'Action', 'Target User', 'IP Address', 'Status', 'Details'];
      const rows = filteredLogs.map(log => {
        const parsed = parseLogDetails(log.details);
        return [
          log.ts,
          log.by,
          log.role,
          log.action,
          parsed.targetUser,
          parsed.ipAddress,
          parsed.status,
          parsed.message
        ];
      });
      
      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `system_logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to export logs: ' + err.message);
    }
  };

  const handleDeleteLogs = async () => {
    if (!window.confirm('WARNING: Are you sure you want to permanently delete ALL system logs? This action cannot be undone.')) return;
    try {
      await deleteAuditLogs();
      await addAuditLog(user.email, user.role, null, 'Audit Log Deletion', 'Cleared all system log records.');
      await loadLogs();
    } catch (err) {
      alert('Failed to clear logs: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>System Security Logs</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Super Admin system administration registry, user session history, and failed login monitors.
          </p>
        </div>
        <div className="page-header-actions">
          <RefreshButton isRefreshing={isRefreshing} onClick={handleRefresh} />
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
          fontWeight: 500
        }}>
          <span>{dbError}</span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading system telemetry logs...
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Audit Events</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{totalActions}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>Successful Logins</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)', lineHeight: 1 }}>{successLoginsCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>Failed Logins</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: failedLoginsCount > 0 ? 'var(--error)' : 'var(--text-muted)', lineHeight: 1 }}>{failedLoginsCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>Active Sessions</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38BDF8', lineHeight: 1 }}>{activeSessionsCount}</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>Management Actions</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--warning)', lineHeight: 1 }}>{userMgmtCount}</div>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="sub-tabs" style={{ marginBottom: 0 }}>
            <button className={`sub-tab ${auditSubView === 'logs' ? 'active' : ''}`} onClick={() => setAuditSubView('logs')}>
              📋 Audit Logs
            </button>
            <button className={`sub-tab ${auditSubView === 'sessions' ? 'active' : ''}`} onClick={() => setAuditSubView('sessions')}>
              🟢 Currently Logged In ({activeSessionsCount})
            </button>
            <button className={`sub-tab ${auditSubView === 'failed' ? 'active' : ''}`} onClick={() => setAuditSubView('failed')}>
              🔴 Failed Logins ({failedLoginsCount})
            </button>
          </div>

          {/* Render Views */}
          {auditSubView === 'logs' && (
            <>
              {/* Filters */}
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Search Details</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search by details, user, IP..."
                        value={auditSearch}
                        onChange={e => setAuditSearch(e.target.value)}
                      />
                    </div>
                    
                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Filter Action</label>
                      <select className="form-control" value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}>
                        <option value="all">All Actions</option>
                        <option value="login">Login & Logout</option>
                        <option value="failed_login">Failed Login</option>
                        <option value="user_mgmt">User Management</option>
                        <option value="configs">Configurations</option>
                        <option value="reports">Reports</option>
                        <option value="sync">Data Syncs</option>
                      </select>
                    </div>

                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Filter User</label>
                      <select className="form-control" value={auditUserFilter} onChange={e => setAuditUserFilter(e.target.value)}>
                        <option value="all">All Users</option>
                        {[...new Set(auditLogs.map(l => l.by).filter(Boolean))].map(email => (
                          <option key={email} value={email}>{email}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1, minWidth: '130px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Filter Status</label>
                      <select className="form-control" value={auditStatusFilter} onChange={e => setAuditStatusFilter(e.target.value)}>
                        <option value="all">All Statuses</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>

                    <div style={{ flex: 1, minWidth: '130px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Filter Role</label>
                      <select className="form-control" value={auditRoleFilter} onChange={e => setAuditRoleFilter(e.target.value)}>
                        <option value="all">All Roles</option>
                        {['Super Admin', 'Admin', 'Operator'].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1, minWidth: '130px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Start Date</label>
                      <input type="date" className="form-control" value={auditStartDate} onChange={e => setAuditStartDate(e.target.value)} />
                    </div>
                    <div style={{ flex: 1, minWidth: '130px' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>End Date</label>
                      <input type="date" className="form-control" value={auditEndDate} onChange={e => setAuditEndDate(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                    <button onClick={handleExportLogs} className="btn btn-secondary" style={{ height: '36px', fontSize: '0.8rem' }}>
                      📥 Export CSV
                    </button>
                    {isSuperAdmin && (
                      <button onClick={handleDeleteLogs} className="btn btn-secondary" style={{ height: '36px', fontSize: '0.8rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#EF4444' }}>
                        🗑️ Clear System Logs
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)', fontWeight: 700, fontSize: '0.875rem' }}>
                  🛡️ System Telemetry Log List ({filteredLogs.length} matching)
                </div>
                <div className="table-responsive" style={{ border: 'none' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Action</th>
                        <th>Target User</th>
                        <th>IP Address</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            No audit records available.
                          </td>
                        </tr>
                      ) : filteredLogs.map((log, idx) => {
                        const parsed = parseLogDetails(log.details);
                        let statusColor = parsed.status === 'Success' ? 'var(--success)' : 'var(--error)';
                        return (
                          <tr key={log.id || idx}>
                            <td className="font-mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{log.ts}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>{log.by}</td>
                            <td>
                              <span style={{
                                fontSize: '0.68rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: log.role === 'Super Admin' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                color: log.role === 'Super Admin' ? '#0EA5E9' : '#10B981'
                              }}>
                                {log.role}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{log.action}</td>
                            <td style={{ fontSize: '0.8rem' }}>{parsed.targetUser}</td>
                            <td className="font-mono" style={{ fontSize: '0.76rem' }}>{parsed.ipAddress}</td>
                            <td>
                              <span style={{
                                fontSize: '0.68rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: parsed.status === 'Success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: statusColor,
                                fontWeight: 700
                              }}>
                                {parsed.status.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={parsed.message}>{parsed.message}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {auditSubView === 'sessions' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-responsive" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Login Time</th>
                      <th>Session Duration</th>
                      <th>Current Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(userSessions).length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          No active sessions found.
                        </td>
                      </tr>
                    ) : Object.values(userSessions).map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>{s.username}</td>
                        <td>{s.role}</td>
                        <td className="font-mono">{s.loginTime}</td>
                        <td>{s.duration}</td>
                        <td>{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {auditSubView === 'failed' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-responsive" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username Attempted</th>
                      <th>Failure Time</th>
                      <th>IP Address</th>
                      <th>Failure Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.filter(l => l.action === 'Failed Login' || l.action === 'Failed Login Attempt').length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          No failed logins.
                        </td>
                      </tr>
                    ) : auditLogs.filter(l => l.action === 'Failed Login' || l.action === 'Failed Login Attempt').map((log, idx) => {
                      const parsed = parseLogDetails(log.details);
                      return (
                        <tr key={idx}>
                          <td style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600 }}>{log.by}</td>
                          <td className="font-mono">{log.ts}</td>
                          <td className="font-mono">{parsed.ipAddress}</td>
                          <td>{parsed.message}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
