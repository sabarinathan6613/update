import { useState, useCallback } from 'react';
import { invalidateCache } from './db';
import { useSimulator } from './SimulatorContext';

export function useRefresh(fetchDataFn, pageName = 'Data') {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState(null); // null | { type: 'success' | 'error', message: string }
  const { setRefreshTrigger } = useSimulator();

  const handleRefresh = useCallback(async (...args) => {
    setIsRefreshing(true);
    setRefreshToast(null);
    try {
      // 1. Purge cache
      invalidateCache();
      
      // 2. Perform page-specific data fetching
      if (fetchDataFn) {
        await fetchDataFn(...args);
      }

      // 3. Trigger global simulator refresh to notify other components
      if (setRefreshTrigger) {
        setRefreshTrigger(prev => prev + 1);
      }

      setRefreshToast({ type: 'success', message: 'Data refreshed successfully.' });
      setTimeout(() => setRefreshToast(null), 3000);
    } catch (err) {
      console.error(`[Refresh Error] Failed to refresh ${pageName}:`, err);
      setRefreshToast({ type: 'error', message: err.message || 'Unable to refresh data. Please check the database connection.' });
      setTimeout(() => setRefreshToast(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchDataFn, setRefreshTrigger, pageName]);

  return {
    isRefreshing,
    refreshToast,
    handleRefresh,
    setRefreshToast
  };
}
