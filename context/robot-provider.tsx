import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  RobotAPI,
  RobotNetworkInfo,
  RobotStatus,
  createRobotApi,
} from "@/services/robot-api";

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

export const ROBOT_BASE_URL_STORAGE_KEY = "robot_base_url";
export const DEFAULT_ROBOT_BASE_URL = "https://tegra-ubuntu.tail535f32.ts.net";

export const RobotProvider = ({ children }: React.PropsWithChildren) => {
  const [baseUrl, setBaseUrlState] = useState<string>(DEFAULT_ROBOT_BASE_URL);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [isPolling, setIsPolling] = useState<boolean>(true);

  const api = useMemo(() => createRobotApi(baseUrl), [baseUrl]);

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

      const combined: RobotStatus = {
        health,
        telemetry: telemetry ?? undefined,
        network: mergedNetwork,
        battery: telemetry?.battery ?? health?.battery,
        cpuLoad: telemetry?.cpuLoad,
        temperatureC: telemetry?.temperatureC,
        humidity: telemetry?.humidity,
        uptimeSeconds: telemetry?.uptimeSeconds ?? health?.uptimeSeconds,
        mode:
          mode?.mode ?? mode?.current ?? mode?.status ?? mergedNetwork?.mode,
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
      } catch (error) {
        console.warn("Failed to load stored robot base URL", error);
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
    [api, baseUrl, isPolling, lastUpdated, refreshStatus, status, statusError]
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
