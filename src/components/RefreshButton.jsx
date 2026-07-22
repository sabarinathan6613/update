import React from 'react';

export function RefreshToast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`refresh-toast refresh-toast-${toast.type}`}>
      <span className="refresh-toast-icon">
        {toast.type === 'success' ? '✓' : '✗'}
      </span>
      <span className="refresh-toast-msg">{toast.message}</span>
    </div>
  );
}

export default function RefreshButton({ isRefreshing, onClick, id, toast }) {
  return (
    <>
      <button
        id={id || "refresh-btn"}
        className={`btn-refresh${isRefreshing ? ' refreshing' : ''}`}
        onClick={onClick}
        disabled={isRefreshing}
        title="Refresh — fetch latest data from the database"
      >
        <svg
          className="refresh-icon"
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M1 4c1-2.5 4-4 7-3.5A7 7 0 0115 8" />
          <path d="M15 12c-1 2.5-4 4-7 3.5A7 7 0 011 8" />
          <polyline points="1,1 1,4 4,4" />
          <polyline points="15,15 15,12 12,12" />
        </svg>
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
      <RefreshToast toast={toast} />
    </>
  );
}
