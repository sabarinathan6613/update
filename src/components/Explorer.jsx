// src/components/Explorer.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { getHistorianData, getTagConfigs, getSettings } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';

export default function Explorer() {
  const { syncTrigger, isNetworkOnline } = useSimulator();
  
  // State variables
  const [data, setData] = useState([]);
  const [tagConfigs, setTagConfigs] = useState([]);
  const [dbTable, setDbTable] = useState('Database');
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [selectedTag, setSelectedTag] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [limit, setLimit] = useState(500);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Date Range Pickers (Start & End)
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  
  // Table Pagination/Sorting States
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('DateAndTime');
  const [sortDirection, setSortDirection] = useState('desc');
  const itemsPerPage = 50;

  // Load configuration and data
  useEffect(() => {
    const loadConfigAndTable = async () => {
      const configs = await getTagConfigs();
      setTagConfigs(configs.sort((a, b) => a.TagIndex - b.TagIndex));

      const settings = await getSettings();
      setDbTable(settings.selectedTable || 'Database');
    };
    loadConfigAndTable();
  }, []);

  // Fetch historian data with date boundaries and selected tag constraints
  useEffect(() => {
    const fetchTableData = async () => {
      if (!autoRefresh && data.length > 0) return;
      
      setLoading(true);
      try {
        const queryParams = { limit };
        if (selectedTag !== 'all') {
          queryParams.tagIndexes = [parseInt(selectedTag)];
        }
        if (startDateFilter) {
          queryParams.startDate = new Date(startDateFilter).toISOString();
        }
        if (endDateFilter) {
          queryParams.endDate = new Date(endDateFilter).toISOString();
        }
        
        const result = await getHistorianData(queryParams);
        setData(result);
      } catch (err) {
        console.error("Failed to query historian data in Explorer:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTableData();
  }, [selectedTag, limit, startDateFilter, endDateFilter, autoRefresh, syncTrigger]);

  // Create tag configs dictionary for O(1) lookup
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => {
      map[c.TagIndex] = c;
    });
    return map;
  }, [tagConfigs]);

  // Process data: filter, search, and sort client-side
  const processedData = useMemo(() => {
    let result = [...data];

    // Status filter
    if (selectedStatus !== 'all') {
      const targetStatus = parseInt(selectedStatus);
      result = result.filter(r => r.Status === targetStatus);
    }

    // Search query filter (fuzzy search on tag display name, tag index, value, or marker)
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(r => {
        const tagMeta = tagMap[r.TagIndex] || {};
        const tagName = tagMeta.TagName ? tagMeta.TagName.toLowerCase() : '';
        const tagIdxStr = `tag ${r.TagIndex}`;
        const valStr = r.Val !== undefined ? r.Val.toString() : '';
        const statusStr = r.Status !== undefined ? r.Status.toString() : '';
        const markerStr = r.Marker ? r.Marker.toLowerCase() : '';
        const timeStr = r.DateAndTime ? r.DateAndTime.toLowerCase() : '';
        
        return tagName.includes(query) ||
               tagIdxStr.includes(query) ||
               valStr.includes(query) ||
               statusStr.includes(query) ||
               markerStr.includes(query) ||
               timeStr.includes(query);
      });
    }

    // Sorting
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Custom tag name sorting
      if (sortField === 'TagName') {
        aVal = (tagMap[a.TagIndex]?.TagName || `Tag ${a.TagIndex}`).toLowerCase();
        bVal = (tagMap[b.TagIndex]?.TagName || `Tag ${b.TagIndex}`).toLowerCase();
      }

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (sortField === 'DateAndTime') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, selectedStatus, searchQuery, sortField, sortDirection, tagMap]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(processedData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const page = currentPage > totalPages ? 1 : currentPage;
    const startIdx = (page - 1) * itemsPerPage;
    return processedData.slice(startIdx, startIdx + itemsPerPage);
  }, [processedData, currentPage, totalPages]);

  // Handle page change
  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Toggle Sorting column
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  // Export filtered rows to CSV
  const handleExportCSV = () => {
    if (processedData.length === 0) {
      alert("No rows available to export.");
      return;
    }

    const headers = ["DateAndTime", "Millitm", "TagIndex", "TagName", "Value", "Unit", "Status", "Marker"];
    const csvRows = [headers.join(",")];

    processedData.forEach(row => {
      const tagMeta = tagMap[row.TagIndex] || {};
      const name = tagMeta.TagName || `Tag ${row.TagIndex}`;
      const unit = tagMeta.Unit || '';
      
      const values = [
        `"${row.DateAndTime}"`,
        row.Millitm,
        row.TagIndex,
        `"${name.replace(/"/g, '""')}"`,
        row.Val,
        `"${unit.replace(/"/g, '""')}"`,
        row.Status,
        `"${(row.Marker || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(values.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `skadomation_historian_${dbTable}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export filtered rows to Excel (Tab-Separated XLS format)
  const handleExportExcel = () => {
    if (processedData.length === 0) {
      alert("No rows available to export.");
      return;
    }

    const headers = ["Date & Time", "Millitm (ms)", "Tag Index", "Tag Name", "Value", "Unit", "Quality Status", "Marker"];
    const rows = [headers.join("\t")];

    processedData.forEach(row => {
      const tagMeta = tagMap[row.TagIndex] || {};
      const name = tagMeta.TagName || `Tag ${row.TagIndex}`;
      const unit = tagMeta.Unit || '';
      
      const values = [
        row.DateAndTime,
        row.Millitm,
        row.TagIndex,
        name,
        row.Val,
        unit,
        row.Status === 192 ? 'Good (192)' : `Bad (${row.Status})`,
        row.Marker || ''
      ];
      rows.push(values.join("\t"));
    });

    const excelContent = "data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent(rows.join("\n"));
    const link = document.createElement("a");
    link.setAttribute("href", excelContent);
    link.setAttribute("download", `skadomation_historian_${dbTable}_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stats summaries
  const stats = useMemo(() => {
    if (processedData.length === 0) return { goodPct: 100, minVal: 0, maxVal: 0 };
    
    let goodCount = 0;
    let min = Infinity;
    let max = -Infinity;

    processedData.forEach(r => {
      if (r.Status === 192) goodCount++;
      if (r.Val < min) min = r.Val;
      if (r.Val > max) max = r.Val;
    });

    return {
      goodPct: parseFloat(((goodCount / processedData.length) * 100).toFixed(1)),
      minVal: min === Infinity ? 0 : min,
      maxVal: max === -Infinity ? 0 : max
    };
  }, [processedData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. Header Information Panel */}
      <div className="card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'white' }}>📁 Real-Time SQL Historian Explorer</h3>
          <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
            Connected Database: <strong style={{ color: 'var(--secondary)' }}>{isNetworkOnline ? 'SUPABASE CLOUD' : 'LOCAL CACHE'}</strong> | Schema: <strong style={{ color: 'white' }}>public</strong> | Table: <strong style={{ color: 'var(--secondary)', fontFamily: 'var(--mono)' }}>{dbTable}</strong>
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
            <span style={{ fontSize: '0.65rem', display: 'block', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Quality Index</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: stats.goodPct > 95 ? 'var(--success)' : stats.goodPct > 80 ? 'var(--warning)' : 'var(--error)' }}>
              {stats.goodPct}% Good
            </span>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
            <span style={{ fontSize: '0.65rem', display: 'block', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Min / Max Range</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', fontFamily: 'var(--mono)' }}>
              {stats.minVal} / {stats.maxVal}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Query Configuration & Filter Panel */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr', gap: '20px', alignItems: 'start' }} className="explorer-filters-grid">
            
            {/* Left Column: Telemetry Selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔍 TELEMETRY SIGNALS</span>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Filter by Tag Name</label>
                <select 
                  className="form-control" 
                  value={selectedTag} 
                  onChange={(e) => { setSelectedTag(e.target.value); setCurrentPage(1); }}
                  style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                >
                  <option value="all">All Tags (1 - 37)</option>
                  {tagConfigs.map(tag => (
                    <option key={tag.TagIndex} value={tag.TagIndex}>
                      Tag {tag.TagIndex}: {tag.TagName} {tag.Unit ? `(${tag.Unit})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Filter by Status Quality</label>
                <select 
                  className="form-control" 
                  value={selectedStatus} 
                  onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                  style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                >
                  <option value="all">All Quality Codes</option>
                  <option value="192">Good Quality (192)</option>
                  <option value="0">Bad Quality (0)</option>
                </select>
              </div>
            </div>

            {/* Center Column: Time Range filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 20px' }} className="explorer-time-col">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>⏱️ TIME BOUNDARIES</span>
                {(startDateFilter || endDateFilter) && (
                  <button
                    type="button"
                    onClick={() => { setStartDateFilter(''); setEndDateFilter(''); setCurrentPage(1); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--error)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Start Date/Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={startDateFilter}
                  onChange={(e) => { setStartDateFilter(e.target.value); setCurrentPage(1); }}
                  style={{ padding: '7px 10px', fontSize: '0.8rem' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>End Date/Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={endDateFilter}
                  onChange={(e) => { setEndDateFilter(e.target.value); setCurrentPage(1); }}
                  style={{ padding: '7px 10px', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            {/* Right Column: Search & Limit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚙️ RESOLUTION & SEARCH</span>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Fuzzy Text Filter</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search value, marker, tag..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    style={{ padding: '8px 10px 8px 28px', fontSize: '0.82rem' }}
                  />
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', opacity: 0.5 }}>🔍</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Scan Row Limit</label>
                <select 
                  className="form-control" 
                  value={limit} 
                  onChange={(e) => { setLimit(parseInt(e.target.value)); setCurrentPage(1); }}
                  style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                >
                  <option value="100">Top 100 rows</option>
                  <option value="500">Top 500 rows</option>
                  <option value="1000">Top 1,000 rows</option>
                  <option value="5000">Top 5,000 rows</option>
                </select>
              </div>
            </div>

          </div>

          {/* Bottom Row Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: '4px' }}>
            <button 
              onClick={() => setAutoRefresh(prev => !prev)}
              className="btn btn-secondary text-xs"
              style={{ 
                padding: '8px 14px', 
                borderColor: autoRefresh ? 'var(--secondary)' : 'var(--border)',
                backgroundColor: autoRefresh ? 'rgba(0, 240, 255, 0.05)' : 'transparent',
                color: autoRefresh ? 'var(--secondary)' : 'white'
              }}
              title="Toggle Live Stream Auto-Refresh"
            >
              {autoRefresh ? '⏱️ Polling Active' : '⏸️ Stream Paused'}
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleExportCSV}
                className="btn btn-secondary text-xs"
                style={{ padding: '8px 14px' }}
              >
                Download CSV
              </button>

              <button 
                onClick={handleExportExcel}
                className="btn btn-primary text-xs"
                style={{ padding: '8px 14px' }}
                title="Export filtered records to MS Excel"
              >
                Export Excel (.xls)
              </button>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .explorer-filters-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .explorer-time-col {
            border-left: none !important;
            border-right: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* 3. Raw Time-Series Grid Table */}
      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {loading && data.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid rgba(0, 240, 255, 0.1)',
              borderTopColor: 'var(--secondary)',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px'
            }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>SCANNING HISTORIAN TELEMETRY TABLE...</span>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : processedData.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>🔍</span>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'white' }}>No historian records match the query criteria.</p>
            <p className="text-xs text-muted" style={{ marginTop: '4px' }}>
              Verify query filters or check that the simulator is pushing data.
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive" style={{ minHeight: '300px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('DateAndTime')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Date & Time {sortField === 'DateAndTime' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => handleSort('Millitm')} style={{ cursor: 'pointer', userSelect: 'none', width: '80px' }}>
                      Milli {sortField === 'Millitm' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => handleSort('TagIndex')} style={{ cursor: 'pointer', userSelect: 'none', width: '90px' }}>
                      Index {sortField === 'TagIndex' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => handleSort('TagName')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Tag Name {sortField === 'TagName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => handleSort('Val')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>
                      Value {sortField === 'Val' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ width: '80px' }}>Unit</th>
                    <th onClick={() => handleSort('Status')} style={{ cursor: 'pointer', userSelect: 'none', width: '100px' }}>
                      Quality {sortField === 'Status' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => handleSort('Marker')} style={{ cursor: 'pointer', userSelect: 'none', width: '90px' }}>
                      Marker {sortField === 'Marker' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, idx) => {
                    const tagMeta = tagMap[row.TagIndex] || {};
                    const tagName = tagMeta.TagName || `Tag Index ${row.TagIndex}`;
                    const decimalPlaces = tagMeta.DecimalPlaces !== undefined ? tagMeta.DecimalPlaces : 2;
                    const valFormatted = row.Val !== undefined && row.Val !== null 
                      ? row.Val.toFixed(decimalPlaces) 
                      : '-';
                    const timeObj = new Date(row.DateAndTime);
                    const formattedTime = isNaN(timeObj.getTime()) 
                      ? row.DateAndTime 
                      : timeObj.toLocaleDateString() + ' ' + timeObj.toLocaleTimeString();

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td className="font-mono text-xs" style={{ color: 'white' }}>{formattedTime}</td>
                        <td className="font-mono text-xs text-muted">{row.Millitm}</td>
                        <td className="font-mono font-semibold" style={{ color: 'var(--secondary)' }}>Tag {row.TagIndex}</td>
                        <td style={{ color: 'white', fontWeight: 500 }}>{tagName}</td>
                        <td className="font-mono font-semibold" style={{ textAlign: 'right', color: 'white' }}>
                          {valFormatted}
                        </td>
                        <td className="font-mono text-xs text-muted">{tagMeta.Unit || '-'}</td>
                        <td>
                          <span className={`badge ${row.Status === 192 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.68rem', padding: '3px 6px' }}>
                            {row.Status === 192 ? 'Good (192)' : `Bad (${row.Status})`}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          {row.Marker ? (
                            <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '2px 5px' }}>
                              {row.Marker}
                            </span>
                          ) : (
                            <span style={{ opacity: 0.15 }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <span className="text-xs text-muted">
                Showing {Math.min(processedData.length, (currentPage - 1) * itemsPerPage + 1)}-
                {Math.min(processedData.length, currentPage * itemsPerPage)} of {processedData.length} records 
                {data.length >= limit ? ` (limited to top ${limit})` : ''}
              </span>
              
              <div style={{ display: 'flex', gap: '6px' }} className="no-print">
                <button 
                  onClick={() => handlePageChange(1)} 
                  disabled={currentPage === 1}
                  className="btn btn-secondary text-xs" 
                  style={{ padding: '6px 10px', minWidth: '32px', opacity: currentPage === 1 ? 0.3 : 1 }}
                >
                  «
                </button>
                <button 
                  onClick={() => handlePageChange(currentPage - 1)} 
                  disabled={currentPage === 1}
                  className="btn btn-secondary text-xs" 
                  style={{ padding: '6px 10px', opacity: currentPage === 1 ? 0.3 : 1 }}
                >
                  Prev
                </button>
                
                <span className="font-mono text-xs" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', color: 'white' }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button 
                  onClick={() => handlePageChange(currentPage + 1)} 
                  disabled={currentPage === totalPages}
                  className="btn btn-secondary text-xs" 
                  style={{ padding: '6px 10px', opacity: currentPage === totalPages ? 0.3 : 1 }}
                >
                  Next
                </button>
                <button 
                  onClick={() => handlePageChange(totalPages)} 
                  disabled={currentPage === totalPages}
                  className="btn btn-secondary text-xs" 
                  style={{ padding: '6px 10px', minWidth: '32px', opacity: currentPage === totalPages ? 0.3 : 1 }}
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
