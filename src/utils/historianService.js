// src/utils/historianService.js
import { getSupabaseClient } from './supabaseClient.js';

// Normalize a TagIndex to a comparable integer or string
export function normalizeTagIndex(v) {
  if (v === null || v === undefined) return v;
  const s = String(v).trim();
  if (/^[Tt](\d+)$/.test(s)) return parseInt(s.substring(1), 10);
  const n = parseInt(s, 10);
  return isNaN(n) ? s : n;
}

// Helper to ensure UTC timestamp format (ends with Z)
export function ensureUtcTimestamp(timestampStr) {
  if (!timestampStr) return timestampStr;
  let cleanStr = String(timestampStr).trim();
  if (!cleanStr.endsWith('Z') && !cleanStr.includes('+') && !/-\d{2}:\d{2}$/.test(cleanStr)) {
    if (!cleanStr.includes('T')) {
      cleanStr = cleanStr.replace(' ', 'T');
    }
    // Do not append 'Z' to preserve plant local time format and prevent double timezone conversion
  }
  return cleanStr;
}

// Helper to format an ISO/UTC string to local plant DB timestamp format.
// The DB stores local plant time (e.g. IST, no timezone designator).
// We strip any Z/offset from the raw string so the local portion is preserved.
// For ISO strings WITH Z (UTC), we convert using the plant timezone offset.
export function formatToDbTimestamp(isoStr, separator = ' ', plantTz = 'Asia/Kolkata') {
  if (!isoStr || typeof isoStr !== 'string') return isoStr;
  try {
    // If already a local string (no Z, no offset), just normalise separator
    if (!isoStr.endsWith('Z') && !isoStr.includes('+') && !/-\d{2}:\d{2}$/.test(isoStr)) {
      const base = isoStr.substring(0, 19);
      if (separator === 'T') return base.replace(' ', 'T');
      return base.replace('T', ' ');
    }
    // UTC/offset ISO string → convert to plant local time string
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    // Use Intl to get the local time components in the plant timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: plantTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = (type) => parts.find(p => p.type === type)?.value || '00';
    const yr = get('year'), mo = get('month'), dy = get('day');
    const hr = get('hour'), mn = get('minute'), sc = get('second');
    const sep = separator === 'T' ? 'T' : ' ';
    return `${yr}-${mo}-${dy}${sep}${hr}:${mn}:${sc}`;
  } catch { /* ignored */ }
  return isoStr;
}

// Helper to detect if the first row of a table uses 'T' as timestamp separator
export async function detectTimestampSeparator(supabase, tableName, tsCol) {
  try {
    let data = null;
    try {
      const { data: orderData, error: orderErr } = await supabase
        .from(tableName)
        .select(tsCol)
        .order(tsCol, { ascending: false })
        .limit(1);
      if (!orderErr && orderData && orderData.length > 0) {
        data = orderData;
      }
    } catch { /* ignore and fallback */ }

    if (!data) {
      const { data: limitData, error: limitErr } = await supabase
        .from(tableName)
        .select(tsCol)
        .limit(1);
      if (limitErr) throw limitErr;
      data = limitData;
    }

    if (data && data.length > 0 && data[0][tsCol]) {
      const val = String(data[0][tsCol]);
      if (val.includes('T')) return 'T';
    }
  } catch (e) {
    console.warn(`[Format Detector] Failed to detect timestamp format for ${tableName}.${tsCol}:`, e.message);
  }
  return ' ';
}

// Helper to check if a column exists in the table structure (discovered or static fallbacks)
export function hasColumn(tableName, colName, settings) {
  if (settings) {
    const struct = settings.discoveredDbStructure;
    let tables = [];
    if (struct && struct.public && Array.isArray(struct.public.tables)) {
      tables = struct.public.tables;
    } else if (struct && Array.isArray(struct.tables)) {
      tables = struct.tables;
    }
    const tbl = tables.find(t => String(t.name).toLowerCase() === String(tableName).toLowerCase());
    if (tbl && Array.isArray(tbl.columns)) {
      return tbl.columns.some(c => String(c.name).toLowerCase() === String(colName).toLowerCase());
    }
  }
  
  if (String(tableName).toLowerCase() === 'database') {
    const dbCols = ['dateandtime', 'timestamp', 'millitm', 'tagindex', 'val', 'status', 'marker'];
    return dbCols.includes(String(colName).toLowerCase());
  }
  
  return true;
}

// Helper to check if a column has a numeric type
export function isNumericColumn(tableName, colName, settings) {
  if (settings) {
    const struct = settings.discoveredDbStructure;
    let tables = [];
    if (struct && struct.public && Array.isArray(struct.public.tables)) {
      tables = struct.public.tables;
    } else if (struct && Array.isArray(struct.tables)) {
      tables = struct.tables;
    }
    const tbl = tables.find(t => String(t.name).toLowerCase() === String(tableName).toLowerCase());
    if (tbl && Array.isArray(tbl.columns)) {
      const col = tbl.columns.find(c => String(c.name).toLowerCase() === String(colName).toLowerCase());
      if (col && col.type) {
        const type = String(col.type).toLowerCase();
        return type.includes('int') || type.includes('num') || type.includes('float') || type.includes('double') || type.includes('real');
      }
    }
  }
  return false;
}

// Translate raw Supabase rows to standard format based on mapping configurations
export function translateRowToStandard(row, mappings = {}, isAlarmInt = false, settings = null) {
  if (!row) return row;
  
  let tsCol = mappings.timestampCol;
  if (!tsCol) {
    if (row.timestamp !== undefined) tsCol = 'timestamp';
    else if (row.DateAndTime !== undefined) tsCol = 'DateAndTime';
    else tsCol = 'DateAndTime';
  }
  
  const tagCol = mappings.tagCol || 'TagIndex';
  const valCol = mappings.valueCol || 'Val';
  const statusCol = mappings.statusCol || 'Status';
  const alarmCol = mappings.alarmCol || 'Marker';

  let markerVal = row[alarmCol];
  if (markerVal === 1 || markerVal === '1' || String(markerVal).trim() === '1') {
    markerVal = 'WARNING VALUE';
  } else if (markerVal === 2 || markerVal === '2' || String(markerVal).trim() === '2') {
    markerVal = 'CRITICAL FAULT';
  } else if (markerVal === 0 || markerVal === '0' || markerVal === null || markerVal === undefined || String(markerVal).trim() === '0') {
    markerVal = '';
  }

  return {
    ...row,
    DateAndTime: ensureUtcTimestamp(row[tsCol]),
    TagIndex: normalizeTagIndex(row[tagCol]),
    Val: row[valCol] !== undefined && row[valCol] !== null ? (isNaN(parseFloat(row[valCol])) ? row[valCol] : parseFloat(row[valCol])) : null,
    Status: statusCol !== undefined && row[statusCol] !== null ? parseInt(row[statusCol], 10) : null,
    Marker: markerVal,
    ID: row.ID || row.id || null
  };
}

// ─── Query 1: Get absolute latest record for a TagIndex ──────────────────────
export async function getLatestRecord(supabase, tableName, tagIndex, mappings = {}, isAlarmInt = false, settings = null) {
  if (!supabase) return null;
  const tagCol = mappings.tagCol || 'TagIndex';
  
  let tsCol = mappings.timestampCol;
  if (!tsCol) {
    if (hasColumn(tableName, 'timestamp', settings)) {
      tsCol = 'timestamp';
    } else {
      tsCol = 'DateAndTime';
    }
  }
  
  // Expand tagIndex to match potential database formats (T0, 0, etc.)
  let targetIndexes = [];
  const str = String(tagIndex).trim();
  const isNumeric = isNumericColumn(tableName, tagCol, settings);
  
  if (isNumeric) {
    const num = parseInt(str.replace(/[^\d]/g, ''), 10);
    if (!isNaN(num)) targetIndexes.push(num);
    if (/^[Tt](\d+)$/.test(str)) {
      const digits = str.substring(1);
      const digitNum = parseInt(digits, 10);
      if (!isNaN(digitNum)) targetIndexes.push(digitNum);
    }
  } else {
    targetIndexes.push(str);
    if (/^\d+$/.test(str)) {
      targetIndexes.push(`T${str}`);
      targetIndexes.push(`t${str}`);
    } else if (/^[Tt](\d+)$/.test(str)) {
      const digits = str.substring(1);
      targetIndexes.push(digits);
    }
  }
  const uniqueIndexes = [...new Set(targetIndexes)].filter(x => x !== null && x !== undefined && x !== '');

  try {
    const selectList = [tsCol, tagCol, mappings.valueCol || 'Val', mappings.statusCol || 'Status', mappings.alarmCol || 'Marker'];
    let idCol = null;
    if (hasColumn(tableName, 'ID', settings)) {
      idCol = 'ID';
    } else if (hasColumn(tableName, 'id', settings)) {
      idCol = 'id';
    }
    
    if (idCol) {
      selectList.push(idCol);
    }
    
    const selectCols = selectList.filter(Boolean).join(',');

    let query = supabase
      .from(tableName)
      .select(selectCols)
      .in(tagCol, uniqueIndexes)
      .order(tsCol, { ascending: false });

    if (idCol) {
      query = query.order(idCol, { ascending: false, nullsFirst: false });
    }

    const queryStartTime = performance.now();
    console.info(`[Supabase Query Audit]
  - Query: "getLatestRecord"
  - Table: "${tableName}"
  - TagIndex: ${tagIndex} (unique matches: ${uniqueIndexes.join(', ')})
  - Columns: "${selectCols}"
  - Triggered at: ${new Date().toLocaleTimeString()}`);

    const { data, error } = await query.limit(1);
    const duration = Math.round(performance.now() - queryStartTime);

    if (error) throw error;
    if (data && data.length > 0) {
      const translated = translateRowToStandard(data[0], mappings, isAlarmInt, settings);
      console.log(`[HistorianService] getLatestRecord SUCCESS tag=${tagIndex}: Val=${translated.Val}, Time=${translated.DateAndTime} (Took ${duration}ms)`);
      return translated;
    }
  } catch (err) {
    console.error(`[HistorianService] Failed getLatestRecord for TagIndex ${tagIndex}:`, err);
  }
  return null;
}

// ─── Query 2: Get records in a time range for multiple tags ─────────────────
export async function getRecordsInRange(supabase, tableName, tagIndexes, startISO, endISO, mappings = {}, sort = 'asc', isAlarmInt = false, settings = null, maxRows = null) {
  if (!supabase) return [];
  const tagCol = mappings.tagCol || 'TagIndex';
  
  let tsCol = mappings.timestampCol;
  if (!tsCol) {
    if (hasColumn(tableName, 'timestamp', settings)) {
      tsCol = 'timestamp';
    } else {
      tsCol = 'DateAndTime';
    }
  }

  // Expand tagIndex filter list if provided
  let targetIndexes = [];
  const isNumeric = isNumericColumn(tableName, tagCol, settings);
  if (tagIndexes && tagIndexes.length > 0) {
    tagIndexes.forEach(idx => {
      const str = String(idx).trim();
      if (isNumeric) {
        const num = parseInt(str.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num)) targetIndexes.push(num);
        if (/^[Tt](\d+)$/.test(str)) {
          const digits = str.substring(1);
          const digitNum = parseInt(digits, 10);
          if (!isNaN(digitNum)) targetIndexes.push(digitNum);
        }
      } else {
        targetIndexes.push(str);
        if (/^\d+$/.test(str)) {
          targetIndexes.push(`T${str}`);
          targetIndexes.push(`t${str}`);
        } else if (/^[Tt](\d+)$/.test(str)) {
          const digits = str.substring(1);
          targetIndexes.push(digits);
        }
      }
    });
    targetIndexes = [...new Set(targetIndexes)].filter(x => x !== null && x !== undefined && x !== '');
  }

  try {
    const selectList = [tsCol, tagCol, mappings.valueCol || 'Val', mappings.statusCol || 'Status', mappings.alarmCol || 'Marker'];
    let idCol = null;
    if (hasColumn(tableName, 'ID', settings)) {
      idCol = 'ID';
    } else if (hasColumn(tableName, 'id', settings)) {
      idCol = 'id';
    }
    
    if (idCol) {
      selectList.push(idCol);
    }
    
    const selectCols = selectList.filter(Boolean).join(',');

    const separator = await detectTimestampSeparator(supabase, tableName, tsCol);
    // Derive plant timezone from settings (default Asia/Kolkata)
    const plantTz = settings?.plantTimezone || settings?.timezone || 'Asia/Kolkata';
    const dbStart = startISO ? formatToDbTimestamp(startISO, separator, plantTz) : null;
    const dbEnd = endISO ? formatToDbTimestamp(endISO, separator, plantTz) : null;

    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let query = supabase.from(tableName)
        .select(selectCols)
        .order(tsCol, { ascending: sort === 'asc' });

      // Secondary sort by ID to give deterministic order when timestamps match
      if (idCol) {
        query = query.order(idCol, { ascending: sort === 'asc', nullsFirst: false });
      }

      query = query.range(from, to);

      if (targetIndexes.length > 0) {
        query = query.in(tagCol, targetIndexes);
      }
      if (dbStart) {
        query = query.gte(tsCol, dbStart);
      }
      if (dbEnd) {
        query = query.lte(tsCol, dbEnd);
      }

      // Development Console Logging for Query Audit
      console.info(`[Supabase Query Audit]
  - Query: "getRecordsInRange"
  - Table: "${tableName}"
  - Filter TagIndexes: ${targetIndexes.length > 0 ? targetIndexes.join(', ') : 'All'}
  - Date Range: ${dbStart || 'None'} to ${dbEnd || 'None'}
  - Page: ${page} (range: ${from}-${to})
  - Columns: "${selectCols}"
  - Triggered at: ${new Date().toLocaleTimeString()}`);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData = [...allData, ...data];
        if (data.length < pageSize || (maxRows !== null && allData.length >= maxRows)) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    const translated = allData.map(row => translateRowToStandard(row, mappings, isAlarmInt, settings));
    console.log(`[HistorianService] getRecordsInRange SUCCESS: ${translated.length} rows returned`);
    return translated;
  } catch (err) {
    console.error('[HistorianService] getRecordsInRange failed:', err);
    throw err;
  }
}

// ─── Query 2.5: Get records since a last ID or timestamp (Incremental Refresh) ─
export async function getRecordsSince(supabase, tableName, tagIndexes, lastID, lastTimestamp, mappings = {}, isAlarmInt = false, settings = null) {
  if (!supabase) return [];
  const tagCol = mappings.tagCol || 'TagIndex';
  
  let tsCol = mappings.timestampCol;
  if (!tsCol) {
    if (hasColumn(tableName, 'timestamp', settings)) {
      tsCol = 'timestamp';
    } else {
      tsCol = 'DateAndTime';
    }
  }

  let idCol = null;
  if (hasColumn(tableName, 'ID', settings)) {
    idCol = 'ID';
  } else if (hasColumn(tableName, 'id', settings)) {
    idCol = 'id';
  }

  let targetIndexes = [];
  const isNumeric = isNumericColumn(tableName, tagCol, settings);
  if (tagIndexes && tagIndexes.length > 0) {
    tagIndexes.forEach(idx => {
      const str = String(idx).trim();
      if (isNumeric) {
        const num = parseInt(str.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num)) targetIndexes.push(num);
        if (/^[Tt](\d+)$/.test(str)) {
          const digits = str.substring(1);
          const digitNum = parseInt(digits, 10);
          if (!isNaN(digitNum)) targetIndexes.push(digitNum);
        }
      } else {
        targetIndexes.push(str);
        if (/^\d+$/.test(str)) {
          targetIndexes.push(`T${str}`);
          targetIndexes.push(`t${str}`);
        } else if (/^[Tt](\d+)$/.test(str)) {
          const digits = str.substring(1);
          targetIndexes.push(digits);
        }
      }
    });
    targetIndexes = [...new Set(targetIndexes)].filter(x => x !== null && x !== undefined && x !== '');
  }

  try {
    const selectList = [tsCol, tagCol, mappings.valueCol || 'Val', mappings.statusCol || 'Status', mappings.alarmCol || 'Marker'];
    if (idCol) selectList.push(idCol);
    const selectCols = selectList.filter(Boolean).join(',');

    let query = supabase.from(tableName).select(selectCols).order(tsCol, { ascending: true });
    if (idCol) {
      query = query.order(idCol, { ascending: true, nullsFirst: false });
    }

    if (targetIndexes.length > 0) {
      query = query.in(tagCol, targetIndexes);
    }

    // Filter using lastID if present, or fallback to timestamp
    if (idCol && lastID !== null && lastID !== undefined) {
      query = query.gt(idCol, lastID);
    } else if (lastTimestamp) {
      const separator = await detectTimestampSeparator(supabase, tableName, tsCol);
      const plantTz = settings?.plantTimezone || settings?.timezone || 'Asia/Kolkata';
      const dbTs = formatToDbTimestamp(lastTimestamp, separator, plantTz);
      query = query.gt(tsCol, dbTs);
    }

    const { data, error } = await query;
    if (error) throw error;

    const translated = (data || []).map(row => translateRowToStandard(row, mappings, isAlarmInt, settings));
    console.log(`[HistorianService] getRecordsSince SUCCESS: ${translated.length} new rows returned`);
    return translated;
  } catch (err) {
    console.error('[HistorianService] getRecordsSince failed:', err);
    throw err;
  }
}

// ─── Query 3: Get total record count ─────────────────────────────────────────
export async function getTotalCount(supabase, tableName) {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.error('[HistorianService] getTotalCount failed:', err);
    return 0;
  }
}

// ─── Query 4: Get statistical summaries for TagIndexes in a time range ────────
export async function getTagStats(supabase, tableName, tagIndexes, startISO, endISO, mappings = {}, isAlarmInt = false, settings = null) {
  const records = await getRecordsInRange(supabase, tableName, tagIndexes, startISO, endISO, mappings, 'asc', isAlarmInt, settings);
  const statsMap = {};

  tagIndexes.forEach(tagIdx => {
    const normTarget = normalizeTagIndex(tagIdx);
    const tagRecs = records.filter(r => normalizeTagIndex(r.TagIndex) === normTarget);

    if (tagRecs.length === 0) {
      statsMap[tagIdx] = { min: null, max: null, avg: null, current: null, count: 0, lastTimestamp: null, sparkPoints: [] };
      return;
    }

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const r of tagRecs) {
      const v = Number(r.Val);
      if (isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }

    const sorted = [...tagRecs].sort((a, b) => new Date(b.DateAndTime).getTime() - new Date(a.DateAndTime).getTime());
    const latest = sorted[0];
    const sparkPoints = sorted.slice(0, 12).map(r => r.Val).reverse();

    statsMap[tagIdx] = {
      min: min === Infinity ? null : min,
      max: max === -Infinity ? null : max,
      avg: tagRecs.length > 0 ? (sum / tagRecs.length) : null,
      current: latest.Val,
      count: tagRecs.length,
      lastTimestamp: latest.DateAndTime,
      sparkPoints
    };
  });

  return statsMap;
}

// ─── Query 5: Get raw rows for Explorer table ──────────────────────────────
export async function getRawRows(supabase, tableName, tagIndexes, startISO, endISO, limit = 500, sort = 'desc', mappings = {}, isAlarmInt = false, settings = null, rangeFrom = null, rangeTo = null) {
  if (!supabase) return [];
  const tagCol = mappings.tagCol || 'TagIndex';
  
  let tsCol = mappings.timestampCol;
  if (!tsCol) {
    if (hasColumn(tableName, 'timestamp', settings)) {
      tsCol = 'timestamp';
    } else {
      tsCol = 'DateAndTime';
    }
  }

  // Expand tagIndex filter list if provided
  let targetIndexes = [];
  const isNumeric = isNumericColumn(tableName, tagCol, settings);
  if (tagIndexes && tagIndexes.length > 0) {
    tagIndexes.forEach(idx => {
      const str = String(idx).trim();
      if (isNumeric) {
        const num = parseInt(str.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num)) targetIndexes.push(num);
        if (/^[Tt](\d+)$/.test(str)) {
          const digits = str.substring(1);
          const digitNum = parseInt(digits, 10);
          if (!isNaN(digitNum)) targetIndexes.push(digitNum);
        }
      } else {
        targetIndexes.push(str);
        if (/^\d+$/.test(str)) {
          targetIndexes.push(`T${str}`);
          targetIndexes.push(`t${str}`);
        } else if (/^[Tt](\d+)$/.test(str)) {
          const digits = str.substring(1);
          targetIndexes.push(digits);
        }
      }
    });
    targetIndexes = [...new Set(targetIndexes)].filter(x => x !== null && x !== undefined && x !== '');
  }

  const queryStartTime = performance.now();
  try {
    let selectCols = '*';
    if (tableName === (settings?.selectedTable || 'Database')) {
      const selectList = [
        tsCol,
        tagCol,
        mappings.valueCol || 'Val',
        mappings.statusCol || 'Status',
        mappings.alarmCol || 'Marker'
      ];
      let idCol = null;
      if (hasColumn(tableName, 'ID', settings)) idCol = 'ID';
      else if (hasColumn(tableName, 'id', settings)) idCol = 'id';
      if (idCol) selectList.push(idCol);
      selectCols = selectList.filter(Boolean).join(',');
    }

    let query = supabase.from(tableName).select(selectCols);
    query = query.order(tsCol, { ascending: sort === 'asc' });

    if (targetIndexes.length > 0) {
      query = query.in(tagCol, targetIndexes);
    }
    
    const separator = await detectTimestampSeparator(supabase, tableName, tsCol);
    const plantTz = settings?.plantTimezone || settings?.timezone || 'Asia/Kolkata';
    const dbStart = startISO ? formatToDbTimestamp(startISO, separator, plantTz) : null;
    const dbEnd = endISO ? formatToDbTimestamp(endISO, separator, plantTz) : null;

    if (dbStart) {
      query = query.gte(tsCol, dbStart);
    }
    if (dbEnd) {
      query = query.lte(tsCol, dbEnd);
    }

    if (rangeFrom !== null && rangeTo !== null) {
      query = query.range(rangeFrom, rangeTo);
    } else if (limit) {
      query = query.limit(limit);
    }

    // Development Console Logging for Query Audit
    console.info(`[Supabase Query Audit]
  - Query: "getRawRows"
  - Table: "${tableName}"
  - Filter TagIndexes: ${targetIndexes.length > 0 ? targetIndexes.join(', ') : 'All'}
  - Date Range: ${dbStart || 'None'} to ${dbEnd || 'None'}
  - Limit/Range: ${rangeFrom !== null ? `Range ${rangeFrom}-${rangeTo}` : `Limit ${limit}`}
  - Triggered at: ${new Date().toLocaleTimeString()}`);

    const { data, error } = await query;
    const duration = Math.round(performance.now() - queryStartTime);
    
    if (error) throw error;

    const translated = (data || []).map(row => translateRowToStandard(row, mappings, isAlarmInt, settings));
    console.log(`[HistorianService] getRawRows SUCCESS: ${translated.length} rows returned (Took ${duration}ms)`);
    return translated;
  } catch (err) {
    console.error('[HistorianService] getRawRows failed:', err);
    throw err;
  }
}

// Global shared helper for calculating plant KPIs from a single dataset
export function calculateExecutiveKPIs(rows, summaries, tz, shiftConfig) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    console.warn("[KPI Engine Warning] calculateExecutiveKPIs called with zero rows. Returning Not Available for all KPIs.");
    return {
      totalFeed: null,
      lumpProd: null,
      finesProd: null,
      currentFeedRate: null,
      avgFeedRate: null,
      maxFeedRate: null,
      minFeedRate: null,
      runtimeHours: null,
      downtimeHours: null,
      availability: null,
      totalRecords: 0,
      latestTs: null
    };
  }

  const findTagIdx = (name) => {
    if (!name) return null;
    const cleanTarget = name.toLowerCase().trim();
    const match = summaries.find(s => {
      const sName = (s?.tagName || s?.display_name || s?.TagName || '').toLowerCase().trim();
      return sName === cleanTarget;
    });
    return match ? (match.tagIndex ?? match.tag_index ?? match.TagIndex) : null;
  };

  const feedRateIdx = findTagIdx("Total Input Feed");
  const lumpRateIdx = findTagIdx("Lump Out");
  const finesRateIdx = findTagIdx("Fines Out");

  const getTagRows = (tagIdx, name) => {
    if (tagIdx === null || tagIdx === undefined) {
      console.warn(`[KPI Engine Warning] Configured Tag '${name}' is missing or has no index configuration.`);
      return [];
    }
    const normTarget = normalizeTagIndex(tagIdx);
    const filtered = rows.filter(r => r && normalizeTagIndex(r.TagIndex) == normTarget && r.Val !== null && r.Val !== undefined);
    if (filtered.length === 0) {
      console.warn(`[KPI Engine Warning] Tag '${name}' resolved to index ${normTarget} but returned 0 rows in this period.`);
    }
    return filtered;
  };

  const feedRows = getTagRows(feedRateIdx, "Total Input Feed");
  const lumpRows = getTagRows(lumpRateIdx, "Lump Out");
  const finesRows = getTagRows(finesRateIdx, "Fines Out");

  // Production sums
  const totalFeed = feedRows.length > 0 ? feedRows.reduce((sum, r) => sum + Number(r.Val), 0) : null;
  const lumpProd = lumpRows.length > 0 ? lumpRows.reduce((sum, r) => sum + Number(r.Val), 0) : null;
  const finesProd = finesRows.length > 0 ? finesRows.reduce((sum, r) => sum + Number(r.Val), 0) : null;

  if (totalFeed === null) console.warn("[KPI Engine Notice] Total Feed Processed is Not Available due to missing Total Input Feed rows.");
  if (lumpProd === null) console.warn("[KPI Engine Notice] Lump Production is Not Available due to missing Lump Out rows.");
  if (finesProd === null) console.warn("[KPI Engine Notice] Fines Production is Not Available due to missing Fines Out rows.");

  let currentFeedRate = null;
  let avgFeedRate = null;
  let maxFeedRate = null;
  let minFeedRate = null;

  if (feedRows.length > 0) {
    currentFeedRate = Number(feedRows[feedRows.length - 1].Val);
    const sum = feedRows.reduce((s, r) => s + Number(r.Val), 0);
    avgFeedRate = sum / feedRows.length;
    maxFeedRate = Math.max(...feedRows.map(r => Number(r.Val)));
    minFeedRate = Math.min(...feedRows.map(r => Number(r.Val)));
  }

  let firstTime = null;
  let lastTime = null;
  rows.forEach(r => {
    if (r && r.DateAndTime) {
      const ms = new Date(r.DateAndTime).getTime();
      if (!firstTime || ms < firstTime) firstTime = ms;
      if (!lastTime || ms > lastTime) lastTime = ms;
    }
  });

  const durationMs = (firstTime && lastTime) ? (lastTime - firstTime) : 0;
  
  let runtimeHours = null;
  let downtimeHours = null;
  let availability = null;

  if (durationMs > 0) {
    const hours = durationMs / (1000 * 60 * 60);
    const downtimeTags = summaries.filter(s => s && (s.category || '').toLowerCase() === 'downtime');
    let downtimeMins = 0;
    if (downtimeTags.length > 0) {
      downtimeTags.forEach(t => {
        downtimeMins += Number(t.dailyTotal || t.daily_total || t.avgVal || 0);
      });
    } else {
      const badRecs = rows.filter(r => r && r.Status !== 192);
      downtimeMins = badRecs.length;
    }
    downtimeHours = downtimeMins / 60;
    runtimeHours = Math.max(0, hours - downtimeHours);
    availability = (runtimeHours / hours) * 100;
  } else {
    console.warn("[KPI Engine Warning] Duration is zero or cannot be determined. Runtime and availability are Not Available.");
  }

  // Logging debug statistics for configurations as requested
  console.log(`[KPI Engine Debug] Configured Tag: Total Input Feed | Index: ${feedRateIdx} | Historian rows returned: ${feedRows.length} | SUM: ${totalFeed} | AVG: ${avgFeedRate} | MIN: ${minFeedRate} | MAX: ${maxFeedRate} | Latest Value: ${currentFeedRate}`);
  console.log(`[KPI Engine Debug] Configured Tag: Lump Out | Index: ${lumpRateIdx} | Historian rows returned: ${lumpRows.length} | SUM: ${lumpProd} | AVG: ${lumpRows.length > 0 ? lumpProd / lumpRows.length : 0} | MIN: ${lumpRows.length > 0 ? Math.min(...lumpRows.map(r => Number(r.Val))) : 0} | MAX: ${lumpRows.length > 0 ? Math.max(...lumpRows.map(r => Number(r.Val))) : 0} | Latest Value: ${lumpRows.length > 0 ? lumpRows[lumpRows.length - 1].Val : 0}`);
  console.log(`[KPI Engine Debug] Configured Tag: Fines Out | Index: ${finesRateIdx} | Historian rows returned: ${finesRows.length} | SUM: ${finesProd} | AVG: ${finesRows.length > 0 ? finesProd / finesRows.length : 0} | MIN: ${finesRows.length > 0 ? Math.min(...finesRows.map(r => Number(r.Val))) : 0} | MAX: ${finesRows.length > 0 ? Math.max(...finesRows.map(r => Number(r.Val))) : 0} | Latest Value: ${finesRows.length > 0 ? finesRows[finesRows.length - 1].Val : 0}`);

  return {
    totalFeed,
    lumpProd,
    finesProd,
    currentFeedRate,
    avgFeedRate,
    maxFeedRate,
    minFeedRate,
    runtimeHours,
    downtimeHours,
    availability,
    totalRecords: rows.length,
    latestTs: lastTime ? new Date(lastTime).toISOString() : null
  };
}
