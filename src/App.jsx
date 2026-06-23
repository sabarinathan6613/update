// src/App.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { SimulatorProvider, useSimulator } from './utils/SimulatorContext';
import { getSupabaseClient, getSupabaseConfig } from './utils/supabaseClient';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Trends from './components/Trends';
import Reports from './components/Reports';
import UserManagement from './components/UserManagement';
import Settings from './components/Settings';
import CloudSync from './components/CloudSync';
import Explorer from './components/Explorer';
import TagConfig from './components/TagConfig';
import ForgotPassword from './components/ForgotPassword';
import { getSettings, getTagConfigs, addAuditLog, invalidateCache } from './utils/db';

// ─── Path-based routing ────────────────────────────────────────────────────────
// Check the URL pathname and render the matching standalone auth page.
// These pages handle their own Supabase state independently.
function getAuthRoute() {
  const p = window.location.pathname.replace(/\/$/, '').toLowerCase();
  if (
    p === '/reset-password' ||
    p === '/auth/forgot-password' ||
    p === '/auth/reset-password' ||
    p === '/forgot-password'
  ) {
    return 'forgot-password';
  }
  return null;
}

// ─── Build a user object from a Supabase profiles row ─────────────────────────
function profileToUser(profile) {
  return {
    id:           profile.id,
    email:        profile.email,
    name:         profile.name,
    role:         profile.role === 'User' ? 'Operator' : profile.role,
    plantId:      profile.plant_id,
    active:       profile.active,
    authProvider: 'supabase',
  };
}

// ─── Shared loading splash ─────────────────────────────────────────────────────
function LoadingSplash() {
  return (
    <div style={{
      display:'flex',minHeight:'100vh',backgroundColor:'#050811',
      justifyContent:'center',alignItems:'center',
      color:'#00F0FF',fontFamily:'var(--sans,Inter,system-ui,sans-serif)'
    }}>
      <div style={{ textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:'20px' }}>
        <div style={{
          width:'50px',height:'50px',borderRadius:'50%',
          border:'3px solid rgba(0,240,255,0.1)',borderTopColor:'#0EA5E9',
          animation:'spin 0.8s cubic-bezier(0.4,0,0.2,1) infinite',
          boxShadow:'0 0 15px rgba(0,240,255,0.2)'
        }}/>
        <span style={{ color:'rgba(148,163,184,0.7)',fontSize:'0.9rem',fontWeight:600,letterSpacing:'0.08em' }}>
          INITIALIZING SKADOMATION…
        </span>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

// ─── No-DB screen ──────────────────────────────────────────────────────────────
function NoDatabaseScreen() {
  return (
    <div style={{
      minHeight:'100vh',backgroundColor:'#060B18',color:'#F1F5F9',
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      display:'flex',alignItems:'center',justifyContent:'center',
      padding:'24px',boxSizing:'border-box'
    }}>
      <div style={{
        maxWidth:'540px',width:'100%',backgroundColor:'#0D1526',
        border:'1px solid #1E2D4A',borderRadius:'12px',padding:'32px',
        boxShadow:'0 8px 30px rgba(0,0,0,0.6)',boxSizing:'border-box'
      }}>
        <div style={{ display:'flex',alignItems:'center',gap:'12px',marginBottom:'20px' }}>
          <div style={{
            width:'40px',height:'40px',borderRadius:'8px',
            backgroundColor:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',
            display:'flex',alignItems:'center',justifyContent:'center',color:'#EF4444'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'20px',height:'20px' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 style={{ fontSize:'1.25rem',fontWeight:600,color:'#F1F5F9',margin:0 }}>
            Database Connection Required
          </h2>
        </div>
        <p style={{ color:'#7C9DBF',fontSize:'0.9rem',marginBottom:'20px',lineHeight:'1.6' }}>
          No active database connection detected. Set the Supabase environment variables and redeploy.
        </p>
        <div style={{
          backgroundColor:'#040810',border:'1px solid #162238',borderRadius:'8px',
          padding:'16px',fontSize:'0.82rem',color:'#7C9DBF',lineHeight:'1.6'
        }}>
          <strong style={{ color:'#F1F5F9',display:'block',marginBottom:'6px' }}>How to connect:</strong>
          <ul style={{ paddingLeft:'18px',margin:0,display:'flex',flexDirection:'column',gap:'8px' }}>
            <li>
              <strong>Local dev:</strong> Create a <code>.env</code> file:
              <pre style={{ margin:'6px 0 0',backgroundColor:'#090F1E',padding:'8px',borderRadius:'4px',color:'#38BDF8',fontFamily:'monospace' }}>
{`VITE_SUPABASE_URL=your-url\nVITE_SUPABASE_ANON_KEY=your-anon-key`}
              </pre>
            </li>
            <li>
              <strong>Vercel:</strong> Add the same variables in Project Settings → Environment Variables, then redeploy.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Session-expired overlay ───────────────────────────────────────────────────
function SessionExpiredOverlay({ onDismiss }) {
  return (
    <div style={{
      position:'fixed',top:0,left:0,right:0,bottom:0,
      backgroundColor:'rgba(5,8,17,0.9)',
      display:'flex',alignItems:'center',justifyContent:'center',
      zIndex:9999,backdropFilter:'blur(4px)'
    }}>
      <div style={{
        maxWidth:'400px',width:'100%',margin:'0 20px',
        backgroundColor:'#0D1526',border:'1px solid rgba(255,255,255,0.08)',
        borderRadius:'16px',padding:'32px',textAlign:'center',
        boxShadow:'0 20px 60px rgba(0,0,0,0.6)'
      }}>
        <div style={{
          width:'56px',height:'56px',borderRadius:'50%',
          backgroundColor:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',
          display:'flex',alignItems:'center',justifyContent:'center',
          margin:'0 auto 16px auto',color:'#EF4444'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 style={{ marginBottom:'8px',color:'#F1F5F9',fontFamily:'Inter,system-ui,sans-serif' }}>
          Session Expired
        </h3>
        <p style={{ fontSize:'0.85rem',color:'rgba(148,163,184,0.7)',marginBottom:'24px',lineHeight:'1.6' }}>
          Your session has expired or your account status changed. Please sign in again.
        </p>
        <button
          onClick={onDismiss}
          style={{
            width:'100%',height:'44px',background:'linear-gradient(135deg,#0EA5E9,#2563EB)',
            color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',
            fontFamily:'Inter,system-ui,sans-serif',fontWeight:600,fontSize:'0.9rem'
          }}
        >
          Return to Sign In
        </button>
      </div>
    </div>
  );
}

// ─── Promise Timeout Helper ────────────────────────────────────────────────────
function withTimeout(promise, ms, name = 'Promise') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: "${name}" took longer than ${ms}ms to resolve.`));
    }, ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ─── Main application content ──────────────────────────────────────────────────
function AppContent() {
  const [user,           setUser]           = useState(null);
  const [activeTab,      setActiveTab]      = useState('dashboard');
  const [loading,        setLoading]        = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [startupError,   setStartupError]   = useState(null);
  const [startupLogs,    setStartupLogs]    = useState([]);
  // Simulator context is loaded to ensure background simulator runs, but syncTrigger is not needed here
  useSimulator();

  // Refs so closures see current values
  const initialCheckDoneRef = useRef(false);
  const userRef             = useRef(null);

  useEffect(() => { userRef.current = user; }, [user]);

  const addLog = useCallback((msg) => {
    console.log(msg);
    setStartupLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  }, []);

  const handleLogout = useCallback(async () => {
    const u = userRef.current;
    invalidateCache();
    if (u) {
      await addAuditLog(u.email, u.role, u.plantId, 'Logout', 'User logged out.');
    }
    const supabase = getSupabaseClient();
    if (supabase) {
      try { await supabase.auth.signOut(); } catch { /* ignored */ }
    }
    setUser(null);
  }, []);

  const triggerSessionExpiration = useCallback((reason, details = '') => {
    const u = userRef.current;
    if (!u) return;
    console.warn(`[Auth] Session expired. Reason: "${reason}". Details: "${details}"`);
    addAuditLog(u.email, u.role, u.plantId, 'Session Expiration', `Reason: ${reason}. ${details}`);
    setSessionExpired(true);
    setUser(null);
  }, []);

  // ─── Audited Bootstrap Sequence ──────────────────────────────────────────────
  const bootstrapApp = useCallback(async () => {
    setLoading(true);
    setStartupError(null);
    setStartupLogs([]);
    addLog('[Bootstrap] Starting Skadomation initialization...');

    const config = getSupabaseConfig();
    addLog(`[Bootstrap] Environment Config check: URL is ${config ? config.url : 'empty'}, Anon Key is ${config?.anonKey ? 'present' : 'empty'}`);

    const supabase = getSupabaseClient();
    if (!supabase) {
      addLog('[Bootstrap] Error: Database config missing or client could not be initialized.');
      initialCheckDoneRef.current = true;
      setLoading(false);
      return;
    }

    try {
      // Step 1: Session validation
      addLog('[Bootstrap] Step 1/4: Validating user session...');
      const { data: { session }, error: sessionErr } = await withTimeout(
        supabase.auth.getSession(),
        15000,
        'supabase.auth.getSession'
      );
      if (sessionErr) throw sessionErr;

      // Step 2: Profile lookup
      if (session?.user?.id) {
        addLog(`[Bootstrap] Step 2/4: Session found for ${session.user.email}. Loading profile...`);
        const { data: profile, error: profileErr } = await withTimeout(
          supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle(),
          15000,
          'profiles.lookup'
        );
        if (profileErr) throw profileErr;

        if (profile?.active) {
          addLog(`[Bootstrap] Profile loaded successfully. Role: ${profile.role}`);
          setUser(profileToUser(profile));
        } else {
          addLog('[Bootstrap] Warning: User profile is deactivated or missing. Signing out...');
          await withTimeout(supabase.auth.signOut(), 3000, 'supabase.auth.signOut');
          setUser(null);
        }
      } else {
        addLog('[Bootstrap] Step 2/4: No active session detected.');
      }

      // Step 3: Settings loading
      addLog('[Bootstrap] Step 3/4: Loading system configuration settings...');
      const settings = await withTimeout(getSettings({ forceRefresh: true }), 15000, 'db.getSettings');
      addLog(`[Bootstrap] Settings loaded successfully. Target table: ${settings?.selectedTable || 'None'}`);

      // Step 4: Tag config loading
      addLog('[Bootstrap] Step 4/4: Loading tag configurations...');
      const tags = await withTimeout(getTagConfigs({ forceRefresh: true }), 15000, 'db.getTagConfigs');
      addLog(`[Bootstrap] Loaded ${tags?.length || 0} tag configurations.`);

      addLog('[Bootstrap] Initialization completed successfully.');
      initialCheckDoneRef.current = true;
      setLoading(false);
    } catch (err) {
      const errMsg = err.message || err.toString();
      addLog(`[Bootstrap] Critical Error: ${errMsg}`);
      setStartupError(errMsg);
      setLoading(false);
    }
  }, [addLog]);

  // Run initial bootstrap on mount
  useEffect(() => {
    if (getAuthRoute()) return;
    const timer = setTimeout(() => {
      bootstrapApp();
    }, 0);
    return () => clearTimeout(timer);
  }, [bootstrapApp]);

  // Global browser error auditing hook
  useEffect(() => {
    const handleGlobalError = (event) => {
      const msg = event.message || (event.error && event.error.message) || 'Unknown JS Error';
      const file = event.filename || '';
      const line = event.lineno || '';
      const col = event.colno || '';
      const browser = navigator.userAgent;
      
      console.error('[Global Error Caught]:', msg, 'at', file, 'line', line, 'col', col);
      const u = userRef.current;
      addAuditLog(
        u?.email || 'anonymous',
        u?.role || 'anonymous',
        u?.plantId || 'all',
        'Browser Error',
        `JS Error: ${msg} in ${file}:${line}:${col}. Browser: ${browser}`
      ).catch(() => {});
    };

    const handleUnhandledRejection = (event) => {
      const reason = event.reason;
      const msg = reason?.message || reason || 'Unhandled Promise Rejection';
      const browser = navigator.userAgent;
      
      console.error('[Unhandled Promise Rejection]:', msg);
      const u = userRef.current;
      addAuditLog(
        u?.email || 'anonymous',
        u?.role || 'anonymous',
        u?.plantId || 'all',
        'Promise Rejection',
        `Unhandled rejection: ${msg}. Browser: ${browser}`
      ).catch(() => {});
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    if (getAuthRoute()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange event:', event, session?.user?.email ?? 'no user');
      if (event === 'SIGNED_IN' && session?.user?.id) {
        try {
          const { data: profile, error: profileErr } = await withTimeout(
            supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle(),
            15000,
            'onAuthStateChange.profiles.lookup'
          );
          if (profileErr) throw profileErr;

          if (profile?.active) {
            setUser(profileToUser(profile));
          } else {
            await withTimeout(supabase.auth.signOut(), 3000, 'onAuthStateChange.signOut');
          }
        } catch (err) {
          console.error("Auth state change error:", err);
        }
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/reset-password';
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Periodic session validity check
  useEffect(() => {
    if (getAuthRoute()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const sessionChecker = setInterval(async () => {
      if (!initialCheckDoneRef.current || !userRef.current) return;

      try {
        const { data: { session }, error: sessionErr } = await withTimeout(
          supabase.auth.getSession(),
          15000,
          'sessionChecker.getSession'
        );
        if (sessionErr) throw sessionErr;
        if (!session) {
          triggerSessionExpiration('Session expired — no session returned by server', 'Periodic check');
          return;
        }

        const { data: profile, error: profileErr } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, active')
            .eq('id', session.user.id)
            .maybeSingle(),
          15000,
          'sessionChecker.profileLookup'
        );

        if (profileErr) throw profileErr;

        if (!profile || !profile.active) {
          triggerSessionExpiration('Account deactivated or removed', `active=${profile?.active}`);
        }
      } catch (e) {
        // Ignore network/timeout errors during poll
        console.warn("[Auth] Session checker warning:", e.message || e);
      }
    }, 30000);

    return () => clearInterval(sessionChecker);
  }, [triggerSessionExpiration]);

  // Minute-by-minute scheduler poller
  useEffect(() => {
    if (!user) return;

    const runSchedulerCheck = async () => {
      try {
        console.log('[Client Poller] Triggering scheduled reports engine...');
        const response = await fetch('/api/run-scheduler', { method: 'POST' });
        const result = await response.json();
        console.log('[Client Poller] Scheduler engine response:', result);
      } catch (err) {
        console.warn('[Client Poller] Scheduler trigger failed:', err.message || err);
      }
    };

    // Delay first run slightly to let settings load
    const initialTimeout = setTimeout(runSchedulerCheck, 5000);
    const schedulerInterval = setInterval(runSchedulerCheck, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(schedulerInterval);
    };
  }, [user]);

  const handleLogin = (authenticatedUser) => {
    invalidateCache();
    setUser(authenticatedUser);
    setActiveTab('dashboard');
  };

  // ── Standalone auth routes ─────────────────────────────────────────────────
  const authRoute = getAuthRoute();
  if (authRoute === 'forgot-password') return <ForgotPassword />;

  // ── Fallback error screen ──────────────────────────────────────────────────
  if (startupError) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#060B18',
        color: '#F1F5F9',
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '540px',
          width: '100%',
          backgroundColor: '#0D1526',
          border: '1px solid #EF4444',
          borderRadius: '12px',
          padding: '32px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#FCA5A5', margin: 0 }}>
              Initialization Failure
            </h2>
          </div>

          <p style={{ color: '#7C9DBF', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.6' }}>
            An error occurred during the Skadomation startup sequence. You can inspect the diagnostic logs below.
          </p>

          <div style={{
            backgroundColor: '#040810',
            border: '1px solid #162238',
            borderRadius: '8px',
            padding: '16px',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: '#A5F3FC',
            maxHeight: '180px',
            overflowY: 'auto',
            marginBottom: '24px',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.5'
          }}>
            {startupLogs.join('\n')}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setStartupError(null);
                setLoading(false);
              }}
              style={{
                flex: 1,
                height: '42px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.88rem'
              }}
            >
              Proceed to Sign In
            </button>
            <button
              onClick={bootstrapApp}
              style={{
                flex: 1,
                height: '42px',
                background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.88rem',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
              }}
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading splash ─────────────────────────────────────────────────────────
  if (loading) return <LoadingSplash />;

  // ── No Supabase config ─────────────────────────────────────────────────────
  if (!getSupabaseConfig()) return <NoDatabaseScreen />;

  // ── Render pages ──────────────────────────────────────────────────────────
  const renderPage = () => {
    const role = user?.role || 'Operator';
    const isSuperAdmin = role === 'Super Admin';
    const isAdmin = role === 'Admin';
    const adminOrAbove = ['Super Admin', 'Plant Admin', 'Admin'].includes(role);

    if (['explorer', 'cloudSync'].includes(activeTab) && !isSuperAdmin && !isAdmin) {
      return <Dashboard user={user} onNavigate={setActiveTab} />;
    }
    if (activeTab === 'settings' && !adminOrAbove) {
      return <Dashboard user={user} onNavigate={setActiveTab} />;
    }
    if (['tagConfig', 'users'].includes(activeTab) && !adminOrAbove) {
      return <Dashboard user={user} onNavigate={setActiveTab} />;
    }
    switch (activeTab) {
      case 'dashboard': return <Dashboard user={user} onNavigate={setActiveTab} />;
      case 'trends':    return <Trends />;
      case 'reports':   return <Reports user={user} />;
      case 'explorer':  return <Explorer />;
      case 'cloudSync': return <CloudSync user={user} />;
      case 'tagConfig': return <TagConfig user={user} />;
      case 'users':     return <UserManagement user={user} />;
      case 'settings':  return <Settings user={user} />;
      default:          return <Dashboard user={user} />;
    }
  };

  return (
    <>
      {!user ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Layout
          user={user}
          onLogout={handleLogout}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        >
          {renderPage()}
        </Layout>
      )}

      {sessionExpired && (
        <SessionExpiredOverlay onDismiss={() => setSessionExpired(false)} />
      )}
    </>
  );
}

export default function App() {
  return (
    <SimulatorProvider>
      <AppContent />
    </SimulatorProvider>
  );
}
