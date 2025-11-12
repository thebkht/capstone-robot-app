import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { CONTROL_TOKEN_STORAGE_KEY } from "@/app/pairing";
import {
  RobotAPI,
  RobotNetworkInfo,
  RobotStatus,
  createRobotApi,
} from "@/services/robot-api";

const isIpv4Address = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  const segments = value.split(".");
  if (segments.length !== 4) {
    return false;
  }

  return segments.every((segment) => {
    if (segment.trim() === "") {
      return false;
    }
    const numeric = Number(segment);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 255;
  });
};

const deriveIpv4FromUrl = (value: string) => {
  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return isIpv4Address(parsed.hostname) ? parsed.hostname : null;
  } catch (error) {
    console.warn("Failed to parse robot base URL for IPv4 fallback", value, error);
    return null;
  }
};

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
  controlToken: string | null;
  setControlToken: (token: string | null) => Promise<void>;
}

const RobotContext = createContext<RobotContextValue | undefined>(undefined);

export const ROBOT_BASE_URL_STORAGE_KEY = "robot_base_url";
export const ROBOT_CONTROL_TOKEN_STORAGE_KEY = "robot_control_token";
export const DEFAULT_ROBOT_BASE_URL = "https://tegra-ubuntu.tail535f32.ts.net";

export const RobotProvider = ({ children }: React.PropsWithChildren) => {
  const [baseUrl, setBaseUrlState] = useState<string>(DEFAULT_ROBOT_BASE_URL);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [controlToken, setControlTokenState] = useState<string | null>(null);
  const [controlToken, setControlTokenState] = useState<string | null>(null);

  const api = useMemo(() => createRobotApi(baseUrl, undefined, controlToken), [baseUrl, controlToken]);

  const refreshStatus = useCallback(async () => {
    try {
      console.log("Refreshing robot status from", baseUrl);
      const health = await api.fetchHealth();

      const [networkInfo, telemetry, mode] = await Promise.all([
        api
          .fetchNetworkInfo()
          .catch((error) => {
            console.warn("Failed to load robot network info", error);
            return null;
          }),
        api
          .fetchTelemetry()
          .catch((error) => {
            console.warn("Failed to load robot telemetry", error);
            return null;
          }),
        api
          .fetchMode()
          .catch((error) => {
            console.warn("Failed to load robot mode", error);
            return null;
          }),
      ]);

      const mergedNetwork: RobotNetworkInfo | undefined = (() => {
        const sources: (RobotNetworkInfo | null | undefined)[] = [
          health?.network,
          telemetry?.network,
          networkInfo,
        ];

        const aggregated: RobotNetworkInfo = {};
        for (const source of sources) {
          if (!source) {
            continue;
          }
          Object.assign(aggregated, source);
          if (source.ssid && !aggregated.wifiSsid) {
            aggregated.wifiSsid = source.ssid;
          }
        }

        return Object.keys(aggregated).length ? aggregated : undefined;
      })();

      const baseUrlIpv4 = deriveIpv4FromUrl(baseUrl);

      const combinedNetwork: RobotNetworkInfo | undefined = (() => {
        const network: RobotNetworkInfo = mergedNetwork
          ? { ...mergedNetwork }
          : {};

        if (!network.ip && baseUrlIpv4) {
          network.ip = baseUrlIpv4;
        }

        return Object.keys(network).length ? network : undefined;
      })();

      const combined: RobotStatus = {
        health,
        telemetry: telemetry ?? undefined,
        network: combinedNetwork,
        battery: telemetry?.battery ?? health?.battery,
        cpuLoad: telemetry?.cpuLoad,
        temperatureC: telemetry?.temperatureC,
        humidity: telemetry?.humidity,
        uptimeSeconds: telemetry?.uptimeSeconds ?? health?.uptimeSeconds,
        mode:
          mode?.mode ?? mode?.current ?? mode?.status ?? combinedNetwork?.mode,
      };

      setStatus(combined);
      setLastUpdated(new Date());
      setStatusError(null);
      console.log("Robot status updated", combined);
    } catch (error) {
      console.warn("Failed to refresh robot status", error);
      setStatus(null);
      setStatusError((error as Error).message);
    }
  }, [api, baseUrl]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const storedUrl = await AsyncStorage.getItem(
          ROBOT_BASE_URL_STORAGE_KEY
        );
        if (storedUrl && isMounted) {
          console.log("Loaded stored robot base URL", storedUrl);
          setBaseUrlState(storedUrl);
        }
        const storedToken = await AsyncStorage.getItem(
          ROBOT_CONTROL_TOKEN_STORAGE_KEY
        );
        if (storedToken && isMounted) {
          setControlTokenState(storedToken);
        }
      } catch (error) {
        console.warn("Failed to load stored robot base URL", error);
      }

      try {
        // Check if SecureStore is available (it may not be on web or in some dev environments)
        if (SecureStore.isAvailableAsync && !(await SecureStore.isAvailableAsync())) {
          console.warn("SecureStore is not available on this platform");
        } else {
          const storedToken = await SecureStore.getItemAsync(
            CONTROL_TOKEN_STORAGE_KEY
          );
          if (storedToken && isMounted) {
            console.log("Loaded stored control token");
            setControlTokenState(storedToken);
          }
        }
      } catch (error) {
        console.warn("Failed to load stored control token", error);
        // Don't crash the app if SecureStore fails - it might not be available in dev mode
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

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
    };
  }, [isPolling, refreshStatus]);

  const setBaseUrl = useCallback(
    (url: string) => {
      const normalized = url.replace(/\/$/, "");
      console.log("Updating robot base URL", {
        previous: baseUrl,
        next: normalized,
      });
      api.updateBaseUrl(normalized);
      setBaseUrlState(normalized);
      setStatusError(null);
      void AsyncStorage.setItem(ROBOT_BASE_URL_STORAGE_KEY, normalized).catch(
        (error) => {
          console.warn("Failed to persist robot base URL", error);
        }
      );
    },
    [api, baseUrl]
  );

  const setControlToken = useCallback(
    async (token: string | null) => {
      console.log("Updating control token", { hasToken: Boolean(token) });
      api.setControlToken(token);
      setControlTokenState(token);
      try {
        // Check if SecureStore is available
        if (SecureStore.isAvailableAsync && !(await SecureStore.isAvailableAsync())) {
          console.warn("SecureStore is not available, token will not persist");
          return;
        }
        if (token) {
          await SecureStore.setItemAsync(CONTROL_TOKEN_STORAGE_KEY, token);
        } else {
          await SecureStore.deleteItemAsync(CONTROL_TOKEN_STORAGE_KEY);
        }
      } catch (error) {
        console.warn("Failed to persist control token", error);
        // Don't throw - token is still set in memory even if storage fails
      }
    },
    [api]
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
      controlToken,
      setControlToken,
      controlToken,
      setControlToken,
    }),
    [api, baseUrl, isPolling, lastUpdated, refreshStatus, status, statusError, controlToken, setControlToken]
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
