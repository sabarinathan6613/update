// src/components/Layout.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSimulator } from '../utils/SimulatorContext';
import { invalidateCache } from '../utils/db';

// ─── Inline SVG Icon Components ───────────────────────────────────────────────

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const IconTrends = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
    <polyline points="16 7 22 7 22 13"/>
  </svg>
);

const IconReports = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const IconExplorer = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

const IconCloudSync = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
);

const IconTagConfig = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 0 1 1.41 13.44l-3.54-3.54A5 5 0 0 0 12 7V4a9.9 9.9 0 0 1 7.07 0.93z"/>
    <path d="M4.93 4.93a10 10 0 0 0-1.41 13.44l3.54-3.54A5 5 0 0 1 12 7V4a9.9 9.9 0 0 0-7.07 0.93z"/>
  </svg>
);

const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);



const IconSignOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);



const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

// Hexagon logo mark (same as Login page)
const HexLogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
    <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="none" stroke="#3B82F6" strokeWidth="2"/>
    <circle cx="16" cy="16" r="5" fill="none" stroke="#0EA5E9" strokeWidth="1.5"/>
    <circle cx="16" cy="16" r="2" fill="#3B82F6"/>
  </svg>
);

// ─── Nav section definitions ───────────────────────────────────────────────────
const NAV_SECTIONS = [
  { label: 'MONITORING',     ids: ['dashboard', 'trends', 'reports', 'explorer'] },
  { label: 'CONFIGURATION',  ids: ['cloudSync', 'tagConfig'] },
  { label: 'ADMINISTRATION', ids: ['users', 'settings'] },
];

// ─── Main Layout Component ─────────────────────────────────────────────────────
export default function Layout({ user, onLogout, activeTab, setActiveTab, children }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalResults, setShowGlobalResults] = useState(false);

  const globalSearchRef = useRef(null);

  const {
    setRefreshTrigger,
    isNetworkOnline,
    localBuffer,
    totalSyncedRecords,
    syncLogs,
    dbConnectionStatus
  } = useSimulator();

  // Extract last successful sync time from logs
  const lastSyncTime = useMemo(() => {
    const successLog = syncLogs.find(l => l.msg.includes('SUCCESS') || l.msg.includes('completed'));
    return successLog ? successLog.time : 'N/A';
  }, [syncLogs]);

  // ─── Manual Refresh State & Logic ──────────────────────────────────────────────
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      console.log('[Manual Refresh] Purging client query cache and triggering page refresh...');
      invalidateCache();
      if (setRefreshTrigger) {
        setRefreshTrigger(prev => prev + 1);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Manual refresh reload failed:", err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }, [setRefreshTrigger]);

  // ─── 30-Minute Force Invalidation Timer (Background Cache Cleaning) ──────────
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[Auto-Refresh] 30-minute interval reached. Purging cache...');
      invalidateCache();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };



  const menuItems = [
    { id: 'dashboard', label: 'Dashboard',           icon: <IconDashboard />, roles: ['Super Admin', 'Admin', 'Plant Admin', 'Operator'] },
    { id: 'trends',    label: 'Trends & Charts',     icon: <IconTrends />,    roles: ['Super Admin', 'Admin', 'Plant Admin', 'Operator'] },
    { id: 'reports',   label: 'Production Reports',  icon: <IconReports />,   roles: ['Super Admin', 'Admin', 'Plant Admin', 'Operator'] },
    { id: 'explorer',  label: 'Database Explorer',   icon: <IconExplorer />,  roles: ['Super Admin', 'Admin'] },
    { id: 'cloudSync', label: 'Cloud DB & Sync',     icon: <IconCloudSync />, roles: ['Super Admin', 'Admin'] },
    { id: 'tagConfig', label: 'Tag Configuration',   icon: <IconTagConfig />, roles: ['Super Admin', 'Admin', 'Plant Admin'] },
    { id: 'users',     label: 'User Management',     icon: <IconUsers />,     roles: ['Super Admin', 'Admin', 'Plant Admin'] },
    { id: 'settings',  label: 'Settings',            icon: <IconSettings />,  roles: ['Super Admin', 'Admin', 'Plant Admin'] },
  ];

  const visibleMenuItems = menuItems.filter(item => item.roles.includes(user.role));

  useEffect(() => {
    function handleClickOutside(event) {
      if (globalSearchRef.current && !globalSearchRef.current.contains(event.target)) {
        setShowGlobalResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getGlobalSearchResults = () => {
    if (!globalSearch) return [];
    const term = globalSearch.toLowerCase();
    const results = [];

    menuItems.forEach(item => {
      if (item.label.toLowerCase().includes(term) && item.roles.includes(user.role)) {
        results.push({ type: 'page', label: `Navigate: ${item.label}`, targetTab: item.id });
      }
    });

    if ('database diagnostics'.includes(term) || 'sync latency'.includes(term)) {
      results.push({ type: 'action', label: 'Run DB Diagnostics Wizard', targetTab: 'cloudSync' });
    }

    return results;
  };

  const searchResults = getGlobalSearchResults();

  // User avatar initial
  const userInitial = (user.name || 'U')[0].toUpperCase();

  // Active page label (for breadcrumb / header)
  const activeLabel = menuItems.find(i => i.id === activeTab)?.label || 'Dashboard';

  // ── Styles ────────────────────────────────────────────────────────────────

  const sidebarStyles = {};

  const sectionLabelStyles = {
    padding: isCollapsed ? '10px 0 4px' : '12px 16px 4px',
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textAlign: isCollapsed ? 'center' : 'left',
    transition: 'opacity 0.15s',
    opacity: isCollapsed ? 0 : 1,
    height: isCollapsed ? '0' : 'auto',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  const getDividerStyles = (isFirst) => ({
    height: '1px',
    backgroundColor: 'var(--border-subtle)',
    margin: isFirst ? '4px 12px 0' : '4px 12px 0',
  });

  const getNavBtnStyles = (isActive) => ({
    width: '100%',
    padding: isCollapsed ? '11px 0' : '9px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: isCollapsed ? 'center' : 'flex-start',
    gap: '10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
    color: isActive ? 'var(--secondary)' : 'var(--text-muted)',
    fontSize: '0.82rem',
    fontWeight: isActive ? 600 : 500,
    cursor: 'pointer',
    transition: 'all 0.14s ease',
    borderLeft: isActive ? '3px solid var(--secondary)' : '3px solid transparent',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    letterSpacing: '0.01em',
  });

  return (
    <div className="app-container">

      {/* Sidebar Backdrop Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 99,
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      {/* ═══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <div
        className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}
        style={sidebarStyles}
      >
        {/* Brand / Logo */}
        <div style={{
          padding: isCollapsed ? '18px 0' : '18px 16px',
          borderBottom: '1px solid rgba(59,130,246,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: '10px',
          background: 'transparent',
          flexShrink: 0,
        }}>
          <span title="SKADOMATION Smart Historian" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <HexLogo />
          </span>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden' }}>
              <h3 style={{
                color: 'var(--text)',
                fontSize: '0.98rem',
                margin: 0,
                fontWeight: 800,
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
              }}>
                SKADOMATION
              </h3>
              <span style={{
                color: '#0EA5E9',
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}>
                SCADA Historian
              </span>
            </div>
          )}
        </div>

        {/* Navigation with Section Groups */}
        <nav style={{
          flex: 1,
          padding: '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          gap: 0,
        }}>
          {NAV_SECTIONS.map((section, sIdx) => {
            const sectionItems = section.ids
              .map(id => visibleMenuItems.find(i => i.id === id))
              .filter(Boolean);

            if (sectionItems.length === 0) return null;

            return (
              <div key={section.label}>
                {/* Divider between sections */}
                {sIdx > 0 && <div style={getDividerStyles(false)} />}

                {/* Section label – hidden in collapsed mode */}
                {!isCollapsed && (
                  <div style={sectionLabelStyles}>{section.label}</div>
                )}

                {/* Nav items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: isCollapsed && sIdx > 0 ? '6px' : '4px' }}>
                  {sectionItems.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsSidebarOpen(false);
                        }}
                        title={isCollapsed ? item.label : ''}
                        style={getNavBtnStyles(isActive)}
                        onMouseOver={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
                            e.currentTarget.style.color = 'var(--text)';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--text-muted)';
                          }
                        }}
                      >
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          width: '16px',
                          height: '16px',
                        }}>
                          {item.icon}
                        </span>
                        {!isCollapsed && (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Network Status Indicator (footer) */}
        <div style={{
          padding: isCollapsed ? '8px 0' : '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: '7px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'transparent',
          flexShrink: 0,
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: isNetworkOnline ? '#22C55E' : '#EF4444',
            boxShadow: isNetworkOnline ? '0 0 6px #22C55E' : '0 0 6px #EF4444',
            flexShrink: 0,
          }} />
          {!isCollapsed && (
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              color: isNetworkOnline ? '#16A34A' : '#DC2626',
              letterSpacing: '0.03em',
            }}>
              {isNetworkOnline ? 'Online' : 'Offline'}
            </span>
          )}
        </div>

        {/* Collapse Toggle */}
        <div style={{ padding: '6px 8px', flexShrink: 0 }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="no-print"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            style={{
              width: '100%',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-dim)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-dim)';
              e.currentTarget.style.color = 'var(--secondary)';
              e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
              e.currentTarget.style.color = 'var(--text-dim)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            {isCollapsed ? <IconChevronRight /> : <><IconChevronLeft /><span>Collapse</span></>}
          </button>
        </div>

        {/* User Profile Section */}
        <div style={{
          padding: isCollapsed ? '12px 8px' : '14px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-raised)',
          flexShrink: 0,
        }}>
          {!isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Avatar + Name + Role */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Avatar circle */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3B82F6 0%, #0EA5E9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 0 2px rgba(59,130,246,0.25)',
                }}>
                  {userInitial}
                </div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {user.name}
                  </div>
                  {/* Role badge */}
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 6px',
                    backgroundColor: 'var(--accent-dim)',
                    color: 'var(--secondary)',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    borderRadius: '4px',
                    marginTop: '2px',
                    border: '1px solid rgba(37,99,235,0.15)',
                  }}>
                    {user.role}
                  </span>
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={onLogout}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.14s',
                  letterSpacing: '0.02em',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                  e.currentTarget.style.color = 'var(--error)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <IconSignOut />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            // Collapsed: avatar initial + sign-out icon
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <div
                title={`${user.name} (${user.role})`}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3B82F6 0%, #0EA5E9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: 'white',
                  cursor: 'help',
                  boxShadow: '0 0 0 2px rgba(59,130,246,0.25)',
                }}
              >
                {userInitial}
              </div>
              <button
                onClick={onLogout}
                title="Sign Out"
                style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.14s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)';
                  e.currentTarget.style.color = '#FCA5A5';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <IconSignOut />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═════════════════════════════════════════════════════ */}
      <div
        className={`main-content ${isCollapsed ? 'expanded' : ''}`}
        style={{
          ...(activeTab === 'trends' ? {
            height: '100vh',
            maxHeight: '100vh',
            overflow: 'hidden',
          } : {})
        }}
      >
        {/* ── HEADER BAR ───────────────────────────────────────────────────── */}
        <header className="card app-header">

          {/* Left: Mobile toggle + Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="no-print mobile-sidebar-toggle"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '12px',
                margin: '-8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconMenu />
            </button>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.62rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}>
                <span>HISTORIAN CONSOLE</span>
                <span style={{ opacity: 0.4 }}>/</span>
                <span style={{ color: '#60A5FA' }}>{activeLabel}</span>
              </div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {activeLabel}
              </h2>
            </div>
          </div>

          {/* Center: Global Search */}
          <div style={{ flex: 1, maxWidth: '220px', position: 'relative' }} ref={globalSearchRef}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '9px',
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0.4,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
              }}>
                <IconSearch />
              </span>
              <input
                type="text"
                placeholder="Search views..."
                value={globalSearch}
                onChange={(e) => { setGlobalSearch(e.target.value); setShowGlobalResults(true); }}
                onFocus={() => setShowGlobalResults(true)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {showGlobalResults && globalSearch && (
              <div className="card" style={{
                position: 'absolute',
                top: '38px',
                left: 0,
                right: 0,
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                padding: '6px 0',
                zIndex: 190,
                maxHeight: '200px',
                overflowY: 'auto',
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
                        padding: '8px 12px',
                        fontSize: '0.78rem',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle)',
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

          {/* Right: Sync Monitor Indicators + Actions + Bell */}
          <div className="header-status-indicators" style={{ display: 'flex', alignItems: 'center', gap: '18px', marginLeft: 'auto', flexWrap: 'wrap' }}>

            {/* 1. Cloud Status */}
            <div className="header-status-item" title="Cloud Gateway Connection Status">
              <span className="header-status-label" style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                Cloud Status
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: isNetworkOnline ? 'var(--success)' : 'var(--error)',
                  boxShadow: isNetworkOnline ? '0 0 6px var(--success)' : '0 0 6px var(--error)',
                  display: 'inline-block',
                }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isNetworkOnline ? 'var(--success)' : 'var(--error)' }}>
                  {isNetworkOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>

            {/* 2. Database Status */}
            <div className="header-status-item" title="Historian Database Health">
              <span className="header-status-label" style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                Database Status
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <span className={`live-indicator ${dbConnectionStatus === 'Reconnecting' ? 'warning' : dbConnectionStatus === 'Disconnected' ? 'error' : ''}`} style={{
                  backgroundColor: dbConnectionStatus === 'Connected' ? 'var(--success)' : dbConnectionStatus === 'Syncing' ? 'var(--info)' : dbConnectionStatus === 'Reconnecting' ? 'var(--warning)' : 'var(--error)',
                  boxShadow: `0 0 6px ${dbConnectionStatus === 'Connected' ? 'var(--success)' : dbConnectionStatus === 'Syncing' ? 'var(--info)' : dbConnectionStatus === 'Reconnecting' ? 'var(--warning)' : 'var(--error)'}`
                }} />
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: dbConnectionStatus === 'Connected' ? 'var(--success)' : dbConnectionStatus === 'Syncing' ? 'var(--info)' : dbConnectionStatus === 'Reconnecting' ? 'var(--warning)' : 'var(--error)'
                }}>
                  {dbConnectionStatus.toUpperCase()}
                </span>
              </div>
            </div>

            {/* 3. Last Sync */}
            <div className="header-status-item optional" title="Last Successful Synchronization">
              <span className="header-status-label" style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                Last Sync
              </span>
              <span className="font-mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>
                {lastSyncTime}
              </span>
            </div>

            {/* 4. Queue Buffer */}
            <div className="header-status-item optional" title="Queued records in local SQL spool buffer">
              <span className="header-status-label" style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                Queue Buffer
              </span>
              <span className="font-mono" style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: '2px', color: localBuffer.length > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {localBuffer.length} rows
              </span>
            </div>

            {/* 5. Total Records */}
            <div className="header-status-item optional" title="Total telemetry records in database">
              <span className="header-status-label" style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                Total Records
              </span>
              <span className="font-mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--secondary)', marginTop: '2px' }}>
                {totalSyncedRecords.toLocaleString()}
              </span>
            </div>

            {/* 6. Intelligent Refresh Timing */}
            {['dashboard', 'tagConfig', 'explorer', 'reports'].includes(activeTab) && (
              <>
                <div className="header-status-item optional" title="Last database refresh">
                  <span className="header-status-label" style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    Last Updated
                  </span>
                  <span className="font-mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)', marginTop: '2px' }}>
                    {formatTime(lastUpdated)}
                  </span>
                </div>

                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="btn btn-secondary"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)'
                  }}
                  title="Purge cache and refresh telemetry data now"
                >
                  <span style={{
                    display: 'inline-flex',
                    animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
                  }}>
                    <IconRefresh />
                  </span>
                  Refresh Now
                </button>
              </>
            )}


          </div>
        </header>

        {/* Content */}
        <main style={{
          flex: 1,
          ...(activeTab === 'trends' ? {
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          } : {})
        }}>
          {children}
        </main>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
