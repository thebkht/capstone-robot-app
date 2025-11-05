import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { RobotAPI, RobotStatus, createRobotApi } from '@/services/robot-api';

type ExpoBluetoothModule = Record<string, unknown>;

const pickFunction = (
  source: ExpoBluetoothModule | null,
  names: string[],
): ((...args: unknown[]) => unknown) | undefined => {
  if (!source) {
    return undefined;
  }

  for (const name of names) {
    const candidate = source[name];
    if (typeof candidate === 'function') {
      return candidate as (...args: unknown[]) => unknown;
    }
  }

  return undefined;
};

const toError = (value: unknown): Error | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  if (typeof value === 'object' && 'message' in value) {
    const message = String((value as { message: unknown }).message ?? 'Unknown Bluetooth error');
    const error = new Error(message);
    if ('code' in value) {
      (error as { code?: unknown }).code = (value as { code?: unknown }).code;
    }
    return error;
  }

  return new Error('Bluetooth error');
};

const toBleDevice = (
  payload: unknown,
): { id: string; name: string | null; rssi: number | null } | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const idCandidate = candidate.id ?? candidate.identifier ?? candidate.deviceId;
  const id =
    typeof idCandidate === 'string'
      ? idCandidate
      : typeof idCandidate === 'number'
        ? String(idCandidate)
        : null;

  if (!id) {
    return null;
  }

  const nameCandidate = candidate.name ?? candidate.localName ?? candidate.displayName;
  const rssiCandidate = candidate.rssi ?? candidate.RSSI ?? candidate.signalStrength;

  return {
    id,
    name: typeof nameCandidate === 'string' ? nameCandidate : null,
    rssi: typeof rssiCandidate === 'number' ? rssiCandidate : null,
  };
};

const normalizeBleState = (value: unknown): BleState => {
  if (typeof value !== 'string') {
    return 'Unknown';
  }

  const normalized = value.toLowerCase();

  if (normalized.includes('off')) {
    return 'PoweredOff';
  }

  if (normalized.includes('unauth')) {
    return 'Unauthorized';
  }

  if (normalized.includes('reset')) {
    return 'Resetting';
  }

  if (normalized.includes('turning')) {
    return 'Resetting';
  }

  if (normalized.includes('support') || normalized.includes('unavailable')) {
    return 'Unsupported';
  }

  if ((normalized.includes('power') && normalized.includes('on')) || normalized === 'on') {
    return 'PoweredOn';
  }

  return 'Unknown';
};

const createRemoval = (subscription: unknown): (() => void) => {
  if (!subscription) {
    return () => {};
  }

  if (typeof subscription === 'function') {
    return subscription as () => void;
  }

  if (typeof subscription === 'object') {
    const record = subscription as Record<string, unknown>;
    if (typeof record.remove === 'function') {
      return record.remove.bind(record);
    }
    if (typeof record.unsubscribe === 'function') {
      return record.unsubscribe.bind(record);
    }
    if (typeof record.stop === 'function') {
      return record.stop.bind(record);
    }
    if (typeof record.destroy === 'function') {
      return record.destroy.bind(record);
    }
  }

  return () => {};
};

const isPromise = (value: unknown): value is PromiseLike<unknown> =>
  Boolean(value) && typeof (value as PromiseLike<unknown>).then === 'function';

const buildScanOptions = (uuids: string[] | null, options: unknown) => {
  const result: Record<string, unknown> = {};

  if (Array.isArray(uuids) && uuids.length > 0) {
    result.services = uuids;
  }

  if (options && typeof options === 'object') {
    Object.assign(result, options as Record<string, unknown>);
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const parseScanArguments = (args: unknown[]): {
  error: Error | null;
  device: { id: string; name: string | null; rssi: number | null } | null;
} => {
  if (args.length >= 2) {
    return {
      error: toError(args[0]),
      device: toBleDevice(args[1]),
    };
  }

  if (args.length === 1) {
    const [single] = args;

    if (single && typeof single === 'object') {
      const payload = single as Record<string, unknown>;
      const errorCandidate = 'error' in payload ? payload.error : undefined;
      const deviceCandidate =
        'device' in payload
          ? payload.device
          : 'peripheral' in payload
            ? payload.peripheral
            : payload;
      return {
        error: toError(errorCandidate),
        device: toBleDevice(deviceCandidate),
      };
    }

    return {
      error: null,
      device: toBleDevice(single),
    };
  }

  return { error: null, device: null };
};

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

class ExpoBleManager implements OptionalBleManager {
  private readonly bluetooth: ExpoBluetoothModule;

  private readonly startScanFn?: (...args: unknown[]) => unknown;

  private readonly stopScanFn?: (...args: unknown[]) => unknown;

  private readonly addStateListenerFn?: (...args: unknown[]) => unknown;

  private readonly enableFn?: (...args: unknown[]) => unknown;

  private readonly stateFn?: (...args: unknown[]) => unknown;

  private removeScanSubscription: (() => void) | null = null;

  constructor(bluetooth: ExpoBluetoothModule) {
    this.bluetooth = bluetooth;
    this.startScanFn = pickFunction(bluetooth, [
      'startDeviceScan',
      'startScanningAsync',
      'startScanAsync',
      'startScan',
      'scanForPeripheralsAsync',
    ]);
    this.stopScanFn = pickFunction(bluetooth, [
      'stopDeviceScan',
      'stopScanningAsync',
      'stopScanAsync',
      'stopScan',
    ]);
    this.addStateListenerFn = pickFunction(bluetooth, [
      'onStateChange',
      'addStateListener',
      'addStateChangeListener',
      'addBluetoothStateListener',
    ]);
    this.enableFn = pickFunction(bluetooth, [
      'requestEnableAsync',
      'enableAsync',
      'enable',
      'setEnabledAsync',
    ]);
    this.stateFn = pickFunction(bluetooth, ['getStateAsync', 'state', 'getState']);
  }

  canScan() {
    return Boolean(this.startScanFn);
  }

  startDeviceScan(
    uuids: string[] | null,
    options: unknown,
    listener: (
      error: Error | null,
      device: { id: string; name: string | null; rssi: number | null } | null,
    ) => void,
  ) {
    if (!this.startScanFn) {
      listener(new Error('Bluetooth scanning is not supported on this device'), null);
      return;
    }

    this.stopDeviceScan();

    const callback = (...args: unknown[]) => {
      const { error, device } = parseScanArguments(args);
      listener(error, device);
    };

    try {
      const result = this.startScanFn.call(this.bluetooth, buildScanOptions(uuids, options), callback);
      this.storeScanSubscription(result);
    } catch (error) {
      listener(toError(error), null);
    }
  }

  stopDeviceScan() {
    if (this.removeScanSubscription) {
      try {
        this.removeScanSubscription();
      } catch (error) {
        console.warn('Failed to clear Bluetooth scan subscription', error);
      }
      this.removeScanSubscription = null;
    }

    if (!this.stopScanFn) {
      return;
    }

    try {
      const outcome = this.stopScanFn.call(this.bluetooth);
      if (isPromise(outcome)) {
        outcome.catch((error) => {
          console.warn('Failed to stop Bluetooth scan', error);
        });
      }
    } catch (error) {
      console.warn('Failed to stop Bluetooth scan', error);
    }
  }

  destroy() {
    this.stopDeviceScan();
  }

  onStateChange(
    listener: (state: BleState) => void,
    emitCurrentState?: boolean,
  ): { remove: () => void } | undefined {
    const handler = (value: unknown) => {
      const stateValue =
        value && typeof value === 'object' && 'state' in (value as Record<string, unknown>)
          ? (value as Record<string, unknown>).state
          : value;
      listener(normalizeBleState(stateValue));
    };

    let removal: (() => void) | null = null;

    if (this.addStateListenerFn) {
      try {
        const subscription = this.addStateListenerFn.call(this.bluetooth, handler);
        removal = createRemoval(subscription);
      } catch (error) {
        console.warn('Failed to subscribe to Bluetooth state changes', error);
      }
    }

    if (!removal) {
      const addEventListener = pickFunction(this.bluetooth, ['addEventListener', 'addListener']);
      if (addEventListener) {
        const eventNames = ['stateChanged', 'stateChange', 'state', 'bluetoothStateChange'];
        for (const eventName of eventNames) {
          try {
            const subscription = addEventListener.call(this.bluetooth, eventName, handler);
            removal = createRemoval(subscription);
            if (removal) {
              break;
            }
          } catch (error) {
            console.warn('Failed to subscribe to Bluetooth state event', error);
          }
        }
      }
    }

    if (emitCurrentState) {
      this.state()
        .then((current) => listener(current))
        .catch(() => {});
    }

    if (!removal) {
      return undefined;
    }

    return { remove: removal };
  }

  async state(): Promise<BleState> {
    try {
      if (this.stateFn) {
        const result = await Promise.resolve(this.stateFn.call(this.bluetooth));
        const stateValue =
          result && typeof result === 'object' && 'state' in (result as Record<string, unknown>)
            ? (result as Record<string, unknown>).state
            : result;
        return normalizeBleState(stateValue);
      }

      const candidate =
        (this.bluetooth.state ?? this.bluetooth.bluetoothState ?? this.bluetooth.currentState) as unknown;
      if (typeof candidate === 'string') {
        return normalizeBleState(candidate);
      }
    } catch (error) {
      console.warn('Failed to resolve Bluetooth state', error);
    }

    return 'Unknown';
  }

  async enable(): Promise<void> {
    const enableFunction = this.enableFn ?? pickFunction(this.bluetooth, ['openSettingsAsync']);
    if (!enableFunction) {
      return;
    }

    try {
      const outcome = enableFunction.call(this.bluetooth);
      if (isPromise(outcome)) {
        await outcome;
      }
    } catch (error) {
      console.warn('Failed to enable Bluetooth', error);
    }
  }

  private storeScanSubscription(subscription: unknown) {
    if (!subscription) {
      return;
    }

    if (isPromise(subscription)) {
      subscription
        .then((value) => {
          this.storeScanSubscription(value);
        })
        .catch((error) => {
          console.warn('Bluetooth scan subscription rejected', error);
        });
      return;
    }

    this.removeScanSubscription = createRemoval(subscription);
  }
}

const loadExpoBleManager = async () => {
  try {
    const module = (await import('expo-bluetooth')) as Record<string, unknown> | undefined;
    if (!module) {
      return null;
    }

    const bluetooth = (module.Bluetooth ?? module.default ?? module) as ExpoBluetoothModule | undefined;
    if (!bluetooth || typeof bluetooth !== 'object') {
      return null;
    }

    const manager = new ExpoBleManager(bluetooth);
    if (!manager.canScan()) {
      return null;
    }

    return { bluetooth, manager };
  } catch (error) {
    console.warn('Expo Bluetooth module unavailable', error);
    return null;
  }
};

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
    typeof process !== 'undefined'
      ? process.env?.EXPO_PUBLIC_ENABLE_BLE !== 'false'
      : true;
  const [bleManager, setBleManager] = useState<OptionalBleManager | null>(null);
  const [bleState, setBleState] = useState<BleState | null>(null);
  const [bluetoothModule, setBluetoothModule] = useState<ExpoBluetoothModule | null>(null);

  useEffect(() => {
    console.log('RobotProvider BLE initialization', { shouldAttemptBle });
    if (!shouldAttemptBle) {
      setBleManager(null);
      setBluetoothModule(null);
      return;
    }

    let isMounted = true;
    let activeManager: OptionalBleManager | null = null;

    const loadBleManager = async () => {
      const expoResult = await loadExpoBleManager();
      if (expoResult) {
        activeManager = expoResult.manager;
        console.log('Expo Bluetooth manager loaded successfully');
        if (isMounted) {
          setBluetoothModule(expoResult.bluetooth);
          setBleManager(expoResult.manager);
        } else {
          expoResult.manager.destroy();
        }
        return;
      }

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
            setBluetoothModule(null);
            setBleManager(null);
          }
          return;
        }

        activeManager = new bleModule.BleManager();
        console.log('BleManager loaded successfully');
        if (isMounted) {
          setBluetoothModule(null);
          setBleManager(activeManager);
        } else {
          activeManager.destroy();
        }
      } catch (error) {
        console.warn('Bluetooth manager unavailable', error);
        if (isMounted) {
          setBluetoothModule(null);
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
    const module = bluetoothModule;
    const requestPermissionsFn = pickFunction(module, [
      'requestPermissionsAsync',
      'requestPermissions',
    ]);
    if (requestPermissionsFn && module) {
      try {
        const result = await Promise.resolve(requestPermissionsFn.call(module));
        console.log('Expo Bluetooth permission response', result);
        if (typeof result === 'boolean') {
          return result;
        }
        if (result && typeof result === 'object') {
          if ('granted' in (result as Record<string, unknown>)) {
            return Boolean((result as Record<string, unknown>).granted);
          }
          if ('status' in (result as Record<string, unknown>)) {
            const status = String((result as Record<string, unknown>).status);
            if (status) {
              return status.toLowerCase() === 'granted';
            }
          }
        }
      } catch (error) {
        console.warn('Expo Bluetooth permission request failed', error);
      }
    }

    if (Platform.OS !== 'android') {
      console.log('BLE permissions granted by default on non-Android platform');
      return true;
    }

    const androidVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);

    if (Number.isNaN(androidVersion)) {
      console.log('Unknown Android version, assuming BLE permissions granted');
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

      const granted =
        scanResult === PermissionsAndroid.RESULTS.GRANTED &&
        connectResult === PermissionsAndroid.RESULTS.GRANTED &&
        fineLocationResult === PermissionsAndroid.RESULTS.GRANTED;
      console.log('Android 12+ BLE permission results', { scanResult, connectResult, fineLocationResult });
      return granted;
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

      const granted = fineLocationResult === PermissionsAndroid.RESULTS.GRANTED;
      console.log('Android 6-11 BLE permission result', { fineLocationResult });
      return granted;
    }

    console.log('Android version below 6, no BLE permissions required');
    return true;
  }, [bluetoothModule]);

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
