import { getSupabaseClient, getSupabaseConfig } from './supabaseClient';

const DEFAULT_USERS = [];
const DEFAULT_PLANTS = [];
const DEFAULT_SCHEDULES = [];

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

function generateHistorianData() {
  return [];
}

export function initDB() {
  if (!localStorage.getItem("prod_users")) {
    localStorage.setItem("prod_users", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_plants")) {
    localStorage.setItem("prod_plants", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_schedules")) {
    localStorage.setItem("prod_schedules", JSON.stringify([]));
  }
  if (!localStorage.getItem("prod_settings")) {
    localStorage.setItem("prod_settings", JSON.stringify(DEFAULT_SETTINGS));
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
  const supabase = getSupabaseClient();

  // Always load local users as the base
  const localUsers = JSON.parse(localStorage.getItem("prod_users")) || [];

  if (supabase) {
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!error && data) {
        const cloudUsers = data.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          plantId: u.plant_id,
          active: u.active
        }));

        // Merge: start with local users, overlay/replace with cloud users by email
        const merged = [...localUsers];
        cloudUsers.forEach(cu => {
          const idx = merged.findIndex(lu => lu.email.toLowerCase() === cu.email.toLowerCase());
          if (idx !== -1) {
            // Cloud data takes priority, but preserve local password
            merged[idx] = { ...merged[idx], ...cu };
          } else {
            merged.push(cu);
          }
        });
        return merged;
      }
      console.warn("Supabase profiles query error, using local storage:", error);
    } catch (e) {
      console.warn("Supabase getUsers exception, using local storage:", e);
    }
  }

  return localUsers;
}

export async function saveUser(user) {
  initDB();
  const supabase = getSupabaseClient();
  let savedUser = null;

  if (supabase) {
    try {
      const dbProfile = {
        id: user.id || undefined,
        email: user.email,
        name: user.name,
        role: user.role,
        plant_id: user.plantId,
        active: user.active
      };

      if (!dbProfile.id) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: user.email.trim(),
          password: user.password || 'password123'
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
        savedUser = {
          id: saved.id,
          email: saved.email,
          name: saved.name,
          password: user.password || 'password123',
          role: saved.role,
          plantId: saved.plant_id,
          active: saved.active
        };
      }
    } catch (e) {
      console.warn("Supabase user save failed, falling back to local:", e);
    }
  }

  const users = JSON.parse(localStorage.getItem("prod_users")) || [];
  if (savedUser) {
    const idx = users.findIndex(u => u.id === savedUser.id || u.email.toLowerCase() === savedUser.email.toLowerCase());
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...savedUser };
    } else {
      users.push(savedUser);
    }
    localStorage.setItem("prod_users", JSON.stringify(users));
    return savedUser;
  } else {
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
}

export async function deleteUser(userId) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (!error) return;
    console.error("Supabase profiles delete error:", error);
    if (isConnected) throw new Error(`Supabase profiles delete failed: ${error.message}`);
  }
  const users = JSON.parse(localStorage.getItem("prod_users"));
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
  }
  return localConfigs;
}

export async function saveTagConfigs(configs) {
  initDB();
  const supabase = getSupabaseClient();
  if (supabase) {
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
    if (error) console.error("Supabase tag_configurations upsert error:", error);
  }
  localStorage.setItem("prod_tag_config", JSON.stringify(configs));
}

// Historian Database Queries - Fetch from live connected table or local buffer fallback
export async function getHistorianData({ tagIndexes, startDate, endDate, limit } = {}) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  
  if (supabase) {
    const settings = await getSettings();
    const tableName = settings.selectedTable || 'Database';
    
    let query = supabase.from(tableName).select('*');
    if (tagIndexes && tagIndexes.length > 0) {
      query = query.in('TagIndex', tagIndexes);
    }
    if (startDate) {
      query = query.gte('DateAndTime', startDate);
    }
    if (endDate) {
      query = query.lte('DateAndTime', endDate);
    }
    if (limit) {
      query = query.limit(limit);
    }
    
    const { data, error } = await query.order('DateAndTime', { ascending: false });
    if (!error && data) {
      return data;
    }
    console.error(`Supabase historian query on table [${tableName}] error:`, error);
    if (isConnected) return [];
  }

  // Local Fallback filtering
  let list = JSON.parse(localStorage.getItem("prod_history")) || [];
  if (tagIndexes && tagIndexes.length > 0) {
    list = list.filter(item => tagIndexes.includes(item.TagIndex));
  }
  if (startDate) {
    list = list.filter(item => item.DateAndTime >= startDate);
  }
  if (endDate) {
    list = list.filter(item => item.DateAndTime <= endDate);
  }
  list.sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime));
  if (limit) {
    list = list.slice(0, limit);
  }
  return list;
}

export async function addHistorianRecords(records) {
  initDB();
  const isConnected = getSupabaseConfig() !== null;
  const supabase = getSupabaseClient();
  
  if (supabase) {
    const settings = await getSettings();
    const tableName = settings.selectedTable || 'Database';
    
    const dbRecords = records.map(r => ({
      DateAndTime: r.DateAndTime,
      Millitm: r.Millitm,
      TagIndex: r.TagIndex,
      Val: r.Val,
      Status: r.Status,
      Marker: r.Marker
    }));
    
    const { error } = await supabase.from(tableName).insert(dbRecords);
    if (!error) return;
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
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('email_configuration').select('*').eq('id', 'default').single();
    if (!error && data) {
      return {
        ...localSettings,
        smtpHost: data.host,
        smtpPort: data.port,
        smtpUser: data.username,
        smtpSecure: data.secure,
        templateLogoText: data.logo_text,
        templateHeaderColor: data.header_color,
        templateFooterText: data.footer_text
      };
    }
  }
  return localSettings;
}

export async function saveSettings(settings) {
  initDB();
  const supabase = getSupabaseClient();
  if (supabase) {
    const dbEmailConfig = {
      id: 'default',
      host: settings.smtpHost,
      port: settings.smtpPort,
      username: settings.smtpUser,
      password: settings.smtpPass || '••••••••••••',
      secure: settings.smtpSecure,
      logo_text: settings.templateLogoText,
      header_color: settings.templateHeaderColor,
      footer_text: settings.templateFooterText
    };
    const { error } = await supabase.from('email_configuration').upsert(dbEmailConfig);
    if (error) console.error("Supabase email_configuration upsert error:", error);
  }
  localStorage.setItem("prod_settings", JSON.stringify(settings));
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
    if (isConnected) throw new Error(`Supabase sync log insert failed: ${error.message}`);
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
        recipient: e.created_by || 'system-alerts@plant.com',
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
      plant_id: 'plant-1',
      created_by: emailLog.recipient
    };
    const { error } = await supabase.from('report_history').insert(dbReportHistory);
    if (!error) return;
    console.error("Supabase report_history insert error:", error);
    if (isConnected) throw new Error(`Supabase report history insert failed: ${error.message}`);
  }
  const logs = JSON.parse(localStorage.getItem("prod_email_logs")) || [];
  logs.unshift({
    timestamp: new Date().toISOString(),
    ...emailLog
  });
  if (logs.length > 50) logs.pop();
  localStorage.setItem("prod_email_logs", JSON.stringify(logs));
}
