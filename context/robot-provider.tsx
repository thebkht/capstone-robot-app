import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RobotAPI, RobotStatus, createRobotApi } from '@/services/robot-api';

interface OptionalBleManager {
  startDeviceScan: (
    uuids: string[] | null,
    options: unknown,
    listener: (
      error: Error | null,
      device: { id: string; name: string | null; rssi: number | null } | null,
    ) => void,
  ) => void;
  stopDeviceScan: () => void;
  destroy: () => void;
}

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
  setBluetoothEnabled: (enabled: boolean) => void;
  bluetoothEnabled: boolean;
  bluetoothSupported: boolean;
  bleManager: OptionalBleManager | null;
}

const RobotContext = createContext<RobotContextValue | undefined>(undefined);

const DEFAULT_URL = 'http://192.168.1.10:8000';

export const RobotProvider = ({ children }: React.PropsWithChildren) => {
  const [baseUrl, setBaseUrlState] = useState<string>(DEFAULT_URL);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(false);
  const shouldAttemptBle =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ENABLE_BLE === 'true';
  const [bleManager, setBleManager] = useState<OptionalBleManager | null>(null);

  useEffect(() => {
    if (!shouldAttemptBle) {
      setBleManager(null);
      return;
    }

    let isMounted = true;
    let activeManager: OptionalBleManager | null = null;

    const loadBleManager = async () => {
      try {
        // eslint-disable-next-line no-eval
        const optionalRequire: ((moduleId: string) => unknown) | undefined = eval('require');
        if (typeof optionalRequire !== 'function') {
          return;
        }

        const moduleName = ['react-native-ble-plx'].join('');
        const bleModule = optionalRequire(moduleName) as
          | { BleManager: new () => OptionalBleManager }
          | undefined;

        if (!bleModule?.BleManager) {
          if (isMounted) {
            setBleManager(null);
          }
          return;
        }

        activeManager = new bleModule.BleManager();
        if (isMounted) {
          setBleManager(activeManager);
        } else {
          activeManager.destroy();
        }
      } catch (error) {
        console.warn('Bluetooth manager unavailable', error);
        if (isMounted) {
          setBleManager(null);
        }
      }
    };

    loadBleManager();

    return () => {
      isMounted = false;
      if (activeManager) {
        activeManager.destroy();
      }
    };
  }, [shouldAttemptBle]);

  const bluetoothSupported = shouldAttemptBle && Boolean(bleManager);

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
      setStatusError(null);
    } catch (error) {
      console.warn('Failed to refresh robot status', error);
      setStatus(null);
      setStatusError((error as Error).message);
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
    setStatusError(null);
  };

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
      bluetoothEnabled,
      setBluetoothEnabled,
      bluetoothSupported,
      bleManager,
    }),
    [
      api,
      baseUrl,
      status,
      statusError,
      lastUpdated,
      isPolling,
      bluetoothEnabled,
      bluetoothSupported,
      bleManager,
    ],
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
