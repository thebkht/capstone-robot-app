import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

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
  onStateChange?: (
    listener: (state: BleState) => void,
    emitCurrentState?: boolean,
  ) => { remove: () => void } | undefined;
  state?: () => Promise<BleState>;
  enable?: () => Promise<void>;
}

type BleState =
  | 'Unknown'
  | 'Resetting'
  | 'Unsupported'
  | 'Unauthorized'
  | 'PoweredOff'
  | 'PoweredOn';

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
  bleState: BleState | null;
  requestBlePermissions: () => Promise<boolean>;
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
  const [bleState, setBleState] = useState<BleState | null>(null);

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
    if (!bleManager) {
      setBleState(null);
      return;
    }

    let isMounted = true;
    const subscription = bleManager.onStateChange?.((state) => {
      if (isMounted) {
        setBleState(state);
      }
    }, true);

    if (bleManager.state) {
      bleManager
        .state()
        .then((state) => {
          if (isMounted) {
            setBleState(state);
          }
        })
        .catch(() => {
          if (isMounted) {
            setBleState(null);
          }
        });
    }

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, [bleManager]);

  useEffect(() => {
    if (!bluetoothSupported && bluetoothEnabled) {
      setBluetoothEnabled(false);
    }
  }, [bluetoothEnabled, bluetoothSupported]);

  const api = useMemo(() => createRobotApi(baseUrl), [baseUrl]);

  const requestBlePermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const androidVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);

    if (Number.isNaN(androidVersion)) {
      return true;
    }

    if (androidVersion >= 31) {
      const scanResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        {
          title: 'Bluetooth scan permission',
          message: 'Allow the app to scan for nearby robots over Bluetooth.',
          buttonPositive: 'Allow',
        },
      );
      const connectResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: 'Bluetooth connection permission',
          message: 'Allow the app to connect to nearby robots over Bluetooth.',
          buttonPositive: 'Allow',
        },
      );
      const fineLocationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location permission',
          message: 'Allow the app to use location to discover nearby robots.',
          buttonPositive: 'Allow',
        },
      );

      return (
        scanResult === PermissionsAndroid.RESULTS.GRANTED &&
        connectResult === PermissionsAndroid.RESULTS.GRANTED &&
        fineLocationResult === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    if (androidVersion >= 23) {
      const fineLocationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location permission',
          message: 'Allow the app to use location to discover nearby robots.',
          buttonPositive: 'Allow',
        },
      );

      return fineLocationResult === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
  }, []);

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
      bleState,
      requestBlePermissions,
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
      bleState,
      requestBlePermissions,
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
