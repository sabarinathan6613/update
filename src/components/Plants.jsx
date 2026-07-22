// src/components/Plants.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { getPlants, savePlant, getProductionHistory } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';
import { useRefresh } from '../utils/useRefresh';
import RefreshButton from './RefreshButton';

export default function Plants() {
  const { refreshTrigger } = useSimulator();
  const [plantsList, setPlantsList] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [showModal, setShowModal] = useState(false);
  
  // Edit Plant Form State
  const [editPlantObj, setEditPlantObj] = useState({
    id: "",
    name: "",
    location: "",
    capacity: "",
    targetOee: ""
  });

  const fetchPlantData = useCallback(async () => {
    const plist = await getPlants();
    setPlantsList(plist);

    const history = await getProductionHistory("all");
    setHistoryData(history);
  }, []);

  const { isRefreshing, refreshToast, handleRefresh } = useRefresh(fetchPlantData, 'Plants');

  useEffect(() => {
    fetchPlantData().catch(() => {});
  }, [fetchPlantData, refreshTrigger]);

  // Aggregate stats for each plant dynamically
  const plantStatsList = useMemo(() => {
    return plantsList.map(plant => {
      const plantHistory = historyData.filter(h => h.plantId === plant.id);
      
      let totalProd = 0;
      let totalRejects = 0;
      let totalUptime = 0;
      let totalRecords = 0;
      let status = 'RUNNING';

      if (plantHistory.length > 0) {
        // Look at the latest reading for status
        const latest = plantHistory[0];
        if (latest.downtimeReason) {
          status = 'STOPPED';
        } else if (latest.oee < 75) {
          status = 'WARNING';
        }

        // Take today's records (or latest 24 hours) for summary
        const latestDate = plantHistory[0].date;
        const todayRecs = plantHistory.filter(h => h.date === latestDate);
        
        todayRecs.forEach(r => {
          totalProd += r.actualParts;
          totalRejects += r.rejectParts;
          totalUptime += r.uptimeMinutes;
          totalRecords++;
        });
      }

      const avgUptime = totalRecords > 0 ? (totalUptime / (totalRecords * 60)) * 100 : 0;
      const rejectRate = (totalProd + totalRejects) > 0 ? (totalRejects / (totalProd + totalRejects)) * 100 : 0;
      const oee = avgUptime * 0.01 * (1 - rejectRate * 0.01) * 100;

      return {
        ...plant,
        status,
        todayYield: totalProd,
        todayRejects: totalRejects,
        calculatedOee: plantHistory.length > 0 ? parseFloat(oee.toFixed(1)) : null,
        avgUptime: plantHistory.length > 0 ? parseFloat(avgUptime.toFixed(1)) : null
      };
    });
  }, [plantsList, historyData]);

  const handleOpenEdit = (plant = null) => {
    if (plant) {
      setEditPlantObj(plant);
    } else {
      setEditPlantObj({
        id: "",
        name: "",
        location: "",
        capacity: "",
        targetOee: ""
      });
    }
    setShowModal(true);
  };

  const handleSavePlant = async (e) => {
    e.preventDefault();
    if (!editPlantObj.name || !editPlantObj.location) return;
    
    const target = { ...editPlantObj };
    if (!target.id) {
      target.id = "plant-" + Date.now();
    }

    await savePlant(target);
    setShowModal(false);
    await fetchPlantData();
    alert("Plant configuration saved successfully.");
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── Page Header ─────────────────────── */}
      <div className="page-header" style={{ marginBottom: '8px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Multi-Plant Operations Directory</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Monitor operating status, target OEE levels, and production capacities across distributed nodes.
          </p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <RefreshButton
            isRefreshing={isRefreshing}
            onClick={handleRefresh}
            toast={refreshToast}
            id="refresh-btn-plants"
          />
          <button onClick={() => handleOpenEdit(null)} className="btn btn-primary">
            ➕ Add Node / Plant
          </button>
        </div>
      </div>

      {/* Plants Grid Directory */}
      <div className="grid-3">
        {plantStatsList.map((plant, idx) => (
          <div className="card" key={idx} style={{ borderTop: `4px solid ${
            plant.status === 'RUNNING' ? 'var(--success)' : 
            plant.status === 'WARNING' ? 'var(--warning)' : 'var(--error)'
          }` }}>
            
            <div className="flex justify-between items-start" style={{ marginBottom: '12px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--text)' }}>{plant.name}</strong>
                <span className="text-xs text-muted">📍 {plant.location}</span>
              </div>
              <span className={`badge ${
                plant.status === 'RUNNING' ? 'badge-success' : 
                plant.status === 'WARNING' ? 'badge-warning' : 'badge-error'
              }`}>
                {plant.status}
              </span>
            </div>

            {/* Plant Health Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem', marginBottom: '16px' }}>
              <div className="flex justify-between">
                <span className="text-muted">Live OEE Rating:</span>
                <strong style={{ color: plant.calculatedOee !== null && plant.calculatedOee >= plant.targetOee ? 'var(--success)' : 'var(--warning)' }}>
                  {plant.calculatedOee !== null ? plant.calculatedOee + '%' : 'No data'} <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 'normal' }}>(Target: {plant.targetOee}%)</span>
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Node Uptime rate:</span>
                <strong style={{ color: 'var(--text)' }}>{plant.avgUptime !== null ? plant.avgUptime + '%' : 'No data'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Daily Good Yield:</span>
                <strong style={{ color: 'var(--text)' }}>{plant.todayYield.toLocaleString()} parts</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Daily Rejection Parts:</span>
                <strong style={{ color: plant.todayRejects > 25 ? 'var(--error)' : 'var(--text)' }}>{plant.todayRejects.toLocaleString()} parts</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Target Capacity:</span>
                <strong style={{ color: 'var(--text)' }}>{plant.capacity.toLocaleString()} / day</strong>
              </div>
            </div>

            {/* Operations Progress Bar */}
            <div style={{ marginBottom: '16px' }}>
              <div className="flex justify-between text-xs text-muted" style={{ marginBottom: '4px' }}>
                <span>Daily Target Completion</span>
                <span>{((plant.todayYield / plant.capacity) * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${Math.min(100, (plant.todayYield / plant.capacity) * 100)}%`, 
                  backgroundColor: 'var(--secondary)' 
                }} />
              </div>
            </div>

            <button onClick={() => handleOpenEdit(plant)} className="btn btn-secondary text-xs" style={{ width: '100%', padding: '6px' }}>
              ⚙️ Configure Node Settings
            </button>

          </div>
        ))}
      </div>

      {/* Multi-Plant Health Comparison Dash panel */}
      <div className="card" style={{ padding: '24px' }}>
        <h4 style={{ marginBottom: '14px', fontSize: '0.95rem' }}>📊 Multi-Node OEE Comparison Dashboard</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {plantStatsList.map((p, idx) => (
            <div key={idx} style={{
              display: 'grid',
              gridTemplateColumns: '150px 1fr 80px',
              alignItems: 'center',
              gap: '16px'
            }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{p.name}</strong>
              <div style={{ height: '10px', backgroundColor: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: p.calculatedOee !== null ? `${p.calculatedOee}%` : '0%',
                  backgroundColor: p.calculatedOee !== null && p.calculatedOee >= p.targetOee ? 'var(--success)' : 'var(--warning)',
                  borderRadius: '5px'
                }} />
              </div>
              <span className="font-mono text-xs text-right" style={{ color: 'var(--text)', fontWeight: 700 }}>
                {p.calculatedOee !== null ? p.calculatedOee + '% OEE' : 'No data'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Configure Plant Modal popup */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '440px' }}>
            <div className="drawer-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.1rem' }}>
                {editPlantObj.id ? "⚙️ Configure Node Settings" : "🏭 Register New Plant Node"}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            
            <form onSubmit={handleSavePlant} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="plant-name">Plant / Node Name</label>
                <input
                  id="plant-name"
                  type="text"
                  className="form-control"
                  placeholder="Enter plant name"
                  value={editPlantObj.name}
                  onChange={(e) => setEditPlantObj({ ...editPlantObj, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="plant-location">Location Address</label>
                <input
                  id="plant-location"
                  type="text"
                  className="form-control"
                  placeholder="Enter location"
                  value={editPlantObj.location}
                  onChange={(e) => setEditPlantObj({ ...editPlantObj, location: e.target.value })}
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="plant-capacity">Daily Parts capacity</label>
                  <input
                    id="plant-capacity"
                    type="number"
                    className="form-control"
                    value={editPlantObj.capacity}
                    onChange={(e) => setEditPlantObj({ ...editPlantObj, capacity: parseInt(e.target.value) || "" })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="plant-oee">Target OEE (%)</label>
                  <input
                    id="plant-oee"
                    type="number"
                    className="form-control"
                    value={editPlantObj.targetOee}
                    onChange={(e) => setEditPlantObj({ ...editPlantObj, targetOee: parseInt(e.target.value) || "" })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Save Node Config</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
