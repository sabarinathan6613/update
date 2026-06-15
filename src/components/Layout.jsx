// src/components/Layout.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSimulator } from '../utils/SimulatorContext';
import { getEmailLogs, getSyncLogs } from '../utils/db';

export default function Layout({ user, onLogout, activeTab, setActiveTab, children }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  
  const quickActionsRef = useRef(null);
  const globalSearchRef = useRef(null);

  const {
    syncTrigger,
    isNetworkOnline,
    forceSync,
    localBuffer,
    syncStatus,
    totalSyncedRecords,
    syncLogs
  } = useSimulator();

  const [notifications, setNotifications] = useState([]);

  // Extract last successful sync time from logs
  const lastSyncTime = useMemo(() => {
    const successLog = syncLogs.find(l => l.msg.includes('SUCCESS') || l.msg.includes('completed'));
    return successLog ? successLog.time : 'N/A';
  }, [syncLogs]);

  // Role permissions checks
  const isSuperAdmin = user.role === 'Super Admin';

  const menuItems = [
    { id: 'dashboard', label: '📊 Dashboard', roles: ['Super Admin', 'Plant Admin', 'User'] },
    { id: 'trends', label: '📈 Trends & Charts', roles: ['Super Admin', 'Plant Admin', 'User'] },
    { id: 'reports', label: '📋 Production Reports', roles: ['Super Admin', 'Plant Admin', 'User'] },
    { id: 'explorer', label: '📁 Database Explorer', roles: ['Super Admin', 'Plant Admin', 'User'] },
    { id: 'cloudSync', label: '☁️ Cloud DB & Sync', roles: ['Super Admin', 'Plant Admin'] },
    { id: 'tagConfig', label: '⚙️ Tag Configuration', roles: ['Super Admin', 'Plant Admin'] },
    { id: 'users', label: '👥 User Management', roles: ['Super Admin', 'Plant Admin'] },
    { id: 'settings', label: '🛠️ Settings', roles: ['Super Admin', 'Plant Admin'] }
  ];

  const visibleMenuItems = menuItems.filter(item => 
    item.roles.includes(user.role)
  );

  useEffect(() => {
    const loadLayoutData = async () => {
      const sLogs = await getSyncLogs();
      const eLogs = await getEmailLogs();
      const syncLogsSliced = sLogs.slice(0, 3);
      const emailLogsSliced = eLogs.slice(0, 3);
      
      const allNotifs = [
        ...syncLogsSliced.map(l => ({ ...l, type: 'sync', title: 'Data Synchronized', timestamp: l.timestamp })),
        ...emailLogsSliced.map(e => ({ ...e, type: 'email', title: 'Email Sent', timestamp: e.timestamp }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6);
      
      setNotifications(allNotifs);
    };

    loadLayoutData();
  }, [syncTrigger]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target)) {
        setShowQuickActions(false);
      }
      if (globalSearchRef.current && !globalSearchRef.current.contains(event.target)) {
        setShowGlobalResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getGlobalSearchResults = () => {
    if (!globalSearch) return [];
    const term = globalSearch.toLowerCase();
    const results = [];

    // Search menu tabs
    menuItems.forEach(item => {
      if (item.label.toLowerCase().includes(term) && item.roles.includes(user.role)) {
        results.push({ type: 'page', label: `Navigate: ${item.label.substring(3)}`, targetTab: item.id });
      }
    });

    if ('database diagnostics'.includes(term) || 'sync latency'.includes(term)) {
      results.push({ type: 'action', label: 'Run DB Diagnostics Wizard', targetTab: 'cloudSync' });
    }

    return results;
  };

  const searchResults = getGlobalSearchResults();

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`} style={{ transition: 'all 0.2s ease-in-out' }}>
        <div style={{
          padding: '20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: '12px',
          background: 'rgba(0,0,0,0.15)'
        }}>
          <span style={{ fontSize: '1.5rem' }} title="SKADOMATION smart historian">📊</span>
          {!isCollapsed && (
            <div>
              <h3 style={{ color: 'white', fontSize: '1.05rem', margin: 0, fontWeight: 700, letterSpacing: '0.02em' }}>SKADOMATION</h3>
              <span style={{ color: 'var(--secondary)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                SCADA Historian
              </span>
            </div>
          )}
        </div>



        {/* Menu Navigation Buttons */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {visibleMenuItems.map(item => {
            const emoji = item.label.substring(0, 2);
            const labelText = item.label.substring(2);
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
                title={isCollapsed ? labelText : ""}
                style={{
                  width: '100%',
                  padding: isCollapsed ? '12px 0' : '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  gap: isCollapsed ? '0' : '10px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
                  color: isActive ? 'var(--secondary)' : 'rgba(255,255,255,0.7)',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  borderLeft: isActive ? '3px solid var(--secondary)' : '3px solid transparent'
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.color = 'white';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                  }
                }}
              >
                <span style={{ fontSize: '1.1rem', marginRight: isCollapsed ? '0' : '2px' }}>{emoji}</span>
                {!isCollapsed && <span>{labelText}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Collapse Toggle */}
        <div style={{ padding: '0 8px 8px 8px' }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="no-print"
            style={{
              width: '100%',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            {isCollapsed ? "»" : "« Collapse"}
          </button>
        </div>

        {/* User profile Summary */}
        <div style={{
          padding: isCollapsed ? '12px 8px' : '14px 16px',
          borderTop: '1px solid #1E2D4D',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {!isCollapsed ? (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '10px' }}>
                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name}
                </span>
                <span style={{
                  color: 'var(--secondary)',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  🛡️ {user.role}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="btn"
                style={{
                  width: '100%',
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 'var(--radius-sm)'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              >
                ↩ Sign Out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <span 
                style={{ fontSize: '1.1rem', cursor: 'help' }} 
                title={`${user.name} (${user.role})`}
              >
                👤
              </span>
              <button
                onClick={onLogout}
                style={{
                  padding: '4px',
                  fontSize: '0.8rem',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  cursor: 'pointer'
                }}
                title="Sign Out"
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              >
                ↩
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Container Area */}
      <div className={`main-content ${isCollapsed ? 'expanded' : ''}`}>
        {/* Header Bar */}
        <header className="card" style={{
          padding: '12px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexDirection: 'row',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 90
        }}>
          {/* Left Title & Mobile toggle & Breadcrumbs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="no-print mobile-sidebar-toggle btn btn-secondary text-lg"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer',
                display: 'none'
              }}
            >
              ☰
            </button>
            
            {/* Breadcrumb Hierarchy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span>HISTORIAN CONSOLE</span>
                <span>/</span>
                <span style={{ color: 'var(--secondary)' }}>
                  {menuItems.find(i => i.id === activeTab)?.label.substring(3) || 'Dashboard'}
                </span>
              </div>
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>
                {menuItems.find(i => i.id === activeTab)?.label.substring(3) || 'Dashboard'}
              </h2>
            </div>
          </div>

          {/* Fuzzy Search box */}
          <div style={{ flex: 1, maxWidth: '200px', margin: '0 16px', position: 'relative' }} ref={globalSearchRef}>
            <input
              type="text"
              placeholder="Search views..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowGlobalResults(true);
              }}
              onFocus={() => setShowGlobalResults(true)}
              style={{
                width: '100%',
                padding: '6px 12px 6px 28px',
                fontSize: '0.8rem',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'white',
                outline: 'none'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', opacity: 0.5 }}>
              🔍
            </span>
            {showGlobalResults && globalSearch && (
              <div className="card" style={{
                position: 'absolute', top: '38px', left: 0, right: 0,
                backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                padding: '6px 0', zIndex: 190, maxHeight: '200px', overflowY: 'auto'
              }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    No matching view found.
                  </div>
                ) : (
                  searchResults.map((res, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setActiveTab(res.targetTab);
                        setGlobalSearch('');
                        setShowGlobalResults(false);
                      }}
                      style={{
                        padding: '8px 12px', fontSize: '0.78rem', color: 'white',
                        cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-hover)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {res.label}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sync Monitor Header Panel (5 key indicators) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginLeft: 'auto' }}>
            
            {/* 1. Cloud Status */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} title="Cloud Gateway Connection Status">
              <span className="text-muted" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase' }}>Cloud Status</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: isNetworkOnline ? 'var(--success)' : 'var(--error)',
                  boxShadow: isNetworkOnline ? '0 0 6px var(--success)' : '0 0 6px var(--error)',
                  display: 'inline-block'
                }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isNetworkOnline ? 'var(--success)' : 'var(--error)' }}>
                  {isNetworkOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>

            {/* 2. Database Status */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} title="Historian Database Health Link">
              <span className="text-muted" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase' }}>Database</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isNetworkOnline ? 'var(--success)' : 'var(--warning)', marginTop: '2px' }}>
                {isNetworkOnline ? 'HEALTHY' : 'LOCAL CACHE'}
              </span>
            </div>

            {/* 3. Last Sync */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} title="Last Successful Synchronization Heartsbeat">
              <span className="text-muted" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase' }}>Last Sync</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'white', marginTop: '2px' }} className="font-mono">
                {lastSyncTime}
              </span>
            </div>

            {/* 4. Records Synced (Buffered / Pending in queue) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} title="Queued records in Local SQL Spool Buffer waiting to sync">
              <span className="text-muted" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase' }}>Queue Buffer</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: localBuffer.length > 0 ? 'var(--warning)' : 'var(--text-muted)', marginTop: '2px' }} className="font-mono">
                {localBuffer.length} rows
              </span>
            </div>

            {/* 5. Total Records */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} title="Total Telemetry records stored in database">
              <span className="text-muted" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Records</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--secondary)', marginTop: '2px' }} className="font-mono">
                {totalSyncedRecords.toLocaleString()}
              </span>
            </div>

            {/* Quick Actions Dropdown */}
            <div style={{ position: 'relative' }} ref={quickActionsRef}>
              <button
                onClick={() => setShowQuickActions(!showQuickActions)}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
              >
                ⚡ Actions
              </button>
              {showQuickActions && (
                <div className="quick-action-menu">
                  <button className="quick-action-item" onClick={() => { forceSync(); setShowQuickActions(false); }}>
                    🔄 Trigger Sync Now
                  </button>
                  <button className="quick-action-item" onClick={() => { setActiveTab('cloudSync'); setShowQuickActions(false); }}>
                    🔌 DB Config Wizard
                  </button>
                  <button className="quick-action-item" onClick={() => { setActiveTab('tagConfig'); setShowQuickActions(false); }}>
                    ⚙️ Configure Tags
                  </button>
                  <button className="quick-action-item" onClick={() => { window.print(); setShowQuickActions(false); }}>
                    🖨️ Print PDF Report
                  </button>
                </div>
              )}
            </div>

            {/* Notification bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', position: 'relative' }}
              >
                🔔
                {notifications.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    width: '6px',
                    height: '6px',
                    backgroundColor: 'var(--error)',
                    borderRadius: '50%'
                  }} />
                )}
              </button>

              {showNotifications && (
                <div className="card" style={{
                  position: 'absolute',
                  top: '40px',
                  right: '0',
                  width: '300px',
                  zIndex: 200,
                  padding: '12px',
                  boxShadow: 'var(--shadow-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                    <span className="font-semibold text-xs text-muted">SYSTEM MESSAGES ({notifications.length})</span>
                    <button 
                      onClick={() => setShowNotifications(false)}
                      style={{ background: 'transparent', border: 'none', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <span className="text-xs text-muted" style={{ padding: '10px 0', textAlign: 'center' }}>No recent events.</span>
                    ) : (
                      notifications.map((notif, idx) => (
                        <div key={idx} style={{
                          padding: '6px 8px',
                          backgroundColor: 'var(--background)',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: `3px solid ${notif.type === 'sync' ? 'var(--secondary)' : 'var(--success)'}`
                        }}>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-xs" style={{ color: 'var(--text)' }}>{notif.title}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>
                              {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p style={{ margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>
                            {notif.message || `To: ${notif.recipient}`}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Content Children Page */}
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
