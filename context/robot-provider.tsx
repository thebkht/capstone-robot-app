import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { RobotAPI, RobotStatus, createRobotApi } from '@/services/robot-api';

interface RobotContextValue {
  api: RobotAPI;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  status: RobotStatus | null;
  lastUpdated?: Date;
  isPolling: boolean;
  setIsPolling: (value: boolean) => void;
  refreshStatus: () => Promise<void>;
  setBluetoothEnabled: (enabled: boolean) => void;
  bluetoothEnabled: boolean;
  bluetoothSupported: boolean;
}

const RobotContext = createContext<RobotContextValue | undefined>(undefined);

const DEFAULT_URL = 'http://192.168.1.10:8000';

export const RobotProvider = ({ children }: React.PropsWithChildren) => {
  const [baseUrl, setBaseUrlState] = useState<string>(DEFAULT_URL);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(false);
  const bluetoothSupported =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ENABLE_BLE === 'true';

  useEffect(() => {
    if (!bluetoothSupported && bluetoothEnabled) {
      setBluetoothEnabled(false);
    }
  }, [bluetoothEnabled, bluetoothSupported]);

  const api = useMemo(() => createRobotApi(baseUrl), [baseUrl]);

  const refreshStatus = useCallback(async () => {
    try {
      const latest = await api.fetchStatus();
      setStatus(latest);
      setLastUpdated(new Date());
    } catch (error) {
      console.warn('Failed to refresh robot status', error);
      Alert.alert('Robot status', (error as Error).message);
    }
  }, [api]);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    refreshStatus();
    const interval = setInterval(refreshStatus, 10_000);
    return () => clearInterval(interval);
  }, [isPolling, refreshStatus]);

  const setBaseUrl = (url: string) => {
    setBaseUrlState(url);
    api.updateBaseUrl(url);
  };

  const value = useMemo(
    () => ({
      api,
      baseUrl,
      setBaseUrl,
      status,
      lastUpdated,
      isPolling,
      setIsPolling,
      refreshStatus,
      bluetoothEnabled,
      setBluetoothEnabled,
      bluetoothSupported,
    }),
    [api, baseUrl, status, lastUpdated, isPolling, bluetoothEnabled, bluetoothSupported],
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
