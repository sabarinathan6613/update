import { getSupabaseClient, getSupabaseConfig, getSupabaseAdminClient } from './supabaseClient';

const DEFAULT_SETTINGS = {
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  smtpSecure: true,
  templateLogoText: "",
  templateHeaderColor: "#131929",
  templateAccentColor: "#0EA5E9",
  templateFooterText: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  selectedTable: "",
  dashboardTags: []
};

// ─── Query Cache ───────────────────────────────────────────────────────────────
const queryCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const CONFIG_CACHE_DURATION = 5000; // 5 seconds for config parameters (near-realtime sync)

export function invalidateCache() {
  console.log('[Cache] Invalidating all cached database queries.');
  queryCache.clear();
}

export function initDB() {
  // Pure cloud configuration: local storage initialization is removed.
}

// User Profile management
export async function getUsers() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let currentUserId = "Unknown";
  let currentRole = "Unknown";

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      currentUserId = authData.user.id;
    }

    const { data, error } = await supabase.from('profiles').select('*');
    if (error) throw error;

    const cloudUsers = (data || []).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role === 'User' ? 'Operator' : u.role,
      plantId: u.plant_id,
      active: u.active
    }));

    const currentProfile = cloudUsers.find(u => u.id === currentUserId);
    if (currentProfile) {
      currentRole = currentProfile.role;
    }

    const usersReturned = cloudUsers.map(u => ({ email: u.email, role: u.role }));
    console.log(`[User Audit Log]
Current User ID: ${currentUserId}
Current Role: ${currentRole}
Query Result Count: ${cloudUsers.length}
Users Returned:`, usersReturned);

    return cloudUsers;
  } catch (e) {
    console.error("Supabase getUsers failed:", e);
    throw e;
  }
}

export async function saveUser(user) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");

  try {
    const dbProfile = {
      id: user.id || undefined,
      email: user.email,
      name: user.name,
      role: user.role === 'Operator' ? 'User' : user.role,
      plant_id: user.plantId,
      active: user.active
    };

    if (!dbProfile.id) {
      const adminClient = getSupabaseAdminClient();
      if (!adminClient) throw new Error("Supabase Admin client not initialized. Set VITE_SUPABASE_SERVICE_ROLE_KEY.");

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: user.email.trim(),
        password: user.password,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          role: user.role === 'Operator' ? 'User' : user.role,
          plant_id: user.plantId,
          active: user.active
        }
      });
      if (authError) throw authError;
      if (authData?.user?.id) {
        dbProfile.id = authData.user.id;
      }
    }

    const isNew = !user.id;
    const { data, error } = await supabase.from('profiles').upsert(dbProfile).select();
    if (error) throw error;
    
    if (data && data.length > 0) {
      const saved = data[0];
      await addAuditLog(null, null, null, isNew ? 'User Creation' : 'User Modification', `${isNew ? 'Created' : 'Modified'} user: ${saved.email} (Role: ${saved.role === 'User' ? 'Operator' : saved.role})`);
      return {
        id: saved.id,
        email: saved.email,
        name: saved.name,
        password: user.password || '',
        role: saved.role === 'User' ? 'Operator' : saved.role,
        plantId: saved.plant_id,
        active: saved.active
      };
    }
    throw new Error("No data returned from profile upsert");
  } catch (e) {
    console.error("Supabase user save failed:", e);
    throw e;
  }
}

export async function deleteUser(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");

  let userEmail = 'Unknown';
  try {
    const { data } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (data) userEmail = data.email;
  } catch { /* ignored */ }

  // 1. First delete from auth.users (authentication system) using the admin API
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
      if (authError) {
        console.warn("Supabase auth delete error (will fallback to direct profile delete):", authError);
        // Fallback: try deleting from profiles directly in case it didn't cascade
        await supabase.from('profiles').delete().eq('id', userId);
      }
    } catch (err) {
      console.warn("Supabase auth delete exception:", err);
      await supabase.from('profiles').delete().eq('id', userId);
    }
  } else {
    // 2. Direct profiles delete if admin client is not available (e.g. VITE_SUPABASE_SERVICE_ROLE_KEY not configured)
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) {
      console.error("Supabase profiles delete error:", error);
      throw new Error(`Supabase profiles delete failed: ${error.message}`);
    }
  }

  await addAuditLog(null, null, null, 'User Deletion', `Deleted user: ${userEmail}`);
}


// Plant configurations query
export async function getPlants(options = {}) {
  const cacheKey = 'getPlants';
  if (!options.forceRefresh) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_DURATION) {
      return cached.data;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('plants').select('*');
    if (error) {
      console.error("Supabase plants query error:", error);
      throw new Error(`Supabase plants query failed: ${error.message}`);
    }
    const result = data || [];
    queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error("getPlants failed:", err);
    throw err;
  }
}

export async function savePlant(plant) {
  invalidateCache();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  const { error } = await supabase.from('plants').upsert(plant);
  if (error) {
    console.error("Supabase plants upsert error:", error);
    throw new Error(`Supabase plants upsert failed: ${error.message}`);
  }
  await addAuditLog(null, null, null, 'Plant Configuration Update', `Saved plant details: ${plant.name || plant.id}`);
}

// Tag Configurations Management
export async function getTagConfigs(options = {}) {
  const cacheKey = 'getTagConfigs';
  if (!options.forceRefresh) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_DURATION) {
      return cached.data;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  // 1. Try querying tag_configurations table
  try {
    const { data, error } = await supabase.from('tag_configurations').select('*');
    if (error) throw error;
    if (data && data.length > 0) {
      const result = data.map(t => ({
        TagIndex: t.tag_index,
        TagName: t.display_name || t.tag_name || `Tag Index ${t.tag_index}`,
        Unit: t.unit || '',
        Description: t.description || `Telemetry channel for Tag Index ${t.tag_index}`,
        DecimalPlaces: t.decimal_places !== undefined ? t.decimal_places : 2,
        DashboardVisible: t.dashboard_visibility !== undefined ? t.dashboard_visibility : (t.dashboard_visible !== undefined ? t.dashboard_visible : false),
        TrendsVisible: t.trends_visible !== undefined ? t.trends_visible : false,
        ReportsVisible: t.reports_visible !== undefined ? t.reports_visible : false
      }));
      queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn("tag_configurations read failed, trying backup:", err);
  }

  // 2. Fallback: Query email_configuration table for row id = 'tag_configs'
  try {
    const { data, error } = await supabase.from('email_configuration').select('*').eq('id', 'tag_configs').maybeSingle();
    console.log("[Query Diagnostics] email_configuration where id='tag_configs':", { data, error });
    if (error) throw error;
    if (data && data.password) {
      const parsed = JSON.parse(data.password);
      if (Array.isArray(parsed) && parsed.length > 0) {
        queryCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
        return parsed;
      }
    }
  } catch (err) {
    console.error("email_configuration tag_configs read failed:", err);
    throw err;
  }

  const emptyResult = [];
  queryCache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
  return emptyResult;
}

export async function saveTagConfigs(configs) {
  invalidateCache();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  
  // 1. Try saving to tag_configurations table
  try {
    const dbConfigs = configs.map(t => ({
      tag_index: t.TagIndex,
      display_name: t.TagName,
      unit: t.Unit,
      description: t.Description,
      decimal_places: t.DecimalPlaces,
      dashboard_visibility: t.DashboardVisible,
      trends_visible: t.TrendsVisible,
      reports_visible: t.ReportsVisible
    }));
    const { error } = await supabase.from('tag_configurations').upsert(dbConfigs);
    if (error) throw error;
  } catch (err) {
    console.error("Supabase tag_configurations upsert error:", err);
    throw err;
  }

  // 2. Always backup/upsert to email_configuration table for row id = 'tag_configs'
  try {
    const dbTagBackup = {
      id: 'tag_configs',
      host: 'tag_configs',
      port: 0,
      username: '',
      password: JSON.stringify(configs),
      secure: false,
      logo_text: '',
      header_color: '',
      footer_text: ''
    };
    const { error } = await supabase.from('email_configuration').upsert(dbTagBackup);
    if (error) throw error;
  } catch (err) {
    console.error("Supabase email_configuration backup error:", err);
    throw err;
  }
  await addAuditLog(null, null, null, 'Tag Configuration Update', `Updated configurations for ${configs.length} tags.`);
}

// Helper to parse dates timezone-agnostically and return standardized ISO UTC strings
function ensureUtcTimestamp(ts) {
  if (!ts) return ts;
  let d;
  if (ts instanceof Date) {
    d = ts;
  } else {
    let tsStr = String(ts).trim();
    // If it doesn't end with Z or a timezone offset, append Z
    if (!tsStr.endsWith('Z') && !tsStr.includes('+') && !/-\d{2}:\d{2}$/.test(tsStr)) {
      tsStr = tsStr.replace(' ', 'T') + 'Z';
    }
    d = new Date(tsStr);
  }
  
  if (isNaN(d.getTime())) {
    return ts;
  }
  return d.toISOString();
}

function isAlarmColInteger(settings, tableName) {
  try {
    const struct = settings?.discoveredDbStructure;
    if (struct) {
      let tables = [];
      if (struct.public && Array.isArray(struct.public.tables)) {
        tables = struct.public.tables;
      } else if (Array.isArray(struct.tables)) {
        tables = struct.tables;
      }
      
      const tbl = tables.find(t => t.name === tableName);
      if (tbl && Array.isArray(tbl.columns)) {
        const alarmColName = settings.columnMappings?.alarmCol || 'Marker';
        const col = tbl.columns.find(c => c.name === alarmColName);
        if (col) {
          const type = String(col.type).toLowerCase();
          return type.includes('int') || type.includes('num') || type.includes('double') || type.includes('float') || type.includes('real');
        }
      }
    }
  } catch { /* ignored */ }
  return false;
}

// Helper to translate a database row with custom column names to standard Skadomation properties
function translateRowToStandard(row, mappings, isAlarmInt = false) {
  if (!row) return row;
  if (!mappings) return row;
  const tsCol = mappings.timestampCol || 'DateAndTime';
  const tagCol = mappings.tagCol || 'TagIndex';
  const valCol = mappings.valueCol || 'Val';
  const statusCol = mappings.statusCol || 'Status';
  const alarmCol = mappings.alarmCol || 'Marker';

  let markerVal = row[alarmCol];
  if (isAlarmInt) {
    if (markerVal === 1) {
      markerVal = 'WARNING VALUE';
    } else if (markerVal === 2) {
      markerVal = 'CRITICAL FAULT';
    } else if (markerVal === 0 || markerVal === null || markerVal === undefined) {
      markerVal = '';
    }
  }

  return {
    ...row,
    DateAndTime: ensureUtcTimestamp(row[tsCol]),
    TagIndex: row[tagCol] !== undefined ? parseInt(row[tagCol]) : undefined,
    Val: row[valCol] !== undefined ? parseFloat(row[valCol]) : undefined,
    Status: row[statusCol] !== undefined ? parseInt(row[statusCol]) : undefined,
    Marker: markerVal
  };
}

// Helper to format an ISO string date to space-separated 'YYYY-MM-DD HH:MM:SS' format for text comparison
function formatToDbTimestamp(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return isoStr;
  try {
    if (isoStr.indexOf(' ') > 0 && isoStr.indexOf('T') < 0) return isoStr;
    const d = new Date(isoStr);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const minutes = String(d.getUTCMinutes()).padStart(2, '0');
      const seconds = String(d.getUTCSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
  } catch { /* ignored */ }
  return isoStr;
}

// Historian Database Queries - Fetch from live connected table
export async function getHistorianData(params = {}, options = {}) {
  const { tagIndexes, startDate, endDate, limit, tableName, sort = 'desc' } = params;
  const cacheKey = `getHistorianData:${JSON.stringify(params)}`;

  if (!options.forceRefresh) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  // Load configured tags to get the valid TagIndexes
  const tagConfigs = await getTagConfigs(options);
  const configuredIndexes = tagConfigs.map(c => c.TagIndex);

  const settings = await getSettings(options);
  const activeTableName = settings.selectedTable || 'Database';
  const targetTableName = tableName || activeTableName;

  // We only filter by TagIndex and apply column mapping translation for the main historian table
  const isMainHistorian = targetTableName === activeTableName || targetTableName === 'Database';

  if (isMainHistorian) {
    let targetIndexes;
    if (tagIndexes && tagIndexes.length > 0) {
      targetIndexes = tagIndexes.filter(idx => configuredIndexes.includes(idx));
    } else {
      targetIndexes = configuredIndexes;
    }

    if (targetIndexes.length === 0) {
      queryCache.set(cacheKey, { data: [], timestamp: Date.now() });
      return [];
    }

    const mappings = settings.columnMappings || {};
    const tagCol = mappings.tagCol || 'TagIndex';
    const tsCol = mappings.timestampCol || 'DateAndTime';
    const valCol = mappings.valueCol || 'Val';
    const statusCol = mappings.statusCol || 'Status';
    const alarmCol = mappings.alarmCol || 'Marker';

    const selectCols = [tsCol, tagCol, valCol, statusCol, alarmCol].filter(Boolean).join(',');
    let query = supabase.from(targetTableName).select(selectCols);

    const dbStart = startDate ? formatToDbTimestamp(startDate) : null;
    const dbEnd = endDate ? formatToDbTimestamp(endDate) : null;

    const isAlarmInt = isAlarmColInteger(settings, targetTableName);

    if (limit) {
      query = query.in(tagCol, targetIndexes);
      if (dbStart) {
        query = query.gte(tsCol, dbStart);
      }
      if (dbEnd) {
        query = query.lte(tsCol, dbEnd);
      }
      query = query.order(tsCol, { ascending: sort === 'asc' }).limit(limit);
      const { data, error } = await query;
      if (error) {
        console.error(`Supabase query on table [${targetTableName}] error:`, error);
        throw error;
      }
      const result = (data || []).map(row => translateRowToStandard(row, settings.columnMappings, isAlarmInt));
      queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } else {
      // Fetch ALL records using pagination (bypassing Supabase 1000 default limit)
      let allData = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        let pageQuery = supabase.from(targetTableName)
          .select(selectCols)
          .in(tagCol, targetIndexes)
          .order(tsCol, { ascending: sort === 'asc' })
          .range(from, to);
          
        if (dbStart) {
          pageQuery = pageQuery.gte(tsCol, dbStart);
        }
        if (dbEnd) {
          pageQuery = pageQuery.lte(tsCol, dbEnd);
        }
        
        const { data, error } = await pageQuery;
        if (error) {
          console.error(`Supabase historian pagination error at range ${from}-${to}:`, error);
          throw error;
        }
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allData = [...allData, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }
      const result = allData.map(row => translateRowToStandard(row, settings.columnMappings, isAlarmInt));
      queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  } else {
    // Direct raw query for Explorer tables
    let query = supabase.from(targetTableName).select('*');
    if (limit) {
      query = query.limit(limit);
    }
    const { data, error } = await query;
    if (error) {
      console.error(`Supabase query on table [${targetTableName}] error:`, error);
      throw error;
    }
    const result = data || [];
    queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }
}

export async function addHistorianRecords(records) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  
  const settings = await getSettings();
  const tableName = settings.selectedTable || 'Database';
  const isAlarmInt = isAlarmColInteger(settings, tableName);
  
  const dbRecords = records.map(r => {
    const mappings = settings.columnMappings;
    if (mappings) {
      const row = {};
      row[mappings.timestampCol || 'DateAndTime'] = r.DateAndTime;
      row[mappings.tagCol || 'TagIndex'] = r.TagIndex;
      row[mappings.valueCol || 'Val'] = r.Val;
      row[mappings.statusCol || 'Status'] = r.Status;
      
      let markerVal = r.Marker || null;
      if (isAlarmInt && typeof markerVal === 'string') {
        if (markerVal === 'WARNING VALUE') {
          markerVal = 1;
        } else if (markerVal === 'CRITICAL FAULT') {
          markerVal = 2;
        } else {
          markerVal = null;
        }
      }
      
      row[mappings.alarmCol || 'Marker'] = markerVal;
      row['Millitm'] = r.Millitm;
      return row;
    }
    
    let markerVal = r.Marker || null;
    if (isAlarmInt && typeof markerVal === 'string') {
      if (markerVal === 'WARNING VALUE') {
        markerVal = 1;
      } else if (markerVal === 'CRITICAL FAULT') {
        markerVal = 2;
      } else {
        markerVal = null;
      }
    }
    return {
      DateAndTime: r.DateAndTime,
      Millitm: r.Millitm,
      TagIndex: r.TagIndex,
      Val: r.Val,
      Status: r.Status,
      Marker: markerVal
    };
  });
  
  const { error } = await supabase.from(tableName).insert(dbRecords);
  if (error) {
    console.error(`[Historian Insert Error Diagnostics] Mappings:`, JSON.stringify(settings.columnMappings));
    console.error(`[Historian Insert Error Diagnostics] Sample Row:`, JSON.stringify(dbRecords[0]));
    console.error(`Supabase historian insert on table [${tableName}] error:`, error);
    throw new Error(`Supabase historian write failed: ${error.message}`);
  }
}

// Scheduled Reports configuration
export async function getSchedules() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('scheduled_reports').select('*');
  if (error) {
    console.error("Supabase schedules query error:", error);
    throw new Error(`Supabase schedules query failed: ${error.message}`);
  }
  return (data || []).map(s => ({
    id: s.id,
    plantId: s.plant_id,
    reportType: s.report_type,
    frequency: s.frequency,
    time: s.time,
    emailRecipients: s.email_recipients,
    enabled: s.enabled,
    lastRun: s.last_run,
    formatPdf: s.format_pdf !== undefined ? s.format_pdf : true,
    formatExcel: s.format_excel !== undefined ? s.format_excel : true,
    reportMode: s.report_mode || 'Daily',
    shiftNumber: s.shift_number,
    lastRunTime: s.last_run_time,
    nextRunTime: s.next_run_time,
    lastExecutionStatus: s.last_execution_status,
    recordsIncluded: s.records_included,
    lastEmailSentTo: s.last_email_sent_to
  }));
}

export async function saveSchedule(schedule) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  const isNew = !schedule.id;
  const dbSched = {
    id: schedule.id || undefined,
    plant_id: schedule.plantId,
    report_type: schedule.reportType,
    frequency: schedule.frequency,
    time: schedule.time,
    email_recipients: schedule.emailRecipients,
    enabled: schedule.enabled,
    last_run: schedule.lastRun || null,
    format_pdf: schedule.formatPdf !== undefined ? schedule.formatPdf : true,
    format_excel: schedule.formatExcel !== undefined ? schedule.formatExcel : true,
    report_mode: schedule.reportMode || 'Daily',
    shift_number: schedule.shiftNumber || null,
    last_run_time: schedule.lastRunTime || null,
    next_run_time: schedule.nextRunTime || null,
    last_execution_status: schedule.lastExecutionStatus || null,
    records_included: schedule.recordsIncluded || null,
    last_email_sent_to: schedule.lastEmailSentTo || null
  };
  if (!dbSched.id) {
    dbSched.id = 'sched-' + Date.now();
  }
  const { error } = await supabase.from('scheduled_reports').upsert(dbSched);
  if (error) {
    console.error("Supabase schedules upsert error:", error);
    throw new Error(`Supabase schedules upsert failed: ${error.message}`);
  }
  await addAuditLog(null, null, null, isNew ? 'Schedule Created' : 'Schedule Modified', `Saved schedule for ${schedule.reportType} (Plant: ${schedule.plantId})`);
  return schedule;
}

export async function deleteSchedule(scheduleId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  const { error } = await supabase.from('scheduled_reports').delete().eq('id', scheduleId);
  if (error) {
    console.error("Supabase schedules delete error:", error);
    throw new Error(`Supabase schedules delete failed: ${error.message}`);
  }
  await addAuditLog(null, null, null, 'Schedule Deleted', `Deleted report schedule: ${scheduleId}`);
}

// System settings configuration
export async function getSettings(options = {}) {
  const cacheKey = 'getSettings';
  if (!options.forceRefresh) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_DURATION) {
      return cached.data;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) return DEFAULT_SETTINGS;

  try {
    const { data: smtpData, error: smtpError } = await supabase.from('email_configuration').select('*').eq('id', 'default').maybeSingle();
    if (smtpError) {
      console.error("Supabase settings default query error:", smtpError);
      throw new Error(`Supabase settings default query failed: ${smtpError.message}`);
    }

    const { data: sysData, error: sysError } = await supabase.from('email_configuration').select('*').eq('id', 'system_settings').maybeSingle();
    if (sysError) {
      console.error("Supabase settings system_settings query error:", sysError);
      throw new Error(`Supabase settings system_settings query failed: ${sysError.message}`);
    }

    let merged = { ...DEFAULT_SETTINGS };

    if (smtpData) {
      merged = {
        ...merged,
        smtpHost: smtpData.host,
        smtpPort: smtpData.port,
        smtpUser: smtpData.username,
        smtpPass: smtpData.password,
        smtpSecure: smtpData.secure,
        templateLogoText: smtpData.logo_text,
        templateHeaderColor: smtpData.header_color,
        templateFooterText: smtpData.footer_text,
        logoText: smtpData.logo_text,
        headerColor: smtpData.header_color,
        footerColor: smtpData.footer_text
      };
    }

    if (sysData) {
      let mappings = {};
      let dTags = [];
      let tTags = [];
      let rTags = [];
      let emailRecipients = '';
      try { if (sysData.password) mappings = JSON.parse(sysData.password); } catch { /* ignored */ }
      try { if (sysData.logo_text) dTags = JSON.parse(sysData.logo_text); } catch { /* ignored */ }
      try { if (sysData.header_color) tTags = JSON.parse(sysData.header_color); } catch { /* ignored */ }
      try { if (sysData.footer_text) rTags = JSON.parse(sysData.footer_text); } catch { /* ignored */ }
      try { if (sysData.username) emailRecipients = JSON.parse(sysData.username); } catch { /* ignored */ }

      merged = {
        ...merged,
        selectedTable: sysData.host || merged.selectedTable,
        columnMappings: Object.keys(mappings).length > 0 ? mappings : merged.columnMappings,
        dashboardTags: dTags.length > 0 ? dTags : merged.dashboardTags,
        trendTags: tTags.length > 0 ? tTags : merged.trendTags,
        reportTags: rTags.length > 0 ? rTags : merged.reportTags,
        emailRecipients: emailRecipients || merged.emailRecipients || ''
      };
    }
    queryCache.set(cacheKey, { data: merged, timestamp: Date.now() });
    return merged;
  } catch (err) {
    console.error("Error retrieving global settings from Supabase:", err);
    throw err;
  }
}

export async function saveSettings(settings) {
  invalidateCache();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");

  try {
    let finalPass = settings.smtpPass;
    if (finalPass === '••••••••••••') {
      const { data: existingSmtp } = await supabase.from('email_configuration').select('password').eq('id', 'default').maybeSingle();
      if (existingSmtp && existingSmtp.password) {
        finalPass = existingSmtp.password;
      }
    }

    const dbEmailConfig = {
      id: 'default',
      host: settings.smtpHost || '',
      port: parseInt(settings.smtpPort) || 587,
      username: settings.smtpUser || '',
      password: finalPass || '',
      secure: settings.smtpSecure !== undefined ? settings.smtpSecure : true,
      logo_text: settings.templateLogoText || settings.logoText || '',
      header_color: settings.templateHeaderColor || settings.headerColor || '',
      footer_text: settings.templateFooterText || settings.footerColor || ''
    };
    await supabase.from('email_configuration').upsert(dbEmailConfig);

    const dbSystemSettings = {
      id: 'system_settings',
      host: settings.selectedTable || 'Database',
      port: 0,
      username: JSON.stringify(settings.emailRecipients || ''),
      password: JSON.stringify(settings.columnMappings || {}),
      secure: false,
      logo_text: JSON.stringify(settings.dashboardTags || []),
      header_color: JSON.stringify(settings.trendTags || []),
      footer_text: JSON.stringify(settings.reportTags || [])
    };
    await supabase.from('email_configuration').upsert(dbSystemSettings);
  } catch (err) {
    console.error("Supabase settings upsert error:", err);
    throw err;
  }
  await addAuditLog(null, null, null, 'Email & System Configuration Update', 'Updated SMTP server settings, visual branding templates, or database configurations.');
}

// Sync Gateway logs
export async function getSyncLogs() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('synchronization_logs').select('*').order('timestamp', { ascending: false }).limit(50);
  if (error) {
    console.error("Supabase synchronization_logs query error:", error);
    throw new Error(`Supabase synchronization_logs query failed: ${error.message}`);
  }
  return (data || []).map(l => ({
    timestamp: l.timestamp,
    type: l.status_type,
    message: l.log_message
  }));
}

export async function addSyncLog(msg, type = "SYNC") {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  const { error } = await supabase.from('synchronization_logs').insert({
    status_type: type === "SYNC" ? "SUCCESS" : type,
    log_message: msg
  });
  if (error) {
    console.error("Supabase synchronization_logs insert error:", error);
    throw error;
  }
  await addAuditLog('system', 'system', 'all', 'Cloud Synchronization', msg);
}

// SMTP Outbox history logs
export async function getEmailLogs() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('report_history').select('*').order('generated_at', { ascending: false }).limit(50);
  if (error) {
    console.error("Supabase report_history query error:", error);
    throw new Error(`Supabase report_history query failed: ${error.message}`);
  }
  return (data || []).map(e => ({
    timestamp: e.generated_at,
    recipient: e.recipients || e.created_by || '',
    subject: e.name,
    message: e.type,
    status: e.delivery_status || "SENT"
  }));
}

export async function getSchedulerHistory() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('report_history')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error("Supabase report_history query error for scheduler history:", error);
    throw new Error(`Supabase report_history query failed: ${error.message}`);
  }
  return data || [];
}

export async function addEmailLog(emailLog) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  const dbReportHistory = {
    id: 'rep-' + Date.now(),
    name: emailLog.subject,
    type: emailLog.message || 'Scheduled Email Report',
    date_range: new Date().toISOString().split('T')[0],
    shift: 'Email Delivery Log',
    plant_id: 'all',
    created_by: emailLog.sender || 'System',
    recipients: emailLog.recipient || '',
    delivery_time: new Date().toISOString(),
    delivery_status: emailLog.status || 'SENT',
    attachments_sent: emailLog.attachmentsSent || 'PDF, Excel'
  };
  const { error } = await supabase.from('report_history').insert(dbReportHistory);
  if (error) {
    console.error("Supabase report_history insert error:", error);
    throw error;
  }
  await addAuditLog(null, null, null, 'Report Send', `Emailed report "${emailLog.subject}" to: ${emailLog.recipient || 'unspecified'}. Status: ${emailLog.status || 'SENT'}`);
}

// ─── Report Recipients CRUD (Supabase-backed) ──────────────────────────────────

export async function getRecipients() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('report_recipients')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error reading report_recipients from Supabase:", err);
    return [];
  }
}

export async function saveRecipient(rec) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const dbRow = {
      email: rec.email,
      name: rec.name,
      role: rec.role || 'Operator',
      active: rec.active !== false,
      groups: rec.groups || '',
      report_types: rec.report_types || rec.reportTypes || ''
    };
    if (rec.id) {
      dbRow.id = rec.id;
    }
    const { data, error } = await supabase.from('report_recipients').upsert(dbRow).select();
    if (error) throw error;
    return data?.[0] || rec;
  } catch (err) {
    console.error("Error saving report_recipient:", err);
    throw err;
  }
}

export async function deleteRecipient(id) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const { error } = await supabase.from('report_recipients').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error("Error deleting report_recipient:", err);
    throw err;
  }
}

export async function bulkUpdateRecipientsStatus(ids, active) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const { error } = await supabase.from('report_recipients').update({ active }).in('id', ids);
    if (error) throw error;
  } catch (err) {
    console.error("Error bulk updating status:", err);
    throw err;
  }
}


// ─── Report History CRUD (Supabase-backed) ────────────────────────────────────

export async function getReportsList() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('report_history')
      .select('*')
      .not('shift', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(100);
    if (error) {
      console.warn('getReportsList Supabase error:', error);
      throw new Error(`getReportsList failed: ${error.message}`);
    }
    return (data || [])
      .filter(r => {
        try { const t = JSON.parse(r.shift); return Array.isArray(t); } catch { return false; }
      })
      .map(r => ({
        id: r.id,
        name: r.name || 'Unnamed Report',
        type: r.type || 'Historian Shift Summary',
        dateInfo: r.date_range || '',
        startDate: '',
        endDate: '',
        tags: (() => { try { return JSON.parse(r.shift); } catch { return []; } })(),
        generatedAt: r.generated_at
          ? r.generated_at.replace('T', ' ').substring(0, 19)
          : new Date().toLocaleString()
      }));
  } catch (err) {
    console.error('getReportsList exception:', err);
    throw err;
  }
}

export async function saveReportRecord(report) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const dbRow = {
      id: report.id,
      name: report.name,
      type: report.type || 'Historian Shift Summary',
      date_range: report.dateInfo || '',
      shift: JSON.stringify(report.tags || []),
      plant_id: report.plantId || 'all',
      created_by: report.createdBy || ''
    };
    const { error } = await supabase.from('report_history').upsert(dbRow);
    if (error) {
      console.error('saveReportRecord Supabase error:', error);
      throw new Error(`Failed to save report: ${error.message}`);
    }
    await addAuditLog(null, null, null, 'Report Generation', `Saved report: ${report.name} (${report.type})`);
    return report;
  } catch (err) {
    console.error('saveReportRecord exception:', err);
    throw err;
  }
}

export async function deleteReportRecord(reportId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const { error } = await supabase.from('report_history').delete().eq('id', reportId);
    if (error) {
      console.error('deleteReportRecord Supabase error:', error);
      throw new Error(`Failed to delete report: ${error.message}`);
    }
    await addAuditLog(null, null, null, 'Report Deletion', `Deleted report record ID: ${reportId}`);
  } catch (err) {
    console.error('deleteReportRecord exception:', err);
    throw err;
  }
}

export async function compileReportData(report) {
  const tagConfigs = await getTagConfigs();
  const tagMap = {};
  tagConfigs.forEach(c => {
    tagMap[c.TagIndex] = c;
  });

  const rawData = await getHistorianData({
    tagIndexes: report.tags,
    startDate: report.startDate,
    endDate: report.endDate,
    sort: 'asc'
  });

  const chronRows = rawData;

  const tagSummaries = report.tags.map(tagIdx => {
    const records = chronRows.filter(r => r.TagIndex === tagIdx);
    const config = tagMap[tagIdx] || { TagName: `Tag ${tagIdx}`, Unit: '', DecimalPlaces: 2 };

    if (records.length === 0) {
      return {
        tagIndex: tagIdx,
        tagName: config.TagName,
        unit: config.Unit,
        decimalPlaces: config.DecimalPlaces ?? 2,
        min: null, max: null, avg: null, stdDev: null,
        current: null, count: 0, goodPct: 100,
        firstSampleTime: null, lastSampleTime: null,
        sparkPoints: []
      };
    }

    let min = Infinity, max = -Infinity, sum = 0, goodCount = 0;
    records.forEach(r => {
      if (r.Val < min) min = r.Val;
      if (r.Val > max) max = r.Val;
      sum += r.Val;
      if (r.Status === 192) goodCount++;
    });
    const avg = sum / records.length;

    // Standard deviation
    const variance = records.reduce((acc, r) => acc + Math.pow(r.Val - avg, 2), 0) / records.length;
    const stdDev = Math.sqrt(variance);

    const sparkPoints = records.slice(-20).map(r => r.Val);

    return {
      tagIndex: tagIdx,
      tagName: config.TagName,
      unit: config.Unit,
      decimalPlaces: config.DecimalPlaces ?? 2,
      min, max, avg, stdDev,
      current: records[records.length - 1].Val,
      count: records.length,
      goodPct: (goodCount / records.length) * 100,
      firstSampleTime: records[0].DateAndTime,
      lastSampleTime: records[records.length - 1].DateAndTime,
      sparkPoints
    };
  });

  const incidents = chronRows
    .filter(r => r.Status !== 192 || r.Marker !== '')
    .map(r => {
      const config = tagMap[r.TagIndex] || { TagName: `Tag Index ${r.TagIndex}` };
      return {
        timestamp: r.DateAndTime,
        tagIndex: r.TagIndex,
        tagName: config.TagName,
        val: r.Val,
        status: r.Status,
        marker: r.Marker || 'ANOMALY'
      };
    });

  // Build enriched raw rows with tag name for reporting
  const allRows = chronRows.map(r => ({
    ...r,
    TagName: (tagMap[r.TagIndex] || {}).TagName || `Tag ${r.TagIndex}`
  }));

  // Days in range for average calculation
  const startMs = new Date(report.startDate).getTime();
  const endMs = new Date(report.endDate).getTime();
  const daysInRange = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));

  return {
    rows: allRows.slice(-10000),      // Last 10k for PDF appendix
    allRows,                           // ALL rows for Excel full data sheet
    totalRowsCount: chronRows.length,
    summaries: tagSummaries,
    incidents: incidents.slice(0, 100),
    daysInRange: Math.round(daysInRange * 10) / 10,
    avgRecordsPerDay: Math.round(chronRows.length / daysInRange)
  };
}


async function getCurrentUserProfile() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return null;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
    if (profile) {
      return {
        email: profile.email,
        role: profile.role === 'User' ? 'Operator' : profile.role,
        plantId: profile.plant_id
      };
    }
    return {
      email: authData.user.email,
      role: 'Operator',
      plantId: null
    };
  } catch {
    return null;
  }
}

export async function addAuditLog(performedBy, role, plantId, action, details = '') {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    let finalBy = performedBy;
    let finalRole = role;
    let finalPlantId = plantId;
    
    // If not explicitly provided, try to detect current user session
    if (!finalBy) {
      const userProfile = await getCurrentUserProfile();
      if (userProfile) {
        finalBy = userProfile.email;
        finalRole = userProfile.role;
        finalPlantId = userProfile.plantId;
      } else {
        finalBy = 'system';
        finalRole = 'system';
        finalPlantId = 'all';
      }
    }
    
    const dbRow = {
      performed_by: finalBy,
      role: finalRole,
      plant_id: finalPlantId || null,
      action: action,
      details: details || ''
    };
    
    const { error } = await supabase.from('audit_logs').insert(dbRow);
    if (error) {
      console.warn('addAuditLog Supabase error:', error);
    }
  } catch (err) {
    console.error('addAuditLog exception:', err);
  }
}

export async function getAuditLogs() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(300);
    if (error) {
      console.warn('getAuditLogs Supabase error:', error);
      throw error;
    }
    return (data || []).map(log => ({
      id: log.id,
      ts: log.timestamp ? log.timestamp.replace('T', ' ').substring(0, 19) : new Date().toISOString().substring(0, 19),
      by: log.performed_by,
      role: log.role,
      plantId: log.plant_id,
      action: log.action,
      details: log.details
    }));
  } catch (err) {
    console.error('getAuditLogs exception:', err);
    throw err;
  }
}

export async function deleteAuditLogs() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const { error } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error('deleteAuditLogs Supabase error:', error);
      throw error;
    }
  } catch (err) {
    console.error('deleteAuditLogs exception:', err);
    throw err;
  }
}

// ─── SMTP Configurations CRUD (Supabase-backed) ─────────────────────────────────
export async function getSmtpConfigurations() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('smtp_configurations')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error reading smtp_configurations from Supabase:", err);
    return [];
  }
}

export async function saveSmtpConfiguration(config) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const dbRow = {
      name: config.name,
      host: config.host,
      port: parseInt(config.port) || 587,
      username: config.username,
      password: config.password,
      secure: config.secure !== false,
      security_type: config.security_type || 'SSL/TLS',
      is_active: config.is_active === true,
      last_modified: new Date().toISOString()
    };
    if (config.id) {
      dbRow.id = config.id;
    }
    const { data, error } = await supabase
      .from('smtp_configurations')
      .upsert(dbRow)
      .select()
      .single();
    if (error) throw error;
    
    // If this configuration was saved as active, set all other configurations to inactive
    if (dbRow.is_active && data?.id) {
      await supabase
        .from('smtp_configurations')
        .update({ is_active: false })
        .neq('id', data.id);
    }
    
    await addAuditLog(null, null, null, 'SMTP Configuration Save', `Saved SMTP configuration: ${config.name}. Active: ${config.is_active}`);
    return data;
  } catch (err) {
    console.error("Error saving smtp_configuration to Supabase:", err);
    throw err;
  }
}

export async function deleteSmtpConfiguration(id) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    // Check if it's the active one
    const { data: config } = await supabase
      .from('smtp_configurations')
      .select('name')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('smtp_configurations')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await addAuditLog(null, null, null, 'SMTP Configuration Deletion', `Deleted SMTP configuration: ${config?.name || id}`);
  } catch (err) {
    console.error("Error deleting smtp_configuration from Supabase:", err);
    throw err;
  }
}

export async function setActiveSmtpConfiguration(id) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    // Set all to inactive
    const { error: err1 } = await supabase
      .from('smtp_configurations')
      .update({ is_active: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (err1) throw err1;

    // Set target to active
    const { data, error: err2 } = await supabase
      .from('smtp_configurations')
      .update({ is_active: true, last_modified: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (err2) throw err2;

    await addAuditLog(null, null, null, 'SMTP Configuration Set Active', `Activated SMTP configuration: ${data?.name}`);
    return data;
  } catch (err) {
    console.error("Error activating smtp_configuration in Supabase:", err);
    throw err;
  }
}

// ─── Report Templates CRUD (Supabase-backed) ────────────────────────────────────
export async function getReportTemplates() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('report_templates')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error reading report_templates from Supabase:", err);
    return [];
  }
}

export async function saveReportTemplate(template) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const dbRow = {
      name: template.name,
      report_type: template.report_type,
      subject: template.subject,
      is_default: template.is_default === true,
      logo_text: template.logo_text || '',
      header_color: template.header_color || '#0A0F1E',
      footer_text: template.footer_text || '',
      email_body: template.email_body || '',
      summary_layout: template.summary_layout || 'standard',
      pdf_layout: template.pdf_layout || 'standard',
      excel_layout: template.excel_layout || 'standard',
      last_modified: new Date().toISOString()
    };
    if (template.id) {
      dbRow.id = template.id;
    }
    const { data, error } = await supabase
      .from('report_templates')
      .upsert(dbRow)
      .select()
      .single();
    if (error) throw error;

    // If this template is set as default, unset other defaults for the same report_type
    if (dbRow.is_default && data?.id) {
      await supabase
        .from('report_templates')
        .update({ is_default: false })
        .eq('report_type', dbRow.report_type)
        .neq('id', data.id);
    }

    await addAuditLog(null, null, null, 'Report Template Save', `Saved report template: ${template.name} for ${template.report_type}`);
    return data;
  } catch (err) {
    console.error("Error saving report_template to Supabase:", err);
    throw err;
  }
}

export async function deleteReportTemplate(id) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    const { data: template } = await supabase
      .from('report_templates')
      .select('name')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('report_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await addAuditLog(null, null, null, 'Report Template Deletion', `Deleted report template: ${template?.name || id}`);
  } catch (err) {
    console.error("Error deleting report_template from Supabase:", err);
    throw err;
  }
}

export async function setDefaultReportTemplate(id, reportType) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not initialized");
  try {
    // Unset all defaults for this reportType
    const { error: err1 } = await supabase
      .from('report_templates')
      .update({ is_default: false })
      .eq('report_type', reportType);
    if (err1) throw err1;

    // Set target to default
    const { data, error: err2 } = await supabase
      .from('report_templates')
      .update({ is_default: true, last_modified: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (err2) throw err2;

    await addAuditLog(null, null, null, 'Report Template Set Default', `Set template "${data?.name}" as default for ${reportType}`);
    return data;
  } catch (err) {
    console.error("Error setting default report_template in Supabase:", err);
    throw err;
  }
}

export async function discoverDatabaseStructure(customClient, customConfig) {
  const supabase = customClient || getSupabaseClient();
  if (!supabase) {
    console.warn("[Schema Discovery] Supabase client not initialized.");
    return null;
  }
  
  const config = customConfig || getSupabaseConfig();
  console.info("[Schema Discovery] Starting probe-based auto-discovery scan on:", config?.url);

  const knownTables = [
    'Database',
    'profiles',
    'plants',
    'production_data',
    'tag_configurations',
    'email_configuration',
    'smtp_configurations',
    'report_templates',
    'scheduled_reports',
    'report_history',
    'synchronization_logs',
    'report_recipients',
    'audit_logs'
  ];

  const discovered = [];
  for (const tblName of knownTables) {
    try {
      console.info(`[Schema Discovery] Probing table existence for: '${tblName}'`);
      // Try to fetch 1 row to test existence and inspect columns
      const { data: sampleRows, error: selectErr } = await supabase
        .from(tblName)
        .select('*')
        .limit(1);

      let exists = false;
      let cols = [];

      if (!selectErr) {
        exists = true;
        console.info(`[Schema Discovery] Table '${tblName}' probe succeeded.`);
        if (sampleRows && sampleRows.length > 0) {
          Object.keys(sampleRows[0]).forEach(colName => {
            const val = sampleRows[0][colName];
            let type = typeof val;
            if (val instanceof Date) type = 'timestamp';
            else if (typeof val === 'number') type = Number.isInteger(val) ? 'integer' : 'numeric';
            
            // Map primary keys logically
            let isPk = false;
            if (tblName === 'Database' && (colName === 'DateAndTime' || colName === 'TagIndex')) {
              isPk = true;
            } else if (colName === 'id' || colName === 'TagIndex') {
              isPk = true;
            }
            
            cols.push({
              name: colName,
              type: type || 'text',
              isPk
            });
          });
        }
        
        // Ensure static schemas supply PK details/default columns if sample rows are empty
        if (cols.length === 0) {
          cols = STATIC_TABLE_SCHEMAS[tblName] || [{ name: 'id', type: 'text', isPk: true }];
        }
      } else {
        const msg = selectErr.message || '';
        const code = selectErr.code || '';
        
        // 42P01 is undefined_table, check for "does not exist" or "relation" in the error message
        if (code === '42P01' || msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('relation')) {
          exists = false;
          console.warn(`[Schema Discovery] Table '${tblName}' does not exist in the database (Code: ${code}, Msg: ${msg})`);
        } else {
          // It's a permission/RLS denial, but the table exists!
          exists = true;
          console.info(`[Schema Discovery] Table '${tblName}' exists but query was denied (RLS/Permissions). Fallback to static schema. Code: ${code}, Msg: ${msg}`);
          cols = STATIC_TABLE_SCHEMAS[tblName] || [{ name: 'id', type: 'text', isPk: true }];
        }
      }

      if (exists) {
        // Query exact row count
        let countVal = 0;
        try {
          const { count, error: countErr } = await supabase
            .from(tblName)
            .select('*', { count: 'exact', head: true });
          if (countErr) {
            console.error(`[Schema Discovery] Row count query failed for '${tblName}':`, countErr);
          } else if (count !== null) {
            countVal = count;
          }
        } catch (errCount) {
          console.error(`[Schema Discovery] Exception during row count query for '${tblName}':`, errCount);
        }

        // Query last record timestamp if applicable
        let lastTimestamp = null;
        try {
          const tsCol = cols.find(c => ['DateAndTime', 'timestamp', 'created_at', 'generated_at', 'last_modified', 'updated_at'].includes(c.name))?.name;
          if (tsCol) {
            const { data: latestRow, error: tsErr } = await supabase
              .from(tblName)
              .select(tsCol)
              .order(tsCol, { ascending: false })
              .limit(1);
            if (tsErr) {
              console.error(`[Schema Discovery] Last record timestamp query failed for '${tblName}' on column '${tsCol}':`, tsErr);
            } else if (latestRow && latestRow.length > 0) {
              lastTimestamp = latestRow[0][tsCol];
            }
          }
        } catch (errTs) {
          console.error(`[Schema Discovery] Exception during last record timestamp query for '${tblName}':`, errTs);
        }

        // Identify primary key column
        const primaryKey = cols.find(c => c.isPk)?.name || cols[0]?.name || 'id';

        discovered.push({
          name: tblName,
          schema: 'public',
          recordCount: countVal,
          primaryKey,
          status: 'ACTIVE',
          columns: cols,
          lastRecordTimestamp: lastTimestamp
        });
      }
    } catch (tblErr) {
      console.error(`[Schema Discovery] Exception reflecting on table '${tblName}':`, tblErr);
    }
  }

  if (discovered.length > 0) {
    console.info(`[Schema Discovery] Dynamic discovery complete. Reflected on ${discovered.length} active tables.`);
    return {
      public: {
        tables: discovered,
        views: [],
        procedures: []
      }
    };
  }

  return null;
}

// Static fallback metadata schemas for standard tables
export const STATIC_TABLE_SCHEMAS = {
  'Database': [
    { name: 'DateAndTime', type: 'timestamp', isPk: true },
    { name: 'Millitm', type: 'integer', isPk: false },
    { name: 'TagIndex', type: 'integer', isPk: true },
    { name: 'Val', type: 'numeric', isPk: false },
    { name: 'Status', type: 'integer', isPk: false },
    { name: 'Marker', type: 'text', isPk: false }
  ],
  'profiles': [
    { name: 'id', type: 'uuid', isPk: true },
    { name: 'email', type: 'text', isPk: false },
    { name: 'name', type: 'text', isPk: false },
    { name: 'role', type: 'text', isPk: false },
    { name: 'plant_id', type: 'text', isPk: false },
    { name: 'active', type: 'boolean', isPk: false }
  ],
  'plants': [
    { name: 'id', type: 'text', isPk: true },
    { name: 'name', type: 'text', isPk: false },
    { name: 'location', type: 'text', isPk: false },
    { name: 'capacity', type: 'integer', isPk: false },
    { name: 'targetOee', type: 'integer', isPk: false }
  ],
  'tag_configurations': [
    { name: 'TagIndex', type: 'integer', isPk: true },
    { name: 'TagName', type: 'text', isPk: false },
    { name: 'Unit', type: 'text', isPk: false },
    { name: 'Description', type: 'text', isPk: false },
    { name: 'DecimalPlaces', type: 'integer', isPk: false }
  ],
  'email_configuration': [
    { name: 'id', type: 'text', isPk: true },
    { name: 'host', type: 'text', isPk: false },
    { name: 'port', type: 'integer', isPk: false },
    { name: 'username', type: 'text', isPk: false },
    { name: 'password', type: 'text', isPk: false },
    { name: 'secure', type: 'boolean', isPk: false },
    { name: 'logo_text', type: 'text', isPk: false },
    { name: 'header_color', type: 'text', isPk: false },
    { name: 'footer_text', type: 'text', isPk: false }
  ],
  'smtp_configurations': [
    { name: 'id', type: 'uuid', isPk: true },
    { name: 'name', type: 'text', isPk: false },
    { name: 'host', type: 'text', isPk: false },
    { name: 'port', type: 'integer', isPk: false },
    { name: 'username', type: 'text', isPk: false },
    { name: 'password', type: 'text', isPk: false },
    { name: 'secure', type: 'boolean', isPk: false },
    { name: 'is_active', type: 'boolean', isPk: false }
  ],
  'report_templates': [
    { name: 'id', type: 'uuid', isPk: true },
    { name: 'name', type: 'text', isPk: false },
    { name: 'report_type', type: 'text', isPk: false },
    { name: 'subject', type: 'text', isPk: false },
    { name: 'is_default', type: 'boolean', isPk: false },
    { name: 'logo_text', type: 'text', isPk: false },
    { name: 'header_color', type: 'text', isPk: false },
    { name: 'footer_text', type: 'text', isPk: false },
    { name: 'email_body', type: 'text', isPk: false },
    { name: 'summary_layout', type: 'text', isPk: false },
    { name: 'pdf_layout', type: 'text', isPk: false },
    { name: 'excel_layout', type: 'text', isPk: false },
    { name: 'last_modified', type: 'timestamp with time zone', isPk: false }
  ],
  'scheduled_reports': [
    { name: 'id', type: 'text', isPk: true },
    { name: 'plant_id', type: 'text', isPk: false },
    { name: 'report_type', type: 'text', isPk: false },
    { name: 'frequency', type: 'text', isPk: false },
    { name: 'time', type: 'text', isPk: false },
    { name: 'email_recipients', type: 'text', isPk: false },
    { name: 'enabled', type: 'boolean', isPk: false },
    { name: 'last_run', type: 'timestamp', isPk: false },
    { name: 'format_pdf', type: 'boolean', isPk: false },
    { name: 'format_excel', type: 'boolean', isPk: false },
    { name: 'report_mode', type: 'text', isPk: false },
    { name: 'shift_number', type: 'integer', isPk: false },
    { name: 'last_run_time', type: 'timestamp with time zone', isPk: false },
    { name: 'next_run_time', type: 'timestamp with time zone', isPk: false },
    { name: 'last_execution_status', type: 'text', isPk: false },
    { name: 'records_included', type: 'integer', isPk: false },
    { name: 'last_email_sent_to', type: 'text', isPk: false }
  ],
  'report_history': [
    { name: 'id', type: 'text', isPk: true },
    { name: 'name', type: 'text', isPk: false },
    { name: 'type', type: 'text', isPk: false },
    { name: 'date_range', type: 'text', isPk: false },
    { name: 'shift', type: 'text', isPk: false },
    { name: 'plant_id', type: 'text', isPk: false },
    { name: 'generated_at', type: 'timestamp', isPk: false },
    { name: 'created_by', type: 'text', isPk: false },
    { name: 'trigger_time', type: 'text', isPk: false },
    { name: 'records_processed', type: 'integer', isPk: false }
  ],
  'synchronization_logs': [
    { name: 'id', type: 'bigint', isPk: true },
    { name: 'timestamp', type: 'timestamp', isPk: false },
    { name: 'status_type', type: 'text', isPk: false },
    { name: 'log_message', type: 'text', isPk: false }
  ],
  'report_recipients': [
    { name: 'id', type: 'uuid', isPk: true },
    { name: 'email', type: 'text', isPk: false },
    { name: 'name', type: 'text', isPk: false },
    { name: 'role', type: 'text', isPk: false },
    { name: 'active', type: 'boolean', isPk: false }
  ],
  'production_data': [
    { name: 'id', type: 'text', isPk: true },
    { name: 'plant_id', type: 'text', isPk: false },
    { name: 'timestamp', type: 'timestamp with time zone', isPk: false },
    { name: 'date', type: 'text', isPk: false },
    { name: 'hour', type: 'integer', isPk: false },
    { name: 'shift', type: 'text', isPk: false },
    { name: 'target_parts', type: 'integer', isPk: false },
    { name: 'actual_parts', type: 'integer', isPk: false },
    { name: 'reject_parts', type: 'integer', isPk: false },
    { name: 'uptime_minutes', type: 'integer', isPk: false },
    { name: 'downtime_reason', type: 'text', isPk: false }
  ],
  'audit_logs': [
    { name: 'id', type: 'uuid', isPk: true },
    { name: 'timestamp', type: 'timestamp with time zone', isPk: false },
    { name: 'user_email', type: 'text', isPk: false },
    { name: 'ip_address', type: 'text', isPk: false },
    { name: 'action', type: 'text', isPk: false },
    { name: 'details', type: 'text', isPk: false },
    { name: 'status', type: 'text', isPk: false }
  ]
};

// Database table statistics helper
export async function getDatabaseTableStats() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    console.info("[Stats Service] Querying statistics for table 'Database'...");
    
    // 1. Get row count
    const { count: rowCount, error: countErr } = await supabase
      .from('Database')
      .select('*', { count: 'exact', head: true });
    if (countErr) {
      console.warn("[Stats Service] Row count query failed:", countErr.message);
    }
    
    // 2. Get latest record timestamp
    let latestTimestamp = null;
    const { data: latestRows, error: tsErr } = await supabase
      .from('Database')
      .select('DateAndTime')
      .order('DateAndTime', { ascending: false })
      .limit(1);
    if (tsErr) {
      console.warn("[Stats Service] Latest timestamp query failed:", tsErr.message);
    } else if (latestRows && latestRows.length > 0) {
      latestTimestamp = latestRows[0].DateAndTime;
    }
    
    // 3. Get TagIndex stats
    const tagConfigs = await getTagConfigs();
    const tagStats = [];
    
    for (const tag of tagConfigs) {
      try {
        // Count for this tag
        const { count: tagCount } = await supabase
          .from('Database')
          .select('*', { count: 'exact', head: true })
          .eq('TagIndex', tag.TagIndex);
          
        // Latest value and time for this tag
        const { data: tagValRows } = await supabase
          .from('Database')
          .select('Val,DateAndTime')
          .eq('TagIndex', tag.TagIndex)
          .order('DateAndTime', { ascending: false })
          .limit(1);
          
        tagStats.push({
          TagIndex: tag.TagIndex,
          TagName: tag.TagName,
          Unit: tag.Unit || '',
          RecordCount: tagCount || 0,
          LatestValue: tagValRows && tagValRows.length > 0 ? tagValRows[0].Val : null,
          LatestTime: tagValRows && tagValRows.length > 0 ? tagValRows[0].DateAndTime : null
        });
      } catch (errTag) {
        console.warn(`[Stats Service] Failed to get stats for Tag ${tag.TagIndex}:`, errTag.message);
      }
    }
    
    return {
      rowCount: rowCount || 0,
      latestTimestamp,
      tagStats
    };
  } catch (err) {
    console.error("[Stats Service] Failed to query Database table stats:", err);
    return null;
  }
}



