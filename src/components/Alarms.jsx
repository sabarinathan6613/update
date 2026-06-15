// src/components/Alarms.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { getPlants } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Alarms() {
  const { currentPlantId, syncTrigger } = useSimulator();
  const [activeTab, setActiveTab] = useState('active'); // active, history, analytics
  const [historyData, setHistoryData] = useState([]);
  const [plantsList, setPlantsList] = useState([]);

  const [activeAlarms, setActiveAlarms] = useState([]);

  // Load plants list
  useEffect(() => {
    const loadAlarmData = async () => {
      const plist = await getPlants();
      setPlantsList(plist);
    };
    loadAlarmData();
  }, [currentPlantId, syncTrigger]);

  // Filter alarms based on current active plant selection in Layout
  const filteredActiveAlarms = useMemo(() => {
    return activeAlarms.filter(a => a.plantId === currentPlantId && !a.acknowledged);
  }, [activeAlarms, currentPlantId]);

  const filteredHistoryAlarms = useMemo(() => {
    return historyData.filter(a => a.plantId === currentPlantId);
  }, [historyData, currentPlantId]);

  // Acknowledge alarm handler
  const handleAcknowledge = (id) => {
    setActiveAlarms(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, acknowledged: true };
      }
      return a;
    }));
    alert("Alarm acknowledged and silenced.");
  };

  // Alarm Analytics calculations
  const analyticsData = useMemo(() => {
    const data = {
      criticalCount: activeAlarms.filter(a => a.severity === 'CRITICAL').length + historyData.filter(h => h.severity === 'CRITICAL').length,
      warningCount: activeAlarms.filter(a => a.severity === 'WARNING').length + historyData.filter(h => h.severity === 'WARNING').length,
      infoCount: activeAlarms.filter(a => a.severity === 'INFO').length + historyData.filter(h => h.severity === 'INFO').length,
      causes: {}
    };

    // Aggregate causes
    activeAlarms.forEach(a => {
      data.causes[a.reason] = (data.causes[a.reason] || 0) + 1;
    });
    historyData.forEach(h => {
      data.causes[h.reason] = (data.causes[h.reason] || 0) + 1;
    });

    return data;
  }, [activeAlarms, historyData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Sub navigation tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '16px', marginBottom: '8px' }} className="no-print">
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'active' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'active' ? 600 : 500,
            borderBottom: activeTab === 'active' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          🚨 Active Alarms ({filteredActiveAlarms.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'history' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'history' ? 600 : 500,
            borderBottom: activeTab === 'history' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          📁 Historical Alarm Log ({filteredHistoryAlarms.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'analytics' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'analytics' ? 600 : 500,
            borderBottom: activeTab === 'analytics' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          📊 Alarm Analytics & Pareto
        </button>
      </div>

      {/* 1. Active Alarms view */}
      {activeTab === 'active' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '6px', fontSize: '1.1rem', color: 'white' }}>🚨 Active Alarm Annunciator Panel</h3>
          <p className="text-xs text-muted" style={{ marginBottom: '16px' }}>Current unacknowledged stops or parameter deviations requiring supervisor verification.</p>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Incident Trigger Time</th>
                  <th>Alarm Tag / Message</th>
                  <th>Plant Location Node</th>
                  <th>Action Trigger</th>
                </tr>
              </thead>
              <tbody>
                {filteredActiveAlarms.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                      No active alarm conditions detected on this plant node. All nodes operational.
                    </td>
                  </tr>
                ) : (
                  filteredActiveAlarms.map((alarm, idx) => (
                    <tr key={idx} style={{ animation: 'pulse-red 2s infinite' }}>
                      <td>
                        <span className={`badge ${
                          alarm.severity === 'CRITICAL' ? 'severity-critical' : 
                          alarm.severity === 'WARNING' ? 'severity-warning' : 'severity-info'
                        }`} style={{ padding: '4px 8px', fontSize: '0.68rem', borderRadius: '4px' }}>
                          ⚠️ {alarm.severity}
                        </span>
                      </td>
                      <td className="font-mono text-xs" style={{ color: 'white' }}>{alarm.time}</td>
                      <td className="font-semibold" style={{ color: 'white' }}>{alarm.reason}</td>
                      <td>{plantsList.find(p => p.id === alarm.plantId)?.name}</td>
                      <td>
                        <button onClick={() => handleAcknowledge(alarm.id)} className="btn btn-primary text-xs" style={{ padding: '4px 8px' }}>
                          ✓ Acknowledge
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Historical Alarm Log view */}
      {activeTab === 'history' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '6px', fontSize: '1.1rem', color: 'white' }}>📁 Alarm Archive History Logs</h3>
          <p className="text-xs text-muted" style={{ marginBottom: '16px' }}>Audited history of downtime incidents, register codes, and resolutions.</p>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Incident Time</th>
                  <th>Severity</th>
                  <th>Downtime Alarm Description</th>
                  <th>Active Shift</th>
                  <th>Duration (Mins)</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryAlarms.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No alarm records stored in database history for this plant.
                    </td>
                  </tr>
                ) : (
                  filteredHistoryAlarms.map((alarm, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-xs">{alarm.timestamp.replace('T', ' ').substring(0, 16)}</td>
                      <td>
                        <span className={`badge ${alarm.severity === 'CRITICAL' ? 'severity-critical' : 'severity-warning'}`}>
                          {alarm.severity}
                        </span>
                      </td>
                      <td className="font-semibold" style={{ color: 'var(--text)' }}>{alarm.reason}</td>
                      <td>{alarm.shift}</td>
                      <td className="font-mono text-xs">-{alarm.duration} mins</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Alarm Analytics & Pareto chart */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid-2">
            
            {/* Severity Distribution */}
            <div className="card" style={{ padding: '20px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '12px' }}>
                Incident Severity Distribution
              </span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <div>
                  <div className="flex justify-between text-xs" style={{ marginBottom: '4px' }}>
                    <span>Critical Incidents</span>
                    <strong style={{ color: 'var(--error)' }}>{analyticsData.criticalCount}</strong>
                  </div>
                  <div style={{ height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (analyticsData.criticalCount / 10) * 100)}%`, backgroundColor: 'var(--error)' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs" style={{ marginBottom: '4px' }}>
                    <span>Warnings flagged</span>
                    <strong style={{ color: 'var(--warning)' }}>{analyticsData.warningCount}</strong>
                  </div>
                  <div style={{ height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (analyticsData.warningCount / 10) * 100)}%`, backgroundColor: 'var(--warning)' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs" style={{ marginBottom: '4px' }}>
                    <span>Information notices</span>
                    <strong style={{ color: 'var(--secondary)' }}>{analyticsData.infoCount}</strong>
                  </div>
                  <div style={{ height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (analyticsData.infoCount / 10) * 100)}%`, backgroundColor: 'var(--secondary)' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Pareto analysis of top alarm causes */}
            <div className="card" style={{ padding: '20px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '12px' }}>
                Top Alarm Causes (Frequency Chart)
              </span>
              
              <div style={{ height: '140px', position: 'relative' }}>
                {Object.keys(analyticsData.causes).length > 0 ? (
                  <svg viewBox="0 0 350 140" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    {Object.keys(analyticsData.causes).slice(0, 4).map((cause, idx) => {
                      const count = analyticsData.causes[cause];
                      const height = Math.min(100, (count / 15) * 110);
                      const x = idx * 80 + 20;
                      const y = 120 - height;
                      return (
                        <g key={idx}>
                          <rect
                            x={x}
                            y={y}
                            width="40"
                            height={height}
                            fill={idx === 0 ? 'var(--error)' : 'var(--warning)'}
                            rx="3"
                          />
                          <text x={x + 20} y={135} fill="var(--text-muted)" fontSize="8" textAnchor="middle">
                            {cause.substring(0, 10)}...
                          </text>
                          <text x={x + 20} y={y - 6} fill="white" fontSize="9" fontWeight="bold" textAnchor="middle">
                            {count}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    Calculating Pareto distribution...
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
