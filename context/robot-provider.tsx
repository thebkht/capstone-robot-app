import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";

import {
  loadBleManager,
  type BleState,
  type OptionalBleManager,
} from "@/services/ble-manager-loader";
import { RobotAPI, RobotStatus, createRobotApi } from "@/services/robot-api";

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

const DEFAULT_URL = "http://192.168.1.10:8000";

export const RobotProvider = ({ children }: React.PropsWithChildren) => {
  const [baseUrl, setBaseUrlState] = useState<string>(DEFAULT_URL);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAttemptBle =
    typeof process !== "undefined" &&
    process.env?.EXPO_PUBLIC_ENABLE_BLE === "true";
  const [bleManager, setBleManager] = useState<OptionalBleManager | null>(null);
  const [bleState, setBleState] = useState<BleState | null>(null);

  useEffect(() => {
    console.log("RobotProvider BLE initialization", { shouldAttemptBle });
    if (!shouldAttemptBle) {
      setBleManager(null);
      return;
    }

    let isMounted = true;
    let activeManager: OptionalBleManager | null = null;

    // Load BLE manager using the loader function
    // This handles platform checks and module loading internally
    try {
      activeManager = loadBleManager();
      if (activeManager) {
        console.log("BleManager loaded successfully");
        if (isMounted) {
          setBleManager(activeManager);
        } else {
          activeManager.destroy();
        }
      } else {
        console.log(
          "BleManager not available (module not installed or web platform)"
        );
        if (isMounted) {
          setBleManager(null);
        }
      }
    } catch (error) {
      console.warn("Bluetooth manager unavailable", error);
      if (isMounted) {
        setBleManager(null);
      }
    }

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
      console.log("BleManager state changed", state);
      if (isMounted) {
        setBleState(state);
      }
    }, true);

    if (bleManager.state) {
      bleManager
        .state()
        .then((state) => {
          console.log("BleManager initial state resolved", state);
          if (isMounted) {
            setBleState(state);
          }
        })
        .catch(() => {
          console.log("BleManager initial state lookup failed");
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

  const api = useMemo(() => createRobotApi(baseUrl, 5000), [baseUrl]);

  const requestBlePermissions = useCallback(async () => {
    console.log("Requesting BLE permissions");
    if (Platform.OS !== "android") {
      console.log("BLE permissions granted by default on non-Android platform");
      return true;
    }

    const androidVersion =
      typeof Platform.Version === "number"
        ? Platform.Version
        : parseInt(Platform.Version, 10);

    if (Number.isNaN(androidVersion)) {
      console.log("Unknown Android version, assuming BLE permissions granted");
      return true;
    }

    if (androidVersion >= 31) {
      const scanResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        {
          title: "Bluetooth scan permission",
          message: "Allow the app to scan for nearby robots over Bluetooth.",
          buttonPositive: "Allow",
        }
      );
      const connectResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: "Bluetooth connection permission",
          message: "Allow the app to connect to nearby robots over Bluetooth.",
          buttonPositive: "Allow",
        }
      );
      const fineLocationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Location permission",
          message: "Allow the app to use location to discover nearby robots.",
          buttonPositive: "Allow",
        }
      );

      const granted =
        scanResult === PermissionsAndroid.RESULTS.GRANTED &&
        connectResult === PermissionsAndroid.RESULTS.GRANTED &&
        fineLocationResult === PermissionsAndroid.RESULTS.GRANTED;
      console.log("Android 12+ BLE permission results", {
        scanResult,
        connectResult,
        fineLocationResult,
      });
      return granted;
    }

    if (androidVersion >= 23) {
      const fineLocationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Location permission",
          message: "Allow the app to use location to discover nearby robots.",
          buttonPositive: "Allow",
        }
      );

      const granted = fineLocationResult === PermissionsAndroid.RESULTS.GRANTED;
      console.log("Android 6-11 BLE permission result", { fineLocationResult });
      return granted;
    }

    console.log("Android version below 6, no BLE permissions required");
    return true;
  }, []);

  const refreshStatus = useCallback(
    async (retryCount = 0): Promise<void> => {
      const maxRetries = 2;
      const baseDelay = 1000; // 1 second base delay

      try {
        console.log("Refreshing robot status from", baseUrl);
        const latest = await api.fetchStatus();
        setStatus(latest);
        setLastUpdated(new Date());
        setStatusError(null);
        consecutiveFailuresRef.current = 0;
        console.log("Robot status updated", latest);
      } catch (error) {
        const errorMessage = (error as Error).message;

        console.warn("Failed to refresh robot status", error);
        setStatus(null);
        setStatusError(errorMessage);

        consecutiveFailuresRef.current += 1;
        const newFailures = consecutiveFailuresRef.current;

        // If we've failed too many times, pause polling temporarily
        if (newFailures >= 5) {
          console.warn(
            "Too many consecutive failures, pausing polling temporarily"
          );
          setIsPolling(false);
          // Auto-resume after 30 seconds
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            consecutiveFailuresRef.current = 0;
            setIsPolling(true);
          }, 30000);
          return;
        }

        // Retry with exponential backoff if we haven't exceeded max retries
        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount);
          console.log(
            `Retrying status refresh in ${delay}ms (attempt ${
              retryCount + 1
            }/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return refreshStatus(retryCount + 1);
        }
      }
    },
    [api, baseUrl]
  );

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    refreshStatus();
    const interval = setInterval(() => {
      refreshStatus();
    }, 10_000);

    return () => {
      clearInterval(interval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [isPolling, refreshStatus]);

  const setBaseUrl = useCallback(
    (url: string) => {
      console.log("Updating robot base URL", { previous: baseUrl, next: url });
      setBaseUrlState(url);
      api.updateBaseUrl(url);
      setStatusError(null);
      consecutiveFailuresRef.current = 0;
      // Clear any pending retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    },
    [api, baseUrl]
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
      refreshStatus,
      setBaseUrl,
      bluetoothEnabled,
      setBluetoothEnabled,
      bluetoothSupported,
      bleManager,
      bleState,
      requestBlePermissions,
    ]
  );

  return (
    <RobotContext.Provider value={value}>{children}</RobotContext.Provider>
  );
};

export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error("useRobot must be used within a RobotProvider");
  }

  return context;
};
