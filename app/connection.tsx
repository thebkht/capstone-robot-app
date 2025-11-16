import NetInfo, {
  type NetInfoState,
} from "@react-native-community/netinfo";
import * as Network from "expo-network";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PermissionsAndroid,
  Platform,
  StyleSheet
} from "react-native";
import WifiManager from "react-native-wifi-reborn";

import { WifiProvisionScreen } from "@/components/WifiProvisionScreen";
import { SerifFonts } from "@/constants/theme";
import { DEFAULT_ROBOT_BASE_URL, useRobot } from "@/context/robot-provider";

const ROBOT_AP_SSID = "Elara_AP";

const TITLE_FONT_FAMILY = SerifFonts.bold;

const SUBTITLE_FONT_FAMILY = SerifFonts.semiBold;

const MONO_REGULAR_FONT_FAMILY = "JetBrainsMono_400Regular";

const MONO_SEMIBOLD_FONT_FAMILY = "JetBrainsMono_600SemiBold";

const canonicalizeUrl = (value: string) => value.trim().replace(/\/$/, "");

const DEFAULT_LAN_PROTOCOL = "http:";
const DEFAULT_LAN_PORT = "8000";

const isValidIpv4 = (value: string | null | undefined) => {
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

const extractUrlParts = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return {
      protocol: parsed.protocol || "http:",
      host: parsed.hostname,
      port: parsed.port,
    };
  } catch (error) {
    console.warn("Failed to parse robot base URL", value, error);
    return null;
  }
};

type RobotLanCandidateResult = {
  urls: string[];
  isRobotHotspot: boolean;
};

const isLinkLocalIpv4 = (value: string | null | undefined) => {
  if (!value || !isValidIpv4(value)) {
    return false;
  }

  const segments = value.split(".").map((segment) => segment.trim());
  if (segments.length !== 4) {
    return false;
  }

  return segments[0] === "169" && segments[1] === "254";
};

const selectPreferredIpv4 = (
  candidates: (string | null | undefined)[]
): string | null => {
  const normalized = candidates
    .map((candidate) => (candidate ? candidate.trim() : null))
    .filter((candidate): candidate is string => Boolean(candidate));

  const validCandidates = normalized.filter((candidate) =>
    isValidIpv4(candidate)
  );

  if (!validCandidates.length) {
    return null;
  }

  const nonLinkLocal = validCandidates.filter(
    (candidate) => !isLinkLocalIpv4(candidate)
  );

  return nonLinkLocal[0] ?? validCandidates[0] ?? null;
};

const gatherRobotLanBaseUrlCandidates = (
  deviceIpAddress: string | null | undefined,
  options: { currentBaseUrl: string; statusIp?: string | null }
): RobotLanCandidateResult => {
  const { currentBaseUrl, statusIp } = options;
  const baseParts = extractUrlParts(currentBaseUrl);
  const defaultParts = extractUrlParts(DEFAULT_ROBOT_BASE_URL);
  const statusParts = extractUrlParts(statusIp);
  let isRobotHotspot = false;

  const resolveLanProtocol = () => {
    if (statusParts?.host && isValidIpv4(statusParts.host) && statusParts.protocol) {
      return statusParts.protocol;
    }

    if (baseParts?.host && isValidIpv4(baseParts.host) && baseParts.protocol) {
      return baseParts.protocol;
    }

    if (defaultParts?.host && isValidIpv4(defaultParts.host) && defaultParts.protocol) {
      return defaultParts.protocol;
    }

    return DEFAULT_LAN_PROTOCOL;
  };

  const resolveLanPort = () => {
    if (statusParts?.host && isValidIpv4(statusParts.host) && statusParts.port) {
      return statusParts.port;
    }

    if (baseParts?.host && isValidIpv4(baseParts.host) && baseParts.port) {
      return baseParts.port;
    }

    if (defaultParts?.host && isValidIpv4(defaultParts.host) && defaultParts.port) {
      return defaultParts.port;
    }

    return DEFAULT_LAN_PORT;
  };

  const protocol = resolveLanProtocol();
  const port = resolveLanPort();

  const trimmedProtocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
  const normalizedPort = port ? `:${port}` : "";

  const seenIps = new Set<string>();
  const urls: string[] = [];

  const pushCandidate = (ip: string | null | undefined) => {
    if (!ip || !isValidIpv4(ip)) {
      return;
    }

    const normalizedIp = ip.trim();
    if (deviceIpAddress && normalizedIp === deviceIpAddress.trim()) {
      return;
    }

    if (seenIps.has(normalizedIp)) {
      return;
    }

    seenIps.add(normalizedIp);
    urls.push(`${trimmedProtocol}//${normalizedIp}${normalizedPort}`);
  };

  if (statusParts?.host && isValidIpv4(statusParts.host)) {
    pushCandidate(statusParts.host);
  }

  const hostCandidates = [baseParts?.host, defaultParts?.host];
  hostCandidates.forEach(pushCandidate);

  if (
    !deviceIpAddress ||
    !isValidIpv4(deviceIpAddress) ||
    isLinkLocalIpv4(deviceIpAddress)
  ) {
    return { urls, isRobotHotspot };
  }

  const ipSegments = deviceIpAddress
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (ipSegments.length !== 4) {
    return { urls, isRobotHotspot };
  }

  const isRobotHotspotSubnet =
    ipSegments[0] === "192" && ipSegments[1] === "168" && ipSegments[2] === "4";

  if (isRobotHotspotSubnet) {
    isRobotHotspot = true;
  }

  return { urls, isRobotHotspot };
};

const deriveRobotLanBaseUrl = (
  deviceIpAddress: string | null | undefined,
  options: { currentBaseUrl: string; statusIp?: string | null }
) => {
  const candidates = gatherRobotLanBaseUrlCandidates(deviceIpAddress, options);
  return candidates.urls[0] ?? null;
};

const probeRobotBaseUrl = async (
  baseUrl: string,
  options?: { timeoutMs?: number }
): Promise<boolean> => {
  const timeoutMs = options?.timeoutMs ?? 1500;
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) {
      controller.abort();
    }
  }, timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller?.signal,
    });

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      // Validate the payload is JSON; discard the result otherwise.
      await response.json().catch(() => null);
      return true;
    }

    return false;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return false;
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

const deriveIpPrefix = (value: string | null | undefined) => {
  if (!value || !isValidIpv4(value)) {
    return null;
  }

  const segments = value
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (segments.length !== 4) {
    return null;
  }

  return segments.slice(0, 3).join(".");
};

type DeviceNetworkDetails = {
  type: Network.NetworkStateType;
  isConnected: boolean;
  isWifi: boolean;
  ipAddress: string | null;
  ssid: string | null;
};

type WifiStatusMeta = {
  color: string;
  label: string;
  details: string[];
  helper: string | null;
};

type AutoDiscoveryContext = "robot-hotspot" | null;

export default function ConnectionScreen() {
  const router = useRouter();
  const { baseUrl, setBaseUrl, status, statusError, refreshStatus, setIsPolling, controlToken, clearConnection } =
    useRobot();
  const mountedRef = useRef(true);
  const [deviceNetwork, setDeviceNetwork] =
    useState<DeviceNetworkDetails | null>(null);
  const [deviceNetworkError, setDeviceNetworkError] = useState<string | null>(
    null
  );
  const [isLoadingDeviceNetwork, setIsLoadingDeviceNetwork] = useState(false);
  const [ssidPermissionWarning, setSsidPermissionWarning] = useState<
    string | null
  >(null);
  const [isConnectingRobot, setIsConnectingRobot] = useState(false);
  const [connectRobotError, setConnectRobotError] = useState<string | null>(
    null
  );
  const [connectRobotSuccess, setConnectRobotSuccess] = useState<string | null>(
    null
  );
  const [autoDiscoveryHelper, setAutoDiscoveryHelper] = useState<string | null>(
    null
  );
  const [isAutoDiscoveringRobot, setIsAutoDiscoveringRobot] = useState(false);
  const deviceIpPrefix = useMemo(
    () => deriveIpPrefix(deviceNetwork?.ipAddress),
    [deviceNetwork?.ipAddress]
  );
  const autoDiscoveryRef = useRef({
    running: false,
    searchContext: null as AutoDiscoveryContext,
    triedUrls: new Set<string>(),
    foundUrl: null as string | null,
  });

  const refreshDeviceNetwork = useCallback(
    async (providedState?: Network.NetworkState) => {
      if (!mountedRef.current) {
        return;
      }

      setIsLoadingDeviceNetwork(true);

      try {
        const state = providedState ?? (await Network.getNetworkStateAsync());
        const ipAddress = await Network.getIpAddressAsync();
        const normalizedIp =
          ipAddress && ipAddress !== "0.0.0.0" ? ipAddress : null;

        // Try to get SSID via WifiManager first, then fall back to NetInfo
        let ssid: string | null = null;
        let permissionWarning: string | null = null;
        try {
          const wifiManagerAvailable =
            WifiManager &&
            typeof WifiManager.getCurrentWifiSSID === "function";

          if (state.type === Network.NetworkStateType.WIFI) {
            if (!wifiManagerAvailable) {
              permissionWarning =
                Platform.OS === "ios"
                  ? "iOS may hide the Wi-Fi network name without additional entitlements."
                  : "Wi-Fi network name unavailable on this platform.";
            } else if (Platform.OS === "android") {
              const fineLocationPermission =
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

              if (!fineLocationPermission) {
                permissionWarning =
                  "Wi-Fi SSID unavailable on this Android version.";
              } else {
                const hasPermission = await PermissionsAndroid.check(
                  fineLocationPermission
                );

                let granted = hasPermission;

                if (!hasPermission) {
                  const status = await PermissionsAndroid.request(
                    fineLocationPermission,
                    {
                      title: "Location permission needed",
                      message:
                        "Allow location access to display the connected Wi-Fi network name.",
                      buttonPositive: "Allow",
                      buttonNegative: "Deny",
                    }
                  );

                  granted = status === PermissionsAndroid.RESULTS.GRANTED;
                }

                if (!granted) {
                  permissionWarning =
                    "Grant location permission to display the Wi-Fi network name.";
                } else {
                  const wifiManagerSsid =
                    await WifiManager.getCurrentWifiSSID();
                  if (wifiManagerSsid && wifiManagerSsid !== "<unknown ssid>") {
                    ssid = wifiManagerSsid;
                  }
                }
              }
            } else if (wifiManagerAvailable) {
              const wifiManagerSsid = await WifiManager.getCurrentWifiSSID();
              if (wifiManagerSsid && wifiManagerSsid !== "<unknown ssid>") {
                ssid = wifiManagerSsid;
              } else if (Platform.OS === "ios") {
                permissionWarning =
                  "iOS may hide the Wi-Fi network name without additional entitlements.";
              }
            }
          }
        } catch (wifiManagerError) {
          console.log("WifiManager failed to fetch SSID", wifiManagerError);
          if (
            state.type === Network.NetworkStateType.WIFI &&
            Platform.OS === "ios"
          ) {
            permissionWarning =
              "iOS may hide the Wi-Fi network name without additional entitlements.";
          }
        }

        let netInfoState: NetInfoState | null = null;

        try {
          netInfoState = await NetInfo.fetch();
        } catch (netInfoError) {
          console.log("NetInfo failed to fetch connection details", netInfoError);
        }

        if (netInfoState?.type === "wifi" && netInfoState.details) {
          if (!ssid && "ssid" in netInfoState.details && netInfoState.details.ssid) {
            ssid = netInfoState.details.ssid as string;
          }

          // NetInfo may expose a more accurate Wi-Fi IPv4 address than Expo's network module.
        }

        const resolvedIp = selectPreferredIpv4([
          normalizedIp,
          netInfoState?.type === "wifi" &&
            netInfoState.details &&
            "ipAddress" in netInfoState.details
            ? (netInfoState.details.ipAddress as string)
            : null,
        ]);

        if (!mountedRef.current) {
          return;
        }

        setSsidPermissionWarning(permissionWarning);
        setDeviceNetwork({
          type: state.type,
          isConnected: Boolean(state.isConnected),
          isWifi:
            state.type === Network.NetworkStateType.WIFI &&
            Boolean(state.isConnected),
          ipAddress: resolvedIp,
          ssid,
        });
        setDeviceNetworkError(null);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unable to determine device network status.";
        setDeviceNetwork(null);
        setDeviceNetworkError(message);
        setSsidPermissionWarning(null);
      } finally {
        if (!mountedRef.current) {
          return;
        }

        setIsLoadingDeviceNetwork(false);
      }
    },
    [mountedRef]
  );

  useEffect(() => {
    mountedRef.current = true;

    void refreshDeviceNetwork();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshDeviceNetwork]);

  useEffect(() => {
    if (
      !deviceNetwork?.isWifi ||
      !deviceNetwork.ipAddress ||
      !status?.network?.ip ||
      !isValidIpv4(status.network.ip)
    ) {
      return;
    }

    const devicePrefix = deriveIpPrefix(deviceNetwork.ipAddress);
    const statusPrefix = deriveIpPrefix(status.network.ip);

    if (!devicePrefix || !statusPrefix || devicePrefix !== statusPrefix) {
      return;
    }

    const derivedUrl = deriveRobotLanBaseUrl(deviceNetwork.ipAddress, {
      currentBaseUrl: baseUrl || DEFAULT_ROBOT_BASE_URL,
      statusIp: status.network.ip,
    });

    if (!derivedUrl) {
      return;
    }

    const normalizedDerived = canonicalizeUrl(derivedUrl);
    const normalizedBase = baseUrl ? canonicalizeUrl(baseUrl) : "";

    if (normalizedBase !== normalizedDerived) {
      setBaseUrl(normalizedDerived);
    }
  }, [
    baseUrl,
    deviceNetwork?.ipAddress,
    deviceNetwork?.isWifi,
    setBaseUrl,
    status?.network?.ip,
  ]);

  useEffect(() => {
    if (deviceNetwork?.isWifi) {
      return;
    }

    autoDiscoveryRef.current.running = false;
    autoDiscoveryRef.current.searchContext = null;
    autoDiscoveryRef.current.triedUrls = new Set<string>();
    autoDiscoveryRef.current.foundUrl = null;
    setIsAutoDiscoveringRobot(false);
    setAutoDiscoveryHelper(null);
  }, [deviceNetwork?.isWifi]);

  useEffect(() => {
    if (status?.network?.ip && isValidIpv4(status.network.ip)) {
      setAutoDiscoveryHelper(null);
      setIsAutoDiscoveringRobot(false);
    }
  }, [status?.network?.ip]);

  useEffect(() => {
    if (!deviceNetwork?.isWifi || !deviceNetwork.ipAddress) {
      return;
    }

    if (status?.network?.ip && isValidIpv4(status.network.ip)) {
      return;
    }

    if (!status && !statusError) {
      return;
    }

    const { urls: candidateUrls, isRobotHotspot } = gatherRobotLanBaseUrlCandidates(
      deviceNetwork.ipAddress,
      {
        currentBaseUrl: baseUrl || DEFAULT_ROBOT_BASE_URL,
        statusIp: status?.network?.ip,
      }
    );

    const nextContext: AutoDiscoveryContext = isRobotHotspot
      ? "robot-hotspot"
      : null;

    if (autoDiscoveryRef.current.searchContext !== nextContext) {
      autoDiscoveryRef.current.searchContext = nextContext;
      autoDiscoveryRef.current.triedUrls = new Set<string>();
      autoDiscoveryRef.current.foundUrl = null;
    }

    const normalizedBase = canonicalizeUrl(baseUrl || DEFAULT_ROBOT_BASE_URL);
    const normalizedFound = autoDiscoveryRef.current.foundUrl
      ? canonicalizeUrl(autoDiscoveryRef.current.foundUrl)
      : null;

    if (normalizedFound && normalizedFound === normalizedBase) {
      return;
    }

    // Build candidate list: last URL → known defaults → auto-discovered IPs
    const allCandidates: string[] = [];
    if (normalizedBase) {
      allCandidates.push(normalizedBase);
    }
    allCandidates.push(...candidateUrls);

    if (!allCandidates.length || autoDiscoveryRef.current.running) {
      return;
    }

    const untriedCandidates = allCandidates.filter((candidate) => {
      const normalized = canonicalizeUrl(candidate);
      return (
        normalized !== normalizedBase &&
        !autoDiscoveryRef.current.triedUrls.has(normalized)
      );
    });

    if (!untriedCandidates.length) {
      return;
    }

    autoDiscoveryRef.current.running = true;
    setIsAutoDiscoveringRobot(true);
    setAutoDiscoveryHelper(
      autoDiscoveryRef.current.searchContext === "robot-hotspot"
        ? `Checking for the robot on the ${ROBOT_AP_SSID} hotspot...`
        : "Searching for the robot on the network..."
    );

    let cancelled = false;

    const search = async () => {
      for (const candidate of untriedCandidates) {
        if (!mountedRef.current || cancelled) {
          break;
        }

        const normalized = canonicalizeUrl(candidate);
        autoDiscoveryRef.current.triedUrls.add(normalized);

        const found = await probeRobotBaseUrl(candidate);

        if (!mountedRef.current || cancelled) {
          break;
        }

        if (found) {
          autoDiscoveryRef.current.foundUrl = candidate;
          setAutoDiscoveryHelper(`Robot found at ${candidate}`);
          if (normalized !== normalizedBase) {
            setBaseUrl(candidate);
          }
          return;
        }
      }
    };

    search()
      .catch((error) => {
        if (mountedRef.current) {
          console.warn("Failed to auto-discover robot", error);
        }
      })
      .finally(() => {
        autoDiscoveryRef.current.running = false;
        if (!mountedRef.current) {
          return;
        }
        setIsAutoDiscoveringRobot(false);
        if (cancelled) {
          return;
        }
        if (!autoDiscoveryRef.current.foundUrl) {
          setAutoDiscoveryHelper(
            "Unable to find the robot automatically. Enter the IP manually if needed."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    baseUrl,
    deviceNetwork?.ipAddress,
    deviceNetwork?.isWifi,
    setBaseUrl,
    status,
    status?.network?.ip,
    statusError,
  ]);

  const handleStatusRefresh = useCallback(() => {
    void refreshDeviceNetwork();
    void refreshStatus();
  }, [refreshDeviceNetwork, refreshStatus]);

  useEffect(() => {
    setIsPolling(false);
    return () => setIsPolling(true);
  }, [setIsPolling]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const statusNetwork = status?.network;

  const wifiStatusMeta = useMemo<WifiStatusMeta>(() => {
    if (isLoadingDeviceNetwork) {
      return {
        color: "#FBBF24",
        label: "Checking...",
        details: ["Loading network name...", "Loading IP address..."],
        helper: null,
      };
    }

    if (deviceNetwork?.isWifi) {
      const networkName =
        (deviceNetwork.ssid && deviceNetwork.ssid.trim()) ||
        (statusNetwork?.wifiSsid && statusNetwork.wifiSsid.trim()) ||
        "Unknown network";
      const ipAddress =
        (deviceNetwork.ipAddress && deviceNetwork.ipAddress.trim()) ||
        (statusNetwork?.ip && statusNetwork.ip.trim()) ||
        "Unavailable";
      const helperMessages: string[] = [];
      if (ssidPermissionWarning) {
        helperMessages.push(ssidPermissionWarning);
      }
      if (autoDiscoveryHelper) {
        helperMessages.push(autoDiscoveryHelper);
      }
      return {
        color: isAutoDiscoveringRobot ? "#FBBF24" : "#1DD1A1",
        label: isAutoDiscoveringRobot ? "Searching" : "Connected",
        details: [networkName, ipAddress],
        helper: helperMessages.length ? helperMessages.join("\n") : null,
      };
    }

    if (deviceNetwork) {
      return {
        color: "#F87171",
        label: "Offline",
        details: ["Not connected", "Unavailable"],
        helper: `Connect this device to the same Wi-Fi network as the robot or join the ${ROBOT_AP_SSID} hotspot to continue. Temporarily disable any personal hotspot connection first.`,
      };
    }

    return {
      color: "#FBBF24",
      label: "Unknown",
      details: [
        deviceNetworkError ??
        (statusNetwork?.wifiSsid && statusNetwork.wifiSsid.trim()) ??
        "Network name unavailable",
        (statusNetwork?.ip && statusNetwork.ip.trim()) ||
        "IP address unavailable",
      ],
      helper: deviceNetworkError
        ? null
        : ssidPermissionWarning ?? "Check network permissions and retry.",
    };
  }, [
    autoDiscoveryHelper,
    deviceNetwork,
    deviceNetworkError,
    isLoadingDeviceNetwork,
    isAutoDiscoveringRobot,
    ssidPermissionWarning,
    statusNetwork,
  ]);

  const handleConnectRobotPress = useCallback(async () => {
    setIsConnectingRobot(true);
    setConnectRobotError(null);
    setConnectRobotSuccess(null);

    const normalizedBase = canonicalizeUrl(baseUrl || DEFAULT_ROBOT_BASE_URL);
    const { urls: autoDiscoveryCandidates, isRobotHotspot } =
      gatherRobotLanBaseUrlCandidates(deviceNetwork?.ipAddress ?? null, {
        currentBaseUrl: baseUrl || DEFAULT_ROBOT_BASE_URL,
        statusIp: status?.network?.ip,
      });

    autoDiscoveryRef.current.searchContext = isRobotHotspot
      ? "robot-hotspot"
      : null;

    const seenCandidates = new Set<string>();
    const candidatesToTry: string[] = [];
    const registerCandidate = (candidate: string | null | undefined) => {
      if (!candidate) {
        return;
      }
      const normalized = canonicalizeUrl(candidate);
      if (seenCandidates.has(normalized)) {
        return;
      }
      seenCandidates.add(normalized);
      candidatesToTry.push(normalized);
    };

    // Connection order: Last URL → known defaults → auto-discovered IPs
    // 1. Try last URL first (from storage)
    registerCandidate(normalizedBase);
    // 2. Add default candidates
    registerCandidate(canonicalizeUrl(DEFAULT_ROBOT_BASE_URL));
    autoDiscoveryCandidates.forEach(registerCandidate);

    if (!candidatesToTry.length) {
      setConnectRobotError(
        "No potential robot addresses were found. Enter the robot IP manually and try again."
      );
      setIsConnectingRobot(false);
      return;
    }

    let connectedUrl: string | null = null;

    try {
      for (const candidate of candidatesToTry) {
        console.log("Attempting to connect to robot", {
          baseUrl: candidate,
        });

        autoDiscoveryRef.current.triedUrls.add(candidate);

        const found = await probeRobotBaseUrl(candidate, { timeoutMs: 2000 });
        if (!found) {
          continue;
        }

        connectedUrl = candidate;
        autoDiscoveryRef.current.foundUrl = candidate;
        setAutoDiscoveryHelper(`Robot found at ${candidate}`);

        if (candidate !== normalizedBase) {
          setBaseUrl(candidate);
        }

        console.log("Robot responded during auto-discovery", {
          candidate,
        });

        try {
          console.log("Refreshing robot status after successful probe", {
            candidate,
          });
          await refreshStatus();
          console.log("Robot status refresh completed", { candidate });
          setConnectRobotSuccess(
            `Robot responded successfully at ${candidate}. Connection details refreshed.`
          );
        } catch (refreshError) {
          console.warn("Failed to refresh status after successful probe", {
            candidate,
            error: refreshError,
          });
          setConnectRobotError(
            refreshError instanceof Error
              ? refreshError.message
              : "Robot responded but status refresh failed. Try again."
          );
        }

        break;
      }

      if (!connectedUrl) {
        const visibleCandidates = candidatesToTry;
        const triedSummary = visibleCandidates.length
          ? visibleCandidates.length === 1
            ? `Tried ${visibleCandidates[0]}.`
            : `Tried ${visibleCandidates.length} addresses: ${visibleCandidates.join(", ")}.`
          : null;
        setConnectRobotError(
          `Unable to reach the robot automatically. Ensure you are on the same network and try again.${triedSummary ? ` ${triedSummary}` : ""
          }`
        );
      }
    } catch (error) {
      console.warn("Failed to connect to robot", error);
      setConnectRobotError(
        error instanceof Error
          ? error.message
          : "Unable to reach the robot. Ensure you are on the same network and try again."
      );
    } finally {
      setIsConnectingRobot(false);
    }
  }, [
    baseUrl,
    deviceNetwork?.ipAddress,
    refreshStatus,
    setBaseUrl,
    status?.network?.ip,
  ]);

  // Disabled auto-redirect to allow Bluetooth testing
  // Users can manually navigate after successful connection if needed
  // useEffect(() => {
  //   if (connectRobotSuccess) {
  //     const hasToken = Boolean(controlToken);
  //     const target = hasToken ? "/" : "/pairing";
  //     console.log("Navigating after robot connection success", {
  //       connectRobotSuccess,
  //       hasToken,
  //       target,
  //     });
  //     router.replace(target);
  //   }
  // }, [connectRobotSuccess, router, controlToken]);

  // Disabled auto-redirect to allow Bluetooth testing
  // When testing Bluetooth, users should be able to stay on the connection screen
  // useEffect(() => {
  //   if (status?.network?.ip) {
  //     // When robot status is available, check if we need to pair
  //     const hasToken = Boolean(controlToken);
  //     const target = hasToken ? "/" : "/pairing";
  //     console.log("Navigating based on robot status", {
  //       statusIp: status.network?.ip,
  //       hasToken,
  //       target,
  //     });
  //     router.replace(target);
  //   }
  // }, [router, status?.network?.ip, controlToken]);

  return (
    // <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
    //   <ScrollView
    //     style={styles.scrollView}
    //     contentContainerStyle={styles.scrollContent}
    //     keyboardShouldPersistTaps="handled"
    //   >
    //     <ThemedView style={styles.container}>
    //       <ThemedText type="title" style={styles.heading}>
    //         Connect to Robot
    //       </ThemedText>
    //       <ThemedText style={styles.subheading}>
    //         If you are on Wi-Fi, the app will try to find the robot on your
    //         network. Otherwise, connect this device to the same Wi-Fi as the
    //         robot or join the {ROBOT_AP_SSID} hotspot to start setup. If this
    //         device is running a hotspot, temporarily disable it so the Wi-Fi
    //         connection stays active.
    //       </ThemedText>

    //       <ThemedView style={styles.statusCard}>
    //         <ThemedText type="subtitle" style={styles.statusTitle}>
    //           Connection Info
    //         </ThemedText>
    //         <View style={styles.infoGroup}>
    //           <View style={styles.infoRow}>
    //             <ThemedText style={styles.infoLabel}>
    //               WiFi Connection:
    //             </ThemedText>
    //             <View style={styles.infoValueContainer}>
    //               <ThemedText style={styles.infoValue}>
    //                 {wifiStatusMeta.label}
    //               </ThemedText>
    //               <View
    //                 style={[
    //                   styles.statusIndicator,
    //                   { backgroundColor: wifiStatusMeta.color },
    //                 ]}
    //               />
    //             </View>
    //           </View>
    //           <View style={styles.infoRow}>
    //             <ThemedText style={styles.infoLabel}>Network Name:</ThemedText>
    //             <ThemedText style={styles.infoValue}>
    //               {wifiStatusMeta.details[0]}
    //             </ThemedText>
    //           </View>
    //           <View style={styles.infoRow}>
    //             <ThemedText style={styles.infoLabel}>IP Address:</ThemedText>
    //             <ThemedText style={styles.infoValue}>
    //               {wifiStatusMeta.details[1]}
    //             </ThemedText>
    //           </View>
    //         </View>
    //         {wifiStatusMeta.helper ? (
    //           <ThemedText style={styles.statusWarning}>
    //             {wifiStatusMeta.helper}
    //           </ThemedText>
    //         ) : null}
    //         {deviceNetwork?.isWifi ? (
    //           <ThemedText style={styles.statusHint}>
    //             Tip:{" "}
    //             {deviceIpPrefix
    //               ? `The robot's address typically shares the first three numbers of this device's IP (${deviceIpPrefix}.x).`
    //               : "The robot's address typically shares the first three numbers of this device's IP."}
    //             {" "}Use that prefix when entering the robot IP and turn off
    //             any hotspot while connecting.
    //           </ThemedText>
    //         ) : null}
    //         {statusError ? (
    //           <ThemedText style={styles.statusError}>
    //             Unable to reach the robot. Make sure your device and the robot
    //             are on the same Wi-Fi network or join the {ROBOT_AP_SSID}
    //             hotspot. Temporarily disable any personal hotspot so your
    //             device stays on Wi-Fi.
    //           </ThemedText>
    //         ) : null}
    //         <Pressable
    //           style={styles.secondaryButton}
    //           onPress={handleStatusRefresh}
    //         >
    //           <ThemedText style={styles.secondaryButtonText}>
    //             Refresh network info
    //           </ThemedText>
    //         </Pressable>
    //       </ThemedView>

    //       {connectRobotError ? (
    //         <ThemedView style={styles.connectCard}>
    //           <ThemedText style={styles.connectError}>
    //             {connectRobotError}
    //           </ThemedText>
    //         </ThemedView>
    //       ) : null}
    //       <Pressable
    //         style={[
    //           styles.primaryButton,
    //           isConnectingRobot && styles.disabledPrimary,
    //         ]}
    //         onPress={handleConnectRobotPress}
    //         disabled={isConnectingRobot}
    //       >
    //         {isConnectingRobot ? (
    //           <ActivityIndicator color="#04110B" />
    //         ) : (
    //           <ThemedText style={styles.primaryButtonText}>
    //             Connect Robot
    //           </ThemedText>
    //         )}
    //       </Pressable>
    //       <Pressable
    //         style={styles.secondaryButton}
    //         onPress={() => router.push("/pairing")}
    //       >
    //         <ThemedText style={styles.secondaryButtonText}>
    //           Pair Robot
    //         </ThemedText>
    //       </Pressable>
    //     </ThemedView>
    //   </ScrollView>
    // </SafeAreaView>
    <WifiProvisionScreen />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050505",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 24,
    backgroundColor: "#050505",
  },
  heading: {
    fontFamily: TITLE_FONT_FAMILY,
  },
  subheading: {
    color: "#D1D5DB",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  statusCard: {
    gap: 16,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F0F10",
  },
  statusTitle: {
    color: "#F9FAFB",
    fontFamily: SUBTITLE_FONT_FAMILY,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusWarning: {
    color: "#FBBF24",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  statusHint: {
    color: "#9CA3AF",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  infoGroup: {
    gap: 12,
    paddingTop: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  infoLabel: {
    color: "#9CA3AF",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  infoValue: {
    color: "#F9FAFB",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusError: {
    color: "#F87171",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  connectCard: {
    gap: 16,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F0F10",
  },
  connectHint: {
    color: "#D1D5DB",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  connectError: {
    color: "#F87171",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  connectSuccess: {
    color: "#1DD1A1",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 0,
    backgroundColor: "#0A0A0B",
  },
  secondaryButtonText: {
    color: "#E5E7EB",
    fontFamily: MONO_REGULAR_FONT_FAMILY,
  },
  primaryButton: {
    backgroundColor: "#1DD1A1",
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabledPrimary: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#04110B",
    fontFamily: MONO_SEMIBOLD_FONT_FAMILY,
  },
});
