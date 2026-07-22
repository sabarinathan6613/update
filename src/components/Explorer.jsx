// src/components/Explorer.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getTagConfigs, getSettings, discoverDatabaseStructure, getDatabaseTableStats } from '../utils/db';
import { useSimulator } from '../utils/SimulatorContext';
import { getSupabaseClient } from '../utils/supabaseClient';
import { useRefresh } from '../utils/useRefresh';
import RefreshButton from './RefreshButton';
import { getRawRows, getLatestRecord } from '../utils/historianService';
import { formatTimestampToPlantTime, toLocalInput, parseTimestampToMs } from '../utils/timeService';

/* ─────────────────────────────────────────────
   Inline styles (scoped to this component)
   ───────────────────────────────────────────── */
const S = {
  /* Layout root */
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 0,
    fontFamily: 'inherit',
  },

  /* ── Page header ─────────────────────────── */
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--surface-raised)',
    flexWrap: 'wrap',
    gap: '10px',
    flexShrink: 0,
  },
  pageHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tableBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 10px',
    borderRadius: '20px',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(37, 99, 235, 0.2)',
    color: 'var(--secondary)',
    fontSize: '0.72rem',
    fontFamily: 'var(--mono)',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  recordBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 10px',
    borderRadius: '20px',
    background: 'rgba(15, 23, 42, 0.04)',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: '0.72rem',
    fontFamily: 'var(--mono)',
  },
  exportRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  /* ── Body (left + right panels) ──────────── */
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },

  /* ── LEFT PANEL ──────────────────────────── */
  leftPanel: {
    width: '260px',
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--surface)',
  },
  leftPanelHeader: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    flexShrink: 0,
  },
  leftPanelTitle: {
    margin: 0,
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
  },
  leftPanelScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  schemaTable: {
    display: 'flex',
    flexDirection: 'column',
  },
  schemaTableHeader: {
    padding: '6px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    borderRadius: '4px',
    margin: '0 6px',
    cursor: 'default',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(37,99,235,0.15)',
  },
  schemaTableName: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: 'var(--text)',
    fontFamily: 'var(--mono)',
  },
  schemaColumnList: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: '2px',
  },
  schemaColumnRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 14px 4px 24px',
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    borderLeft: '1px solid transparent',
    transition: 'background 0.15s',
  },
  schemaColIcon: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  schemaColName: {
    fontFamily: 'var(--mono)',
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
  },
  schemaColType: {
    marginLeft: 'auto',
    fontSize: '0.62rem',
    color: 'var(--text-dim)',
    fontFamily: 'var(--mono)',
  },
  schemaEmptyState: {
    padding: '20px 14px',
    textAlign: 'center',
  },

  /* ── RIGHT PANEL ──────────────────────────── */
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },

  /* Filter bar */
  filterBar: {
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    flexShrink: 0,
    background: 'var(--surface-raised)',
  },
  filterLabel: {
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  filterDivider: {
    width: '1px',
    height: '20px',
    background: 'var(--border)',
    flexShrink: 0,
  },
  filterInput: {
    padding: '5px 10px 5px 28px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '0.78rem',
    outline: 'none',
    width: '170px',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  filterSelect: {
    padding: '5px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '0.78rem',
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  filterDate: {
    padding: '5px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '0.76rem',
    outline: 'none',
    fontFamily: 'inherit',
    colorScheme: 'light',
    transition: 'border-color 0.2s',
  },

  /* Auto-refresh toggle pill */
  togglePill: (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '20px',
    border: `1px solid ${active ? 'rgba(37, 99, 235, 0.3)' : 'var(--border)'}`,
    background: active ? 'var(--accent-dim)' : 'var(--surface-raised)',
    color: active ? 'var(--secondary)' : 'var(--text-muted)',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  }),
  toggleDot: (active) => ({
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: active ? 'var(--secondary)' : 'var(--border)',
    boxShadow: active ? '0 0 6px var(--secondary)' : 'none',
    transition: 'all 0.2s',
  }),

  /* Table wrapper */
  tableWrapper: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'auto',
    minHeight: 0,
  },
  stickyTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.78rem',
  },
  stickyThead: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--surface-raised)',
  },
  th: (sortable, isActive) => ({
    padding: '9px 12px',
    textAlign: 'left',
    fontSize: '0.66rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: isActive ? 'var(--secondary)' : 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    cursor: sortable ? 'pointer' : 'default',
    userSelect: 'none',
    background: 'var(--surface-raised)',
    transition: 'color 0.15s',
  }),
  thRight: {
    textAlign: 'right',
  },
  sortArrow: {
    marginLeft: '4px',
    fontSize: '0.6rem',
    opacity: 0.9,
  },
  td: {
    padding: '7px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    verticalAlign: 'middle',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  tdMono: {
    fontFamily: 'var(--mono)',
    fontSize: '0.74rem',
  },
  tdRight: {
    textAlign: 'right',
  },

  /* Quality badge */
  qBadgeGood: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '10px',
    background: 'rgba(0,230,118,0.12)',
    border: '1px solid rgba(0,230,118,0.25)',
    color: 'var(--success, #00e676)',
    fontSize: '0.66rem',
    fontWeight: 700,
    fontFamily: 'var(--mono)',
  },
  qBadgeBad: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '10px',
    background: 'rgba(255,82,82,0.12)',
    border: '1px solid rgba(255,82,82,0.25)',
    color: 'var(--error, #ff5252)',
    fontSize: '0.66rem',
    fontWeight: 700,
    fontFamily: 'var(--mono)',
  },
  markerBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '10px',
    background: 'rgba(255,193,7,0.1)',
    border: '1px solid rgba(255,193,7,0.2)',
    color: 'var(--warning, #ffc107)',
    fontSize: '0.65rem',
    fontFamily: 'var(--mono)',
  },
  tagIndexChip: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '10px',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(37,99,235,0.15)',
    color: 'var(--secondary)',
    fontSize: '0.67rem',
    fontWeight: 700,
    fontFamily: 'var(--mono)',
  },

  /* Empty / Loading states */
  centeredState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: '10px',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  spinnerRing: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '2px solid rgba(37,99,235,0.1)',
    borderTopColor: 'var(--secondary)',
    animation: 'explorerSpin 0.8s linear infinite',
  },

  /* Pagination bar */
  paginationBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
    background: 'var(--surface-raised)',
  },
  pageBtn: (disabled) => ({
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: disabled ? 'transparent' : 'var(--surface)',
    color: disabled ? 'var(--text-dim)' : 'var(--text-muted)',
    fontSize: '0.75rem',
    cursor: disabled ? 'default' : 'pointer',
    pointerEvents: disabled ? 'none' : 'auto',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  }),
  pageIndicator: {
    padding: '4px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(37,99,235,0.2)',
    color: 'var(--secondary)',
    fontSize: '0.72rem',
    fontFamily: 'var(--mono)',
    fontWeight: 700,
  },

  /* Small export buttons */
  smBtn: {
    padding: '5px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    fontSize: '0.72rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
};

/* ─────────────────────────────────────────────
   Schema column definitions (static metadata)
   ───────────────────────────────────────────── */
const SCHEMA_COLUMNS = [
  { name: 'DateAndTime', type: 'TIMESTAMP', isPk: true,  color: '#00f0ff' },
  { name: 'Millitm',    type: 'INT',       isPk: false, color: '#a78bfa' },
  { name: 'TagIndex',   type: 'INT',       isPk: true,  color: '#00f0ff' },
  { name: 'Val',        type: 'FLOAT8',    isPk: false, color: '#6ee7b7' },
  { name: 'Status',     type: 'INT',       isPk: false, color: '#fcd34d' },
  { name: 'Marker',     type: 'VARCHAR',   isPk: false, color: '#f9a8d4' },
];

/* ─────────────────────────────────────────────
   Sort arrow helper
   ───────────────────────────────────────────── */
function SortArrow({ field, sortField, sortDirection }) {
  if (sortField !== field) return <span style={{ ...S.sortArrow, opacity: 0.2 }}>⇅</span>;
  return <span style={S.sortArrow}>{sortDirection === 'asc' ? '▲' : '▼'}</span>;
}

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */
export default function Explorer({ isActive }) {
  const { refreshTrigger, currentPlantId, chartStart, chartEnd } = useSimulator();

  // ── State ──────────────────────────────────
  const [data, setData]               = useState([]);
  const [tagConfigs, setTagConfigs]   = useState([]);
  const [dbTable, setDbTable]         = useState('Database');
  const [discoveredTables, setDiscoveredTables] = useState([]);
  const discoveredTablesRef = useRef(discoveredTables);
  useEffect(() => {
    discoveredTablesRef.current = discoveredTables;
  }, [discoveredTables]);
  const [settings, setSettings]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [dbStats, setDbStats]         = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [selectedTag, setSelectedTag]         = useState('all');
  const [selectedStatus, setSelectedStatus]   = useState('all');
  const [limit, setLimit]                     = useState(500);
  const [searchQuery, setSearchQuery]         = useState('');
  const [autoRefresh, setAutoRefresh]         = useState(true);

  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter]     = useState('');

  const [currentPage, setCurrentPage]         = useState(1);
  const [filteredTotalCount, setFilteredTotalCount] = useState(0);
  const [sortField, setSortField]             = useState('DateAndTime');
  const [sortDirection, setSortDirection]     = useState('desc');
  const itemsPerPage = 50;

  // Align Explorer time filter state with centralized time range
  useEffect(() => {
    if (chartStart) setStartDateFilter(toLocalInput(new Date(chartStart)));
    if (chartEnd) setEndDateFilter(toLocalInput(new Date(chartEnd)));
  }, [chartStart, chartEnd]);

  // ── Load config & discover structure dynamically ──
  useEffect(() => {
    if (!isActive) return;
    const loadConfigAndTable = async () => {
      const configs = await getTagConfigs();
      setTagConfigs(configs.sort((a, b) => a.TagIndex - b.TagIndex));
      
      const s = await getSettings();
      setSettings(s);
      
      const activeTbl = s.selectedTable || 'Database';
      setDbTable(activeTbl);
      
      console.info("[Explorer] Running database auto-discovery scan...");
      const dbStructure = await discoverDatabaseStructure();
      if (dbStructure && dbStructure.public && dbStructure.public.tables) {
        console.info(`[Explorer] Discovery complete. Found ${dbStructure.public.tables.length} public tables.`);
        setDiscoveredTables(dbStructure.public.tables);
      } else {
        console.warn("[Explorer] Dynamic schema discovery returned empty. Falling back to default schema config.");
        setDiscoveredTables([{
          name: activeTbl,
          schema: 'public',
          recordCount: 0,
          primaryKey: 'id',
          columns: SCHEMA_COLUMNS
        }]);
      }
    };
    loadConfigAndTable();
  }, [refreshTrigger, isActive]);

  // Update selected table count and metadata dynamically when active table changes
  const hasNoDiscoveredTables = discoveredTables.length === 0;
  useEffect(() => {
    if (!isActive || !dbTable) return;
    const updateSelectedTableMetadata = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        // 1. Get live count
        const { count, error: countErr } = await supabase
          .from(dbTable)
          .select('*', { count: 'exact', head: true });
        
        let countVal = 0;
        if (!countErr && count !== null) {
          countVal = count;
        } else if (countErr) {
          console.error(`[Explorer] Row count query failed for '${dbTable}':`, countErr);
        }

        // 2. Get latest timestamp
        let lastTimestamp = null;
        const currentTblObj = discoveredTablesRef.current.find(t => t.name === dbTable);
        const cols = currentTblObj ? currentTblObj.columns : [];
        const tsCol = cols.find(c => ['DateAndTime', 'timestamp', 'created_at', 'generated_at', 'last_modified', 'updated_at'].includes(c.name))?.name;
        
        if (tsCol) {
          const { data: latestRow, error: tsErr } = await supabase
            .from(dbTable)
            .select(tsCol)
            .order(tsCol, { ascending: false })
            .limit(1);
          
          if (tsErr) {
            console.error(`[Explorer] Last record timestamp query failed for '${dbTable}' on column '${tsCol}':`, tsErr);
          } else if (latestRow && latestRow.length > 0) {
            lastTimestamp = latestRow[0][tsCol];
          }
        }

        setDiscoveredTables(prev => prev.map(t => 
          t.name === dbTable ? { ...t, recordCount: countVal, lastRecordTimestamp: lastTimestamp } : t
        ));
      } catch (err) {
        console.error(`[Explorer] Exception fetching live metadata for '${dbTable}':`, err);
      }
    };
    updateSelectedTableMetadata();
  }, [dbTable, refreshTrigger, hasNoDiscoveredTables, isActive]);

  // Fetch detailed TagIndex statistics when Database table is selected
  useEffect(() => {
    if (!isActive) return;
    if (dbTable !== 'Database') {
      const timer = setTimeout(() => {
        setDbStats(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const fetchStats = async () => {
        setLoadingStats(true);
        try {
          const stats = await getDatabaseTableStats();
          setDbStats(stats);
        } catch (err) {
          console.error("[Explorer] Failed to fetch Database table stats:", err);
        } finally {
          setLoadingStats(false);
        }
      };
      fetchStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [dbTable, refreshTrigger, isActive]);

  const activeTableObj = useMemo(() => {
    return discoveredTables.find(t => t.name === dbTable);
  }, [discoveredTables, dbTable]);

  const activeColumns = useMemo(() => {
    return activeTableObj ? activeTableObj.columns : SCHEMA_COLUMNS;
  }, [activeTableObj]);

  // ── Fetch historian data ────────────────────
  const fetchTableData = useCallback(async (isManual = false) => {
    const rangeFrom = (currentPage - 1) * itemsPerPage;
    const rangeTo = rangeFrom + itemsPerPage - 1;
    
    const needsLoader = data.length === 0 || isManual;
    if (needsLoader) {
      setLoading(true);
    }
    try {
      const supabase = getSupabaseClient();
      const settings = await getSettings();
      const mappings = settings?.columnMappings || {};
      const isAlarmInt = settings?.selectedTable === 'Database';
      const tagCol = mappings.tagCol || 'TagIndex';
      const tsCol = mappings.timestampCol || 'DateAndTime';
      
      let targetIndexes = undefined;
      if (selectedTag !== 'all') {
        const parsedTagIndex = /^\d+$/.test(selectedTag) ? parseInt(selectedTag, 10) : selectedTag;
        targetIndexes = [parsedTagIndex];
      }
      
      const startISO = startDateFilter ? new Date(startDateFilter).toISOString() : null;
      const endISO = endDateFilter ? new Date(endDateFilter).toISOString() : null;
      
      // 1. Fetch exact count of filtered records server-side via lightweight HEAD select count query
      let countQuery = supabase.from(dbTable).select('*', { count: 'exact', head: true });
      if (targetIndexes && targetIndexes.length > 0) {
        // Resolve T0/0 string/numeric targets
        const uniqueIndexes = [];
        targetIndexes.forEach(idx => {
          const str = String(idx).trim();
          uniqueIndexes.push(idx);
          uniqueIndexes.push(str);
          uniqueIndexes.push(`T${str}`);
          uniqueIndexes.push(`t${str}`);
          if (!isNaN(idx)) uniqueIndexes.push(parseInt(str, 10));
        });
        const finalIndexes = [...new Set(uniqueIndexes)].filter(Boolean);
        countQuery = countQuery.in(tagCol, finalIndexes);
      }
      
      // Parse timezone separator
      if (startISO) {
        const separator = startISO.includes('T') ? 'T' : ' ';
        const plantTz = settings?.plantTimezone || settings?.timezone || 'Asia/Kolkata';
        const formattedStart = startISO; // formatToDbTimestamp isn't exported directly, we can use the raw timestamp
        countQuery = countQuery.gte(tsCol, formattedStart);
      }
      if (endISO) {
        const formattedEnd = endISO;
        countQuery = countQuery.lte(tsCol, formattedEnd);
      }
      
      const { count: filteredCount, error: countErr } = await countQuery;
      if (!countErr && filteredCount !== null) {
        setFilteredTotalCount(filteredCount);
      } else {
        setFilteredTotalCount(activeTableObj?.recordCount || 0);
      }
      
      // 2. Fetch page results
      const result = await getRawRows(
        supabase,
        dbTable,
        targetIndexes,
        startISO,
        endISO,
        null, // limit
        'desc',
        mappings,
        isAlarmInt,
        settings,
        rangeFrom,
        rangeTo
      );
      setData(result);
    } catch (err) {
      console.error('Failed to query historian data in Explorer:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dbTable, selectedTag, startDateFilter, endDateFilter, currentPage, itemsPerPage]);

  const { isRefreshing, refreshToast, handleRefresh } = useRefresh(() => fetchTableData(true), 'Explorer');

  useEffect(() => {
    if (isActive) {
      fetchTableData(false).catch(() => {});
    }
  }, [fetchTableData, refreshTrigger, currentPage, isActive]);

  // ── Tag map ────────────────────────────────
  const tagMap = useMemo(() => {
    const map = {};
    tagConfigs.forEach(c => { map[c.TagIndex] = c; });
    return map;
  }, [tagConfigs]);

  // ── Process data ───────────────────────────
  const processedData = useMemo(() => {
    let result = [...data];
    if (selectedStatus !== 'all') {
      const targetStatus = parseInt(selectedStatus);
      result = result.filter(r => r.Status === targetStatus);
    }
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(r => {
        const tagMeta  = tagMap[r.TagIndex] || {};
        const tagName  = tagMeta.TagName ? tagMeta.TagName.toLowerCase() : '';
        const tagIdx   = `tag ${r.TagIndex}`;
        const valStr   = r.Val !== undefined ? r.Val.toString() : '';
        const statStr  = r.Status !== undefined ? r.Status.toString() : '';
        const marker   = r.Marker ? r.Marker.toLowerCase() : '';
        const timeStr  = r.DateAndTime ? r.DateAndTime.toLowerCase() : '';
        return tagName.includes(query) || tagIdx.includes(query) ||
               valStr.includes(query)  || statStr.includes(query) ||
               marker.includes(query)  || timeStr.includes(query);
      });
    }
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === 'TagName') {
        aVal = (tagMap[a.TagIndex]?.TagName || `Tag ${a.TagIndex}`).toLowerCase();
        bVal = (tagMap[b.TagIndex]?.TagName || `Tag ${b.TagIndex}`).toLowerCase();
      }
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (sortField === 'DateAndTime') {
        aVal = parseTimestampToMs(aVal);
        bVal = parseTimestampToMs(bVal);
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ?  1 : -1;
      return 0;
    });
    return result;
  }, [data, selectedStatus, searchQuery, sortField, sortDirection, tagMap]);

  // ── Pagination ─────────────────────────────
  const totalPages   = Math.max(1, Math.ceil(filteredTotalCount / itemsPerPage));
  const paginatedData = useMemo(() => {
    return processedData;
  }, [processedData]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  // ── Sorting ────────────────────────────────
  const handleSort = (field) => {
    if (sortField === field) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
    setCurrentPage(1);
  };

  // ── CSV Export ─────────────────────────────
  const handleExportCSV = () => {
    if (processedData.length === 0) { alert('No rows available to export.'); return; }
    const headers = ['DateAndTime','Millitm','TagIndex','TagName','Value','Unit','Marker'];
    const csvRows = [headers.join(',')];
    processedData.forEach(row => {
      const meta = tagMap[row.TagIndex] || {};
      csvRows.push([
        `"${row.DateAndTime}"`, row.Millitm, row.TagIndex,
        `"${(meta.TagName || `Tag ${row.TagIndex}`).replace(/"/g,'""')}"`,
        row.Val, `"${(meta.Unit || '').replace(/"/g,'""')}"`,
        `"${(row.Marker || '').replace(/"/g,'""')}"`
      ].join(','));
    });
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csvRows.join('\n'));
    link.download = `historian_${dbTable}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // ── Excel Export ───────────────────────────
  const handleExportExcel = () => {
    if (processedData.length === 0) { alert('No rows available to export.'); return; }
    const headers = ['Date & Time','Millitm (ms)','Tag Index','Equipment Name','Value','Unit','Marker'];
    const rows = [headers.join('\t')];
    processedData.forEach(row => {
      const meta = tagMap[row.TagIndex] || {};
      rows.push([
        row.DateAndTime, row.Millitm, row.TagIndex,
        meta.TagName || `Tag ${row.TagIndex}`, row.Val, meta.Unit || '',
        row.Marker || ''
      ].join('\t'));
    });
    const link = document.createElement('a');
    link.href = 'data:application/vnd.ms-excel;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    link.download = `historian_${dbTable}_${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // ── Helpers ────────────────────────────────
  const fmtTime = (raw) => {
    return formatTimestampToPlantTime(raw, currentPlantId);
  };

  const isConnected = useMemo(() => {
    void refreshTrigger;
    return !!getSupabaseClient();
  }, [refreshTrigger]);

  /* ────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────── */
  return (
    <div style={S.root}>

      {/* ── Keyframes injected once ── */}
      <style>{`
        @keyframes explorerSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .exp-filter-input:focus  { border-color: var(--secondary) !important; }
        .exp-filter-select:focus { border-color: var(--secondary) !important; }
        .exp-filter-date:focus   { border-color: var(--secondary) !important; }
        .exp-tr:hover td         { background: var(--primary-hover); }
        .exp-sm-btn:hover        { border-color: var(--secondary) !important; color: var(--secondary) !important; background: var(--accent-dim) !important; }
        .exp-page-btn:hover:not([disabled]) { border-color: var(--secondary); color: var(--secondary); background: var(--accent-dim); }
        .exp-schema-col:hover    { background: var(--primary-hover); }
        .exp-toggle:hover        { opacity: 0.9; }
      `}</style>

      {/* ══════════════════════════════════════
          PAGE HEADER
          ══════════════════════════════════════ */}
      <div style={S.pageHeader}>
        <div style={S.pageHeaderLeft}>
          {/* Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <h2 style={S.pageTitle}>Database Explorer</h2>
          <span style={S.tableBadge}>
            <span style={{ opacity: 0.5 }}>⬡</span>
            {dbTable}
          </span>
          <span style={S.recordBadge}>
            {processedData.length.toLocaleString()} records
            {data.length >= limit ? ` (top ${limit.toLocaleString()})` : ''}
          </span>
        </div>

        <div style={{ ...S.exportRow, gap: '8px', display: 'flex', alignItems: 'center' }}>
          <RefreshButton isRefreshing={isRefreshing} onClick={handleRefresh} toast={refreshToast} id="refresh-btn-explorer" />
          <button className="exp-sm-btn" style={S.smBtn} onClick={handleExportCSV} title="Export to CSV">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button className="exp-sm-btn" style={S.smBtn} onClick={handleExportExcel} title="Export to Excel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
          BODY  (left + right)
          ══════════════════════════════════════ */}
      <div style={S.body}>

        {/* ── LEFT PANEL: Schema Tree ───────── */}
        <div style={S.leftPanel}>
          <div style={S.leftPanelHeader}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span style={S.leftPanelTitle}>Database</span>
          </div>

          <div style={S.leftPanelScroll}>
            {!isConnected ? (
              <div style={S.schemaEmptyState}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '10px' }}>
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
                </svg>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  No database connected.<br/>Configure connection in<br/>Cloud DB &amp; Sync.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {discoveredTables.filter(tbl => tbl.name === dbTable).map(tbl => {
                  const isSelected = tbl.name === dbTable;
                  return (
                    <div key={tbl.name} style={S.schemaTable}>
                      {/* Table Header / Selector */}
                      <div
                        onClick={() => {
                          setDbTable(tbl.name);
                          setCurrentPage(1);
                          const defaultSort = tbl.columns && tbl.columns.length > 0 
                            ? (tbl.columns.find(c => c.isPk)?.name || tbl.columns[0].name)
                            : 'DateAndTime';
                          setSortField(defaultSort);
                          setSortDirection('desc');
                        }}
                        style={{
                          ...S.schemaTableHeader,
                          cursor: 'pointer',
                          background: isSelected ? 'var(--accent-dim)' : 'transparent',
                          border: isSelected ? '1px solid rgba(37,99,235,0.25)' : '1px solid transparent',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          margin: '0 6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isSelected ? "var(--secondary)" : "var(--text-muted)"} strokeWidth="1.8">
                            <rect x="3" y="3" width="18" height="18" rx="1"/>
                            <line x1="3" y1="9" x2="21" y2="9"/>
                            <line x1="3" y1="15" x2="21" y2="15"/>
                            <line x1="9" y1="3" x2="9" y2="21"/>
                          </svg>
                          <span style={{ ...S.schemaTableName, color: isSelected ? 'var(--text)' : 'var(--text-muted)' }}>{tbl.name}</span>
                        </div>
                        {tbl.recordCount !== undefined && (
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {tbl.recordCount}
                          </span>
                        )}
                      </div>

                      {/* Column list */}
                      {isSelected && (
                        <div style={S.schemaColumnList}>
                          {activeColumns.map(col => (
                            <div key={col.name} className="exp-schema-col" style={S.schemaColumnRow}>
                              <span style={{ ...S.schemaColIcon, background: col.isPk ? '#00f0ff' : '#6ee7b7', opacity: 0.7 }} />
                              <span style={S.schemaColName}>{col.name}</span>
                              {col.isPk && (
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2.5" title="Primary key" style={{ opacity: 0.7 }}>
                                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                                </svg>
                              )}
                              <span style={S.schemaColType}>{col.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* TagIndex → TagName resolved from configs */}
                {tagConfigs.length > 0 && (
                  <div>
                    <div style={{ padding: '10px 14px 4px', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 700 }}>
                      Tag Config Map
                    </div>
                    {tagConfigs.slice(0, 12).map(tag => (
                      <div key={tag.TagIndex} className="exp-schema-col" style={{ ...S.schemaColumnRow, paddingLeft: '24px' }}>
                        <span style={{ ...S.schemaColIcon, background: '#10B981', opacity: 0.6 }} />
                        <span style={{ ...S.schemaColName, color: 'var(--text-muted)' }}>
                          [{tag.TagIndex}] {tag.TagName}
                        </span>
                        {tag.Unit && <span style={{ ...S.schemaColType }}>{tag.Unit}</span>}
                      </div>
                    ))}
                    {tagConfigs.length > 12 && (
                      <div style={{ padding: '4px 24px 8px', fontSize: '0.65rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        +{tagConfigs.length - 12} more tags…
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Filter Bar + Table ── */}
        <div style={S.rightPanel}>

          {/* Filter bar */}
          <div style={S.filterBar}>
            {/* Search */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', opacity: 0.35, fontSize: '0.75rem', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                className="exp-filter-input"
                style={S.filterInput}
                placeholder="Search tag, value, marker…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <div style={S.filterDivider} />

            {/* Tag filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={S.filterLabel}>Tag</span>
              <select
                className="exp-filter-select"
                style={S.filterSelect}
                value={selectedTag}
                onChange={e => { setSelectedTag(e.target.value); setCurrentPage(1); }}
              >
                <option value="all">All Tags</option>
                {tagConfigs.map(tag => (
                  <option key={tag.TagIndex} value={tag.TagIndex}>
                    [{tag.TagIndex}] {tag.TagName}{tag.Unit ? ` (${tag.Unit})` : ''}
                  </option>
                ))}
              </select>
            </div>


            <div style={S.filterDivider} />

            {/* Date range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={S.filterLabel}>From</span>
              <input
                type="datetime-local"
                className="exp-filter-date"
                style={S.filterDate}
                value={startDateFilter}
                onChange={e => { setStartDateFilter(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={S.filterLabel}>To</span>
              <input
                type="datetime-local"
                className="exp-filter-date"
                style={S.filterDate}
                value={endDateFilter}
                onChange={e => { setEndDateFilter(e.target.value); setCurrentPage(1); }}
              />
            </div>
            {(startDateFilter || endDateFilter) && (
              <button
                style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.7rem', cursor: 'pointer', padding: '0 2px', fontWeight: 600 }}
                onClick={() => { setStartDateFilter(''); setEndDateFilter(''); setCurrentPage(1); }}
              >
                ✕ Clear
              </button>
            )}

            <div style={S.filterDivider} />

            {/* Row limit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={S.filterLabel}>Limit</span>
              <select
                className="exp-filter-select"
                style={S.filterSelect}
                value={limit}
                onChange={e => { setLimit(parseInt(e.target.value)); setCurrentPage(1); }}
              >
                <option value="100">100</option>
                <option value="500">500</option>
                <option value="1000">1,000</option>
                <option value="5000">5,000</option>
              </select>
            </div>

            <div style={S.filterDivider} />

            {/* Auto-refresh toggle */}
            <div
              className="exp-toggle"
              style={S.togglePill(autoRefresh)}
              onClick={() => setAutoRefresh(prev => !prev)}
              title="Toggle live auto-refresh"
            >
              <span style={S.toggleDot(autoRefresh)} />
              {autoRefresh ? 'Live' : 'Paused'}
            </div>
          </div>

          {/* Table metadata strip */}
          {activeTableObj && (
            <div style={{
              padding: '10px 16px',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: '24px',
              fontSize: '0.76rem',
              color: 'var(--text-muted)',
              flexShrink: 0
            }}>
              <div>
                <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>Table:</span>
                <strong style={{ color: 'var(--text)' }}>{activeTableObj.name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>Row Count:</span>
                <strong style={{ color: 'var(--text)' }}>{activeTableObj.recordCount !== undefined ? activeTableObj.recordCount.toLocaleString() : '0'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>Columns:</span>
                <strong style={{ color: 'var(--text)' }}>{activeColumns.length} fields</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>Primary Key:</span>
                <strong style={{ color: 'var(--secondary)', fontFamily: 'var(--mono)' }}>🔑 {activeTableObj.primaryKey || 'id'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', marginRight: '6px' }}>Last Record:</span>
                <strong style={{ color: 'var(--text)' }}>
                  {activeTableObj.lastRecordTimestamp ? fmtTime(activeTableObj.lastRecordTimestamp) : 'No records'}
                </strong>
              </div>
            </div>
          )}

          {/* Detailed Statistics Panel for Database Table */}
          {dbTable === 'Database' && dbStats && (
            <div style={{
              margin: '12px 16px 4px 16px',
              padding: '12px 16px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <h4 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📊 Historian Tag Statistics
                </h4>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Latest Entry: <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{dbStats.latestTimestamp ? fmtTime(dbStats.latestTimestamp) : 'N/A'}</strong>
                </div>
              </div>
              
              {loadingStats ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.72rem', padding: '6px 0' }}>
                  <div style={{ ...S.spinnerRing, width: '12px', height: '12px', borderWidth: '1px' }} />
                  Calculating tag telemetry stats...
                </div>
              ) : dbStats.tagStats && dbStats.tagStats.length === 0 ? (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', padding: '6px 0' }}>
                  No tag configurations detected or telemetry data written.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '8px',
                  maxHeight: '175px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}>
                  {dbStats.tagStats.map(stat => {
                    const tagDp = tagConfigs.find(tc => tc.TagIndex === stat.TagIndex)?.DecimalPlaces ?? 2;
                    return (
                      <div key={stat.TagIndex} style={{
                        padding: '8px 10px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={S.tagIndexChip}>T{stat.TagIndex}</span>
                          <strong style={{ fontSize: '0.7rem', color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '130px' }} title={stat.TagName}>
                            {stat.TagName}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Value</span>
                          <strong style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontFamily: 'var(--mono)' }}>
                            {stat.LatestValue !== null && stat.LatestValue !== undefined 
                              ? `${stat.LatestValue.toFixed(tagDp)} ${stat.Unit}`.trim()
                              : '—'
                            }
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Count</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{stat.RecordCount.toLocaleString()}</span>
                        </div>
                        {stat.LatestTime && (
                          <div style={{ fontSize: '0.56rem', color: 'var(--text-dim)', textAlign: 'right', marginTop: '1px', fontFamily: 'var(--mono)' }}>
                            {new Date(stat.LatestTime).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Data table ─────────────────────── */}
          <div style={S.tableWrapper}>
            {loading && data.length === 0 ? (
              <div style={S.centeredState}>
                <div style={S.spinnerRing} />
                <span style={{ fontSize: '0.82rem' }}>Scanning historian table…</span>
              </div>
            ) : processedData.length === 0 ? (
              <div style={S.centeredState}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>No records are available for the selected time range.</p>
              </div>
            ) : (
              <table style={S.stickyTable}>
                <thead style={S.stickyThead}>
                  <tr>
                    {activeColumns.map(col => (
                      <th
                        key={col.name}
                        style={col.name === 'Val' || (settings?.columnMappings && col.name === settings.columnMappings.valueCol) ? { ...S.th(true, sortField === col.name), ...S.thRight } : S.th(true, sortField === col.name)}
                        onClick={() => handleSort(col.name)}
                      >
                        {col.name} <SortArrow field={col.name} sortField={sortField} sortDirection={sortDirection} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, idx) => {
                    const isMainHistorian = dbTable === 'Database' || dbTable === (settings?.selectedTable);
                    return (
                      <tr key={idx} className="exp-tr">
                        {activeColumns.map(col => {
                          const val = row[col.name];
                          
                          // Resolve translated fields for the main historian table
                          let displayVal = val;
                          if (isMainHistorian && settings?.columnMappings) {
                            const mappings = settings.columnMappings;
                            if (col.name === mappings.timestampCol) displayVal = row.DateAndTime;
                            else if (col.name === mappings.tagCol) displayVal = row.TagIndex;
                            else if (col.name === mappings.valueCol) displayVal = row.Val;
                            else if (col.name === mappings.statusCol) displayVal = row.Status;
                            else if (col.name === mappings.alarmCol) displayVal = row.Marker;
                          }

                          let renderedEl;
                          const isTagCol = col.name === 'TagIndex' || (settings?.columnMappings && col.name === settings.columnMappings.tagCol);
                          const isStatusCol = col.name === 'Status' || (settings?.columnMappings && col.name === settings.columnMappings.statusCol);
                          const isAlarmCol = col.name === 'Marker' || (settings?.columnMappings && col.name === settings.columnMappings.alarmCol);
                          const isTimeCol = col.name === 'DateAndTime' || (settings?.columnMappings && col.name === settings.columnMappings.timestampCol);

                          if (isMainHistorian && isTagCol) {
                            const meta = tagMap[displayVal] || {};
                            const tagName = meta.TagName || `Tag ${displayVal}`;
                            renderedEl = (
                              <span style={S.tagIndexChip} title={tagName}>
                                T{displayVal}
                              </span>
                            );
                          } else if (isMainHistorian && isStatusCol) {
                            renderedEl = (
                              <span style={S.tdMono}>{displayVal}</span>
                            );
                          } else if (isMainHistorian && isAlarmCol) {
                            renderedEl = displayVal ? (
                              <span style={S.markerBadge}>{displayVal}</span>
                            ) : (
                              <span style={{ opacity: 0.12 }}>—</span>
                            );
                          } else if (isTimeCol) {
                            renderedEl = <span style={S.tdMono}>{fmtTime(displayVal)}</span>;
                          } else if (typeof displayVal === 'number') {
                            const isValueCol = col.name === 'Val' || (settings?.columnMappings && col.name === settings.columnMappings.valueCol);
                            if (isMainHistorian && isValueCol) {
                              const tagIdx = row.TagIndex;
                              const meta = tagMap[tagIdx] || {};
                              const dp = meta.DecimalPlaces !== undefined ? meta.DecimalPlaces : 2;
                              renderedEl = <span style={{ ...S.tdMono, fontWeight: 700, color: 'var(--text)' }}>{displayVal.toFixed(dp)}</span>;
                            } else {
                              renderedEl = <span style={S.tdMono}>{displayVal}</span>;
                            }
                          } else {
                            renderedEl = <span>{displayVal !== undefined && displayVal !== null ? String(displayVal) : '—'}</span>;
                          }

                          return (
                            <td
                              key={col.name}
                              style={
                                col.name === 'Val' || (settings?.columnMappings && col.name === settings.columnMappings.valueCol)
                                  ? { ...S.td, ...S.tdRight }
                                  : S.td
                              }
                            >
                              {renderedEl}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination bar ─────────────────── */}
          {filteredTotalCount > 0 && (
            <div style={S.paginationBar}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {Math.min(filteredTotalCount, (currentPage - 1) * itemsPerPage + 1)}–
                {Math.min(filteredTotalCount, currentPage * itemsPerPage)} / {filteredTotalCount.toLocaleString()} rows
              </span>

              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <button className="exp-page-btn" style={S.pageBtn(currentPage === 1)} onClick={() => handlePageChange(1)} disabled={currentPage === 1}>«</button>
                <button className="exp-page-btn" style={S.pageBtn(currentPage === 1)} onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>Prev</button>
                <span style={S.pageIndicator}>{currentPage} / {totalPages}</span>
                <button className="exp-page-btn" style={S.pageBtn(currentPage === totalPages)} onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
                <button className="exp-page-btn" style={S.pageBtn(currentPage === totalPages)} onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>{/* end rightPanel */}
      </div>{/* end body */}
    </div>
  );
}
