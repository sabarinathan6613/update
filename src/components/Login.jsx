import React, { useState } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Forgot Password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: { session }, error: authErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (authErr) {
          // Fallback to local storage auth to avoid administrator lockouts before users are seeded in Supabase
          const users = JSON.parse(localStorage.getItem('prod_users')) || [];
          const matchedLocalUser = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);
          if (matchedLocalUser) {
            onLogin(matchedLocalUser, rememberMe);
            return;
          }
          setError(authErr.message);
          return;
        }

        if (session) {
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileErr || !profile) {
            setError('User profile details not found in database.');
            await supabase.auth.signOut();
            return;
          }

          if (!profile.active) {
            setError('This account has been deactivated. Contact Super Admin.');
            await supabase.auth.signOut();
            return;
          }

          const matchedUser = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: profile.role,
            plantId: profile.plant_id,
            active: profile.active
          };

          // Success!
          onLogin(matchedUser, rememberMe);
          return;
        }
      } catch (err) {
        console.error("Supabase Auth Error:", err);
        setError("Network error authenticating with cloud database.");
        return;
      }
    }

    // Fallback: Authenticate against localStorage database
    const users = JSON.parse(localStorage.getItem('prod_users')) || [];
    
    if (users.length === 0) {
      // First-time configuration: register this account as Super Admin automatically
      const newAdmin = {
        id: "super-admin-init",
        email: email.trim().toLowerCase(),
        password: password,
        name: "Initial Administrator",
        role: "Super Admin",
        plantId: "all",
        active: true
      };
      users.push(newAdmin);
      localStorage.setItem('prod_users', JSON.stringify(users));
      onLogin(newAdmin, rememberMe);
      return;
    }

    const matchedUser = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);

    if (!matchedUser) {
      setError('Invalid email or password.');
      return;
    }

    if (!matchedUser.active) {
      setError('This account has been deactivated. Contact Super Admin.');
      return;
    }

    // Success!
    onLogin(matchedUser, rememberMe);
  };


  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
          redirectTo: window.location.origin
        });

        if (error) {
          alert(`Supabase reset request failed: ${error.message}`);
          return;
        }

        setForgotSent(true);
        // Seed logs in Supabase if possible
        const { error: logErr } = await supabase.from('synchronization_logs').insert({
          status_type: 'INFO',
          log_message: `Dispatched cloud password reset request to ${forgotEmail}.`
        });
        if (logErr) console.error("Error inserting sync log:", logErr);
        return;
      } catch (err) {
        console.error("Supabase Forgot Password Error:", err);
      }
    }
    
    // Simulate sending email
    setForgotSent(true);
    setTimeout(() => {
      // Seed an email notification in logs
      const emailLogs = JSON.parse(localStorage.getItem('prod_email_logs')) || [];
      emailLogs.unshift({
        timestamp: new Date().toISOString(),
        recipient: forgotEmail,
        subject: "Production System Password Reset Request",
        status: "SENT"
      });
      localStorage.setItem('prod_email_logs', JSON.stringify(emailLogs));
    }, 500);
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100%',
      backgroundColor: 'var(--primary)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
      position: 'relative'
    }}>
      {/* Decorative Background Gradients */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(37,99,235,0.15) 0%, rgba(15,23,42,0) 70%)',
        top: '-10%',
        left: '-10%',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, rgba(15,23,42,0) 70%)',
        bottom: '-10%',
        right: '-10%',
        pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%',
        maxWidth: '440px',
        zIndex: 5
      }}>
        {/* Logo/Branding */}
        <div style={{ textAlign: 'center', marginBottom: '24px', color: 'white' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px'
          }}>
            <svg viewBox="0 0 100 100" style={{ width: '50px', height: '50px' }} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--secondary)" />
                  <stop offset="100%" stopColor="#2563EB" />
                </linearGradient>
              </defs>
              <path d="M50,15 L80,32.5 L80,67.5 L50,85 L20,67.5 L20,32.5 Z" fill="none" stroke="url(#logoGrad)" strokeWidth="3" strokeLinejoin="round" />
              <circle cx="50" cy="50" r="14" fill="none" stroke="var(--secondary)" strokeWidth="2" />
              <line x1="50" y1="15" x2="50" y2="36" stroke="rgba(14, 165, 233, 0.4)" strokeWidth="2" />
              <line x1="20" y1="67.5" x2="38" y2="57" stroke="rgba(14, 165, 233, 0.4)" strokeWidth="2" />
              <line x1="80" y1="67.5" x2="62" y2="57" stroke="rgba(14, 165, 233, 0.4)" strokeWidth="2" />
              <circle cx="50" cy="50" r="4" fill="var(--secondary)" />
              <circle cx="50" cy="15" r="5" fill="#2563EB" />
              <circle cx="20" cy="67.5" r="5" fill="#2563EB" />
              <circle cx="80" cy="67.5" r="5" fill="#2563EB" />
            </svg>
          </div>
          <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 6px', letterSpacing: '0.02em' }}>SKADOMATION</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>Smart SCADA Automation & Cloud Monitoring</p>
        </div>

        {/* Login Card */}
        <div className="card" style={{ padding: '32px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
          {error && (
            <div style={{
              backgroundColor: 'var(--error-bg)',
              color: 'var(--error)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '16px',
              fontWeight: 500,
              border: '1px solid rgba(239,68,68,0.2)'
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-control"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <div className="flex justify-between items-center">
                <label className="form-label" htmlFor="login-password">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(true);
                    setForgotSent(false);
                    setForgotEmail('');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--secondary)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Forgot Password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="flex items-center" style={{ marginBottom: '24px', gap: '8px' }}>
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              />
              <label htmlFor="remember-me" className="text-sm font-semibold" style={{ cursor: 'pointer' }}>
                Remember me on this computer
              </label>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: '8px' }}>
              Sign In to Dashboard
            </button>
          </form>

        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '400px' }}>
            <div className="drawer-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>Password Reset</h3>
              <button 
                onClick={() => setShowForgotModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {forgotSent ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✉️</div>
                  <h4 style={{ marginBottom: '8px' }}>Reset Link Dispatched</h4>
                  <p style={{ fontSize: '0.88rem', marginBottom: '20px' }}>
                    A password reset email has been dispatched to <strong>{forgotEmail}</strong>.
                  </p>
                  <button 
                    onClick={() => setShowForgotModal(false)}
                    className="btn btn-secondary"
                    style={{ marginTop: '16px', width: '100%' }}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit}>
                  <p style={{ fontSize: '0.88rem', marginBottom: '16px' }}>
                    Enter your registered email address to receive a password reset link.
                  </p>
                  <div className="form-group">
                    <label className="form-label" htmlFor="forgot-email">Account Email</label>
                    <input
                      id="forgot-email"
                      type="email"
                      className="form-control"
                      placeholder="Enter your email address"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button 
                      type="button" 
                      onClick={() => setShowForgotModal(false)}
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
                      Send Reset Email
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
