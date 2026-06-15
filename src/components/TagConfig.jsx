// src/components/TagConfig.jsx
import React, { useState, useEffect } from 'react';
import { getTagConfigs, saveTagConfigs, getSettings, saveSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function TagConfig() {
  const { syncTrigger } = useSimulator();
  const [activeTab, setActiveTab] = useState('tags'); // tags, kpis
  const [tagConfigs, setTagConfigs] = useState([]);
  const [dashboardTags, setDashboardTags] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null);

  useEffect(() => {
    const loadConfigData = async () => {
      const configs = await getTagConfigs();
      setTagConfigs(configs.sort((a, b) => a.TagIndex - b.TagIndex));

      const settings = await getSettings();
      setDashboardTags(settings.dashboardTags || []);
    };
    loadConfigData();
  }, [syncTrigger]);

  const handleEditOpen = (tag) => {
    setEditingTag({ ...tag, isNew: false });
    setShowModal(true);
  };

  const handleAddNewOpen = () => {
    setEditingTag({
      TagIndex: '',
      TagName: '',
      Unit: '',
      Description: '',
      DecimalPlaces: 2,
      DashboardVisible: false,
      TrendsVisible: false,
      ReportsVisible: false,
      isNew: true
    });
    setShowModal(true);
  };

  const handleSaveTag = async (e) => {
    e.preventDefault();
    
    if (editingTag.isNew) {
      const indexNum = parseInt(editingTag.TagIndex);
      if (isNaN(indexNum)) {
        alert("Tag Index must be a valid number.");
        return;
      }
      if (tagConfigs.some(t => t.TagIndex === indexNum)) {
        alert(`Tag Index ${indexNum} is already configured. Please choose a unique Tag Index.`);
        return;
      }
      const newTag = {
        TagIndex: indexNum,
        TagName: editingTag.TagName,
        Unit: editingTag.Unit,
        Description: editingTag.Description,
        DecimalPlaces: editingTag.DecimalPlaces,
        DashboardVisible: editingTag.DashboardVisible,
        TrendsVisible: editingTag.TrendsVisible,
        ReportsVisible: editingTag.ReportsVisible
      };
      const updatedConfigs = [...tagConfigs, newTag].sort((a, b) => a.TagIndex - b.TagIndex);
      setTagConfigs(updatedConfigs);
      await saveTagConfigs(updatedConfigs);
      alert(`Tag configuration for Index ${newTag.TagIndex} created successfully.`);
    } else {
      const updatedConfigs = tagConfigs.map(t => t.TagIndex === editingTag.TagIndex ? editingTag : t);
      setTagConfigs(updatedConfigs);
      await saveTagConfigs(updatedConfigs);
      
      // Auto-remove tag from dashboardTags if it's no longer DashboardVisible
      if (!editingTag.DashboardVisible && dashboardTags.includes(editingTag.TagIndex)) {
        const updatedDashboardTags = dashboardTags.filter(id => id !== editingTag.TagIndex);
        setDashboardTags(updatedDashboardTags);
        const currentSettings = await getSettings();
        await saveSettings({
          ...currentSettings,
          dashboardTags: updatedDashboardTags
        });
      }
      alert(`Tag configurations for Index ${editingTag.TagIndex} updated successfully.`);
    }
    setShowModal(false);
  };

  const handleDeleteTag = async (tagIndex) => {
    if (!window.confirm(`Are you sure you want to delete the configuration for Tag Index ${tagIndex}?`)) {
      return;
    }
    const updatedConfigs = tagConfigs.filter(t => t.TagIndex !== tagIndex);
    setTagConfigs(updatedConfigs);
    await saveTagConfigs(updatedConfigs);

    // Auto-remove tag from dashboardTags
    if (dashboardTags.includes(tagIndex)) {
      const updatedDashboardTags = dashboardTags.filter(id => id !== tagIndex);
      setDashboardTags(updatedDashboardTags);
      const currentSettings = await getSettings();
      await saveSettings({
        ...currentSettings,
        dashboardTags: updatedDashboardTags
      });
    }
    alert(`Tag configuration for Index ${tagIndex} deleted successfully.`);
  };

  const handleKpiToggle = (tagIndex) => {
    if (dashboardTags.includes(tagIndex)) {
      setDashboardTags(prev => prev.filter(id => id !== tagIndex));
    } else {
      if (dashboardTags.length >= 5) {
        alert("You can select up to 5 TagIndexes for Dashboard display.");
        return;
      }
      setDashboardTags(prev => [...prev, tagIndex]);
    }
  };

  const handleSaveDashboardKpis = async () => {
    if (dashboardTags.length > 5) {
      alert(`Please select up to 5 TagIndexes. Currently selected: ${dashboardTags.length}`);
      return;
    }
    const currentSettings = await getSettings();
    await saveSettings({
      ...currentSettings,
      dashboardTags: dashboardTags
    });
    alert("Dashboard KPI selection saved successfully!");
  };

  // Filter tags eligible for dashboard KPI selection (must have DashboardVisible = true)
  const eligibleKpiTags = tagConfigs.filter(t => t.DashboardVisible);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Sub tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '16px', marginBottom: '8px' }} className="no-print">
        <button
          onClick={() => setActiveTab('tags')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'tags' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'tags' ? 600 : 500,
            borderBottom: activeTab === 'tags' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ⚙️ Tag Configuration Parameters
        </button>
        <button
          onClick={() => setActiveTab('kpis')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'kpis' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'kpis' ? 600 : 500,
            borderBottom: activeTab === 'kpis' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          📊 Dashboard KPI Card selection ({dashboardTags.filter(id => eligibleKpiTags.some(t => t.TagIndex === id)).length} / 5)
        </button>
      </div>

      {/* 1. Tag Configuration List Tab */}
      {activeTab === 'tags' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'white' }}>⚙️ Historian Data Tag Configuration</h3>
                <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
                  Define human-readable names, measurement units, descriptions, and visibility scopes (Dashboard, Trends, Reports) for TagIndex values.
                </p>
              </div>
              <button onClick={handleAddNewOpen} className="btn btn-primary">
                ➕ Configure New Tag
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            {tagConfigs.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '1rem', color: 'white', margin: '0 0 16px 0' }}>No tags configured. Please create tags in Tag Configuration.</p>
                <button onClick={handleAddNewOpen} className="btn btn-primary btn-sm" style={{ padding: '8px 14px' }}>
                  ➕ Configure New Tag
                </button>
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '450px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tag Index</th>
                      <th>Tag Name</th>
                      <th>Unit</th>
                      <th>Description</th>
                      <th>Decimal Places</th>
                      <th>Dashboard</th>
                      <th>Trends</th>
                      <th>Reports</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagConfigs.map((tag, idx) => (
                      <tr key={idx}>
                        <td className="font-mono font-semibold" style={{ color: 'var(--secondary)' }}>Tag {tag.TagIndex}</td>
                        <td style={{ color: 'white', fontWeight: 600 }}>{tag.TagName}</td>
                        <td className="font-mono text-xs">{tag.Unit || '-'}</td>
                        <td className="text-muted text-xs" style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tag.Description}>
                          {tag.Description || '-'}
                        </td>
                        <td className="font-mono">{tag.DecimalPlaces}</td>
                        <td>
                          <span className={`badge ${tag.DashboardVisible ? 'badge-success' : 'badge-secondary'}`} style={{ opacity: tag.DashboardVisible ? 1 : 0.4 }}>
                            {tag.DashboardVisible ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${tag.TrendsVisible ? 'badge-success' : 'badge-secondary'}`} style={{ opacity: tag.TrendsVisible ? 1 : 0.4 }}>
                            {tag.TrendsVisible ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${tag.ReportsVisible ? 'badge-success' : 'badge-secondary'}`} style={{ opacity: tag.ReportsVisible ? 1 : 0.4 }}>
                            {tag.ReportsVisible ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleEditOpen(tag)} className="btn btn-secondary text-xs" style={{ padding: '6px 10px' }}>
                              ✏️ Edit Config
                            </button>
                            <button onClick={() => handleDeleteTag(tag.TagIndex)} className="btn btn-secondary text-xs" style={{ padding: '6px 10px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                              🗑 Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Dashboard KPI Card selection Tab */}
      {activeTab === 'kpis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'white' }}>📊 Dashboard KPI Annunciator Settings</h3>
                <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
                  Select up to 5 tags (among those configured with Dashboard Visible = Yes) to display on the main dashboard.
                </p>
              </div>
              <button onClick={handleSaveDashboardKpis} className="btn btn-primary">
                💾 Save KPI Selection
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            {eligibleKpiTags.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '0.9rem', color: 'white', margin: 0 }}>No dashboard-visible tags found.</p>
                <p className="text-xs text-muted" style={{ marginTop: '4px' }}>
                  Go to "Tag Configuration Parameters" and set "Dashboard Visible = Yes" on at least one tag first.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {eligibleKpiTags.map((tag, idx) => {
                  const isSelected = dashboardTags.includes(tag.TagIndex);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleKpiToggle(tag.TagIndex)}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-sm)',
                        border: isSelected ? '2px solid var(--secondary)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'rgba(0, 240, 255, 0.05)' : 'var(--background)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <span className="font-mono text-xs text-muted" style={{ display: 'block' }}>TAG INDEX {tag.TagIndex}</span>
                        <strong style={{ color: 'white', fontSize: '0.9rem' }}>{tag.TagName}</strong>
                        {tag.Unit && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}> ({tag.Unit})</span>}
                      </div>
                      <span style={{ fontSize: '1.1rem', color: isSelected ? 'var(--secondary)' : 'rgba(255,255,255,0.1)' }}>
                        {isSelected ? '✓' : '○'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Config popup modal */}
      {showModal && editingTag && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '450px' }}>
            <div className="drawer-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>
                {editingTag.isNew ? '➕ Configure New Tag' : `✏️ Edit Configuration: Tag ${editingTag.TagIndex}`}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            
            <form onSubmit={handleSaveTag} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="tag-index-input">Tag Index</label>
                <input
                  id="tag-index-input"
                  type="number"
                  min="0"
                  className="form-control"
                  value={editingTag.TagIndex}
                  onChange={(e) => setEditingTag({ ...editingTag, TagIndex: e.target.value })}
                  disabled={!editingTag.isNew}
                  required
                  placeholder="e.g. 22"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="tag-name-input">Tag Name</label>
                <input
                  id="tag-name-input"
                  type="text"
                  className="form-control"
                  value={editingTag.TagName}
                  onChange={(e) => setEditingTag({ ...editingTag, TagName: e.target.value })}
                  required
                  placeholder="e.g. Temperature"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="tag-desc-input">Description</label>
                <textarea
                  id="tag-desc-input"
                  className="form-control"
                  rows="2"
                  value={editingTag.Description || ''}
                  onChange={(e) => setEditingTag({ ...editingTag, Description: e.target.value })}
                  placeholder="Describe the tag parameter..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="grid-2" style={{ gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="tag-unit">Measurement Unit</label>
                  <input
                    id="tag-unit"
                    type="text"
                    className="form-control"
                    placeholder="e.g. °C, bar, RPM"
                    value={editingTag.Unit}
                    onChange={(e) => setEditingTag({ ...editingTag, Unit: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="tag-decimals">Decimal Places</label>
                  <input
                    id="tag-decimals"
                    type="number"
                    min="0"
                    max="5"
                    className="form-control"
                    value={editingTag.DecimalPlaces}
                    onChange={(e) => setEditingTag({ ...editingTag, DecimalPlaces: parseInt(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              {/* Visibility options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '2px' }}>Visibility Settings</label>
                
                <div className="form-group" style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <input
                    id="tag-visible-dashboard"
                    type="checkbox"
                    checked={editingTag.DashboardVisible}
                    onChange={(e) => setEditingTag({ ...editingTag, DashboardVisible: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label className="form-label" htmlFor="tag-visible-dashboard" style={{ cursor: 'pointer', margin: 0, color: 'white', fontSize: '0.82rem' }}>
                    Dashboard Visible (Yes)
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <input
                    id="tag-visible-trends"
                    type="checkbox"
                    checked={editingTag.TrendsVisible}
                    onChange={(e) => setEditingTag({ ...editingTag, TrendsVisible: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label className="form-label" htmlFor="tag-visible-trends" style={{ cursor: 'pointer', margin: 0, color: 'white', fontSize: '0.82rem' }}>
                    Trends Visible (Yes)
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <input
                    id="tag-visible-reports"
                    type="checkbox"
                    checked={editingTag.ReportsVisible}
                    onChange={(e) => setEditingTag({ ...editingTag, ReportsVisible: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label className="form-label" htmlFor="tag-visible-reports" style={{ cursor: 'pointer', margin: 0, color: 'white', fontSize: '0.82rem' }}>
                    Reports Visible (Yes)
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Save Config</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
