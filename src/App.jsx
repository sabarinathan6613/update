// src/App.jsx
import React, { useState, useEffect } from 'react';
import { initDB } from './utils/db';
import { SimulatorProvider, useSimulator } from './utils/SimulatorContext';
import { getSupabaseClient } from './utils/supabaseClient';
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
  const { syncTrigger } = useSimulator();

  useEffect(() => {
    // 1. Initialize Mock Database
    initDB();

    const checkSession = async () => {
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
                role: profile.role,
                plantId: profile.plant_id,
                active: profile.active
              });
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.error("Supabase session check error:", e);
        }
      }

      // 2. Check for "Remember Me" session (local storage fallback)
      const rememberedUser = localStorage.getItem('prod_active_user');
      if (rememberedUser) {
        try {
          const parsedUser = JSON.parse(rememberedUser);
          const allUsers = JSON.parse(localStorage.getItem('prod_users')) || [];
          const refreshed = allUsers.find(u => u.id === parsedUser.id);
          
          if (refreshed && refreshed.active) {
            setUser(refreshed);
          } else {
            localStorage.removeItem('prod_active_user');
          }
        } catch (err) {
          localStorage.removeItem('prod_active_user');
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
        if (event === 'SIGNED_IN' && session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (profile && profile.active) {
            setUser({
              id: profile.id,
              email: profile.email,
              name: profile.name,
              role: profile.role,
              plantId: profile.plant_id,
              active: profile.active
            });
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });
      authListener = subscription;
    }

    return () => {
      if (authListener) authListener.unsubscribe();
    };
  }, [syncTrigger]);

  const handleLogin = (authenticatedUser, rememberMe) => {
    setUser(authenticatedUser);
    setActiveTab('dashboard'); // reset tab on login
    if (rememberMe) {
      localStorage.setItem('prod_active_user', JSON.stringify(authenticatedUser));
    }
  };

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    localStorage.removeItem('prod_active_user');
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
            BOOTING SKADOMATION CLOUD SYNC...
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

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Render correct page based on sidebar tab selection
  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard user={user} />;
      case 'trends':
        return <Trends />;
      case 'reports':
        return <Reports />;
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
    <Layout 
      user={user} 
      onLogout={handleLogout} 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
    >
      {renderActivePage()}
    </Layout>
  );
}

export default function App() {
  return (
    <SimulatorProvider>
      <AppContent />
    </SimulatorProvider>
  );
}
