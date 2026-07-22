/* eslint-disable react-refresh/only-export-components */
// src/utils/SimulatorContext.jsx
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { addHistorianRecords, addSyncLog, getTagConfigs, getPlants, getSettings, invalidateCache } from './db';
import { getSupabaseClient, getSupabaseConfig } from './supabaseClient';

// ─── Promise Timeout Helper ────────────────────────────────────────────────────
function withTimeout(promise, ms, name = 'Promise') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: "${name}" took longer than ${ms}ms to resolve.`));
    }, ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

const SimulatorContext = createContext();

export function useSimulator() {
  return useContext(SimulatorContext);
}

export function SimulatorProvider({ children }) {
  // Local historian records buffer queue waiting to be uploaded to cloud
  const [localBuffer, setLocalBuffer] = useState([]);

  // Cloud & Sync States
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [failedSyncAttempts, setFailedSyncAttempts] = useState(0);
  const [totalSyncedRecords, setTotalSyncedRecords] = useState(0);
  const [cloudStorageUsageKb, setCloudStorageUsageKb] = useState(0);
  
  const [syncStatus, setSyncStatus] = useState("Idle"); // Idle, Syncing, Success, Failed
  const [syncLogs, setSyncLogs] = useState([]);

  // Track currently selected plant (Legacy context compatibility, default plant-1)
  const [currentPlantId, setCurrentPlantId] = useState('');

  useEffect(() => {
    const initPlant = async () => {
      try {
        const plants = await withTimeout(getPlants(), 5000, 'SimulatorContext.getPlants');
        if (plants && plants.length > 0) {
          setCurrentPlantId(plants[0].id);
        }
      } catch (e) {
        console.error("Failed to load plants for simulator context:", e);
      }
    };
    initPlant();
  }, []);

  // Accumulated production counter for Tag 35 simulation
  // For notifying components to refresh their view
  const [syncTrigger, setSyncTrigger] = useState(0);

  // Real-Time Database connection and sync states
  const [dbConnectionStatus, setDbConnectionStatus] = useState('Disconnected'); // Connected, Syncing, Disconnected
  const [dbConfig, setDbConfig] = useState({ url: '', anonKey: '', table: '' });
  const [reconnectCount, setReconnectCount] = useState(0);

  const syncTimerRef = useRef(null);
  const localBufferRef = useRef(localBuffer);
  const isNetworkOnlineRef = useRef(isNetworkOnline);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    localBufferRef.current = localBuffer;
  }, [localBuffer]);

  useEffect(() => {
    isNetworkOnlineRef.current = isNetworkOnline;
  }, [isNetworkOnline]);

  // Add line to sync terminal log
  const logMsg = useCallback((msg, isError = false) => {
    setSyncLogs(prev => [
      { time: new Date().toLocaleTimeString(), msg: `${isError ? '❌ ERROR: ' : ''}${msg}` },
      ...prev.slice(0, 49)
    ]);
  }, []);

  // Synchronize Local Buffer to Cloud Database (prod_history)
  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current) {
      console.log("[Sync] Sync already in progress, skipping overlapping execution.");
      return;
    }

    const buffer = localBufferRef.current;
    if (buffer.length === 0) {
      return; // Nothing to sync
    }

    isSyncingRef.current = true;
    setSyncStatus("Syncing");
    
    // Check network availability
    if (!isNetworkOnlineRef.current) {
      setTimeout(() => {
        setSyncStatus("Failed");
        setFailedSyncAttempts(prev => prev + 1);
        logMsg(`Sync Failed. Cloud gateway link offline. Retaining +${buffer.length} rows in local SQL cache.`, true);
        try {
          addSyncLog(`Sync Failed: Cloud Connection Offline. Local Historian Buffer: +${buffer.length} pending.`, "ERROR");
        } catch { /* ignored */ }
        setSyncTrigger(prev => prev + 1);
        isSyncingRef.current = false;
      }, 800);
      return;
    }

    logMsg(`Securing SSL tunnel... Uploading +${buffer.length} queued SCADA historian rows to Cloud...`);
    
    // Simulate network delay
    setTimeout(async () => {
      try {
        const recordBatchCount = buffer.length;
        // Write to Cloud DB with timeout protection
        await withTimeout(addHistorianRecords(buffer), 8000, 'SimulatorContext.addHistorianRecords');
        try {
          await withTimeout(addSyncLog(`Automated Sync: Uploaded +${recordBatchCount} historian telemetry rows to Cloud DB.`), 5000, 'SimulatorContext.addSyncLog');
        } catch (e) {
          console.warn("Failed to write sync log:", e);
        }

        // Log to simulator console
        logMsg(`SUCCESS: Flushed local SCADA buffer. Sync completed for +${recordBatchCount} tags.`);
        
        // Reset local buffer and failed flags
        invalidateCache();
        setLocalBuffer([]);
        setSyncStatus("Success");
        setFailedSyncAttempts(0);
        try {
          localStorage.setItem('skadomation_last_sync_time', new Date().toISOString());
        } catch (e) {
          console.warn("Failed to store sync time locally:", e);
        }
        setSyncTrigger(prev => prev + 1);
        setRefreshTrigger(prev => prev + 1); // Trigger UI reload

        setTimeout(() => {
          setSyncStatus("Idle");
        }, 1500);
      } catch (err) {
        setSyncStatus("Failed");
        setFailedSyncAttempts(prev => prev + 1);
        logMsg(`Sync Exception: ${err.message}`, true);
        try {
          await withTimeout(addSyncLog(`Sync Exception: ${err.message}`, "ERROR"), 5000, 'SimulatorContext.addSyncLog.error');
        } catch { /* ignored */ }
        setSyncTrigger(prev => prev + 1);
      } finally {
        isSyncingRef.current = false;
      }
    }, 1000);
  }, [logMsg]);

  // Seed total synced records count and storage size from existing db
  useEffect(() => {
    const fetchSyncStats = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const settings = await getSettings();
        const tableName = settings?.selectedTable || 'Database';
        // Use a lightweight HEAD count instead of fetching all records
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        const total = count || 0;
        setTotalSyncedRecords(total);
        const size = total * 0.125; // ~125 bytes per historian row
        setCloudStorageUsageKb(parseFloat(size.toFixed(2)));
      } catch (e) {
        console.error("Failed to load historian stats:", e);
      }
    };
    fetchSyncStats();
  }, [syncTrigger]);

  // Poll configuration changes and check connection status
  useEffect(() => {
    const checkConfigAndConnection = async () => {
      try {
        const config = getSupabaseConfig();
        const url = config ? (config.url || '').trim() : '';
        const anonKey = config ? (config.anonKey || '').trim() : '';
        
        let table = '';
        try {
          const settings = await withTimeout(getSettings(), 5000, 'SimulatorContext.getSettings');
          table = (settings?.selectedTable || '').trim();
        } catch (err) {
          console.warn("Failed to fetch settings from Supabase in simulator context check:", err);
        }

        if (url !== dbConfig.url || anonKey !== dbConfig.anonKey || table !== dbConfig.table) {
          console.log("Supabase config change detected, updating database config state.");
          setDbConfig({ url, anonKey, table });
        }
      } catch (e) {
        console.error("Error reading settings for polling:", e);
      }
    };

    // Run once immediately
    checkConfigAndConnection();

    const interval = setInterval(checkConfigAndConnection, 10000);
    return () => clearInterval(interval);
  }, [dbConfig]);

  // Real-Time Subscription Effect
  useEffect(() => {
    let active = true;

    if (!isNetworkOnline) {
      const timer = setTimeout(() => {
        if (active) setDbConnectionStatus('Disconnected');
      }, 0);
      return () => { active = false; clearTimeout(timer); };
    }

    if (!dbConfig.url || !dbConfig.anonKey || !dbConfig.table) {
      const timer = setTimeout(() => {
        if (active) setDbConnectionStatus('Disconnected');
      }, 0);
      return () => { active = false; clearTimeout(timer); };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      const timer = setTimeout(() => {
        if (active) setDbConnectionStatus('Disconnected');
      }, 0);
      return () => { active = false; clearTimeout(timer); };
    }

    console.log(`Setting up real-time listener for table: ${dbConfig.table}`);
    const timer = setTimeout(() => {
      if (active) {
        setDbConnectionStatus(prev => (prev === 'Disconnected' || prev === 'Reconnecting') ? 'Reconnecting' : 'Syncing');
      }
    }, 0);
    
    const channelName = `skadomation-realtime-${dbConfig.table}`;
    const channel = supabase.channel(channelName);
    
    channel
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE to keep everything in sync
          schema: 'public',
          table: dbConfig.table
        },
        (payload) => {
          console.log('Supabase real-time change payload:', payload);
          // Set to Syncing briefly on data ingestion to show active work
          if (active) setDbConnectionStatus('Syncing');
          invalidateCache();
          setSyncTrigger(prev => prev + 1);
          setRefreshTrigger(prev => prev + 1); // Trigger active views to refresh
          setTimeout(() => {
            if (active) setDbConnectionStatus('Connected');
          }, 800);
        }
      )
      .subscribe((status, err) => {
        console.log(`Channel [${channelName}] status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          if (active) setDbConnectionStatus('Connected');
          logMsg(`Supabase Realtime: Connected & Subscribed to public.${dbConfig.table}`);
        } else {
          if (active) setDbConnectionStatus('Disconnected');
          logMsg(`Supabase Realtime: Connection lost (${status})`, true);
          if (err) {
            console.error('Supabase channel error:', err);
          }
        }
      });

    return () => {
      active = false;
      clearTimeout(timer);
      console.log(`Cleaning up real-time listener for table: ${dbConfig.table}`);
      channel.unsubscribe();
    };
  }, [dbConfig, reconnectCount, isNetworkOnline, logMsg]);

  // Reconnection Loop
  useEffect(() => {
    if (dbConnectionStatus !== 'Disconnected') return;
    if (!isNetworkOnline) return;
    if (!dbConfig.url || !dbConfig.anonKey || !dbConfig.table) return;

    const retryInterval = setInterval(() => {
      logMsg("Attempting database reconnection...");
      setDbConnectionStatus('Reconnecting');
      setReconnectCount(prev => prev + 1);
    }, 10000);

    return () => clearInterval(retryInterval);
  }, [dbConnectionStatus, dbConfig, isNetworkOnline, logMsg]);

  // Missed Records Sync Transition
  const prevStatusRef = useRef('Disconnected');
  useEffect(() => {
    const isPreviousOffline = prevStatusRef.current === 'Disconnected' || prevStatusRef.current === 'Reconnecting';
    if (isPreviousOffline && dbConnectionStatus === 'Connected') {
      logMsg("Reconnection successful! Synchronizing missed records.");
      setSyncTrigger(prev => prev + 1);
      if (localBuffer.length > 0) {
        triggerSync();
      }
    }
    prevStatusRef.current = dbConnectionStatus;
  }, [dbConnectionStatus, localBuffer, logMsg, triggerSync]);


  // 1. SCADA historian Buffering - Generates live data for configured tags
  useEffect(() => {
    // SCADA simulation has been removed to enforce read-only Cloud Database access
    // and prevent generated telemetry values from altering actual historian records.
  }, []);

  // 2. Automated Sync Service (runs every 12 seconds)
  useEffect(() => {
    syncTimerRef.current = setInterval(() => {
      triggerSync();
    }, 12000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [triggerSync]);

  // 3. Auto-recovery loop: Trigger bulk sync if network becomes online and buffer has data
  useEffect(() => {
    if (isNetworkOnline && localBuffer.length > 0) {
      const timer = setTimeout(() => {
        logMsg("Cloud link restored. Initiating automatic recovery and flushing pending Local SQL queue.");
        triggerSync();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isNetworkOnline, localBuffer.length, logMsg, triggerSync]);



  const forceSync = () => {
    logMsg("Manual synchronization command sent.");
    triggerSync();
  };

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Centralized Time Range State Management
  const [timePreset, setTimePreset] = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartStart, setChartStart] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const [chartEnd, setChartEnd] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = setTimeout(() => {
      if (timePreset === 'custom') {
        const now = new Date();
        const start = customStart ? new Date(customStart).toISOString() : new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const end = customEnd ? new Date(customEnd).toISOString() : now.toISOString();
        setChartStart(start);
        setChartEnd(end);
      } else if (timePreset !== 'zoomed') {
        const now = new Date();
        let start;
        let end   = now;
        switch (timePreset) {
          case '1h':  start = new Date(now.getTime() - 1  * 60 * 60 * 1000); break;
          case '6h':  start = new Date(now.getTime() - 6  * 60 * 60 * 1000); break;
          case '24h': start = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '7d':  start = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); break;
          case '30d': start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
          default: start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        setChartStart(start.toISOString());
        setChartEnd(end.toISOString());
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [timePreset, customStart, customEnd, refreshTrigger]);

  return (
    <SimulatorContext.Provider value={{
      localBuffer,
      syncStatus,
      syncLogs,
      currentPlantId,
      setCurrentPlantId,
      syncTrigger,
      setSyncTrigger,
      refreshTrigger,
      setRefreshTrigger,
      forceSync,
      
      // Centralized Time Range State
      timePreset,
      setTimePreset,
      customStart,
      setCustomStart,
      customEnd,
      setCustomEnd,
      chartStart,
      chartEnd,
      setChartStart,
      setChartEnd,
      
      // Sync states
      isNetworkOnline,
      setIsNetworkOnline,
      failedSyncAttempts,
      totalSyncedRecords,
      cloudStorageUsageKb,

      // Database connection status
      dbConnectionStatus
    }}>
      {children}
    </SimulatorContext.Provider>
  );
}
