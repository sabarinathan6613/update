import { getSupabaseClient, getSupabaseConfig } from './supabaseClient';

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

const DEFAULT_TAG_CONFIGS = [];

export function initDB() {
  const defaultLocalAdmin = {
    id: "super-admin-init",
    email: "superadmin@plant.com",
    password: "password123",
    name: "Initial Administrator",
    role: "Super Admin",
    plantId: "all",
    active: true
  };
  if (!localStorage.getItem("prod_users")) {
    localStorage.setItem("prod_users", JSON.stringify([defaultLocalAdmin]));
  } else {
    try {
      const users = JSON.parse(localStorage.getItem("prod_users")) || [];
      if (users.length === 0) {
        localStorage.setItem("prod_users", JSON.stringify([defaultLocalAdmin]));
      }
    } catch {
      localStorage.setItem("prod_users", JSON.stringify([defaultLocalAdmin]));
    }
  }
  if (!localStorage.getItem("prod_plants")) {
    localStorage.setItem("prod_plants", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_schedules")) {
    localStorage.setItem("prod_schedules", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_settings")) {
    let envUrl = "";
    let envKey = "";
    try {
      envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
      envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
    } catch { /* ignored */ }
    const initialSettings = {
      ...DEFAULT_SETTINGS,
      supabaseUrl: envUrl,
      supabaseAnonKey: envKey
    };
    localStorage.setItem("prod_settings", JSON.stringify(initialSettings));
  }
  if (!localStorage.getItem("prod_tag_config")) {
    localStorage.setItem("prod_tag_config", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_history")) {
    localStorage.setItem("prod_history", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_sync_logs")) {
    localStorage.setItem("prod_sync_logs", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_email_logs")) {
    localStorage.setItem("prod_email_logs", JSON.stringify([]));
  }
}

// User Profile management
export async function getUsers() {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();

  let currentUserId = "Unknown";
  let currentRole = "Unknown";

  // Check local storage for active user as fallback/preliminary source
  const activeUserJson = localStorage.getItem("prod_active_user") || sessionStorage.getItem("prod_active_user");
  if (activeUserJson) {
    try {
      const activeUser = JSON.parse(activeUserJson);
      currentUserId = activeUser.id || "Unknown";
      currentRole = activeUser.role || "Unknown";
    } catch (e) { /* ignored */ }
  }

  if (isConnected && supabase) {
    try {
      // Get current user from supabase auth
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

      // Find current user's role from the cloud users list
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

  // Fallback to local storage ONLY if supabase is NOT configured
  const localUsers = JSON.parse(localStorage.getItem("prod_users")) || [];
  const usersReturned = localUsers.map(u => ({ email: u.email, role: u.role }));
  console.log(`[User Audit Log] (Local Fallback)
Current User ID: ${currentUserId}
Current Role: ${currentRole}
Query Result Count: ${localUsers.length}
Users Returned:`, usersReturned);

  return localUsers;
}

export async function saveUser(user) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();

  if (isConnected && supabase) {
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
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: user.email.trim(),
          password: user.password || ''
        });
        if (authError) throw authError;
        if (authData?.user?.id) {
          dbProfile.id = authData.user.id;
        }
      }

      const { data, error } = await supabase.from('profiles').upsert(dbProfile).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        const saved = data[0];
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

  // Fallback to local storage ONLY when supabase is not configured
  const users = JSON.parse(localStorage.getItem("prod_users")) || [];
  const localUser = { ...user };
  if (!localUser.id) {
    localUser.id = "user-" + Date.now();
  }
  const idx = users.findIndex(u => u.id === localUser.id || u.email.toLowerCase() === localUser.email.toLowerCase());
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...localUser };
  } else {
    users.push(localUser);
  }
  localStorage.setItem("prod_users", JSON.stringify(users));
  return localUser;
}

export async function deleteUser(userId) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();

  if (isConnected && supabase) {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) {
      console.error("Supabase profiles delete error:", error);
      throw new Error(`Supabase profiles delete failed: ${error.message}`);
    }
    return;
  }

  // Fallback to local storage ONLY when supabase is not configured
  const users = JSON.parse(localStorage.getItem("prod_users")) || [];
  const filtered = users.filter(u => u.id !== userId);
  localStorage.setItem("prod_users", JSON.stringify(filtered));
}


// Plant configurations query
export async function getPlants() {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('plants').select('*');
    if (!error && data.length > 0) return data;
    console.error("Supabase plants query error:", error);
    if (isConnected) return [];
  }
  return JSON.parse(localStorage.getItem("prod_plants"));
}

export async function savePlant(plant) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('plants').upsert(plant);
    if (!error) return;
    console.error("Supabase plants upsert error:", error);
    if (isConnected) throw new Error(`Supabase plants upsert failed: ${error.message}`);
  }
  const plants = JSON.parse(localStorage.getItem("prod_plants"));
  const idx = plants.findIndex(p => p.id === plant.id);
  if (idx !== -1) {
    plants[idx] = plant;
  } else {
    plants.push(plant);
  }
  localStorage.setItem("prod_plants", JSON.stringify(plants));
}

// Tag Configurations Management
export async function getTagConfigs() {
  initDB();
  const localConfigs = JSON.parse(localStorage.getItem("prod_tag_config")) || DEFAULT_TAG_CONFIGS;
  const supabase = getSupabaseClient();
  if (supabase) {
    // 1. Try querying tag_configurations table
    try {
      const { data, error } = await supabase.from('tag_configurations').select('*');
      if (!error && data && data.length > 0) {
        return data.map(t => ({
          TagIndex: t.tag_index,
          TagName: t.display_name || t.tag_name || `Tag Index ${t.tag_index}`,
          Unit: t.unit || '',
          Description: t.description || `Telemetry channel for Tag Index ${t.tag_index}`,
          DecimalPlaces: t.decimal_places !== undefined ? t.decimal_places : 2,
          DashboardVisible: t.dashboard_visibility !== undefined ? t.dashboard_visibility : (t.dashboard_visible !== undefined ? t.dashboard_visible : false),
          TrendsVisible: t.trends_visible !== undefined ? t.trends_visible : false,
          ReportsVisible: t.reports_visible !== undefined ? t.reports_visible : false
        }));
      }
    } catch { /* ignored */ }

    // 2. Fallback: Query email_configuration table for row id = 'tag_configs'
    try {
      const { data, error } = await supabase.from('email_configuration').select('*').eq('id', 'tag_configs').single();
      if (!error && data && data.password) {
        const parsed = JSON.parse(data.password);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch { /* ignored */ }
  }
  return localConfigs;
}

export async function saveTagConfigs(configs) {
  initDB();
  const supabase = getSupabaseClient();
  if (supabase) {
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
      await supabase.from('tag_configurations').upsert(dbConfigs);
    } catch { /* ignored */ }

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
      await supabase.from('email_configuration').upsert(dbTagBackup);
    } catch { /* ignored */ }
  }
  localStorage.setItem("prod_tag_config", JSON.stringify(configs));
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

// Historian Database Queries - Fetch from live connected table or local buffer fallback
export async function getHistorianData({ tagIndexes, startDate, endDate, limit, tableName, sort = 'desc' } = {}) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  
  // Load configured tags to get the valid TagIndexes
  const tagConfigs = await getTagConfigs();
  const configuredIndexes = tagConfigs.map(c => c.TagIndex);

  const settings = await getSettings();
  const activeTableName = settings.selectedTable || 'Database';
  const targetTableName = tableName || activeTableName;

  // We only filter by TagIndex and apply column mapping translation for the main historian table
  const isMainHistorian = targetTableName === activeTableName || targetTableName === 'Database';

  if (supabase) {
    if (isMainHistorian) {
      let targetIndexes;
      if (tagIndexes && tagIndexes.length > 0) {
        targetIndexes = tagIndexes.filter(idx => configuredIndexes.includes(idx));
      } else {
        targetIndexes = configuredIndexes;
      }

      if (targetIndexes.length === 0) {
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
        query = query.limit(limit);
        const { data, error } = await query.order(tsCol, { ascending: sort === 'asc' });
        if (!error && data) {
          return data.map(row => translateRowToStandard(row, settings.columnMappings, isAlarmInt));
        }
        console.error(`Supabase historian query on table [${targetTableName}] error:`, error);
        if (isConnected) return [];
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
            break;
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
        return allData.map(row => translateRowToStandard(row, settings.columnMappings, isAlarmInt));
      }
    } else {
      // Direct raw query for Explorer tables
      let query = supabase.from(targetTableName).select('*');
      if (limit) {
        query = query.limit(limit);
      }
      const { data, error } = await query;
      if (!error && data) {
        return data;
      }
      console.error(`Supabase query on table [${targetTableName}] error:`, error);
      return [];
    }
  }

  // Local Fallback filtering
  if (isMainHistorian) {
    let targetIndexes = [];
    if (tagIndexes && tagIndexes.length > 0) {
      targetIndexes = tagIndexes.filter(idx => configuredIndexes.includes(idx));
    } else {
      targetIndexes = configuredIndexes;
    }

    if (targetIndexes.length === 0) {
      return [];
    }

    let list = JSON.parse(localStorage.getItem("prod_history")) || [];
    list = list.filter(item => targetIndexes.includes(item.TagIndex));
    
    if (startDate) {
      const startMs = new Date(startDate).getTime();
      list = list.filter(item => new Date(item.DateAndTime).getTime() >= startMs);
    }
    if (endDate) {
      const endMs = new Date(endDate).getTime();
      list = list.filter(item => new Date(item.DateAndTime).getTime() <= endMs);
    }
    if (sort === 'asc') {
      list.sort((a, b) => new Date(a.DateAndTime) - new Date(b.DateAndTime));
    } else {
      list.sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime));
    }
    if (limit) {
      list = list.slice(0, limit);
    }
    return list;
  }

  // Local fallback mock logs for Explorer
  if (targetTableName === 'email_configuration') {
    return [JSON.parse(localStorage.getItem("prod_settings")) || {}];
  }
  if (targetTableName === 'synchronization_logs') {
    return JSON.parse(localStorage.getItem("prod_sync_logs")) || [];
  }

  return [];
}

export async function addHistorianRecords(records) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  
  if (supabase) {
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
    if (!error) return;
    console.error(`[Historian Insert Error Diagnostics] Mappings:`, JSON.stringify(settings.columnMappings));
    console.error(`[Historian Insert Error Diagnostics] Sample Row:`, JSON.stringify(dbRecords[0]));
    console.error(`Supabase historian insert on table [${tableName}] error:`, error);
    if (isConnected) throw new Error(`Supabase historian write failed: ${error.message}`);
  }

  const history = JSON.parse(localStorage.getItem("prod_history")) || [];
  records.forEach(newRec => {
    history.push(newRec);
  });
  // Cap local history size at 12000 records to prevent quota errors
  const trimmed = history.slice(-12000);
  localStorage.setItem("prod_history", JSON.stringify(trimmed));
}

// Scheduled Reports configuration
export async function getSchedules() {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('scheduled_reports').select('*');
    if (!error) {
      return data.map(s => ({
        id: s.id,
        plantId: s.plant_id,
        reportType: s.report_type,
        frequency: s.frequency,
        time: s.time,
        emailRecipients: s.email_recipients,
        enabled: s.enabled,
        lastRun: s.last_run,
        formatPdf: s.format_pdf !== undefined ? s.format_pdf : true,
        formatExcel: s.format_excel !== undefined ? s.format_excel : true
      }));
    }
    console.error("Supabase schedules query error:", error);
    if (isConnected) return [];
  }
  return JSON.parse(localStorage.getItem("prod_schedules")) || [];
}

export async function saveSchedule(schedule) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
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
      format_excel: schedule.formatExcel !== undefined ? schedule.formatExcel : true
    };
    if (!dbSched.id) {
      dbSched.id = 'sched-' + Date.now();
    }
    const { error } = await supabase.from('scheduled_reports').upsert(dbSched);
    if (!error) return schedule;
    console.error("Supabase schedules upsert error:", error);
    if (isConnected) throw new Error(`Supabase schedules upsert failed: ${error.message}`);
  }

  const schedules = JSON.parse(localStorage.getItem("prod_schedules")) || [];
  if (schedule.id) {
    const idx = schedules.findIndex(s => s.id === schedule.id);
    if (idx !== -1) schedules[idx] = schedule;
  } else {
    schedule.id = "sched-" + Date.now();
    schedules.push(schedule);
  }
  localStorage.setItem("prod_schedules", JSON.stringify(schedules));
  return schedule;
}

export async function deleteSchedule(scheduleId) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('scheduled_reports').delete().eq('id', scheduleId);
    if (!error) return;
    console.error("Supabase schedules delete error:", error);
    if (isConnected) throw new Error(`Supabase schedules delete failed: ${error.message}`);
  }
  const schedules = JSON.parse(localStorage.getItem("prod_schedules"));
  const filtered = schedules.filter(s => s.id !== scheduleId);
  localStorage.setItem("prod_schedules", JSON.stringify(filtered));
}

// System settings configuration
export async function getSettings() {
  initDB();
  const localSettings = JSON.parse(localStorage.getItem("prod_settings")) || DEFAULT_SETTINGS;
  
  // Backfill environment variables if empty
  let envUrl = "";
  let envKey = "";
  try {
    envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
    envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  } catch { /* ignored */ }

  let settingsChanged = false;
  if (!localSettings.supabaseUrl && envUrl) {
    localSettings.supabaseUrl = envUrl;
    settingsChanged = true;
  }
  if (!localSettings.supabaseAnonKey && envKey) {
    localSettings.supabaseAnonKey = envKey;
    settingsChanged = true;
  }
  if (settingsChanged) {
    localStorage.setItem("prod_settings", JSON.stringify(localSettings));
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: smtpData } = await supabase.from('email_configuration').select('*').eq('id', 'default').single();
      const { data: sysData } = await supabase.from('email_configuration').select('*').eq('id', 'system_settings').single();

      let merged = { ...localSettings };

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
      return merged;
    } catch (err) {
      console.warn("Error retrieving global settings from Supabase:", err);
    }
  }
  return localSettings;
}

export async function saveSettings(settings) {
  initDB();
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let finalPass = settings.smtpPass;
      if (finalPass === '••••••••••••') {
        const { data: existingSmtp } = await supabase.from('email_configuration').select('password').eq('id', 'default').single();
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
    }
  }

  const localSettings = {
    ...settings,
    templateLogoText: settings.templateLogoText || settings.logoText || '',
    templateHeaderColor: settings.templateHeaderColor || settings.headerColor || '',
    templateFooterText: settings.templateFooterText || settings.footerColor || '',
    logoText: settings.templateLogoText || settings.logoText || '',
    headerColor: settings.templateHeaderColor || settings.headerColor || '',
    footerColor: settings.templateFooterText || settings.footerColor || ''
  };
  localStorage.setItem("prod_settings", JSON.stringify(localSettings));
}

// Sync Gateway logs
export async function getSyncLogs() {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('synchronization_logs').select('*').order('timestamp', { ascending: false }).limit(50);
    if (!error) {
      return data.map(l => ({
        timestamp: l.timestamp,
        type: l.status_type,
        message: l.log_message
      }));
    }
    console.error("Supabase synchronization_logs query error:", error);
    if (isConnected) return [];
  }
  return JSON.parse(localStorage.getItem("prod_sync_logs")) || [];
}

export async function addSyncLog(msg, type = "SYNC") {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('synchronization_logs').insert({
      status_type: type === "SYNC" ? "SUCCESS" : type,
      log_message: msg
    });
    if (!error) return;
    console.error("Supabase synchronization_logs insert error:", error);
  }
  const logs = JSON.parse(localStorage.getItem("prod_sync_logs")) || [];
  logs.unshift({
    timestamp: new Date().toISOString(),
    type,
    message: msg
  });
  if (logs.length > 50) logs.pop();
  localStorage.setItem("prod_sync_logs", JSON.stringify(logs));
}

// SMTP Outbox history logs
export async function getEmailLogs() {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('report_history').select('*').order('generated_at', { ascending: false }).limit(50);
    if (!error) {
      return data.map(e => ({
        timestamp: e.generated_at,
        recipient: e.created_by || '',
        subject: e.name,
        message: e.type,
        status: "SENT"
      }));
    }
    console.error("Supabase report_history query error:", error);
    if (isConnected) return [];
  }
  return JSON.parse(localStorage.getItem("prod_email_logs")) || [];
}

export async function addEmailLog(emailLog) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const dbReportHistory = {
      id: 'rep-' + Date.now(),
      name: emailLog.subject,
      type: emailLog.message || 'Scheduled Email Report',
      date_range: new Date().toISOString().split('T')[0],
      shift: 'All Shifts',
      created_by: emailLog.recipient
    };
    const { error } = await supabase.from('report_history').insert(dbReportHistory);
    if (!error) return;
    console.error("Supabase report_history insert error:", error);
  }
  const logs = JSON.parse(localStorage.getItem("prod_email_logs")) || [];
  logs.unshift({
    timestamp: new Date().toISOString(),
    ...emailLog
  });
  if (logs.length > 50) logs.pop();
  localStorage.setItem("prod_email_logs", JSON.stringify(logs));
}

// ─── Report History CRUD (Supabase-backed) ────────────────────────────────────

export async function getReportsList() {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('report_history')
        .select('*')
        .not('shift', 'is', null)
        .order('generated_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        return data
          .filter(r => {
            // Only rows that represent saved reports (have tags stored in shift column)
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
      }
      console.warn('getReportsList Supabase error:', error);
      if (isConnected) return [];
    } catch (err) {
      console.warn('getReportsList exception:', err);
    }
  }
  // localStorage fallback
  try {
    return JSON.parse(localStorage.getItem('prod_reports_list')) || [];
  } catch {
    return [];
  }
}

export async function saveReportRecord(report) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const dbRow = {
        id: report.id,
        name: report.name,
        type: report.type || 'Historian Shift Summary',
        date_range: report.dateInfo || '',
        shift: JSON.stringify(report.tags || []),
        created_by: report.createdBy || ''
      };
      const { error } = await supabase.from('report_history').upsert(dbRow);
      if (!error) return report;
      console.error('saveReportRecord Supabase error:', error);
      if (isConnected) throw new Error(`Failed to save report: ${error.message}`);
    } catch (err) {
      if (isConnected) throw err;
      console.warn('saveReportRecord exception (using local fallback):', err);
    }
  }
  // localStorage fallback
  try {
    const list = JSON.parse(localStorage.getItem('prod_reports_list')) || [];
    const idx = list.findIndex(r => r.id === report.id);
    if (idx !== -1) { list[idx] = report; } else { list.unshift(report); }
    localStorage.setItem('prod_reports_list', JSON.stringify(list));
  } catch { /* ignored */ }
  return report;
}

export async function deleteReportRecord(reportId) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('report_history').delete().eq('id', reportId);
      if (!error) return;
      console.error('deleteReportRecord Supabase error:', error);
      if (isConnected) throw new Error(`Failed to delete report: ${error.message}`);
    } catch (err) {
      if (isConnected) throw err;
      console.warn('deleteReportRecord exception (using local fallback):', err);
    }
  }
  // localStorage fallback
  try {
    const list = JSON.parse(localStorage.getItem('prod_reports_list')) || [];
    localStorage.setItem('prod_reports_list', JSON.stringify(list.filter(r => r.id !== reportId)));
  } catch { /* ignored */ }
}
