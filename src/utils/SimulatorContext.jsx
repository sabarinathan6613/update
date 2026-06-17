/* eslint-disable react-refresh/only-export-components */
// src/utils/SimulatorContext.jsx
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getHistorianData, addHistorianRecords, addSyncLog, getTagConfigs } from './db';
import { getSupabaseClient } from './supabaseClient';

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
  const [currentPlantId, setCurrentPlantId] = useState(() => {
    try {
      const plants = JSON.parse(localStorage.getItem('prod_plants')) || [];
      return plants.length > 0 ? plants[0].id : '';
    } catch { return ''; }
  });

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
    const buffer = localBufferRef.current;
    if (buffer.length === 0) {
      return; // Nothing to sync
    }

    setSyncStatus("Syncing");
    
    // Check network availability
    if (!isNetworkOnlineRef.current) {
      setTimeout(() => {
        setSyncStatus("Failed");
        setFailedSyncAttempts(prev => prev + 1);
        logMsg(`Sync Failed. Cloud gateway link offline. Retaining +${buffer.length} rows in local SQL cache.`, true);
        addSyncLog(`Sync Failed: Cloud Connection Offline. Local Historian Buffer: +${buffer.length} pending.`);
        setSyncTrigger(prev => prev + 1);
      }, 800);
      return;
    }

    logMsg(`Securing SSL tunnel... Uploading +${buffer.length} queued SCADA historian rows to Cloud...`);
    
    // Simulate network delay
    setTimeout(async () => {
      try {
        const recordBatchCount = buffer.length;
        // Write to Cloud DB
        await addHistorianRecords(buffer);
        await addSyncLog(`Automated Sync: Uploaded +${recordBatchCount} historian telemetry rows to Cloud DB.`);

        // Log to simulator console
        logMsg(`SUCCESS: Flushed local SCADA buffer. Sync completed for +${recordBatchCount} tags.`);
        
        // Reset local buffer and failed flags
        setLocalBuffer([]);
        setSyncStatus("Success");
        setFailedSyncAttempts(0);
        setSyncTrigger(prev => prev + 1);

        setTimeout(() => {
          setSyncStatus("Idle");
        }, 1500);
      } catch (err) {
        setSyncStatus("Failed");
        setFailedSyncAttempts(prev => prev + 1);
        logMsg(`Sync Exception: ${err.message}`, true);
        addSyncLog(`Sync Exception: ${err.message}`, "ERROR");
        setSyncTrigger(prev => prev + 1);
      }
    }, 1000);
  }, [logMsg]);

  // Seed total synced records count and storage size from existing db
  useEffect(() => {
    const fetchSyncStats = async () => {
      const history = await getHistorianData();
      setTotalSyncedRecords(history.length);
      const size = history.length * 0.125; // ~125 bytes per historian row
      setCloudStorageUsageKb(parseFloat(size.toFixed(2)));
    };
    fetchSyncStats();
  }, [syncTrigger]);

  // Poll configuration changes and check connection status
  useEffect(() => {
    const checkConfigAndConnection = () => {
      try {
        const settings = JSON.parse(localStorage.getItem('prod_settings')) || {};
        const url = (settings.supabaseUrl || '').trim();
        const anonKey = (settings.supabaseAnonKey || '').trim();
        const table = (settings.selectedTable || '').trim();

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
          setSyncTrigger(prev => prev + 1);
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
    const interval = setInterval(async () => {
      try {
        const configs = await getTagConfigs();
        if (configs.length === 0) return;

        const now = new Date().toISOString();
        const millitm = new Date().getMilliseconds();

        const newRecords = configs.map(tag => {
          // Generate a realistic mock value based on the tag unit or index
          let val;
          if (tag.Unit === '°C') {
            // Temperature simulation: 50 to 90 degrees with some noise
            val = 60 + Math.sin(Date.now() / 50000) * 15 + Math.random() * 2;
          } else if (tag.Unit === 'RPM') {
            // Speed simulation: 1000 to 1500 RPM
            val = 1200 + Math.cos(Date.now() / 30000) * 200 + Math.random() * 10;
          } else if (tag.Unit === 'bar') {
            // Pressure simulation: 4 to 6 bar
            val = 5.0 + Math.sin(Date.now() / 40000) * 0.8 + Math.random() * 0.1;
          } else {
            // Standard random walk
            val = 40 + Math.sin(Date.now() / 60000) * 30 + Math.random() * 5;
          }

          // Format value to tag's configured decimal places
          const dp = tag.DecimalPlaces !== undefined ? tag.DecimalPlaces : 2;
          val = parseFloat(val.toFixed(dp));

          // Simulate occasional status drops or warning markers (e.g. 2% chance)
          let status = 192; // Good
          let marker = '';
          if (Math.random() < 0.02) {
            status = Math.random() < 0.5 ? 128 : 0; // Uncertain or Bad
            marker = status === 0 ? 'CRITICAL FAULT' : 'WARNING VALUE';
          }

          return {
            DateAndTime: now,
            Millitm: millitm,
            TagIndex: tag.TagIndex,
            Val: val,
            Status: status,
            Marker: marker
          };
        });

        // Add to local buffer to sync with connected database table
        setLocalBuffer(prev => {
          const combined = [...prev, ...newRecords];
          // Cap local buffer at 500 records to prevent overflow
          return combined.slice(-500);
        });

      } catch (e) {
        console.error("Error running SCADA live simulator:", e);
      }
    }, 5000); // Generate every 5 seconds

    return () => clearInterval(interval);
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

  return (
    <SimulatorContext.Provider value={{
      localBuffer,
      syncStatus,
      syncLogs,
      currentPlantId,
      setCurrentPlantId,
      syncTrigger,
      forceSync,
      
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
