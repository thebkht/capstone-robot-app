import NetInfo from "@react-native-community/netinfo";
import * as Network from "expo-network";
import WifiManager from "react-native-wifi-reborn";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { DEFAULT_ROBOT_BASE_URL, useRobot } from "@/context/robot-provider";

const ROBOT_AP_SSID = "ROBOTSNAME_AP";

const TITLE_FONT_FAMILY = "Lato_900Black";

const SUBTITLE_FONT_FAMILY = "Lato_400Regular";

const MONO_REGULAR_FONT_FAMILY = "JetBrainsMono_400Regular";

const MONO_SEMIBOLD_FONT_FAMILY = "JetBrainsMono_600SemiBold";

const canonicalizeUrl = (value: string) => value.trim().replace(/\/$/, "");

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

const deriveRobotLanBaseUrl = (
  deviceIpAddress: string | null | undefined,
  options: { currentBaseUrl: string; statusIp?: string | null }
) => {
  const { currentBaseUrl, statusIp } = options;
  const baseParts = extractUrlParts(currentBaseUrl);
  const defaultParts = extractUrlParts(DEFAULT_ROBOT_BASE_URL);
  const statusParts = extractUrlParts(statusIp);

  const protocol =
    baseParts?.protocol ??
    statusParts?.protocol ??
    defaultParts?.protocol ??
    "http:";
  const port =
    statusParts?.port ??
    baseParts?.port ??
    defaultParts?.port ??
    "8000";

  const buildUrl = (ip: string) => {
    const trimmedProtocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
    const normalizedPort = port ? `:${port}` : "";
    return `${trimmedProtocol}//${ip}${normalizedPort}`;
  };

  if (statusParts?.host && isValidIpv4(statusParts.host)) {
    return buildUrl(statusParts.host);
  }

  if (!deviceIpAddress || !isValidIpv4(deviceIpAddress)) {
    return null;
  }

  const ipSegments = deviceIpAddress
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (ipSegments.length !== 4) {
    return null;
  }

  const isRobotHotspotSubnet =
    ipSegments[0] === "192" &&
    ipSegments[1] === "168" &&
    ipSegments[2] === "4";

  if (isRobotHotspotSubnet) {
    return buildUrl("192.168.4.1");
  }

  const candidateSources = [baseParts?.host, defaultParts?.host];

  for (const source of candidateSources) {
    if (!source || !isValidIpv4(source)) {
      continue;
    }

    const hostSegments = source.split(".");
    if (hostSegments.length !== 4) {
      continue;
    }

    const candidateSegments = [
      ipSegments[0],
      ipSegments[1],
      ipSegments[2],
      hostSegments[3],
    ];
    const candidateIp = candidateSegments.join(".");

    if (isValidIpv4(candidateIp)) {
      return buildUrl(candidateIp);
    }
  }

  return null;
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

export default function ConnectionScreen() {
  const { api, baseUrl, setBaseUrl, status, statusError, refreshStatus, setIsPolling } =
    useRobot();
  const mountedRef = useRef(true);
  const [deviceNetwork, setDeviceNetwork] =
    useState<DeviceNetworkDetails | null>(null);
  const [deviceNetworkError, setDeviceNetworkError] = useState<string | null>(
    null
  );
  const [isLoadingDeviceNetwork, setIsLoadingDeviceNetwork] = useState(false);
  const [ssidPermissionWarning, setSsidPermissionWarning] =
    useState<string | null>(null);
  const [isConnectingRobot, setIsConnectingRobot] = useState(false);
  const [connectRobotError, setConnectRobotError] = useState<string | null>(
    null
  );
  const [connectRobotSuccess, setConnectRobotSuccess] = useState<string | null>(
    null
  );

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
          if (state.type === Network.NetworkStateType.WIFI) {
            if (Platform.OS === "android") {
              const fineLocationPermission =
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

              if (!fineLocationPermission) {
                permissionWarning =
                  "Wi-Fi SSID unavailable on this Android version.";
              } else {
                const hasPermission =
                  await PermissionsAndroid.check(fineLocationPermission);

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
                  const wifiManagerSsid = await WifiManager.getCurrentWifiSSID();
                  if (wifiManagerSsid && wifiManagerSsid !== "<unknown ssid>") {
                    ssid = wifiManagerSsid;
                  }
                }
              }
            } else {
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

        if (!ssid) {
          try {
            const netInfoState = await NetInfo.fetch();
            if (
              netInfoState.type === "wifi" &&
              netInfoState.details &&
              "ssid" in netInfoState.details &&
              netInfoState.details.ssid
            ) {
              ssid = netInfoState.details.ssid as string;
            }
          } catch (netInfoError) {
            console.log("NetInfo failed to fetch SSID", netInfoError);
          }
        }

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
          ipAddress: normalizedIp,
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
    if (!deviceNetwork?.isWifi || !deviceNetwork.ipAddress) {
      return;
    }

    const derivedUrl = deriveRobotLanBaseUrl(deviceNetwork.ipAddress, {
      currentBaseUrl: baseUrl || DEFAULT_ROBOT_BASE_URL,
      statusIp: status?.network?.ip,
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
    if (!status?.network?.ip) {
      return;
    }

    const nextUrl = deriveRobotLanBaseUrl(deviceNetwork?.ipAddress, {
      currentBaseUrl: baseUrl || DEFAULT_ROBOT_BASE_URL,
      statusIp: status.network.ip,
    });

    if (!nextUrl) {
      return;
    }

    const normalizedNext = canonicalizeUrl(nextUrl);
    const normalizedBase = baseUrl ? canonicalizeUrl(baseUrl) : "";

    if (normalizedNext !== normalizedBase) {
      setBaseUrl(normalizedNext);
    }
  }, [
    baseUrl,
    deviceNetwork?.ipAddress,
    setBaseUrl,
    status?.network?.ip,
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
      return {
        color: "#1DD1A1",
        label: "Connected",
        details: [networkName, ipAddress],
        helper: ssidPermissionWarning,
      };
    }

    if (deviceNetwork) {
      return {
        color: "#F87171",
        label: "Offline",
        details: ["Not connected", "Unavailable"],
        helper:
          `Connect this device to the same Wi-Fi network as the robot or join the ${ROBOT_AP_SSID} hotspot to continue.`,
      };
    }

    return {
      color: "#FBBF24",
      label: "Unknown",
      details: [
        deviceNetworkError ??
          (statusNetwork?.wifiSsid && statusNetwork.wifiSsid.trim()) ??
          "Network name unavailable",
        (statusNetwork?.ip && statusNetwork.ip.trim()) || "IP address unavailable",
      ],
      helper: deviceNetworkError
        ? null
        : ssidPermissionWarning ?? "Check network permissions and retry.",
    };
  }, [
    deviceNetwork,
    deviceNetworkError,
    isLoadingDeviceNetwork,
    ssidPermissionWarning,
    statusNetwork,
  ]);

  const handleConnectRobotPress = useCallback(async () => {
    setIsConnectingRobot(true);
    setConnectRobotError(null);
    setConnectRobotSuccess(null);

    try {
      const normalizedBase = canonicalizeUrl(
        baseUrl || DEFAULT_ROBOT_BASE_URL
      );
      console.log("Attempting to connect to robot", { baseUrl: normalizedBase });
      await api.ping();
      setConnectRobotSuccess(
        "Robot responded successfully. Connection details refreshed."
      );
      await refreshStatus();
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
  }, [api, baseUrl, refreshStatus]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.heading}>
            Connect to Robot
          </ThemedText>
          <ThemedText style={styles.subheading}>
            If you are on Wi-Fi, the app will try to find the robot on your
            network. Otherwise, connect this device to the same Wi-Fi as the
            robot or join the {ROBOT_AP_SSID} hotspot to start setup.
          </ThemedText>

          <ThemedView style={styles.statusCard}>
            <ThemedText type="subtitle" style={styles.statusTitle}>
              Connection Info
            </ThemedText>
            <View style={styles.infoGroup}>
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>
                  WiFi Connection:
                </ThemedText>
                <View style={styles.infoValueContainer}>
                  <ThemedText style={styles.infoValue}>
                    {wifiStatusMeta.label}
                  </ThemedText>
                  <View
                    style={[
                      styles.statusIndicator,
                      { backgroundColor: wifiStatusMeta.color },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Network Name:</ThemedText>
                <ThemedText style={styles.infoValue}>
                  {wifiStatusMeta.details[0]}
                </ThemedText>
              </View>
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>IP Address:</ThemedText>
                <ThemedText style={styles.infoValue}>
                  {wifiStatusMeta.details[1]}
                </ThemedText>
              </View>
            </View>
            {wifiStatusMeta.helper ? (
              <ThemedText style={styles.statusWarning}>
                {wifiStatusMeta.helper}
              </ThemedText>
            ) : null}
            {statusError ? (
              <ThemedText style={styles.statusError}>
                Unable to reach the robot. Make sure your device and the robot
                are on the same Wi-Fi network or join the {ROBOT_AP_SSID}
                hotspot.
              </ThemedText>
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              onPress={handleStatusRefresh}
            >
              <ThemedText style={styles.secondaryButtonText}>
                Refresh network info
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView style={styles.connectCard}>
            <ThemedText type="subtitle">Connect to the robot</ThemedText>
            <ThemedText style={styles.connectHint}>
              Attempt to reach the robot at the configured address. Make sure
              this device and the robot share the same Wi-Fi network or join the
              {ROBOT_AP_SSID} hotspot when direct connection is needed.
            </ThemedText>
            {connectRobotError ? (
              <ThemedText style={styles.connectError}>
                {connectRobotError}
              </ThemedText>
            ) : null}
            {connectRobotSuccess ? (
              <ThemedText style={styles.connectSuccess}>
                {connectRobotSuccess}
              </ThemedText>
            ) : null}
            <Pressable
              style={[
                styles.primaryButton,
                isConnectingRobot && styles.disabledPrimary,
              ]}
              onPress={handleConnectRobotPress}
              disabled={isConnectingRobot}
            >
              {isConnectingRobot ? (
                <ActivityIndicator color="#04110B" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>
                  Connect Robot
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
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
