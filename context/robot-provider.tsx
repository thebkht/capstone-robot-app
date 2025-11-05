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
    console.log('RobotProvider BLE initialization', { shouldAttemptBle });
    if (!shouldAttemptBle) {
      setBleManager(null);
      return;
    }

    let isMounted = true;
    let activeManager: OptionalBleManager | null = null;

    const loadBleManager = async () => {
      try {
        const bleModule = await import('react-native-ble-plx');
        const BleManagerCtor =
          bleModule.BleManager ??
          (typeof bleModule.default === 'function'
            ? bleModule.default
            : bleModule.default?.BleManager);

        if (typeof BleManagerCtor !== 'function') {
          if (isMounted) {
            setBleManager(null);
          }
          return;
        }

        activeManager = new BleManagerCtor();
        console.log('BleManager loaded successfully');
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
      console.log('BleManager state changed', state);
      if (isMounted) {
        setBleState(state);
      }
    }, true);

    if (bleManager.state) {
      bleManager
        .state()
        .then((state) => {
          console.log('BleManager initial state resolved', state);
          if (isMounted) {
            setBleState(state);
          }
        })
        .catch(() => {
          console.log('BleManager initial state lookup failed');
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
    console.log('Requesting BLE permissions');
    if (Platform.OS !== 'android') {
      console.log('BLE permissions granted by default on non-Android platform');
      return true;
    }

    const requestAndroid31Permissions = async () => {
      const bluetoothScanPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        {
          title: 'Location Permission',
          message: 'Bluetooth Low Energy requires Location',
          buttonPositive: 'OK',
        },
      );
      const bluetoothConnectPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: 'Location Permission',
          message: 'Bluetooth Low Energy requires Location',
          buttonPositive: 'OK',
        },
      );
      const fineLocationPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Bluetooth Low Energy requires Location',
          buttonPositive: 'OK',
        },
      );

      const granted =
        bluetoothScanPermission === PermissionsAndroid.RESULTS.GRANTED &&
        bluetoothConnectPermission === PermissionsAndroid.RESULTS.GRANTED &&
        fineLocationPermission === PermissionsAndroid.RESULTS.GRANTED;

      console.log('Android 12+ BLE permission results', {
        bluetoothScanPermission,
        bluetoothConnectPermission,
        fineLocationPermission,
      });

      return granted;
    };

    const resolveAndroidApiLevel = async () => {
      const fallbackVersion =
        typeof Platform.Version === 'number'
          ? Platform.Version
          : parseInt(String(Platform.Version), 10);

      if (Number.isNaN(fallbackVersion)) {
        return -1;
      }

      try {
        const expoDeviceModule = await import('expo-device');
        const { platformApiLevel } = expoDeviceModule;

        if (typeof platformApiLevel === 'number') {
          return platformApiLevel;
        }
      } catch (error) {
        console.log('ExpoDevice module unavailable, falling back to Platform.Version', error);
      }

      return fallbackVersion;
    };

    const androidApiLevel = await resolveAndroidApiLevel();

    if (androidApiLevel < 0) {
      console.log('Unknown Android API level, assuming BLE permissions granted');
      return true;
    }

    if (androidApiLevel < 31) {
      const fineLocationPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Bluetooth Low Energy requires Location',
          buttonPositive: 'OK',
        },
      );

      const granted = fineLocationPermission === PermissionsAndroid.RESULTS.GRANTED;
      console.log('Android 6-11 BLE permission result', { fineLocationPermission });
      return granted;
    }

    return requestAndroid31Permissions();
  }, []);

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

  const setBaseUrl = (url: string) => {
    console.log('Updating robot base URL', { previous: baseUrl, next: url });
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
