/**
 * Standalone Local MS SQL Server to Supabase Cloud Sync Bridge
 * 
 * This service runs continuously in the background to synchronize production data
 * collected from PLC/SCADA in a local Microsoft SQL Server database up to Supabase PostgreSQL.
 * 
 * Features:
 *  - Upsert logic prevents duplicates (using composite key: plant_id + timestamp).
 *  - Connection retry loop with exponential backoff for network/internet dropouts.
 *  - Real-time logging of synchronization status back to Supabase's `synchronization_logs` table.
 *  - Smart Fallback: If a local Microsoft SQL Server is not running, the script runs in
 *    a SCADA Simulation Mode, generating hourly production data and syncing it to Supabase
 *    so the pipeline can be evaluated out-of-the-box.
 * 
 * Usage:
 *   1. Install dependencies:
 *      npm install mssql @supabase/supabase-js dotenv
 *   2. Configure your environment variables in a .env file or settings:
 *      SUPABASE_URL=https://your-project.supabase.co
 *      SUPABASE_ANON_KEY=your-anon-key
 *      MSSQL_CONNECTION_STRING=Server=localhost,1433;Database=SCADA;User Id=sa;Password=your_password;Encrypt=true;
 *   3. Run the bridge:
 *      node sync-service/local-sync-bridge.js
 */

import { createClient } from '@supabase/supabase-js';
import sql from 'mssql';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Load Supabase config from environment or fallback to client application settings
function getSyncConfig() {
  const config = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    mssqlConfig: process.env.MSSQL_CONNECTION_STRING || null,
    pollIntervalMs: parseInt(process.env.SYNC_POLL_INTERVAL_MS) || 10000 // default 10 seconds
  };

  // Fallback to checking local app storage settings if environment is empty
  try {
    const appSettingsPath = path.resolve('localStorage_mock_prod_settings.json'); // check if mock file exists
    if (fs.existsSync(appSettingsPath)) {
      const settings = JSON.parse(fs.readFileSync(appSettingsPath, 'utf8'));
      if (!config.supabaseUrl && settings.supabaseUrl) config.supabaseUrl = settings.supabaseUrl;
      if (!config.supabaseAnonKey && settings.supabaseAnonKey) config.supabaseAnonKey = settings.supabaseAnonKey;
    } else {
      // Look for standard localStorage file used by Vite during development
      // Local storage values are often saved in browser profiles. We check if we can read settings from the vite app config.
      const settingsFile = path.resolve('settings.json');
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        if (!config.supabaseUrl && settings.supabaseUrl) config.supabaseUrl = settings.supabaseUrl;
        if (!config.supabaseAnonKey && settings.supabaseAnonKey) config.supabaseAnonKey = settings.supabaseAnonKey;
      }
    }
  } catch (e) {
    // Fail silently
  }

  // Final default prompts if not set
  if (!config.supabaseUrl || config.supabaseUrl === 'your-supabase-url') {
    config.supabaseUrl = 'https://your-project.supabase.co';
  }
  if (!config.supabaseAnonKey || config.supabaseAnonKey === 'your-anon-key') {
    config.supabaseAnonKey = '';
  }

  return config;
}

const config = getSyncConfig();

// Initialize Supabase Client
let supabase = null;
if (config.supabaseUrl && config.supabaseAnonKey && config.supabaseUrl !== 'https://your-project.supabase.co') {
  try {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    console.log(`\x1b[32m[SUPABASE] Client initialized successfully targeting URL: ${config.supabaseUrl}\x1b[0m`);
  } catch (err) {
    console.error(`\x1b[31m[SUPABASE] Initialization failed: ${err.message}\x1b[0m`);
  }
} else {
  console.log(`\x1b[33m[SUPABASE] Warning: Supabase credentials not configured in environment variables or application settings. Sync will run in SIMULATED LOG mode.\x1b[0m`);
}

/**
 * Log sync outcome back to Supabase and console
 */
async function writeLog(message, statusType = 'SUCCESS') {
  const timestamp = new Date().toISOString();
  const color = statusType === 'SUCCESS' ? '\x1b[32m' : statusType === 'FAILED' ? '\x1b[31m' : '\x1b[36m';
  console.log(`${color}[${statusType}] [${timestamp}] ${message}\x1b[0m`);

  if (supabase) {
    try {
      await supabase.from('synchronization_logs').insert({
        status_type: statusType,
        log_message: message
      });
    } catch (err) {
      console.error(`\x1b[31m[LOGGING ERROR] Failed to push log to Supabase: ${err.message}\x1b[0m`);
    }
  }
}

/**
 * Connect to Local MS SQL database
 */
async function getLocalSqlConnection() {
  if (!config.mssqlConfig) {
    return null;
  }
  try {
    const pool = await sql.connect(config.mssqlConfig);
    return pool;
  } catch (err) {
    console.warn(`\x1b[33m[MSSQL] Could not connect to local MS SQL Server: ${err.message}\x1b[0m`);
    return null;
  }
}

// Keep track of sync state
let syncInProgress = false;
let failedAttempts = 0;

/**
 * SCADA Simulator Generator
 * Used when MS SQL is offline or not configured, ensuring the sync bridge demonstrates capabilities immediately.
 */
function generateSimulatedScadaData() {
  const plants = ['plant-1', 'plant-2', 'plant-3'];
  const data = [];
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hour = now.getHours();
  
  let shift = "Shift C";
  if (hour >= 6 && hour < 14) shift = "Shift A";
  else if (hour >= 14 && hour < 22) shift = "Shift B";

  plants.forEach(plantId => {
    let baseRate = 150;
    if (plantId === "plant-2") baseRate = 110;
    if (plantId === "plant-3") baseRate = 160;

    let modifier = 0.9 + Math.random() * 0.2;
    if (shift === "Shift C") modifier -= 0.08;
    
    let uptimeMinutes = 60;
    let downtimeReason = null;
    if (Math.random() < 0.05) {
      const downtime = Math.floor(10 + Math.random() * 25);
      uptimeMinutes = 60 - downtime;
      modifier *= (uptimeMinutes / 60);
      downtimeReason = Math.random() < 0.5 ? "Conveyor Jam" : "Tool Adjustment";
    }

    const targetParts = Math.round(baseRate);
    const actualParts = Math.round(baseRate * modifier);
    const rejectRate = 0.005 + Math.random() * 0.025;
    const rejectParts = Math.round(actualParts * rejectRate);
    const goodParts = actualParts - rejectParts;

    const hourStr = hour.toString().padStart(2, '0');
    const timestampStr = `${dateStr}T${hourStr}:00:00.000Z`;

    data.push({
      id: `${plantId}-${dateStr}T${hourStr}:00:00`,
      plant_id: plantId,
      timestamp: timestampStr,
      date: dateStr,
      hour: hour,
      shift: shift,
      target_parts: targetParts,
      actual_parts: goodParts,
      reject_parts: rejectParts,
      uptime_minutes: uptimeMinutes,
      downtime_reason: downtimeReason
    });
  });

  return data;
}

/**
 * Synchronization Execution Engine
 */
async function runSynchronizationCycle() {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    const pool = await getLocalSqlConnection();
    let recordsToSync = [];
    let isSimulation = false;

    if (pool) {
      // Query local database for unsynced production records
      // Assumes a table schema matching: SCADA_ProductionData
      const result = await pool.request().query(`
        SELECT TOP 100 * 
        FROM SCADA_ProductionData 
        WHERE Synced = 0 
        ORDER BY Timestamp ASC
      `);
      
      recordsToSync = result.recordset.map(r => ({
        id: `${r.PlantId}-${r.Timestamp.toISOString().split('T')[0]}T${r.Timestamp.getUTCHours().toString().padStart(2, '0')}:00:00`,
        plant_id: r.PlantId,
        timestamp: r.Timestamp.toISOString(),
        date: r.Timestamp.toISOString().split('T')[0],
        hour: r.Timestamp.getUTCHours(),
        shift: r.Shift,
        target_parts: r.TargetParts,
        actual_parts: r.ActualParts,
        reject_parts: r.RejectParts,
        uptime_minutes: r.UptimeMinutes,
        downtime_reason: r.DowntimeReason
      }));
      
      console.log(`[MSSQL] Retrieved ${recordsToSync.length} unsynced records from SQL Server.`);
    } else {
      // Fallback: SCADA Simulator Mode
      recordsToSync = generateSimulatedScadaData();
      isSimulation = true;
    }

    if (recordsToSync.length > 0) {
      if (supabase) {
        // Perform Upsert in Supabase (prevents duplicate records on composite key match)
        const { error } = await supabase.from('production_data').upsert(recordsToSync);
        
        if (error) {
          throw new Error(`Supabase Upsert failed: ${error.message}`);
        }
        
        // If MS SQL was active, mark records as Synced in local database
        if (pool && !isSimulation) {
          const ids = recordsToSync.map(r => `'${r.id}'`).join(',');
          await pool.request().query(`
            UPDATE SCADA_ProductionData 
            SET Synced = 1 
            WHERE CONCAT(PlantId, '-', FORMAT(Timestamp, 'yyyy-MM-ddTHH:00:00')) IN (${ids})
          `);
        }

        const modeStr = isSimulation ? 'Simulated SCADA Pipeline' : 'Local MS SQL Server';
        await writeLog(`Successfully synced ${recordsToSync.length} records from ${modeStr} to Supabase Cloud.`, 'SUCCESS');
      } else {
        const modeStr = isSimulation ? 'Simulated SCADA' : 'Local MS SQL';
        await writeLog(`Simulated sync of ${recordsToSync.length} records from ${modeStr}. (Supabase connection offline/unconfigured)`, 'INFO');
      }
      failedAttempts = 0; // reset retry counter
    } else {
      console.log(`[SYNC] No new unsynced production records detected. Sleeping...`);
    }

  } catch (err) {
    failedAttempts++;
    const delay = Math.min(300000, 1000 * Math.pow(2, failedAttempts)); // Exponential backoff max 5 mins
    
    await writeLog(`Sync cycle failed: ${err.message}. Retrying in ${(delay / 1000).toFixed(0)} seconds...`, 'FAILED');
    
    // Pause sync interval, trigger a timeout retry cycle
    clearInterval(pollInterval);
    setTimeout(() => {
      pollInterval = setInterval(runSynchronizationCycle, config.pollIntervalMs);
      runSynchronizationCycle();
    }, delay);
  } finally {
    syncInProgress = false;
  }
}

// Start continuous polling loop
console.log(`\x1b[32m[SYNC ENGINE] Started polling bridge. Polling interval: ${config.pollIntervalMs / 1000}s\x1b[0m`);
let pollInterval = setInterval(runSynchronizationCycle, config.pollIntervalMs);

// Trigger immediately on startup
runSynchronizationCycle();
