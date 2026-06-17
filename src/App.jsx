// src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import { initDB } from './utils/db';
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

function AppContent() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { syncTrigger } = useSimulator();

  const [bypassConfigError, setBypassConfigError] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [configAnonKey, setConfigAnonKey] = useState('');

  const handleSaveConfig = (e) => {
    e.preventDefault();
    if (!configUrl || !configAnonKey) {
      alert('Please fill in all fields.');
      return;
    }
    const settings = JSON.parse(localStorage.getItem('prod_settings')) || {};
    settings.supabaseUrl = configUrl.trim();
    settings.supabaseAnonKey = configAnonKey.trim();
    localStorage.setItem('prod_settings', JSON.stringify(settings));
    alert('Configuration saved successfully! Reloading...');
    window.location.reload();
  };

  const handleLogout = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch { /* ignored */ }
    }
    setUser(null);
    localStorage.removeItem('prod_active_user');
    sessionStorage.removeItem('prod_active_user');
  }, []);

  const triggerSessionExpiration = useCallback((reason, details = '') => {
    console.warn(`[AUTH DEBUG] Session Expiration Triggered in App.jsx! Reason: "${reason}". Details: "${details}"`);
    setSessionExpired(true);
    handleLogout();
  }, [handleLogout]);

  useEffect(() => {
    // 1. Initialize Mock Database
    initDB();

    const checkSession = async () => {
      // Check sessionStorage first (session-only login)
      try {
        const sessionUser = sessionStorage.getItem('prod_active_user');
        if (sessionUser) {
          const parsedUser = JSON.parse(sessionUser);
          if (parsedUser.authProvider === 'supabase') {
            const supabase = getSupabaseClient();
            if (supabase) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session && session.user.id === parsedUser.id) {
                setUser(parsedUser);
                setLoading(false);
                return;
              }
            }
            sessionStorage.removeItem('prod_active_user');
          } else {
            const allUsers = JSON.parse(localStorage.getItem('prod_users')) || [];
            const refreshed = allUsers.find(u => u.id === parsedUser.id);
            if (refreshed && refreshed.active) {
              const translatedUser = {
                ...refreshed,
                role: refreshed.role === 'User' ? 'Operator' : refreshed.role,
                authProvider: parsedUser.authProvider || 'local'
              };
              setUser(translatedUser);
              setLoading(false);
              return;
            } else {
              sessionStorage.removeItem('prod_active_user');
            }
          }
        }
      } catch {
        sessionStorage.removeItem('prod_active_user');
      }

      // Check localStorage second (Remember Me session)
      try {
        const rememberedUser = localStorage.getItem('prod_active_user');
        if (rememberedUser) {
          const parsedUser = JSON.parse(rememberedUser);
          if (parsedUser.authProvider === 'supabase') {
            const supabase = getSupabaseClient();
            if (supabase) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session && session.user.id === parsedUser.id) {
                setUser(parsedUser);
                setLoading(false);
                return;
              }
            }
            localStorage.removeItem('prod_active_user');
          } else {
            const allUsers = JSON.parse(localStorage.getItem('prod_users')) || [];
            const refreshed = allUsers.find(u => u.id === parsedUser.id);
            if (refreshed && refreshed.active) {
              const translatedUser = {
                ...refreshed,
                role: refreshed.role === 'User' ? 'Operator' : refreshed.role,
                authProvider: parsedUser.authProvider || 'local'
              };
              setUser(translatedUser);
              setLoading(false);
              return;
            } else {
              localStorage.removeItem('prod_active_user');
            }
          }
        }
      } catch {
        localStorage.removeItem('prod_active_user');
      }

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
              
            if (!error && profile && profile.active) {
              setUser({
                id: profile.id,
                email: profile.email,
                name: profile.name,
                role: profile.role === 'User' ? 'Operator' : profile.role,
                plantId: profile.plant_id,
                active: profile.active,
                authProvider: 'supabase'
              });
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.error("Supabase session check error:", e);
        }
      }

      setLoading(false);
    };

    checkSession();

    // 3. Set up Auth listener
    const supabase = getSupabaseClient();
    let authListener = null;
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        let activeUserObj = null;
        try {
          activeUserObj = JSON.parse(sessionStorage.getItem('prod_active_user')) || JSON.parse(localStorage.getItem('prod_active_user'));
        } catch { /* ignored */ }
        const provider = activeUserObj?.authProvider || 'local';

        if (event === 'SIGNED_IN' && session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (profile && profile.active) {
            const u = {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              role: profile.role === 'User' ? 'Operator' : profile.role,
              plantId: profile.plant_id,
              active: profile.active,
              authProvider: 'supabase'
            };
            setUser(u);
            if (!localStorage.getItem('prod_active_user')) {
              sessionStorage.setItem('prod_active_user', JSON.stringify(u));
            }
          }
        } else if (event === 'SIGNED_OUT') {
          if (provider === 'supabase') {
            console.log("[AUTH DEBUG] onAuthStateChange SIGNED_OUT received. Logging out user.");
            setUser(null);
            localStorage.removeItem('prod_active_user');
            sessionStorage.removeItem('prod_active_user');
          } else {
            console.log("[AUTH DEBUG] onAuthStateChange SIGNED_OUT received, but active session is local. Ignoring event.");
          }
        }
      });
      authListener = subscription;
    }

    // 4. Set up periodic session validity checker (every 10 seconds)
    const sessionChecker = setInterval(async () => {
      let activeUserObj = null;
      try {
        activeUserObj = JSON.parse(sessionStorage.getItem('prod_active_user')) || JSON.parse(localStorage.getItem('prod_active_user'));
      } catch { /* ignored */ }
      
      if (!activeUserObj) return;

      const provider = activeUserObj.authProvider || 'local';

      if (provider === 'supabase') {
        const supabaseClient = getSupabaseClient();
        if (supabaseClient) {
          try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
              triggerSessionExpiration('Supabase session is null or expired', 'No session found in auth client');
              return;
            }
            const { data: profile, error } = await supabaseClient
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (error) {
              const isNetworkError = !navigator.onLine || error.message?.toLowerCase().includes('fetch') || error.status === 0 || error.status >= 500;
              if (!isNetworkError) {
                triggerSessionExpiration(
                  'Supabase profile validation failed', 
                  `Error: ${error?.message || 'Profile check error'}`
                );
              }
            } else if (!profile || !profile.active) {
              triggerSessionExpiration(
                'Supabase profile validation failed', 
                'Profile inactive or missing'
              );
            }
          } catch (e) {
            console.error("Periodic session check error:", e);
          }
        }
      } else {
        try {
          const allUsers = JSON.parse(localStorage.getItem('prod_users')) || [];
          const current = allUsers.find(u => u.id === activeUserObj.id);
          if (!current) {
            triggerSessionExpiration(
              'Local user not found in database',
              `User ID ${activeUserObj.id} is missing in prod_users list`
            );
          } else if (!current.active) {
            triggerSessionExpiration(
              'Local user account deactivated',
              `Account active status set to false for user: ${current.email}`
            );
          }
        } catch (e) {
          console.error("Local periodic session check error:", e);
        }
      }
    }, 10000);

    return () => {
      if (authListener) authListener.unsubscribe();
      clearInterval(sessionChecker);
    };
  }, [syncTrigger, triggerSessionExpiration]);



  const handleLogin = (authenticatedUser, rememberMe) => {
    setUser(authenticatedUser);
    setActiveTab('dashboard'); // reset tab on login
    if (rememberMe) {
      localStorage.setItem('prod_active_user', JSON.stringify(authenticatedUser));
      sessionStorage.removeItem('prod_active_user');
    } else {
      sessionStorage.setItem('prod_active_user', JSON.stringify(authenticatedUser));
      localStorage.removeItem('prod_active_user');
    }
  };



  if (loading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#050811',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#00F0FF',
        fontFamily: "var(--sans)"
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: '3px solid rgba(0, 240, 255, 0.1)',
            borderTopColor: 'var(--secondary)',
            animation: 'spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            boxShadow: '0 0 15px rgba(0, 240, 255, 0.2)'
          }} />
          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            INITIALIZING SKADOMATION...
          </span>
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

  const isSupabaseConfigured = getSupabaseConfig() !== null;
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (!isSupabaseConfigured && !isLocalhost && !bypassConfigError) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#060B18',
        color: '#F1F5F9',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
          border: '1px solid #1E2D4A',
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
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#F1F5F9', margin: 0 }}>Database Link Disconnected</h2>
          </div>

          <p style={{ color: '#7C9DBF', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.6' }}>
            No active database connection was detected for this cloud deployment. In production, an active Supabase database link is required to query live configurations, user profiles, and historian analytics.
          </p>

          <div style={{
            backgroundColor: '#040810',
            border: '1px solid #162238',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            fontSize: '0.82rem',
            color: '#7C9DBF',
            lineHeight: '1.6'
          }}>
            <strong style={{ color: '#F1F5F9', display: 'block', marginBottom: '6px' }}>Deployment Resolution Options:</strong>
            <ul style={{ paddingLeft: '18px', margin: 0 }}>
              <li>Inject environment variables <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your hosting provider (e.g. Vercel) and redeploy.</li>
              <li>Or configure the local database connection credentials directly below.</li>
            </ul>
          </div>

          <form onSubmit={handleSaveConfig} style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#7C9DBF', marginBottom: '6px' }}>Supabase URL</label>
              <input
                type="text"
                value={configUrl}
                onChange={(e) => setConfigUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                style={{
                  width: '100%',
                  height: '38px',
                  backgroundColor: '#040810',
                  border: '1px solid #1E2D4A',
                  borderRadius: '6px',
                  padding: '0 12px',
                  color: '#F1F5F9',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#7C9DBF', marginBottom: '6px' }}>Supabase Anonymous Key</label>
              <input
                type="password"
                value={configAnonKey}
                onChange={(e) => setConfigAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                style={{
                  width: '100%',
                  height: '38px',
                  backgroundColor: '#040810',
                  border: '1px solid #1E2D4A',
                  borderRadius: '6px',
                  padding: '0 12px',
                  color: '#F1F5F9',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                height: '40px',
                backgroundColor: '#3B82F6',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'background-color 0.15s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#2563EB'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#3B82F6'}
            >
              Save & Link Database
            </button>
          </form>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setBypassConfigError(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#4A6480',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
              onMouseOver={(e) => e.target.style.color = '#7C9DBF'}
              onMouseOut={(e) => e.target.style.color = '#4A6480'}
            >
              Proceed in Local Offline Mock Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render correct page based on sidebar tab selection
  const renderActivePage = () => {
    const role = user?.role || 'Operator';

    if (['explorer', 'cloudSync', 'settings'].includes(activeTab) && role !== 'Super Admin') {
      setTimeout(() => setActiveTab('dashboard'), 0);
      return <Dashboard user={user} onNavigate={setActiveTab} />;
    }

    if (['tagConfig', 'users'].includes(activeTab) && !['Super Admin', 'Plant Admin'].includes(role)) {
      setTimeout(() => setActiveTab('dashboard'), 0);
      return <Dashboard user={user} onNavigate={setActiveTab} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard user={user} onNavigate={setActiveTab} />;
      case 'trends':
        return <Trends />;
      case 'reports':
        return <Reports user={user} />;
      case 'explorer':
        return <Explorer />;
      case 'cloudSync':
        return <CloudSync />;
      case 'tagConfig':
        return <TagConfig />;
      case 'users':
        return <UserManagement user={user} />;
      case 'settings':
        return <Settings user={user} />;
      default:
        return <Dashboard user={user} />;
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
          {renderActivePage()}
        </Layout>
      )}

      {sessionExpired && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 8, 17, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '24px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              backgroundColor: 'var(--error-bg)',
              border: '1px solid var(--error-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px auto', color: 'var(--error)'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 style={{ marginBottom: '8px', color: 'var(--text)' }}>Session Expired</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.5' }}>
              Your login session has expired or your account status has changed. Please log in again to continue.
            </p>
            <button className="btn btn-primary w-full" onClick={() => setSessionExpired(false)}>
              Return to Login
            </button>
          </div>
        </div>
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
