import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { RobotAPI, RobotStatus, createRobotApi } from '@/services/robot-api';

interface RobotContextValue {
  api: RobotAPI;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  status: RobotStatus | null;
  statusError: string | null;
  lastUpdated?: Date;
  isPolling: boolean;
  setIsPolling: (value: boolean) => void;
  refreshStatus: () => Promise<void>;
}

const RobotContext = createContext<RobotContextValue | undefined>(undefined);

const DEFAULT_URL = 'http://192.168.1.10:8000';

export const RobotProvider = ({ children }: React.PropsWithChildren) => {
  const [baseUrl, setBaseUrlState] = useState<string>(DEFAULT_URL);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [isPolling, setIsPolling] = useState<boolean>(true);

  const api = useMemo(() => createRobotApi(baseUrl), [baseUrl]);

  const refreshStatus = useCallback(async () => {
    try {
      console.log('Refreshing robot status from', baseUrl);
      const latest = await api.fetchStatus();
      setStatus(latest);
      setLastUpdated(new Date());
      setStatusError(null);
      console.log('Robot status updated', latest);
    } catch (error) {
      console.warn('Failed to refresh robot status', error);
      setStatus(null);
      setStatusError((error as Error).message);
    }
  }, [api, baseUrl]);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    refreshStatus();
    const interval = setInterval(refreshStatus, 10_000);
    return () => clearInterval(interval);
  }, [isPolling, refreshStatus]);

  const setBaseUrl = useCallback(
    (url: string) => {
      console.log('Updating robot base URL', { previous: baseUrl, next: url });
      setBaseUrlState(url);
      api.updateBaseUrl(url);
      setStatusError(null);
    },
    [api, baseUrl],
  );

  const value = useMemo(
    () => ({
      api,
      baseUrl,
      setBaseUrl,
      status,
      statusError,
      lastUpdated,
      isPolling,
      setIsPolling,
      refreshStatus,
    }),
    [api, baseUrl, isPolling, lastUpdated, refreshStatus, status, statusError],
  );

  return <RobotContext.Provider value={value}>{children}</RobotContext.Provider>;
};

export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobot must be used within a RobotProvider');
  }

  return context;
};
