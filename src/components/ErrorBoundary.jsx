import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[Runtime Crash Diagnostic]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetConfig = () => {
    if (confirm("Are you sure you want to reset the configuration? This will clear all local database credentials and cached settings.")) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
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
            maxWidth: '640px',
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
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#F1F5F9', margin: 0 }}>System Diagnostic Alert</h2>
            </div>

            <p style={{ color: '#7C9DBF', fontSize: '0.9rem', marginBottom: '24px', lineHeight: '1.6' }}>
              An unexpected runtime error has occurred in the application module. The interface has been halted to prevent data corruption or inconsistent UI states.
            </p>

            <div style={{
              backgroundColor: '#040810',
              border: '1px solid #162238',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              boxSizing: 'border-box'
            }}>
              <div style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#EF4444',
                marginBottom: '8px',
                fontFamily: 'monospace',
                wordBreak: 'break-all'
              }}>
                Error: {this.state.error ? this.state.error.toString() : 'Unknown runtime crash'}
              </div>
              {this.state.errorInfo && (
                <pre style={{
                  fontSize: '0.75rem',
                  color: '#4A6480',
                  margin: 0,
                  overflowX: 'auto',
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: '1.5',
                  maxHeight: '200px'
                }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#2563EB'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#3B82F6'}
              >
                Reload Application
              </button>
              <button
                onClick={this.handleResetConfig}
                style={{
                  backgroundColor: '#121E35',
                  color: '#F1F5F9',
                  border: '1px solid #1E2D4A',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background-color 0.15s'
                }}
                onMouseOver={(e) => {
                  e.target.style.borderColor = '#3B82F6';
                  e.target.style.backgroundColor = '#131D35';
                }}
                onMouseOut={(e) => {
                  e.target.style.borderColor = '#1E2D4A';
                  e.target.style.backgroundColor = '#121E35';
                }}
              >
                Reset Configuration
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
