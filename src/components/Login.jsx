import { useState, useEffect } from 'react';
import { getSupabaseClient, getSupabaseConfig } from '../utils/supabaseClient';

/* ─────────────────────────── inline SVG icons ─────────────────────────── */
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: '16px', height: '16px', display: 'block' }}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: '16px', height: '16px', display: 'block' }}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const EnvelopeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: '15px', height: '15px', display: 'block' }}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: '15px', height: '15px', display: 'block' }}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ─────────────────────────── decorative hex grid SVG ───────────────────── */
const HexGridDecor = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity: 0.07,
      pointerEvents: 'none'
    }}
  >
    <defs>
      <pattern id="hexPat" x="0" y="0" width="56" height="64" patternUnits="userSpaceOnUse">
        {/* flat-top hexagon rows, offset every other column */}
        <polygon points="28,4 52,18 52,46 28,60 4,46 4,18"
          fill="none" stroke="rgba(14,165,233,1)" strokeWidth="1" />
        <polygon points="56,36 80,50 80,78 56,92 32,78 32,50"
          fill="none" stroke="rgba(14,165,233,1)" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hexPat)" />
  </svg>
);

/* ─────────────────────────── brand logo mark ───────────────────────────── */
const LogoMark = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
    style={{ width: '72px', height: '72px', filter: 'drop-shadow(0 0 18px rgba(14,165,233,0.55))' }}>
    <defs>
      <linearGradient id="lgBrand" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0EA5E9" />
        <stop offset="100%" stopColor="#2563EB" />
      </linearGradient>
    </defs>
    {/* outer hex */}
    <path d="M50,8 L86,29 L86,71 L50,92 L14,71 L14,29 Z"
      fill="none" stroke="url(#lgBrand)" strokeWidth="2.5" strokeLinejoin="round" />
    {/* inner hex */}
    <path d="M50,22 L72,34.5 L72,59.5 L50,72 L28,59.5 L28,34.5 Z"
      fill="rgba(14,165,233,0.10)" stroke="rgba(14,165,233,0.6)" strokeWidth="1.5" strokeLinejoin="round" />
    {/* spokes */}
    <line x1="50" y1="22" x2="50" y2="8" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5" />
    <line x1="72" y1="34.5" x2="86" y2="29" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5" />
    <line x1="72" y1="59.5" x2="86" y2="71" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5" />
    <line x1="50" y1="72" x2="50" y2="92" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5" />
    <line x1="28" y1="59.5" x2="14" y2="71" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5" />
    <line x1="28" y1="34.5" x2="14" y2="29" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5" />
    {/* center circle */}
    <circle cx="50" cy="50" r="10" fill="rgba(14,165,233,0.15)" stroke="#0EA5E9" strokeWidth="2" />
    <circle cx="50" cy="50" r="4" fill="#0EA5E9" />
    {/* corner dots */}
    <circle cx="50" cy="8" r="3.5" fill="#2563EB" />
    <circle cx="86" cy="29" r="3.5" fill="#2563EB" />
    <circle cx="86" cy="71" r="3.5" fill="#2563EB" />
    <circle cx="50" cy="92" r="3.5" fill="#2563EB" />
    <circle cx="14" cy="71" r="3.5" fill="#2563EB" />
    <circle cx="14" cy="29" r="3.5" fill="#2563EB" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */
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

  const [isInitialSetup, setIsInitialSetup] = useState(false);

  useEffect(() => {
    const checkUsers = () => {
      const isConnected = getSupabaseConfig() !== null;
      if (isConnected) {
        setIsInitialSetup(false);
        return;
      }
      try {
        const users = JSON.parse(localStorage.getItem('prod_users')) || [];
        setIsInitialSetup(users.length === 0);
      } catch {
        setIsInitialSetup(true);
      }
    };
    checkUsers();
  }, []);

  /* ─── auth logic (unchanged) ─── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    const isConnected = getSupabaseConfig() !== null;
    const supabase = getSupabaseClient();

    if (isConnected && supabase) {
      try {
        const { data: { session }, error: authErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (authErr) {
          // Show a human-readable message for known Supabase auth errors directly
          const msg = authErr.message || '';
          if (msg.toLowerCase().includes('email not confirmed')) {
            setError('Your email address has not been confirmed. Please check your inbox for a confirmation link, or ask your administrator to confirm your account in Supabase Authentication settings.');
          } else if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
            setError('Invalid email or password. Please try again.');
          } else if (msg.toLowerCase().includes('too many requests')) {
            setError('Too many login attempts. Please wait a few minutes and try again.');
          } else {
            setError(msg || 'Login failed. Please check your credentials.');
          }
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
            role: profile.role === 'User' ? 'Operator' : profile.role,
            plantId: profile.plant_id,
            active: profile.active,
            authProvider: 'supabase'
          };

          onLogin(matchedUser, rememberMe);
          return;
        }
      } catch (err) {
        console.error("Supabase Auth Error:", err);
        setError("Network error authenticating with cloud database.");
        return;
      }
    } else {
      // Fallback: Authenticate against localStorage database only if Supabase is unconfigured/null
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
        onLogin({ ...newAdmin, authProvider: 'local' }, rememberMe);
        return;
      }

      const matchedUser = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);

      if (!matchedUser) {
        setError('Invalid login credentials');
        return;
      }

      if (!matchedUser.active) {
        setError('This account has been deactivated. Contact Super Admin.');
        return;
      }

      onLogin({ ...matchedUser, authProvider: 'local' }, rememberMe);
    }
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
          alert(`Password reset request failed: ${error.message}`);
          return;
        }

        setForgotSent(true);
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

    setForgotSent(true);
    setTimeout(() => {
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



  /* ═══════════════ render ═══════════════ */
  return (
    <>
      {/* Inject keyframes + responsive overrides via a <style> tag */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .login-root {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
          background: var(--background, #060B18);
          padding: 40px 20px;
          position: relative;
        }

        .login-container {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 440px;
        }

        .brand-header {
          text-align: center;
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .brand-title {
          margin: 16px 0 0;
          font-size: 1.9rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--text);
          line-height: 1.1;
        }

        .brand-subtitle {
          margin: 8px 0 0;
          font-size: 0.78rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--secondary);
        }

        /* ── Login card ── */
        .login-card {
          width: 100%;
          max-width: 440px;
          background: var(--card-bg, #1E293B);
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          border-radius: 16px;
          padding: 40px;
          box-shadow: var(--shadow-md);
        }

        /* ── Input wrapper ── */
        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 14px;
          color: rgba(148,163,184,0.7);
          pointer-events: none;
          display: flex;
          align-items: center;
        }
        .input-styled {
          width: 100%;
          height: 44px;
          padding: 0 40px 0 40px;
          background: var(--surface-raised);
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 8px;
          color: var(--text);
          font-size: 0.875rem;
          font-family: inherit;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }
        .input-styled::placeholder { color: var(--text-dim); }
        .input-styled:focus {
          border-color: var(--secondary, #0EA5E9);
          box-shadow: 0 0 0 3px var(--accent-dim);
        }
        .input-styled.no-right-pad { padding-right: 14px; }

        /* ── Eye toggle ── */
        .eye-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          padding: 0;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: color 0.2s;
        }

        /* ── Submit button ── */
        .submit-btn {
          width: 100%;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
          color: #fff;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 14px rgba(14,165,233,0.35);
        }
        .submit-btn:hover {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(14,165,233,0.5);
        }
        .submit-btn:active { transform: translateY(0); opacity: 1; }

        /* ── Feature badges ── */
        .feature-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        .feature-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #0EA5E9;
          box-shadow: 0 0 8px rgba(14,165,233,0.9);
          flex-shrink: 0;
          animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }

        /* ── Error banner ── */
        .error-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.22);
          border-radius: 8px;
          padding: 11px 14px;
          margin-bottom: 20px;
          font-size: 0.84rem;
          color: #FCA5A5;
          font-weight: 500;
        }

        /* ── Checkbox custom ── */
        input[type="checkbox"].custom-chk {
          appearance: none;
          width: 16px;
          height: 16px;
          border: 1px solid var(--border, rgba(255,255,255,0.15));
          border-radius: 4px;
          background: rgba(255,255,255,0.04);
          cursor: pointer;
          flex-shrink: 0;
          position: relative;
          transition: border-color 0.2s, background 0.2s;
        }
        input[type="checkbox"].custom-chk:checked {
          background: var(--secondary, #0EA5E9);
          border-color: var(--secondary, #0EA5E9);
        }
        input[type="checkbox"].custom-chk:checked::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 5px;
          width: 4px;
          height: 7px;
          border: 2px solid white;
          border-top: none;
          border-left: none;
          transform: rotate(40deg);
        }

        /* ── Modal ── */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(6,11,24,0.8);
          backdrop-filter: blur(6px);
          z-index: 9000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-box {
          width: 100%;
          max-width: 420px;
          background: var(--card-bg, #1E293B);
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 14px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.6);
          overflow: hidden;
          animation: slideUp 0.25s ease;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 22px;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
          background: rgba(14,165,233,0.06);
        }
        .modal-close-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: rgba(148,163,184,0.8);
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .modal-close-btn:hover { background: rgba(239,68,68,0.15); color: #FCA5A5; }

        /* ── Divider ── */
        .form-divider {
          height: 1px;
          background: var(--border, rgba(255,255,255,0.08));
          margin: 24px 0;
        }
      `}</style>

      <div className="login-root">
        {/* decorative hex grid */}
        <HexGridDecor />

        {/* top glow blob */}
        <div style={{
          position: 'absolute', top: '-80px', left: '-80px',
          width: '320px', height: '320px',
          background: 'radial-gradient(circle, rgba(14,165,233,0.1) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 1
        }} />
        {/* bottom glow blob */}
        <div style={{
          position: 'absolute', bottom: '-100px', right: '-80px',
          width: '350px', height: '350px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 1
        }} />

        <div className="login-container">
          {/* Brand centrepiece */}
          <div className="brand-header">
            <LogoMark />
            <h1 className="brand-title">SKADOMATION</h1>
            <p className="brand-subtitle">Industrial SCADA · Historian · Analytics</p>
          </div>

          <div className="login-card">

            {/* ── Card header ── */}
            <div style={{ marginBottom: '28px' }}>
              <h2 style={{
                margin: '0 0 6px',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text)'
              }}>
                Sign In
              </h2>
              <p style={{
                margin: 0,
                fontSize: '0.84rem',
                color: 'var(--text-muted)'
              }}>
                Access your SCADA monitoring platform
              </p>
            </div>

            {/* ── Initial Setup Banner ── */}
            {isInitialSetup && (
              <div style={{
                background: 'rgba(14, 165, 233, 0.08)',
                border: '1px solid rgba(14, 165, 233, 0.22)',
                borderRadius: '8px',
                padding: '11px 14px',
                marginBottom: '20px',
                fontSize: '0.84rem',
                color: '#38BDF8',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px', flexShrink: 0, marginTop: '2px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  <strong>Initial Setup Mode:</strong> No users are currently registered. Sign in with any credentials to automatically register as the Super Administrator.
                </span>
              </div>
            )}

            {/* ── Error message ── */}
            {error && (
              <div className="error-banner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: '15px', height: '15px', flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} noValidate>

              {/* Email */}
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="login-email" style={{
                  display: 'block',
                  marginBottom: '7px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.03em'
                }}>
                  EMAIL ADDRESS
                </label>
                <div className="input-wrap">
                  <span className="input-icon">
                    <EnvelopeIcon />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    className="input-styled"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
                  <label htmlFor="login-password" style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.03em'
                  }}>
                    PASSWORD
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(true);
                      setForgotSent(false);
                      setForgotEmail('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--secondary, #0EA5E9)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: '0.01em',
                      transition: 'opacity 0.2s'
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>

                <div className="input-wrap">
                  <span className="input-icon">
                    <LockIcon />
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="input-styled"
                    placeholder="••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setShowPassword(prev => !prev)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    style={{ color: showPassword ? 'var(--secondary, #0EA5E9)' : 'rgba(148,163,184,0.5)' }}
                  >
                    {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '26px' }}>
                <input
                  id="remember-me"
                  type="checkbox"
                  className="custom-chk"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember-me" style={{
                  cursor: 'pointer',
                  fontSize: '0.83rem',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                  userSelect: 'none'
                }}>
                  Remember me on this device
                </label>
              </div>

              {/* Submit */}
              <button type="submit" className="submit-btn">
                Sign In to Dashboard
              </button>

            </form>

            {/* Card footer */}
            <div style={{
              marginTop: '22px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              alignItems: 'center'
            }}>
              <p style={{
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.04em',
                margin: 0
              }}>
                Secured connection · Enterprise SCADA Platform
              </p>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Reset application storage? This will clear all local mock databases and cached users to restore initial configurations.")) {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4A6480',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  fontFamily: 'inherit'
                }}
                onMouseOver={(e) => e.target.style.color = '#7C9DBF'}
                onMouseOut={(e) => e.target.style.color = '#4A6480'}
              >
                Reset App Storage (Clear Mock Caches)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ FORGOT PASSWORD MODAL ══════════════ */}
      {showForgotModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowForgotModal(false); }}>
          <div className="modal-box">

            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="var(--secondary, #0EA5E9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: '18px', height: '18px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 600 }}>Password Reset</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowForgotModal(false)} aria-label="Close modal">
                ×
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {forgotSent ? (
                <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                  {/* Envelope success icon */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '56px', height: '56px',
                    background: 'rgba(14,165,233,0.12)',
                    border: '1px solid rgba(14,165,233,0.3)',
                    borderRadius: '50%',
                    marginBottom: '16px'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                      stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ width: '24px', height: '24px' }}>
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>

                  <h4 style={{ margin: '0 0 8px', color: 'var(--text)', fontWeight: 600, fontSize: '1rem' }}>
                    Reset Link Dispatched
                  </h4>
                  <p style={{ margin: '0 0 22px', fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    A password reset email has been sent to&nbsp;
                    <strong style={{ color: '#0EA5E9', fontWeight: 600 }}>{forgotEmail}</strong>.
                    <br />Check your inbox and follow the link to set a new password.
                  </p>
                  <button
                    onClick={() => setShowForgotModal(false)}
                    className="submit-btn"
                    style={{ maxWidth: '200px', margin: '0 auto', fontSize: '0.85rem' }}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} noValidate>
                  <p style={{ margin: '0 0 20px', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                    Enter your registered email address and we will send you a link to reset your password.
                  </p>

                  <div style={{ marginBottom: '22px' }}>
                    <label htmlFor="forgot-email" style={{
                      display: 'block', marginBottom: '7px',
                      fontSize: '0.78rem', fontWeight: 600,
                      color: 'var(--text-dim)', letterSpacing: '0.03em'
                    }}>
                      ACCOUNT EMAIL
                    </label>
                    <div className="input-wrap">
                      <span className="input-icon">
                        <EnvelopeIcon />
                      </span>
                      <input
                        id="forgot-email"
                        type="email"
                        className="input-styled"
                        placeholder="Enter your email address"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      style={{
                        flex: 1,
                        height: '42px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#94A3B8',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.2s'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="submit-btn"
                      style={{ flex: 2, height: '42px', fontSize: '0.85rem' }}
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
    </>
  );
}
