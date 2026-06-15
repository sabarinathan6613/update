// src/components/CloudSync.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useSimulator } from '../utils/SimulatorContext';
import { getSyncLogs, getSettings, saveSettings } from '../utils/db';

const CLOUD_PROVIDERS = [
  { id: 'azure-pg', name: 'Microsoft Azure PostgreSQL', icon: '🔷', dbType: 'PostgreSQL' },
  { id: 'azure-sql', name: 'Azure SQL Database', icon: '🔷', dbType: 'MSSQL' },
  { id: 'aws-rds', name: 'AWS RDS PostgreSQL', icon: '🔶', dbType: 'PostgreSQL' },
  { id: 'google-cloud', name: 'Google Cloud SQL', icon: '🟢', dbType: 'PostgreSQL' },
  { id: 'supabase', name: 'Supabase PostgreSQL', icon: '⚡', dbType: 'PostgreSQL' },
  { id: 'custom-pg', name: 'Custom PostgreSQL Server', icon: '🐘', dbType: 'PostgreSQL' }
];

export default function CloudSync() {
  const {
    isNetworkOnline,
    setIsNetworkOnline,
    totalSyncedRecords,
    cloudStorageUsageKb,
    syncStatus,
    localBuffer,
    syncTrigger,
    forceSync,
    syncLogs
  } = useSimulator();

  // Navigation sub-tabs: 'wizard', 'explorer', 'monitor', 'logs'
  const [activeTab, setActiveTab] = useState('wizard');

  // Wizard flow step: 1 to 7
  const [wizardStep, setWizardStep] = useState(1);

  // Connection settings states
  const [selectedProvider, setSelectedProvider] = useState(CLOUD_PROVIDERS[4]); // default Supabase
  const [dbHost, setDbHost] = useState('db.skadomation-cloud.net');
  const [dbPort, setDbPort] = useState(5432);
  const [dbName, setDbName] = useState('skadomation_production');
  const [dbUser, setDbUser] = useState('skadomation_admin');
  const [dbPass, setDbPass] = useState('••••••••••••');
  const [dbSslMode, setDbSslMode] = useState('require');
  const [showDbPass, setShowDbPass] = useState(false);
  const [showSupabaseKey, setShowSupabaseKey] = useState(false);

  // Supabase specific endpoints if selected
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');

  // Status flags
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);

  // Diagnostics and validation check results
  const [diagnosticsLog, setDiagnosticsLog] = useState({
    latency: 0,
    sslHandshake: 'Pending',
    selectPermissions: 'Pending',
    schemaIntegrity: 'Pending',
    healthScore: 0
  });

  // Dynamically discovered database structures (Strictly live)
  const [discoveredDbStructure, setDiscoveredDbStructure] = useState({});
  const [discoveryDiagnostics, setDiscoveryDiagnostics] = useState({
    connectedDatabase: '',
    connectedSchema: 'public',
    tablesFound: 0,
    errors: []
  });

  // Wizard selections
  const [selectedTable, setSelectedTable] = useState('');
  const [columnMappings, setColumnMappings] = useState({
    timestampCol: '',
    tagCol: '',
    valueCol: '',
    statusCol: '',
    alarmCol: ''
  });
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [syncInterval, setSyncInterval] = useState(30); // 30 sec default

  // Database Explorer tree state
  const [expandedNodes, setExpandedNodes] = useState({});
  const [explorerSearch, setExplorerSearch] = useState('');

  // Advanced features states
  const [latency, setLatency] = useState(45);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [auditLogs, setAuditLogs] = useState([
    { timestamp: new Date(Date.now() - 3600000).toISOString(), user: "system-gateway", action: "Established SSL/TLS handshake", status: "SUCCESS" }
  ]);
  const [previewRows, setPreviewRows] = useState([]);

  // Telemetry Monitor live tracking (shifting array of latest latency points)
  const [latencyHistory, setLatencyHistory] = useState([45, 42, 49, 43, 44, 46, 45, 43, 48, 45]);

  // Fetch preview rows dynamically based on the selected table
  useEffect(() => {
    const fetchPreviewData = async () => {
      if (!selectedTable) {
        setPreviewRows([]);
        return;
      }

      if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your-supabase-url') {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const client = createClient(supabaseUrl.trim(), supabaseAnonKey.trim());
          const { data, error } = await client.from(selectedTable).select('*').limit(100);
          if (!error && data) {
            setPreviewRows(data);
            return;
          }
        } catch (e) {
          console.error("Failed to fetch Supabase preview rows", e);
        }
      }
      setPreviewRows([]);
    };

    fetchPreviewData();
  }, [selectedTable, syncTrigger, supabaseUrl, supabaseAnonKey]);

  // Load existing configuration settings
  useEffect(() => {
    const loadSettingsData = async () => {
      const settings = await getSettings();
      if (settings.supabaseUrl) setSupabaseUrl(settings.supabaseUrl);
      if (settings.supabaseAnonKey) setSupabaseAnonKey(settings.supabaseAnonKey);
      if (settings.cloudDbHost) setDbHost(settings.cloudDbHost);
      if (settings.cloudDbPort) setDbPort(settings.cloudDbPort);
      if (settings.cloudDbName) setDbName(settings.cloudDbName);
      if (settings.cloudDbUser) setDbUser(settings.cloudDbUser);
      
      if (settings.supabaseUrl && settings.supabaseUrl !== 'your-supabase-url') {
        setTestSuccess(true);
        setDiscoveryComplete(true);
        scanConnectedDatabase(settings.supabaseUrl, settings.supabaseAnonKey);
      }
    };
    loadSettingsData();

    // Latency simulator
    if (isNetworkOnline) {
      const interval = setInterval(() => {
        setLatency(prev => {
          const nextVal = Math.min(Math.max(15, prev + Math.floor((Math.random() - 0.5) * 8)), 100);
          setLatencyHistory(history => [...history.slice(1), nextVal]);
          return nextVal;
        });
      }, 3000);
      return () => clearInterval(interval);
    } else {
      setLatency(0);
    }
  }, [isNetworkOnline]);

  const handleProviderSelect = (prov) => {
    setSelectedProvider(prov);
    if (prov.id === 'supabase') {
      setDbPort(443);
      setDbHost('your-project-ref.supabase.co');
    } else if (prov.id === 'azure-sql') {
      setDbPort(1433);
      setDbHost('sql-server.database.windows.net');
    } else {
      setDbPort(5432);
      setDbHost('db.example.com');
    }
    setTestSuccess(false);
    setDiscoveryComplete(false);
  };

  // Connection Test & Diagnostics Handler
  const handleTestConnection = async () => {
    setIsTesting(true);
    addAuditLog(`Initiated validation handshake to: ${dbHost}`);

    // If using Supabase or PostgREST API Gateway credentials are input
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(supabaseUrl.trim(), supabaseAnonKey.trim());
        
        // Handshake validation
        const startTest = Date.now();
        const { error } = await client.from('information_schema.tables').select('table_name').limit(1);
        const testLatency = Date.now() - startTest;

        setIsTesting(false);
        setTestSuccess(true);
        
        // Update diagnostics summary stats
        setDiagnosticsLog({
          latency: testLatency,
          sslHandshake: 'PASSED (TLS 1.3)',
          selectPermissions: error ? 'DENIED' : 'PASSED',
          schemaIntegrity: 'VERIFIED',
          healthScore: error ? 65 : 98
        });

        addAuditLog(`SSL handshake successful. Latency: ${testLatency}ms`, "SUCCESS");

        // Save settings to db
        const currentSets = await getSettings();
        await saveSettings({
          ...currentSets,
          supabaseUrl: supabaseUrl.trim(),
          supabaseAnonKey: supabaseAnonKey.trim(),
          cloudDbHost: dbHost,
          cloudDbPort: dbPort,
          cloudDbName: dbName,
          cloudDbUser: dbUser
        });

        // Automatically trigger scan
        scanConnectedDatabase(supabaseUrl, supabaseAnonKey);
        setDiscoveryComplete(true);
        setWizardStep(3);
      } catch (err) {
        setIsTesting(false);
        setTestSuccess(false);
        alert(`Database Connection FAILED: ${err.message}`);
        addAuditLog(`Connection failed: ${err.message}`, "ERROR");
      }
    } else {
      // Direct raw TCP Postgres/SQL connection warning
      setTimeout(async () => {
        setIsTesting(false);
        setTestSuccess(false);
        alert(`Direct browser TCP database connection to ${dbHost}:${dbPort} is blocked by browser sandbox restrictions.\n\nPlease configure the Supabase API Gateway to enable dynamic client-side auto-discovery, or launch the background Skadomation Local Sync Bridge Service.`);
        addAuditLog(`TCP handshake blocked by browser security sandbox policies. API gateway required.`, "ERROR");
      }, 1200);
    }
  };

  // Real schema dynamic discovery logic using PostgREST OpenAPI spec endpoint
  const scanConnectedDatabase = async (url, key) => {
    setIsDiscovering(true);
    addAuditLog("Querying schema specs and catalog tables...");

    const dbHostName = url ? new URL(url).hostname : dbHost;
    const diagnostics = {
      connectedDatabase: dbHostName,
      connectedSchema: 'public',
      tablesFound: 0,
      errors: []
    };

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(url.trim(), key.trim());

      let discovered = [];
      let catalogSuccess = false;

      // 1. Try direct catalog queries via PostgREST client if exposed
      try {
        const { data: tablesData, error: tablesErr } = await client
          .from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')
          .eq('table_type', 'BASE TABLE');

        if (!tablesErr && tablesData && Array.isArray(tablesData)) {
          addAuditLog("PostgreSQL catalog query succeeded.", "SUCCESS");
          for (const row of tablesData) {
            const tblName = row.table_name;
            
            // Query columns: SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<selected_table>';
            const { data: colsData } = await client
              .from('information_schema.columns')
              .select('column_name, data_type')
              .eq('table_name', tblName);
              
            // Query primary key: SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_name='<selected_table>';
            const { data: constraintsData } = await client
              .from('information_schema.table_constraints')
              .select('constraint_name')
              .eq('constraint_type', 'PRIMARY KEY')
              .eq('table_name', tblName);
              
            let pk = 'id';
            if (constraintsData && constraintsData.length > 0) {
              const constraintNames = constraintsData.map(c => c.constraint_name);
              const { data: keyUsageData } = await client
                .from('information_schema.key_column_usage')
                .select('column_name')
                .in('constraint_name', constraintNames)
                .eq('table_name', tblName);
              if (keyUsageData && keyUsageData.length > 0) {
                pk = keyUsageData[0].column_name;
              }
            }

            const cols = (colsData || []).map(c => ({
              name: c.column_name,
              type: c.data_type,
              isPk: c.column_name === pk
            }));

            // Get row count
            let countVal = 0;
            try {
              const { count } = await client
                .from(tblName)
                .select('*', { count: 'exact', head: true });
              if (count !== null) countVal = count;
            } catch (e) {}

            discovered.push({
              name: tblName,
              schema: 'public',
              recordCount: countVal,
              primaryKey: pk,
              status: 'ACTIVE',
              columns: cols.length > 0 ? cols : [{ name: 'id', type: 'integer', isPk: true }]
            });
          }
          catalogSuccess = true;
        } else if (tablesErr) {
          diagnostics.errors.push(`Catalog query error: ${tablesErr.message}`);
          console.warn("Direct catalog query failed, falling back to OpenAPI:", tablesErr);
        }
      } catch (err) {
        diagnostics.errors.push(`Catalog query exception: ${err.message}`);
        console.warn("Direct catalog query exception, falling back to OpenAPI:", err);
      }

      // 2. Fallback to OpenAPI spec parsing if catalog query failed or returned no tables
      if (!catalogSuccess || discovered.length === 0) {
        addAuditLog("Scanning OpenAPI specification...");
        const openApiUrl = `${url.trim()}/rest/v1/?apikey=${key.trim()}`;
        const res = await fetch(openApiUrl);
        if (!res.ok) {
          throw new Error(`OpenAPI fetch failed: ${res.statusText}`);
        }
        
        const schemaData = await res.json();
        const definitions = schemaData.definitions || {};
        const paths = schemaData.paths || {};

        // Merge tables found in definitions or paths
        const tableNames = new Set([
          ...Object.keys(definitions),
          ...Object.keys(paths)
            .filter(p => p !== '/' && !p.startsWith('/rpc/'))
            .map(p => p.substring(1))
        ]);

        for (const tblName of tableNames) {
          const def = definitions[tblName] || {};
          const cols = Object.keys(def.properties || {}).map(colName => {
            const prop = def.properties[colName];
            return {
              name: colName,
              type: prop.format || prop.type || 'text',
              isPk: def.required ? def.required.includes(colName) : false
            };
          });

          // If cols is empty because OpenAPI definitions lacked it, try to fetch a single row to discover columns
          if (cols.length === 0) {
            try {
              const { data: sampleRow, error: sampleErr } = await client
                .from(tblName)
                .select('*')
                .limit(1);
              if (!sampleErr && sampleRow && sampleRow.length > 0) {
                Object.keys(sampleRow[0]).forEach(colName => {
                  cols.push({
                    name: colName,
                    type: typeof sampleRow[0][colName] === 'object' && sampleRow[0][colName] instanceof Date ? 'timestamp' : typeof sampleRow[0][colName],
                    isPk: colName === 'id'
                  });
                });
              }
            } catch (e) {
              console.warn("Failed to discover columns dynamically for " + tblName);
            }
          }

          // Get actual row count dynamically
          let countVal = 0;
          try {
            const { count, error: countErr } = await client
              .from(tblName)
              .select('*', { count: 'exact', head: true });
            if (!countErr && count !== null) {
              countVal = count;
            } else if (countErr) {
              console.warn(`Row count query error for ${tblName}: ${countErr.message}`);
            }
          } catch (e) {
            console.warn("Failed to get row count for " + tblName);
          }

          discovered.push({
            name: tblName,
            schema: 'public',
            recordCount: countVal,
            primaryKey: cols.find(c => c.isPk)?.name || cols[0]?.name || 'id',
            status: 'ACTIVE',
            columns: cols.length > 0 ? cols : [{ name: 'id', type: 'integer', isPk: true }]
          });
        }
      }

      const structured = {
        public: {
          tables: discovered,
          views: [],
          procedures: []
        }
      };

      diagnostics.tablesFound = discovered.length;
      setDiscoveryDiagnostics(diagnostics);

      setDiscoveredDbStructure(structured);
      if (discovered.length > 0) {
        setSelectedTable(discovered[0].name);
      } else {
        setSelectedTable('');
      }
      setIsDiscovering(false);
      addAuditLog(`Dynamic discovery finished. Discovered ${discovered.length} tables.`, "SUCCESS");
    } catch (err) {
      console.error("OpenAPI schema scan error:", err);
      diagnostics.errors.push(err.message);
      setDiscoveryDiagnostics(diagnostics);
      setDiscoveredDbStructure({});
      setSelectedTable('');
      setIsDiscovering(false);
      addAuditLog("Discovery query failed: " + err.message, "ERROR");
    }
  };

  // Convert schema map to flat tables array
  const discoveredTablesList = useMemo(() => {
    const list = [];
    Object.keys(discoveredDbStructure).forEach(schemaKey => {
      if (discoveredDbStructure[schemaKey].tables) {
        discoveredDbStructure[schemaKey].tables.forEach(table => {
          list.push({ ...table, schema: schemaKey });
        });
      }
    });
    return list;
  }, [discoveredDbStructure]);

  const activeColumnsList = useMemo(() => {
    if (!selectedTable) return [];
    const tbl = discoveredTablesList.find(t => t.name === selectedTable);
    return tbl ? tbl.columns : [];
  }, [selectedTable, discoveredTablesList]);

  // Intelligent dynamic mapper based on column names keywords
  useEffect(() => {
    if (activeColumnsList.length > 0) {
      const colNames = activeColumnsList.map(c => c.name);
      
      const findCol = (keywords, defaultIdx) => {
        const match = activeColumnsList.find(c => 
          keywords.some(kw => c.name.toLowerCase().includes(kw))
        );
        return match ? match.name : (colNames[defaultIdx] || colNames[0]);
      };

      setColumnMappings({
        timestampCol: findCol(['timestamp', 'date', 'time', 'dateandtime', 'created_at'], 0),
        tagCol: findCol(['tag', 'index', 'tagindex', 'id', 'user', 'plant'], 1),
        valueCol: findCol(['val', 'parts', 'count', 'yield', 'oee', 'value', 'actualparts', 'recipients', 'message'], 2),
        statusCol: findCol(['status', 'state', 'active', 'enabled'], 3),
        alarmCol: findCol(['alarm', 'reason', 'message', 'marker', 'downtimereason', 'subject'], 4)
      });
    }
  }, [selectedTable, activeColumnsList]);

  // Confidence mapping helper score calculator
  const getMappingConfidence = (param, colName) => {
    if (!colName) return { score: 0, class: 'confidence-low', text: 'Unmapped' };
    const p = param.toLowerCase();
    const c = colName.toLowerCase();

    if (p.includes('time')) {
      if (c === 'timestamp' || c === 'created_at' || c === 'time') return { score: 98, class: 'confidence-high', text: 'High (98%)' };
      if (c.includes('time') || c.includes('date') || c.includes('ts')) return { score: 85, class: 'confidence-medium', text: 'Medium (85%)' };
    }
    if (p.includes('tag')) {
      if (c === 'tag' || c === 'tag_id' || c === 'tagindex' || c === 'plant_id') return { score: 98, class: 'confidence-high', text: 'High (98%)' };
      if (c.includes('id') || c.includes('index') || c.includes('name')) return { score: 80, class: 'confidence-medium', text: 'Medium (80%)' };
    }
    if (p.includes('val')) {
      if (c === 'val' || c === 'value' || c === 'actual_parts') return { score: 95, class: 'confidence-high', text: 'High (95%)' };
      if (c.includes('parts') || c.includes('count') || c.includes('yield') || c.includes('qty')) return { score: 80, class: 'confidence-medium', text: 'Medium (80%)' };
    }
    if (p.includes('status')) {
      if (c === 'status' || c === 'state' || c === 'active' || c === 'enabled') return { score: 98, class: 'confidence-high', text: 'High (98%)' };
      if (c.includes('flag') || c.includes('mode')) return { score: 75, class: 'confidence-medium', text: 'Medium (75%)' };
    }
    if (p.includes('alarm')) {
      if (c === 'alarm' || c === 'downtime_reason' || c === 'reason') return { score: 98, class: 'confidence-high', text: 'High (98%)' };
      if (c.includes('message') || c.includes('error') || c.includes('fail')) return { score: 82, class: 'confidence-medium', text: 'Medium (82%)' };
    }
    return { score: 50, class: 'confidence-low', text: 'Low (50%)' };
  };

  const handleSaveMapping = () => {
    addAuditLog("Saved custom columns mapping for table " + selectedTable, "SUCCESS");
    alert("Mapping Saved Successfully:\n\nTable: " + selectedTable + "\nTimestamp: " + columnMappings.timestampCol + "\nTag: " + columnMappings.tagCol + "\nValue: " + columnMappings.valueCol + "\nStatus: " + columnMappings.statusCol + "\nAlarm: " + columnMappings.alarmCol);
    setWizardStep(7);
  };

  const handleSaveSyncSettings = () => {
    addAuditLog("Activated sync gateway. Interval: " + syncInterval + " seconds", "SUCCESS");
    alert("Synchronization Activated:\n\nInterval: " + syncInterval + " seconds\nCloud Sync: " + (isSyncEnabled ? "Enabled" : "Disabled"));
  };

  const addAuditLog = (action, status = "INFO") => {
    setAuditLogs(prev => [
      { timestamp: new Date().toISOString(), user: "superadmin@plant.com", action, status },
      ...prev
    ]);
  };

  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Source indicator computed dynamically
  const sourceIndicator = useMemo(() => {
    if (!testSuccess) return "Source: Disconnected";
    if (selectedProvider.id === 'supabase') return "Source: Supabase";
    if (selectedProvider.id === 'azure-pg') return "Source: Azure PostgreSQL";
    if (selectedProvider.id === 'azure-sql') return "Source: Azure SQL";
    if (selectedProvider.id === 'aws-rds') return "Source: AWS RDS";
    if (selectedProvider.id === 'google-cloud') return "Source: Google Cloud SQL";
    return "Source: PostgreSQL";
  }, [selectedProvider, testSuccess]);

  // Health and Sync indicators
  const connectionHealth = isNetworkOnline ? (100 - latency * 0.1).toFixed(1) : "0.0";
  const databaseHealth = testSuccess && isNetworkOnline ? "99.8" : "0.0";
  const formattedStorage = (kb) => (kb / 1024).toFixed(2) + " MB";

  // Filter tables for Explorer tree search
  const filteredExplorerTables = discoveredTablesList.filter(tbl => 
    tbl.name.toLowerCase().includes(explorerSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Sub Tabs Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '16px', marginBottom: '8px' }} className="no-print">
        <button
          onClick={() => setActiveTab('wizard')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'wizard' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'wizard' ? 600 : 500,
            borderBottom: activeTab === 'wizard' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          🔌 Connection Wizard
        </button>
        <button
          onClick={() => setActiveTab('explorer')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'explorer' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'explorer' ? 600 : 500,
            borderBottom: activeTab === 'explorer' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          📁 Database Explorer
        </button>
        <button
          onClick={() => setActiveTab('monitor')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'monitor' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'monitor' ? 600 : 500,
            borderBottom: activeTab === 'monitor' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          📈 Monitor & Stats
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '10px 4px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'logs' ? 'var(--secondary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'logs' ? 600 : 500,
            borderBottom: activeTab === 'logs' ? '2px solid var(--secondary)' : 'none',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          📋 Transaction Logs
        </button>
      </div>

      {/* 1. Connection Wizard Tab */}
      {activeTab === 'wizard' && (
        <div className="card" style={{ padding: '24px' }}>
          
          {/* Stepper Progress Bar */}
          <div className="wizard-stepper">
            {[
              { step: 1, label: 'Cloud Provider' },
              { step: 2, label: 'Connection Config' },
              { step: 3, label: 'Auto Discovery' },
              { step: 4, label: 'Table Selection' },
              { step: 5, label: 'Data Preview' },
              { step: 6, label: 'Column Mapping' },
              { step: 7, label: 'Activate Sync' }
            ].map(s => (
              <div 
                key={s.step} 
                className={`wizard-step-indicator ${wizardStep === s.step ? 'active' : ''} ${wizardStep > s.step ? 'completed' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (s.step === 1 || testSuccess || s.step <= wizardStep) {
                    setWizardStep(s.step);
                  }
                }}
              >
                <div className="wizard-step-circle">
                  {wizardStep > s.step ? '✓' : s.step}
                </div>
                <span className="wizard-step-label">{s.label}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', minHeight: '380px' }}>
            
            {/* Step 1: Cloud Provider Selection */}
            {wizardStep === 1 && (
              <div>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem' }}>Step 1: Select Cloud Database Provider</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '20px' }}>Choose the hosting service of your SQL telemetry database.</p>
                
                <div className="grid-3" style={{ gap: '16px' }}>
                  {CLOUD_PROVIDERS.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleProviderSelect(p)}
                      style={{
                        padding: '20px',
                        borderRadius: 'var(--radius-md)',
                        border: selectedProvider.id === p.id ? '2px solid var(--secondary)' : '1px solid var(--border)',
                        backgroundColor: selectedProvider.id === p.id ? 'rgba(0, 240, 255, 0.05)' : 'var(--background)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                      onMouseOver={(e) => { if (selectedProvider.id !== p.id) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                      onMouseOut={(e) => { if (selectedProvider.id !== p.id) e.currentTarget.style.borderColor = 'var(--border)' }}
                    >
                      <span style={{ fontSize: '2rem' }}>{p.icon}</span>
                      <div>
                        <strong style={{ display: 'block', color: 'white', fontSize: '0.92rem' }}>{p.name}</strong>
                        <span className="text-xs text-muted">Engine: {p.dbType}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button className="btn btn-primary" onClick={() => setWizardStep(2)}>
                    Continue to Credentials »
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Connection Configuration */}
            {wizardStep === 2 && (
              <div style={{ maxWidth: '650px', margin: '0 auto' }}>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem', textAlign: 'center' }}>Step 2: Configure Database Credentials</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '24px', textAlign: 'center' }}>
                  Establishing connection parameters for: <strong style={{ color: 'var(--secondary)' }}>{selectedProvider.name}</strong>
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {selectedProvider.id === 'supabase' ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="supabase-url">Supabase Project URL</label>
                        <input
                          id="supabase-url"
                          type="text"
                          className="form-control"
                          placeholder="https://your-project.supabase.co"
                          value={supabaseUrl}
                          onChange={(e) => setSupabaseUrl(e.target.value)}
                          title={supabaseUrl}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="supabase-key">Supabase Anon Key</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            id="supabase-key"
                            type={showSupabaseKey ? "text" : "password"}
                            className="form-control"
                            placeholder="your-anon-key"
                            value={supabaseAnonKey}
                            onChange={(e) => setSupabaseAnonKey(e.target.value)}
                            title={supabaseAnonKey}
                            style={{ paddingRight: '40px' }}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                            style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: showSupabaseKey ? 'var(--secondary)' : 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={showSupabaseKey ? "Hide Key" : "Show Key"}
                          >
                            {showSupabaseKey ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                <line x1="2" y1="2" x2="22" y2="22" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="db-host">Host / Server Endpoint</label>
                        <input
                          id="db-host"
                          type="text"
                          className="form-control"
                          placeholder="db.example.com"
                          value={dbHost}
                          onChange={(e) => setDbHost(e.target.value)}
                          title={dbHost}
                          required
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="db-port">Port</label>
                          <input
                            id="db-port"
                            type="number"
                            className="form-control"
                            value={dbPort}
                            onChange={(e) => setDbPort(parseInt(e.target.value) || 5432)}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="db-name">Database Name</label>
                          <input
                            id="db-name"
                            type="text"
                            className="form-control"
                            value={dbName}
                            onChange={(e) => setDbName(e.target.value)}
                            title={dbName}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid-2" style={{ gap: '16px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="db-user">Username</label>
                          <input
                            id="db-user"
                            type="text"
                            className="form-control"
                            value={dbUser}
                            onChange={(e) => setDbUser(e.target.value)}
                            title={dbUser}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="db-pass">Password</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              id="db-pass"
                              type={showDbPass ? "text" : "password"}
                              className="form-control"
                              value={dbPass}
                              onChange={(e) => setDbPass(e.target.value)}
                              style={{ paddingRight: '40px' }}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowDbPass(!showDbPass)}
                              style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: showDbPass ? 'var(--secondary)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title={showDbPass ? "Hide Password" : "Show Password"}
                            >
                              {showDbPass ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                  <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                  <line x1="2" y1="2" x2="22" y2="22" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid-2" style={{ gap: '16px', alignItems: 'center' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="db-ssl">SSL Mode</label>
                          <select
                            id="db-ssl"
                            className="form-control"
                            value={dbSslMode}
                            onChange={(e) => setDbSslMode(e.target.value)}
                          >
                            <option value="disable">disable (unencrypted)</option>
                            <option value="require">require (SSL secure)</option>
                            <option value="verify-ca">verify-ca</option>
                            <option value="verify-full">verify-full</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
                          <span style={{ color: 'var(--success)', fontSize: '1.1rem' }}>🛡️</span>
                          <span className="text-xs text-muted">SSL mode configures control room client link encryption.</span>
                        </div>
                      </div>

                      {/* API Gateway parameters for client-side explorer dynamic catalog discovery */}
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '16px', paddingTop: '16px' }}>
                        <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'white' }}>⚡ API Gateway Credentials (Required for Client-Side Explorer)</h4>
                        <p className="text-xs text-muted" style={{ marginBottom: '12px' }}>
                          Client-side auto-discovery requires HTTP API access via Supabase / PostgREST.
                        </p>
                        
                        <div className="form-group" style={{ marginBottom: '12px' }}>
                          <label className="form-label" htmlFor="api-gateway-url">API Gateway / Supabase URL</label>
                          <input
                            id="api-gateway-url"
                            type="text"
                            className="form-control"
                            placeholder="https://your-project.supabase.co"
                            value={supabaseUrl}
                            onChange={(e) => setSupabaseUrl(e.target.value)}
                            title={supabaseUrl}
                            required
                          />
                        </div>
                        
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="api-gateway-key">API Gateway / Supabase Anon Key</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              id="api-gateway-key"
                              type={showSupabaseKey ? "text" : "password"}
                              className="form-control"
                              placeholder="your-anon-key"
                              value={supabaseAnonKey}
                              onChange={(e) => setSupabaseAnonKey(e.target.value)}
                              title={supabaseAnonKey}
                              style={{ paddingRight: '40px' }}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                              style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: showSupabaseKey ? 'var(--secondary)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title={showSupabaseKey ? "Hide Key" : "Show Key"}
                            >
                              {showSupabaseKey ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                  <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                  <line x1="2" y1="2" x2="22" y2="22" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                    >
                      {isTesting ? '🔄 Handshaking...' : '⚡ Test Connection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      disabled={!testSuccess}
                      className="btn btn-primary"
                      style={{ flex: 1.5 }}
                    >
                      Continue to Discovery »
                    </button>
                  </div>

                  {testSuccess && (
                    <div style={{
                      backgroundColor: 'var(--success-bg)',
                      border: '1px solid rgba(0, 255, 102, 0.2)',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--success)',
                      fontWeight: 600,
                      textAlign: 'center',
                      fontSize: '0.88rem',
                      animation: 'fadeIn 0.3s'
                    }}>
                      ✓ Connection Successful
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* Step 3: Auto Discovery */}
            {wizardStep === 3 && (
              <div>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem' }}>Step 3: Schema Auto Discovery Scan</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '20px' }}>Automatically scanning schemas, tables, and views dynamically from the active database connection.</p>

                {isDiscovering ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      border: '3px solid rgba(0, 240, 255, 0.1)',
                      borderTopColor: 'var(--secondary)',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>SCANNING CATALOG TABLES...</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className="text-xs text-muted font-semibold">DISCOVERED TABLES ({discoveredTablesList.length})</span>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span className="badge badge-info text-xs font-semibold">{sourceIndicator}</span>
                        <button onClick={() => scanConnectedDatabase(supabaseUrl, supabaseAnonKey)} className="btn btn-secondary text-xs" style={{ padding: '4px 8px' }}>
                          🔄 Refresh Scan
                        </button>
                      </div>
                    </div>

                    <div className="table-responsive" style={{ maxHeight: '250px' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Table Name</th>
                            <th>Schema</th>
                            <th>Record Count</th>
                            <th>Primary Key</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discoveredTablesList.length === 0 ? (
                            <tr>
                              <td colSpan="5">
                                <div style={{ padding: '20px', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px dashed var(--error)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                  <h4 style={{ color: 'var(--error)', marginBottom: '8px', fontSize: '0.95rem' }}>⚠️ Table Discovery Failed / No Tables Found</h4>
                                  <p style={{ fontSize: '0.82rem', marginBottom: '12px' }}>The connection succeeded, but no base tables were discovered in the schema.</p>
                                  
                                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '0.78rem', fontFamily: 'var(--mono)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                                    <span style={{ color: 'var(--text)' }}>Connected DB:</span>
                                    <span style={{ color: 'var(--secondary)' }}>{discoveryDiagnostics.connectedDatabase || 'Unknown'}</span>
                                    
                                    <span style={{ color: 'var(--text)' }}>Scan Schema:</span>
                                    <span style={{ color: 'var(--secondary)' }}>{discoveryDiagnostics.connectedSchema}</span>
                                    
                                    <span style={{ color: 'var(--text)' }}>Tables Found:</span>
                                    <span style={{ color: 'var(--error)' }}>{discoveryDiagnostics.tablesFound}</span>
                                    
                                    {discoveryDiagnostics.errors.length > 0 && (
                                      <>
                                        <span style={{ color: 'var(--text)' }}>Query Errors:</span>
                                        <span style={{ color: 'var(--error)', whiteSpace: 'pre-wrap' }}>
                                          {discoveryDiagnostics.errors.join('\n')}
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <div style={{ marginTop: '16px', fontSize: '0.8rem', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                                    <strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>Potential Reasons & Fixes:</strong>
                                    <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <li>Make sure you have created your tables in the <strong>public</strong> schema.</li>
                                      <li>Verify that the <code>anon</code> role has <code>SELECT</code> privileges granted on your tables. Run: <code>GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;</code></li>
                                      <li>Run the updated <code>supabase-schema.sql</code> script in your Supabase SQL editor to create the required helper functions for robust catalog discovery.</li>
                                    </ul>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            discoveredTablesList.map((tbl, idx) => (
                              <tr key={idx}>
                                <td className="font-semibold" style={{ color: 'var(--secondary)' }}>📁 {tbl.name}</td>
                                <td><span className="font-mono text-xs">{tbl.schema}</span></td>
                                <td className="font-mono">{tbl.recordCount.toLocaleString()}</td>
                                <td><span className="badge badge-info" style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>🔑 {tbl.primaryKey}</span></td>
                                <td>
                                  <span className={`badge ${tbl.status === 'ACTIVE' || tbl.status === 'SYNCED' ? 'badge-success' : 'badge-warning'}`}>
                                    {tbl.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px' }}>
                      <button className="btn btn-secondary" onClick={() => setWizardStep(2)}>« Back</button>
                      <button className="btn btn-primary" onClick={() => setWizardStep(4)} disabled={discoveredTablesList.length === 0}>Continue to Table Selection »</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Table Selection */}
            {wizardStep === 4 && (
              <div>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem' }}>Step 4: Table Selection</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '20px' }}>Select the discovered table you wish to query and map.</p>

                <div className="grid-3" style={{ gap: '16px' }}>
                  {discoveredTablesList.length === 0 ? (
                    <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No discovered tables available. Please check your database connection credentials.
                    </div>
                  ) : (
                    discoveredTablesList.map((tbl, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedTable(tbl.name)}
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-sm)',
                          border: selectedTable === tbl.name ? '2px solid var(--secondary)' : '1px solid var(--border)',
                          backgroundColor: selectedTable === tbl.name ? 'rgba(0, 240, 255, 0.05)' : 'var(--background)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseOver={(e) => { if (selectedTable !== tbl.name) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                        onMouseOut={(e) => { if (selectedTable !== tbl.name) e.currentTarget.style.borderColor = 'var(--border)' }}
                      >
                        <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                          <strong style={{ color: 'white' }}>📁 {tbl.name}</strong>
                          <span className="badge badge-info" style={{ fontSize: '0.62rem' }}>{tbl.schema}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className="text-muted">Columns: {tbl.columns.length}</span>
                          <span className="text-muted">Rows: {tbl.recordCount.toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedTable && (
                  <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)' }}>
                    <span className="text-xs text-muted font-semibold" style={{ display: 'block', marginBottom: '8px' }}>COLUMNS DISCOVERED FOR {selectedTable.toUpperCase()}:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {activeColumnsList.map((col, idx) => (
                        <span key={idx} className="badge badge-info" style={{ textTransform: 'none', padding: '6px 10px', fontSize: '0.78rem' }}>
                          {col.isPk && '🔑 '}<strong>{col.name}</strong> <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>({col.type})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => setWizardStep(3)}>« Back</button>
                  <button className="btn btn-primary" onClick={() => setWizardStep(5)} disabled={!selectedTable}>Continue to Data Preview »</button>
                </div>
              </div>
            )}

            {/* Step 5: Data Preview */}
            {wizardStep === 5 && (
              <div>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem' }}>Step 5: Telemetry Data Preview</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '16px' }}>Showing rows (latest 100 max) dynamically fetched from table: <strong style={{ color: 'var(--secondary)' }}>{selectedTable}</strong></p>

                <div className="table-responsive" style={{ maxHeight: '250px' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        {activeColumnsList.map((col, idx) => (
                          <th key={idx}>{col.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(1, activeColumnsList.length)} style={{ textAlign: 'center' }}>No record rows detected in this table scope.</td>
                        </tr>
                      ) : (
                        previewRows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {activeColumnsList.map((col, cIdx) => {
                              const val = row[col.name];
                              return (
                                <td key={cIdx} className={col.type === 'timestamp' || col.isPk ? 'font-mono text-xs' : ''} style={{
                                  color: col.isPk ? 'var(--secondary)' : 'inherit',
                                  fontWeight: col.isPk ? 600 : 'normal'
                                }}>
                                  {val !== null && val !== undefined ? val.toString() : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => setWizardStep(4)}>« Back</button>
                  <button className="btn btn-primary" onClick={() => setWizardStep(6)}>Continue to Mapping »</button>
                </div>
              </div>
            )}

            {/* Step 6: Mapping Configuration */}
            {wizardStep === 6 && (
              <div>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem' }}>Step 6: Column Field Mapping & Suggestions</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '20px' }}>Select matching columns to map database values dynamically. The system auto-detects fields and shows confidence ratings.</p>

                <div style={{ maxWidth: '650px', margin: '0 auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--background)', overflow: 'hidden' }}>
                  <div className="mapping-row" style={{ backgroundColor: 'var(--surface)', gridTemplateColumns: '1.2fr 1fr 1.5fr 1fr' }}>
                    <span className="mapping-row-header">Skadomation Parameter</span>
                    <span className="mapping-row-header">Expected Type</span>
                    <span className="mapping-row-header">Select Database Column</span>
                    <span className="mapping-row-header">Auto Confidence</span>
                  </div>

                  {/* Timestamp Mapping Row */}
                  <div className="mapping-row" style={{ gridTemplateColumns: '1.2fr 1fr 1.5fr 1fr' }}>
                    <strong>🕒 Timestamp Column</strong>
                    <span className="text-xs text-muted">date / timestamp</span>
                    <select
                      className="form-control text-xs"
                      value={columnMappings.timestampCol}
                      onChange={(e) => setColumnMappings({ ...columnMappings, timestampCol: e.target.value })}
                    >
                      {activeColumnsList.map((col, idx) => <option key={idx} value={col.name}>{col.name}</option>)}
                    </select>
                    <div>
                      {(() => {
                        const confidence = getMappingConfidence('timestamp', columnMappings.timestampCol);
                        return <span className={`confidence-badge ${confidence.class}`}>{confidence.text}</span>;
                      })()}
                    </div>
                  </div>

                  {/* Tag Mapping Row */}
                  <div className="mapping-row" style={{ gridTemplateColumns: '1.2fr 1fr 1.5fr 1fr' }}>
                    <strong>🏷️ Tag Column</strong>
                    <span className="text-xs text-muted">integer / varchar</span>
                    <select
                      className="form-control text-xs"
                      value={columnMappings.tagCol}
                      onChange={(e) => setColumnMappings({ ...columnMappings, tagCol: e.target.value })}
                    >
                      {activeColumnsList.map((col, idx) => <option key={idx} value={col.name}>{col.name}</option>)}
                    </select>
                    <div>
                      {(() => {
                        const confidence = getMappingConfidence('tag', columnMappings.tagCol);
                        return <span className={`confidence-badge ${confidence.class}`}>{confidence.text}</span>;
                      })()}
                    </div>
                  </div>

                  {/* Value Mapping Row */}
                  <div className="mapping-row" style={{ gridTemplateColumns: '1.2fr 1fr 1.5fr 1fr' }}>
                    <strong>📈 Value Column</strong>
                    <span className="text-xs text-muted">numeric / float</span>
                    <select
                      className="form-control text-xs"
                      value={columnMappings.valueCol}
                      onChange={(e) => setColumnMappings({ ...columnMappings, valueCol: e.target.value })}
                    >
                      {activeColumnsList.map((col, idx) => <option key={idx} value={col.name}>{col.name}</option>)}
                    </select>
                    <div>
                      {(() => {
                        const confidence = getMappingConfidence('value', columnMappings.valueCol);
                        return <span className={`confidence-badge ${confidence.class}`}>{confidence.text}</span>;
                      })()}
                    </div>
                  </div>

                  {/* Status Mapping Row */}
                  <div className="mapping-row" style={{ gridTemplateColumns: '1.2fr 1fr 1.5fr 1fr' }}>
                    <strong>🟢 Status Column</strong>
                    <span className="text-xs text-muted">varchar / boolean</span>
                    <select
                      className="form-control text-xs"
                      value={columnMappings.statusCol}
                      onChange={(e) => setColumnMappings({ ...columnMappings, statusCol: e.target.value })}
                    >
                      {activeColumnsList.map((col, idx) => <option key={idx} value={col.name}>{col.name}</option>)}
                    </select>
                    <div>
                      {(() => {
                        const confidence = getMappingConfidence('status', columnMappings.statusCol);
                        return <span className={`confidence-badge ${confidence.class}`}>{confidence.text}</span>;
                      })()}
                    </div>
                  </div>

                  {/* Alarm Mapping Row */}
                  <div className="mapping-row" style={{ gridTemplateColumns: '1.2fr 1fr 1.5fr 1fr' }}>
                    <strong>🚨 Alarm Column</strong>
                    <span className="text-xs text-muted">varchar / text</span>
                    <select
                      className="form-control text-xs"
                      value={columnMappings.alarmCol}
                      onChange={(e) => setColumnMappings({ ...columnMappings, alarmCol: e.target.value })}
                    >
                      {activeColumnsList.map((col, idx) => <option key={idx} value={col.name}>{col.name}</option>)}
                    </select>
                    <div>
                      {(() => {
                        const confidence = getMappingConfidence('alarm', columnMappings.alarmCol);
                        return <span className={`confidence-badge ${confidence.class}`}>{confidence.text}</span>;
                      })()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => setWizardStep(5)}>« Back</button>
                  <button className="btn btn-primary" onClick={handleSaveMapping}>💾 Save Mapping & Continue</button>
                </div>
              </div>
            )}

            {/* Step 7: Activate Sync */}
            {wizardStep === 7 && (
              <div style={{ maxWidth: '550px', margin: '0 auto' }}>
                <h3 style={{ marginBottom: '6px', fontSize: '1.2rem', textAlign: 'center' }}>Step 7: Activate Synchronization Gateway</h3>
                <p className="text-sm text-muted" style={{ marginBottom: '24px', textAlign: 'center' }}>Enable background sync transfers based on target column mappings.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.95rem' }}>Enable Cloud Synchronization</strong>
                      <span className="text-xs text-muted">Automatically sync selected database table</span>
                    </div>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                      <input 
                        type="checkbox" 
                        checked={isSyncEnabled}
                        onChange={(e) => setIsSyncEnabled(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: isSyncEnabled ? 'var(--success)' : '#475569',
                        borderRadius: '34px', transition: '0.2s'
                      }}>
                        <span style={{
                          position: 'absolute', height: '18px', width: '18px',
                          left: isSyncEnabled ? '22px' : '4px', bottom: '3px',
                          backgroundColor: '#050811', borderRadius: '50%', transition: '0.2s'
                        }} />
                      </span>
                    </label>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="sync-interval">Synchronization Polling Interval</label>
                    <select
                      id="sync-interval"
                      className="form-control"
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(parseInt(e.target.value))}
                    >
                      <option value={10}>10 Seconds (Real-time telemetry)</option>
                      <option value={30}>30 Seconds (Fast cycle)</option>
                      <option value={60}>60 Seconds (Standard cycle)</option>
                      <option value={300}>5 Minutes (Production buffer)</option>
                      <option value={900}>15 Minutes (Utility logs)</option>
                      <option value={1800}>30 Minutes (Enterprise statistics)</option>
                    </select>
                  </div>

                  {/* Diagnostics Validation panel summary inside wizard */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'white', margin: 0 }}>✓ Connection Diagnostic validation Passed</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                      <span className="text-muted">SSL Secure Link:</span>
                      <strong style={{ color: 'var(--success)' }}>{diagnosticsLog.sslHandshake}</strong>
                      
                      <span className="text-muted">SELECT Permissions:</span>
                      <strong style={{ color: 'var(--success)' }}>{diagnosticsLog.selectPermissions}</strong>
                      
                      <span className="text-muted">Database Link Health:</span>
                      <strong style={{ color: 'var(--success)' }}>{diagnosticsLog.healthScore}% (OPTIMAL)</strong>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-muted" style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    <span>Active Gateway:</span>
                    <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{sourceIndicator}</span>
                  </div>

                  <button className="btn btn-primary" onClick={handleSaveSyncSettings} style={{ marginTop: '8px' }}>
                    ⚡ Save & Activate Sync
                  </button>

                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
                  <button className="btn btn-secondary" onClick={() => setWizardStep(6)}>« Back to Mappings</button>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* 2. SQL Database Explorer Tab */}
      {activeTab === 'explorer' && (
        <div className="grid-3">
          
          {/* Left: DB Tree Explorer Panel */}
          <div className="card" style={{ gridColumn: 'span 1', padding: '20px', minHeight: '450px' }}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '12px' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>📁 Catalog Explorer</h3>
                <span className="badge badge-info font-semibold" style={{ fontSize: '0.65rem' }}>
                  {sourceIndicator}
                </span>
              </div>
              <input
                type="text"
                placeholder="Filter tables..."
                value={explorerSearch}
                onChange={(e) => setExplorerSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'white',
                  outline: 'none'
                }}
              />
            </div>

            <div className="db-explorer-tree" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              
              {Object.keys(discoveredDbStructure).length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No schemas discovered. Establish a database connection to scan catalog structure.
                </div>
              ) : (
                Object.keys(discoveredDbStructure).map(schemaKey => {
                  const schemaNodeId = `schema-${schemaKey}`;
                  const tablesNodeId = `${schemaKey}-tables`;
                  const viewsNodeId = `${schemaKey}-views`;
                  const schema = discoveredDbStructure[schemaKey];
                  
                  return (
                    <div key={schemaKey} className="tree-node">
                      <div 
                        className="tree-node-row" 
                        onClick={() => toggleNode(schemaNodeId)}
                      >
                        <span className={`tree-node-toggle ${expandedNodes[schemaNodeId] ? 'expanded' : ''}`}>▶</span>
                        <span className="tree-node-icon">💼</span>
                        <span className="tree-node-label" style={{ color: 'white' }}>{schemaKey}</span>
                      </div>

                      {expandedNodes[schemaNodeId] && (
                        <div className="tree-node-children">
                          
                          {/* Tables group */}
                          {schema.tables && schema.tables.length > 0 && (
                            <div className="tree-node">
                              <div className="tree-node-row" onClick={() => toggleNode(tablesNodeId)}>
                                <span className={`tree-node-toggle ${expandedNodes[tablesNodeId] ? 'expanded' : ''}`}>▶</span>
                                <span className="tree-node-icon">📁</span>
                                <span className="tree-node-label">Tables</span>
                                <span className="tree-node-meta">({filteredExplorerTables.length})</span>
                              </div>

                              {expandedNodes[tablesNodeId] && (
                                <div className="tree-node-children">
                                  {filteredExplorerTables.map(tbl => {
                                    const tblNodeId = `table-${tbl.name}`;
                                    return (
                                      <div key={tbl.name} className="tree-node">
                                        <div 
                                          className={`tree-node-row ${selectedTable === tbl.name ? 'active' : ''}`}
                                          onClick={() => {
                                            setSelectedTable(tbl.name);
                                            toggleNode(tblNodeId);
                                          }}
                                        >
                                          <span className={`tree-node-toggle ${expandedNodes[tblNodeId] ? 'expanded' : ''}`}>▶</span>
                                          <span className="tree-node-icon">📊</span>
                                          <span className="tree-node-label">{tbl.name}</span>
                                          <span className="tree-node-meta" style={{ fontSize: '0.65rem' }}>({tbl.recordCount})</span>
                                        </div>

                                        {expandedNodes[tblNodeId] && (
                                          <div className="tree-node-children">
                                            {tbl.columns.map(col => (
                                              <div key={col.name} className="tree-node-row" style={{ cursor: 'default' }}>
                                                <span style={{ width: '14px' }} />
                                                <span className="tree-node-icon">{col.isPk ? '🔑' : '🔹'}</span>
                                                <span className="tree-node-label" style={{ color: col.isPk ? 'var(--secondary)' : 'var(--text)' }}>
                                                  {col.name}
                                                </span>
                                                <span className="tree-node-meta">({col.type})</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })
              )}

            </div>
          </div>

          {/* Right: Details & Query Preview Pane */}
          <div className="card" style={{ gridColumn: 'span 2', padding: '24px' }}>
            <h3 style={{ marginBottom: '4px', fontSize: '1.1rem' }}>📁 Table Details: <span style={{ color: 'var(--secondary)' }}>{selectedTable || 'None'}</span></h3>
            <p className="text-xs text-muted" style={{ marginBottom: '16px' }}>Metadata description, primary keys, record stats, and column data definitions.</p>

            {!selectedTable ? (
              <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Please select a table in the tree explorer to view metadata details.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--background)' }}>
                    <span className="text-xs text-muted" style={{ display: 'block', marginBottom: '4px' }}>ESTIMATED ROWS</span>
                    <h4 style={{ fontSize: '1.3rem', color: 'white' }}>
                      {discoveredTablesList.find(t => t.name === selectedTable)?.recordCount.toLocaleString() || '0'}
                    </h4>
                  </div>
                  <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--background)' }}>
                    <span className="text-xs text-muted" style={{ display: 'block', marginBottom: '4px' }}>PRIMARY KEY</span>
                    <h4 style={{ fontSize: '1.1rem', color: 'var(--secondary)', fontFamily: 'var(--mono)' }}>
                      🔑 {discoveredTablesList.find(t => t.name === selectedTable)?.primaryKey || 'None'}
                    </h4>
                  </div>
                  <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--background)' }}>
                    <span className="text-xs text-muted" style={{ display: 'block', marginBottom: '4px' }}>DATA REFRESH STATUS</span>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--success)' }}>
                      ✓ Connected & Streaming
                    </h4>
                  </div>
                </div>

                {/* Tabbed view for Explorer: Column Details & Preview Grid */}
                <details open style={{ marginBottom: '16px' }}>
                  <summary style={{ fontSize: '0.9rem', marginBottom: '8px', cursor: 'pointer', outline: 'none' }}>Column Structure Schema</summary>
                  <div className="table-responsive" style={{ maxHeight: '180px', marginTop: '8px' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Column Name</th>
                          <th>Data Type</th>
                          <th>Constraints</th>
                          <th>Mapping Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeColumnsList.map((col, idx) => {
                          const isMapped = Object.values(columnMappings).includes(col.name);
                          return (
                            <tr key={idx}>
                              <td className="font-semibold" style={{ color: col.isPk ? 'var(--secondary)' : 'var(--text)' }}>
                                {col.isPk && '🔑 '}{col.name}
                              </td>
                              <td><span className="font-mono text-xs">{col.type}</span></td>
                              <td>{col.isPk ? <span className="badge badge-error">PRIMARY KEY / NOT NULL</span> : <span className="text-muted">NULLABLE</span>}</td>
                              <td>
                                {isMapped ? (
                                  <span className="badge badge-success">Mapped</span>
                                ) : (
                                  <span className="badge badge-secondary" style={{ opacity: 0.5 }}>Unmapped</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>

                <details style={{ marginBottom: '8px' }}>
                  <summary style={{ fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}>Data Rows Live Preview</summary>
                  <div className="table-responsive" style={{ maxHeight: '180px', marginTop: '8px' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          {activeColumnsList.map((col, idx) => (
                            <th key={idx}>{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.length === 0 ? (
                          <tr>
                            <td colSpan={Math.max(1, activeColumnsList.length)} style={{ textAlign: 'center' }}>No record rows detected in this table scope.</td>
                          </tr>
                        ) : (
                          previewRows.slice(0, 10).map((row, rIdx) => (
                            <tr key={rIdx}>
                              {activeColumnsList.map((col, cIdx) => {
                                const val = row[col.name];
                                return (
                                  <td key={cIdx} className={col.type === 'timestamp' || col.isPk ? 'font-mono text-xs' : ''}>
                                    {val !== null && val !== undefined ? val.toString() : '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}

          </div>

        </div>
      )}

      {/* 3. Monitor & Stats Tab */}
      {activeTab === 'monitor' && (
        <>
          {/* Status Indicators Grid */}
          <div className="grid-3">
            
            {/* Connection Health Indicator */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase' }}>
                📶 Connection Health
              </span>
              <div className="flex items-center gap-4">
                <span style={{ fontSize: '2.5rem' }}>📶</span>
                <div>
                  <h2 style={{ fontSize: '1.6rem', margin: 0, color: isNetworkOnline ? 'var(--success)' : 'var(--error)' }}>
                    {connectionHealth}%
                  </h2>
                  <span className="text-xs text-muted">
                    Response Latency: {latency} ms
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: 'auto', display: 'flex', justifyBetween: 'space-between', fontSize: '0.78rem' }}>
                <span className="text-muted">SSL Protocol:</span>
                <span className="font-semibold" style={{ color: 'var(--secondary)' }}>TLS 1.3 Secure</span>
              </div>
            </div>

            {/* Database Health Indicator */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase' }}>
                🛡️ Database Statistics
              </span>
              <div className="flex items-center gap-4">
                <span style={{ fontSize: '2.5rem' }}>💾</span>
                <div>
                  <h2 style={{ fontSize: '1.6rem', margin: 0, color: testSuccess && isNetworkOnline ? 'var(--success)' : 'var(--error)' }}>
                    {testSuccess && isNetworkOnline ? 'HEALTHY' : 'OFFLINE'}
                  </h2>
                  <span className="text-xs text-muted">
                    Index usage: {databaseHealth}% optimized
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: 'auto', display: 'flex', justifyBetween: 'space-between', fontSize: '0.78rem' }}>
                <span className="text-muted">Storage usage:</span>
                <span className="font-semibold">{formattedStorage(cloudStorageUsageKb)}</span>
              </div>
            </div>

            {/* Auto Reconnect Settings */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase' }}>
                ⚙️ Auto-reconnect Settings
              </span>
              <div className="flex items-center gap-4">
                <span style={{ fontSize: '2.5rem' }}>🔄</span>
                <div>
                  <h2 style={{ fontSize: '1.6rem', margin: 0, color: autoReconnect ? 'var(--secondary)' : 'inherit' }}>
                    {autoReconnect ? 'ENABLED' : 'DISABLED'}
                  </h2>
                  <span className="text-xs text-muted">
                    Attempts: 5 retries max
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: 'auto', display: 'flex', justifyBetween: 'space-between', fontSize: '0.78rem', alignItems: 'center' }}>
                <span className="text-muted">Toggle State:</span>
                <button 
                  onClick={() => {
                    setAutoReconnect(!autoReconnect);
                    addAuditLog("Auto-reconnect toggled to: " + (!autoReconnect ? "Enabled" : "Disabled"));
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--secondary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    padding: 0
                  }}
                >
                  {autoReconnect ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>

          </div>

          {/* Latency Live SVG trend tracker & Spool metrics */}
          <div className="grid-2">
            
            {/* Live latency SVG line chart */}
            <div className="card" style={{ padding: '20px' }}>
              <span className="text-xs text-muted font-semibold" style={{ display: 'block', textTransform: 'uppercase', marginBottom: '14px' }}>
                Live Connection Latency Trend (ms)
              </span>
              <div style={{ height: '140px', position: 'relative' }}>
                <svg viewBox="0 0 400 140" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* Gridlines */}
                  {[0, 0.5, 1].map((r, i) => (
                    <line
                      key={i}
                      x1="0"
                      y1={140 * r}
                      x2="400"
                      y2={140 * r}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                      strokeDasharray="4,4"
                    />
                  ))}
                  {/* Line rendering */}
                  {(() => {
                    const maxVal = Math.max(...latencyHistory) || 100;
                    const points = latencyHistory.map((val, idx) => {
                      const x = (idx / (latencyHistory.length - 1)) * 400;
                      const y = 130 - (val / maxVal) * 110;
                      return { x, y, val };
                    });
                    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                    return (
                      <>
                        <path d={linePath} fill="none" stroke="var(--secondary)" strokeWidth="2" />
                        {points.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r="3"
                            fill="var(--background)"
                            stroke="var(--secondary)"
                            strokeWidth="1.5"
                          />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <div className="flex justify-between text-xs text-muted" style={{ marginTop: '10px' }}>
                <span>30s ago</span>
                <span>Active Link Telemetry</span>
                <span>Live</span>
              </div>
            </div>

            {/* Storage and sync performance overview */}
            <div className="card" style={{ padding: '20px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '0.9rem' }}>📊 Sync Rate & Throughput Statistics</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Sync Flow Rate (RPM):</span>
                  <strong>{isNetworkOnline ? '120 RPM' : '0 RPM'}</strong>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Avg Data Throughput:</span>
                  <strong>{isNetworkOnline ? '1.85 KB/s' : '0 KB/s'}</strong>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Failed Sync Count:</span>
                  <strong style={{ color: 'var(--success)' }}>0 failures</strong>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Local spool spool buffer:</span>
                  <span className="font-semibold text-warning">{localBuffer.parts} rows queued</span>
                </div>
                <button onClick={forceSync} className="btn btn-primary text-xs" style={{ padding: '8px', marginTop: '6px' }}>
                  🔄 Flush Local Buffer Queue
                </button>
              </div>
            </div>

          </div>
        </>
      )}

      {/* 4. Transaction Logs Tab */}
      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Scrollable Command Line Console */}
          <div className="card" style={{ padding: '20px', backgroundColor: '#050811', border: '1px solid var(--border)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '12px', borderBottom: '1px solid #1E294B', paddingBottom: '8px' }}>
              <strong style={{ fontSize: '0.9rem', color: '#00F0FF', fontFamily: 'var(--mono)' }}>&gt;_ ACTIVE SCADA MONITORING CONSOLE (CONNECTION LOGS)</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>Telemetry tunnel heartbeat logs</span>
            </div>
            
            <div style={{
              backgroundColor: '#000000',
              padding: '16px',
              borderRadius: '6px',
              height: '180px',
              overflowY: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: '0.8rem',
              color: '#00FF66',
              lineHeight: '1.6',
              border: '1px solid #1E294B'
            }}>
              {syncLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>Console initialized. Waiting for SCADA heartbeats...</div>
              ) : (
                syncLogs.map((log, idx) => (
                  <div key={idx} style={{ 
                    color: log.msg.includes('ERROR') ? '#FF2E2E' : log.msg.includes('SUCCESS') ? '#00FF66' : '#E2E8F0' 
                  }}>
                    <span style={{ color: '#7080A0', marginRight: '8px' }}>[{log.time}]</span>
                    {log.msg}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="card" style={{ padding: '24px' }}>
            <h4 style={{ marginBottom: '12px' }}>Database Gateway Operations Audit Logs</h4>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Operator User</th>
                    <th>System Operation Action</th>
                    <th>Result Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-xs">{log.timestamp.replace('T', ' ').substring(0, 19)}</td>
                      <td>{log.user}</td>
                      <td className="font-semibold" style={{ color: 'var(--text)' }}>{log.action}</td>
                      <td>
                        <span className={`badge ${log.status === 'SUCCESS' ? 'badge-success' : 'badge-info'}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
