import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';
import { addAuditLog } from '../utils/db';

/* ── Shared Design Atoms ── */
const HexGridDecor = () => (
  <svg xmlns="http://www.w3.org/2000/svg" style={{ position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.07,pointerEvents:'none' }}>
    <defs>
      <pattern id="hexFP" x="0" y="0" width="56" height="64" patternUnits="userSpaceOnUse">
        <polygon points="28,4 52,18 52,46 28,60 4,46 4,18" fill="none" stroke="rgba(14,165,233,1)" strokeWidth="1"/>
        <polygon points="56,36 80,50 80,78 56,92 32,78 32,50" fill="none" stroke="rgba(14,165,233,1)" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hexFP)"/>
  </svg>
);

const LogoMark = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
    style={{ width:'64px',height:'64px',filter:'drop-shadow(0 0 18px rgba(14,165,233,0.55))' }}>
    <defs>
      <linearGradient id="lgFP" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0EA5E9"/>
        <stop offset="100%" stopColor="#2563EB"/>
      </linearGradient>
    </defs>
    <path d="M50,8 L86,29 L86,71 L50,92 L14,71 L14,29 Z" fill="none" stroke="url(#lgFP)" strokeWidth="2.5" strokeLinejoin="round"/>
    <path d="M50,22 L72,34.5 L72,59.5 L50,72 L28,59.5 L28,34.5 Z" fill="rgba(14,165,233,0.10)" stroke="rgba(14,165,233,0.6)" strokeWidth="1.5" strokeLinejoin="round"/>
    <line x1="50" y1="22" x2="50" y2="8" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5"/>
    <line x1="72" y1="34.5" x2="86" y2="29" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5"/>
    <line x1="72" y1="59.5" x2="86" y2="71" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5"/>
    <line x1="50" y1="72" x2="50" y2="92" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5"/>
    <line x1="28" y1="59.5" x2="14" y2="71" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5"/>
    <line x1="28" y1="34.5" x2="14" y2="29" stroke="rgba(14,165,233,0.45)" strokeWidth="1.5"/>
    <circle cx="50" cy="50" r="10" fill="rgba(14,165,233,0.15)" stroke="#0EA5E9" strokeWidth="2"/>
    <circle cx="50" cy="50" r="4" fill="#0EA5E9"/>
    <circle cx="50" cy="8" r="3.5" fill="#2563EB"/>
    <circle cx="86" cy="29" r="3.5" fill="#2563EB"/>
    <circle cx="86" cy="71" r="3.5" fill="#2563EB"/>
    <circle cx="50" cy="92" r="3.5" fill="#2563EB"/>
    <circle cx="14" cy="71" r="3.5" fill="#2563EB"/>
    <circle cx="14" cy="29" r="3.5" fill="#2563EB"/>
  </svg>
);

const EnvelopeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width:'15px',height:'15px',display:'block' }}>
    <rect width="20" height="16" x="2" y="4" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width:'15px',height:'15px',display:'block' }}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px' }}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px' }}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
    <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);

/* ── Password strength checker ── */
function getStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '#475569', pct: 0 };
  const checks = {
    minLen:    pw.length >= 8,
    goodLen:   pw.length >= 12,
    upper:     /[A-Z]/.test(pw),
    lower:     /[a-z]/.test(pw),
    digit:     /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  if (score <= 1) return { score, label:'Very Weak',  color:'#EF4444', pct:10 };
  if (score === 2) return { score, label:'Weak',       color:'#F97316', pct:28 };
  if (score === 3) return { score, label:'Fair',       color:'#EAB308', pct:50 };
  if (score === 4) return { score, label:'Good',       color:'#84CC16', pct:70 };
  if (score === 5) return { score, label:'Strong',     color:'#22C55E', pct:88 };
  return               { score, label:'Very Strong', color:'#10B981', pct:100 };
}

function getReqs(pw) {
  return [
    { ok: pw.length >= 8,          text: 'At least 8 characters' },
    { ok: /[A-Z]/.test(pw),        text: 'One uppercase letter (A–Z)' },
    { ok: /[a-z]/.test(pw),        text: 'One lowercase letter (a–z)' },
    { ok: /[0-9]/.test(pw),        text: 'One number (0–9)' },
    { ok: /[^A-Za-z0-9]/.test(pw), text: 'One special character (!@#$…)' },
  ];
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box}
  .fp-root{display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;overflow:hidden;font-family:'Inter',system-ui,sans-serif;background:var(--background,#060B18);padding:40px 20px;position:relative}
  .fp-container{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;width:100%;max-width:440px}
  .fp-brand{text-align:center;margin-bottom:24px;display:flex;flex-direction:column;align-items:center}
  .fp-title{margin:14px 0 0;font-size:1.8rem;font-weight:800;letter-spacing:0.1em;color:var(--text,#F1F5F9);line-height:1.1}
  .fp-subtitle{margin:6px 0 0;font-size:0.75rem;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:var(--secondary,#0EA5E9)}
  .fp-card{width:100%;background:var(--card-bg,#0D1526);border:1px solid var(--border,#1E2D4A);border-radius:16px;padding:36px;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
  .fp-input-wrap{position:relative;display:flex;align-items:center}
  .fp-input-icon{position:absolute;left:14px;color:rgba(148,163,184,0.7);pointer-events:none;display:flex;align-items:center}
  .fp-eye-btn{position:absolute;right:12px;background:none;border:none;cursor:pointer;color:rgba(148,163,184,0.55);display:flex;align-items:center;padding:4px;transition:color 0.2s}
  .fp-eye-btn:hover{color:rgba(148,163,184,0.9)}
  .fp-input{width:100%;height:46px;padding:0 14px 0 42px;background:var(--surface-raised,#121E35);border:1px solid var(--border,#1E2D4A);border-radius:8px;color:var(--text,#F1F5F9);font-size:0.875rem;font-family:inherit;transition:border-color 0.2s,box-shadow 0.2s;outline:none}
  .fp-input.pwd-input{padding:0 44px 0 42px}
  .fp-input::placeholder{color:var(--text-dim,#4A6480)}
  .fp-input:focus{border-color:#0EA5E9;box-shadow:0 0 0 3px rgba(14,165,233,0.15)}
  .fp-input.match{border-color:#22C55E}
  .fp-input.no-match{border-color:#EF4444}
  .fp-btn{width:100%;height:46px;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#0EA5E9 0%,#2563EB 100%);color:#fff;font-family:inherit;font-size:0.9rem;font-weight:600;border:none;border-radius:8px;cursor:pointer;letter-spacing:0.02em;transition:opacity 0.2s,transform 0.15s,box-shadow 0.2s;box-shadow:0 4px 14px rgba(14,165,233,0.35)}
  .fp-btn:hover:not(:disabled){opacity:0.92;transform:translateY(-1px);box-shadow:0 6px 20px rgba(14,165,233,0.5)}
  .fp-btn:active:not(:disabled){transform:translateY(0);opacity:1}
  .fp-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
  .fp-error{display:flex;align-items:flex-start;gap:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.22);border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:0.84rem;color:#FCA5A5;font-weight:500;line-height:1.5}
  .fp-back{background:none;border:none;color:rgba(148,163,184,0.6);font-size:0.8rem;cursor:pointer;font-family:inherit;transition:color 0.2s;padding:0;display:inline-flex;align-items:center;gap:6px}
  .fp-back:hover{color:#0EA5E9}
  .strength-bar-bg{height:4px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;margin-top:8px}
  .strength-bar{height:100%;border-radius:99px;transition:width 0.4s ease,background 0.4s ease}
  .req-item{display:flex;align-items:center;gap:8px;font-size:0.78rem;color:rgba(148,163,184,0.55);transition:color 0.2s}
  .req-item.ok{color:#22C55E}
  .req-dot{width:6px;height:6px;border-radius:50%;background:rgba(148,163,184,0.3);flex-shrink:0;transition:background 0.2s}
  .req-item.ok .req-dot{background:#22C55E}
  .fp-otp-input:focus {
    border-color: #0EA5E9 !important;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15) !important;
  }
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  .fp-spin{animation:spin 0.8s linear infinite}
  .fp-anim{animation:fadeUp 0.35s ease both}
`;

export default function ForgotPassword() {
  const [step, setStep]         = useState('email'); // email | otp | password
  const [email, setEmail]       = useState('');
  const [otp, setOtp]           = useState(['', '', '', '', '', '']);
  const [status, setStatus]     = useState('idle'); // idle | submitting | error
  const [errorMsg, setErrorMsg] = useState('');
  
  // Password step states
  const [newPw, setNewPw]       = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew]   = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [timer, setTimer]       = useState(0);

  // Focus tracking for OTP fields
  const otpInputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null)
  ];

  // Cooldown countdown timer
  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((t) => t - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  // Passwords evaluation
  const strength = getStrength(newPw);
  const reqs     = getReqs(newPw);
  const allReqsMet = reqs.every(r => r.ok);
  const pwMatch  = confirmPw.length > 0 && newPw === confirmPw;
  const pwNoMatch = confirmPw.length > 0 && newPw !== confirmPw;

  // Step 1: Send OTP code to email
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setErrorMsg('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('error');
      setErrorMsg('Database client not initialised. Check environment variables.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);

      if (error) {
        if (error.message?.toLowerCase().includes('rate') || error.status === 429) {
          setErrorMsg('Too many requests. Please wait a few minutes before trying again.');
        } else {
          setErrorMsg(error.message || 'Failed to send verification code. Please try again.');
        }
        setStatus('error');
        return;
      }

      setTimer(60); // 60s cooldown before resend
      setStatus('idle');
      setStep('otp');
      // Auto focus first OTP input box in next tick
      setTimeout(() => {
        if (otpInputRefs[0].current) otpInputRefs[0].current.focus();
      }, 50);
    } catch (err) {
      console.error('[ForgotPassword] Exception:', err);
      setStatus('error');
      setErrorMsg('A network error occurred. Please check your connection and try again.');
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setErrorMsg('Please enter the full 6-digit code.');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('error');
      setErrorMsg('Database client not initialised.');
      return;
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode,
        type: 'recovery'
      });

      if (error) {
        setStatus('error');
        setErrorMsg(error.message || 'Verification failed. The code may be invalid or expired.');
        return;
      }

      setStatus('idle');
      setStep('password');
    } catch (err) {
      console.error('[ForgotPassword] Verification exception:', err);
      setStatus('error');
      setErrorMsg('A network error occurred. Please check your connection.');
    }
  };

  // Step 3: Update Password
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!allReqsMet) {
      setErrorMsg('Password does not meet all requirements. Please review them below.');
      return;
    }
    if (newPw !== confirmPw) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setStatus('submitting');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('error');
      setErrorMsg('Database client not initialised.');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });

      if (error) {
        setStatus('idle');
        if (error.message?.toLowerCase().includes('weak') || error.message?.toLowerCase().includes('password')) {
          setErrorMsg('This password is too weak. Please choose a stronger one.');
        } else {
          setErrorMsg(error.message || 'Failed to update password.');
        }
        return;
      }
      await addAuditLog(email, 'Operator', null, 'Password Reset', 'User reset password successfully via OTP verification.');

      // Sign out to clear the active recovery session so user can log in fresh
      await supabase.auth.signOut();
      
      // Redirect to login screen with success flag
      window.location.href = '/?reset=success';
    } catch (err) {
      console.error('[ForgotPassword] Update exception:', err);
      setStatus('idle');
      setErrorMsg('A network error occurred. Please check your connection.');
    }
  };

  // OTP inputs handling
  const handleOtpChange = (val, index) => {
    if (val && !/^[0-9]$/.test(val)) return;

    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);
    setErrorMsg('');

    // Auto-focus next input
    if (val && index < 5) {
      otpInputRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      setErrorMsg('');
      if (!otp[index] && index > 0) {
        // Go back and clear previous box
        otpInputRefs[index - 1].current.focus();
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs[index - 1].current.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs[index + 1].current.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    setErrorMsg('');
    const text = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(text)) return;

    const newOtp = text.split('');
    setOtp(newOtp);
    otpInputRefs[5].current.focus();
  };

  const isSubmitting = status === 'submitting';

  return (
    <>
      <style>{CSS}</style>
      <div className="fp-root">
        <HexGridDecor />
        <div style={{ position:'absolute',top:'-80px',left:'-80px',width:'320px',height:'320px',background:'radial-gradient(circle,rgba(14,165,233,0.09) 0%,transparent 70%)',pointerEvents:'none',zIndex:1 }}/>
        <div style={{ position:'absolute',bottom:'-100px',right:'-80px',width:'350px',height:'350px',background:'radial-gradient(circle,rgba(37,99,235,0.06) 0%,transparent 70%)',pointerEvents:'none',zIndex:1 }}/>

        <div className="fp-container">
          {/* Brand */}
          <div className="fp-brand">
            <LogoMark />
            <h1 className="fp-title">SKADOMATION</h1>
            <p className="fp-subtitle">Industrial SCADA · Historian · Analytics</p>
          </div>

          <div className="fp-card">
            {/* ── 1. Enter Email Step ── */}
            {step === 'email' && (
              <div className="fp-anim">
                <div style={{ marginBottom:'24px' }}>
                  <h2 style={{ margin:'0 0 6px',fontSize:'1.4rem',fontWeight:700,color:'var(--text,#F1F5F9)' }}>
                    Forgot Password
                  </h2>
                  <p style={{ margin:0,fontSize:'0.84rem',color:'var(--text-muted,rgba(148,163,184,0.7))',lineHeight:1.55 }}>
                    Enter your account email to receive a secure 6-digit verification code.
                  </p>
                </div>

                {errorMsg && (
                  <div className="fp-error">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px',flexShrink:0,marginTop:'1px' }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSendOtp} noValidate>
                  <div style={{ marginBottom:'20px' }}>
                    <label htmlFor="fp-email" style={{ display:'block',marginBottom:'7px',fontSize:'0.78rem',fontWeight:600,color:'var(--text-muted,rgba(148,163,184,0.7))',letterSpacing:'0.04em' }}>
                      ACCOUNT EMAIL
                    </label>
                    <div className="fp-input-wrap">
                      <span className="fp-input-icon"><EnvelopeIcon /></span>
                      <input
                        id="fp-email"
                        type="email"
                        className="fp-input"
                        placeholder="name@company.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                        autoComplete="email"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <button type="submit" className="fp-btn" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <svg className="fp-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                        </svg>
                        Sending Verification Code…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px' }}>
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                        Send Verification Code
                      </>
                    )}
                  </button>
                </form>

                <div style={{ marginTop:'24px',textAlign:'center' }}>
                  <button className="fp-back" onClick={() => { window.location.href = '/'; }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'14px',height:'14px' }}>
                      <path d="m15 18-6-6 6-6"/>
                    </svg>
                    Back to Sign In
                  </button>
                </div>
              </div>
            )}

            {/* ── 2. Enter OTP Step ── */}
            {step === 'otp' && (
              <div className="fp-anim">
                <div style={{ marginBottom:'20px' }}>
                  <h2 style={{ margin:'0 0 6px',fontSize:'1.4rem',fontWeight:700,color:'var(--text,#F1F5F9)' }}>
                    Enter Code
                  </h2>
                  <p style={{ margin:0,fontSize:'0.84rem',color:'var(--text-muted,rgba(148,163,184,0.7))',lineHeight:1.55 }}>
                    Enter the 6-digit OTP code sent to <strong style={{ color:'#0EA5E9' }}>{email}</strong>.
                  </p>
                </div>

                {errorMsg && (
                  <div className="fp-error">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px',flexShrink:0,marginTop:'1px' }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} noValidate>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '24px 0' }}>
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={otpInputRefs[idx]}
                        id={`otp-box-${idx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(e.target.value, idx)}
                        onKeyDown={e => handleOtpKeyDown(e, idx)}
                        onPaste={handleOtpPaste}
                        disabled={isSubmitting}
                        style={{
                          width: '46px',
                          height: '48px',
                          textAlign: 'center',
                          fontSize: '1.25rem',
                          fontWeight: '700',
                          background: 'var(--surface-raised,#121E35)',
                          border: '1px solid var(--border,#1E2D4A)',
                          borderRadius: '8px',
                          color: 'var(--text,#F1F5F9)',
                          outline: 'none',
                          transition: 'border-color 0.2s, box-shadow 0.2s'
                        }}
                        className="fp-otp-input"
                      />
                    ))}
                  </div>

                  <button type="submit" className="fp-btn" disabled={isSubmitting || otp.some(d => !d)}>
                    {isSubmitting ? (
                      <>
                        <svg className="fp-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                        </svg>
                        Verifying Code…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px' }}>
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Verify & Continue
                      </>
                    )}
                  </button>
                </form>

                <div style={{ marginTop:'24px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <button className="fp-back" onClick={() => { setStep('email'); setErrorMsg(''); setOtp(['', '', '', '', '', '']); }} disabled={isSubmitting}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'14px',height:'14px' }}>
                      <path d="m15 18-6-6 6-6"/>
                    </svg>
                    Change Email
                  </button>

                  {timer > 0 ? (
                    <span style={{ fontSize:'0.8rem',color:'rgba(148,163,184,0.45)' }}>
                      Resend code in {timer}s
                    </span>
                  ) : (
                    <button className="fp-back" onClick={handleSendOtp} style={{ color:'#0EA5E9' }} disabled={isSubmitting}>
                      Resend Code
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── 3. Reset Password Step ── */}
            {step === 'password' && (
              <div className="fp-anim">
                <div style={{ marginBottom:'24px' }}>
                  <h2 style={{ margin:'0 0 6px',fontSize:'1.4rem',fontWeight:700,color:'var(--text,#F1F5F9)' }}>
                    Reset Password
                  </h2>
                  <p style={{ margin:0,fontSize:'0.84rem',color:'var(--text-muted,rgba(148,163,184,0.7))',lineHeight:1.55 }}>
                    Enter a strong new password for your account.
                  </p>
                </div>

                {errorMsg && (
                  <div className="fp-error">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px',flexShrink:0,marginTop:'1px' }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleUpdatePassword} noValidate>
                  {/* New Password */}
                  <div style={{ marginBottom:'20px' }}>
                    <label htmlFor="fp-new" style={{ display:'block',marginBottom:'7px',fontSize:'0.78rem',fontWeight:600,color:'rgba(148,163,184,0.7)',letterSpacing:'0.04em' }}>
                      NEW PASSWORD
                    </label>
                    <div className="fp-input-wrap">
                      <span className="fp-input-icon"><LockIcon /></span>
                      <input
                        id="fp-new"
                        type={showNew ? 'text' : 'password'}
                        className="fp-input pwd-input"
                        placeholder="Enter new password"
                        value={newPw}
                        onChange={e => { setNewPw(e.target.value); setErrorMsg(''); }}
                        autoComplete="new-password"
                        required
                        disabled={isSubmitting}
                      />
                      <button type="button" className="fp-eye-btn" onClick={() => setShowNew(p => !p)} tabIndex={-1}>
                        {showNew ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>

                    {/* Strength meter */}
                    {newPw.length > 0 && (
                      <div style={{ marginTop:'10px' }}>
                        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px' }}>
                          <span style={{ fontSize:'0.72rem',color:'rgba(148,163,184,0.55)',letterSpacing:'0.04em' }}>STRENGTH</span>
                          <span style={{ fontSize:'0.72rem',fontWeight:600,color:strength.color,letterSpacing:'0.04em' }}>
                            {strength.label}
                          </span>
                        </div>
                        <div className="strength-bar-bg">
                          <div className="strength-bar" style={{ width:`${strength.pct}%`,background:strength.color }} />
                        </div>
                        {/* Requirements */}
                        <div style={{ marginTop:'10px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px 12px' }}>
                          {reqs.map((r, i) => (
                            <div key={i} className={`req-item ${r.ok ? 'ok' : ''}`}>
                              <span className="req-dot" />
                              <span style={{ fontSize:'0.74rem' }}>{r.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div style={{ marginBottom:'24px' }}>
                    <label htmlFor="fp-confirm" style={{ display:'block',marginBottom:'7px',fontSize:'0.78rem',fontWeight:600,color:'rgba(148,163,184,0.7)',letterSpacing:'0.04em' }}>
                      CONFIRM PASSWORD
                    </label>
                    <div className="fp-input-wrap">
                      <span className="fp-input-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'15px',height:'15px' }}>
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </span>
                      <input
                        id="fp-confirm"
                        type={showConf ? 'text' : 'password'}
                        className={`fp-input pwd-input ${pwMatch ? 'match' : ''} ${pwNoMatch ? 'no-match' : ''}`}
                        placeholder="Confirm new password"
                        value={confirmPw}
                        onChange={e => { setConfirmPw(e.target.value); setErrorMsg(''); }}
                        autoComplete="new-password"
                        required
                        disabled={isSubmitting}
                      />
                      <button type="button" className="fp-eye-btn" onClick={() => setShowConf(p => !p)} tabIndex={-1}>
                        {showConf ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    {pwMatch && (
                      <p style={{ margin:'6px 0 0',fontSize:'0.76rem',color:'#22C55E',display:'flex',alignItems:'center',gap:'5px' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:'12px',height:'12px' }}><polyline points="20 6 9 17 4 12"/></svg>
                        Passwords match
                      </p>
                    )}
                    {pwNoMatch && (
                      <p style={{ margin:'6px 0 0',fontSize:'0.76rem',color:'#EF4444',display:'flex',alignItems:'center',gap:'5px' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:'12px',height:'12px' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Passwords do not match
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="fp-btn"
                    disabled={isSubmitting || !allReqsMet || !pwMatch}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="fp-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                        </svg>
                        Updating Password…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:'16px',height:'16px' }}>
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Update Password
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>

          <p style={{ marginTop:'18px',fontSize:'0.72rem',color:'rgba(100,116,139,0.6)',letterSpacing:'0.04em',textAlign:'center' }}>
            Secured connection · Enterprise SCADA Platform
          </p>
        </div>
      </div>
    </>
  );
}
