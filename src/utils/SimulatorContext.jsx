// src/utils/SimulatorContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getHistorianData, addHistorianRecords, addSyncLog } from './db';

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
  const [cloudStorageUsageKb, setCloudStorageUsageKb] = useState(15.4);
  
  const [syncStatus, setSyncStatus] = useState("Idle"); // Idle, Syncing, Success, Failed
  const [syncLogs, setSyncLogs] = useState([
    { time: new Date().toLocaleTimeString(), msg: "Sync Service link active. Historian Gateway connected." }
  ]);

  // Track currently selected plant (Legacy context compatibility, default plant-1)
  const [currentPlantId, setCurrentPlantId] = useState("plant-1");

  // Accumulated production counter for Tag 35 simulation
  const accumulatedProdCounterRef = useRef(14200);

  // For notifying components to refresh their view
  const [syncTrigger, setSyncTrigger] = useState(0);

  const bufferTimerRef = useRef(null);
  const syncTimerRef = useRef(null);

  // Add line to sync terminal log
  const logMsg = (msg, isError = false) => {
    setSyncLogs(prev => [
      { time: new Date().toLocaleTimeString(), msg: `${isError ? '❌ ERROR: ' : ''}${msg}` },
      ...prev.slice(0, 49)
    ]);
  };

  // Seed total synced records count and storage size from existing db
  useEffect(() => {
    const fetchSyncStats = async () => {
      const history = await getHistorianData();
      setTotalSyncedRecords(history.length);
      const size = 15.4 + (history.length * 0.125); // ~125 bytes per historian row
      setCloudStorageUsageKb(parseFloat(size.toFixed(2)));
    };
    fetchSyncStats();
  }, [syncTrigger]);

  // 1. SCADA historian Buffering - DISABLED in compliance with NO DEMO/MOCK DATA policy
  useEffect(() => {
    // Simulator mock data generation is disabled.
    // Telemetry is configuration-driven and sourced solely from actual database records.
  }, []);

  // 2. Automated Sync Service (runs every 12 seconds)
  useEffect(() => {
    syncTimerRef.current = setInterval(() => {
      triggerSync();
    }, 12000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [localBuffer, isNetworkOnline]);

  // 3. Auto-recovery loop: Trigger bulk sync if network becomes online and buffer has data
  useEffect(() => {
    if (isNetworkOnline && localBuffer.length > 0) {
      logMsg("Cloud link restored. Initiating automatic recovery and flushing pending Local SQL queue.");
      triggerSync();
    }
  }, [isNetworkOnline]);

  // Synchronize Local Buffer to Cloud Database (prod_history)
  const triggerSync = async () => {
    if (localBuffer.length === 0) {
      return; // Nothing to sync
    }

    setSyncStatus("Syncing");
    
    // Check network availability
    if (!isNetworkOnline) {
      setTimeout(() => {
        setSyncStatus("Failed");
        setFailedSyncAttempts(prev => prev + 1);
        logMsg(`Sync Failed. Cloud gateway link offline. Retaining +${localBuffer.length} rows in local SQL cache.`, true);
        addSyncLog(`Sync Failed: Cloud Connection Offline. Local Historian Buffer: +${localBuffer.length} pending.`);
        setSyncTrigger(prev => prev + 1);
      }, 800);
      return;
    }

    logMsg(`Securing SSL tunnel... Uploading +${localBuffer.length} queued SCADA historian rows to Cloud...`);
    
    // Simulate network delay
    setTimeout(async () => {
      try {
        const recordBatchCount = localBuffer.length;
        // Write to Cloud DB
        await addHistorianRecords(localBuffer);
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
  };

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
      cloudStorageUsageKb
    }}>
      {children}
    </SimulatorContext.Provider>
  );
}
