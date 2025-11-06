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
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { DEFAULT_ROBOT_BASE_URL, useRobot } from "@/context/robot-provider";
const ROBOT_AP_SSID = "ROBOTSNAME_AP";

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
  deviceIpAddress: string,
  options: { currentBaseUrl: string; statusIp?: string | null }
) => {
  const ipSegments = deviceIpAddress
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (ipSegments.length !== 4) {
    return null;
  }

  const { currentBaseUrl, statusIp } = options;
  const baseParts = extractUrlParts(currentBaseUrl);
  const protocol = baseParts?.protocol ?? "http:";
  const port = baseParts?.port ?? "8000";

  const buildUrl = (ip: string) => {
    const trimmedProtocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
    const normalizedPort = port ? `:${port}` : "";
    return `${trimmedProtocol}//${ip}${normalizedPort}`;
  };

  if (isValidIpv4(statusIp)) {
    return buildUrl(statusIp as string);
  }

  if (baseParts?.host && isValidIpv4(baseParts.host)) {
    const hostSegments = baseParts.host.split(".");
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
  const [wifiNetworks, setWifiNetworks] = useState<string[]>([]);
  const [isScanningWifi, setIsScanningWifi] = useState(false);
  const [wifiScanError, setWifiScanError] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [wifiPassword, setWifiPassword] = useState("");
  const [isSubmittingWifi, setIsSubmittingWifi] = useState(false);
  const [wifiConnectError, setWifiConnectError] = useState<string | null>(null);
  const [wifiConnectSuccess, setWifiConnectSuccess] = useState<string | null>(
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

    const nextUrl = deriveRobotLanBaseUrl(status.network.ip, {
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
  }, [baseUrl, setBaseUrl, status?.network?.ip]);

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

  useEffect(() => {
    const available = status?.network?.availableNetworks;
    if (Array.isArray(available) && available.length) {
      const nextNetworks = available.filter(
        (item): item is string => typeof item === "string"
      );
      setWifiNetworks(nextNetworks);
      setWifiScanError(null);
      if (selectedNetwork && !nextNetworks.includes(selectedNetwork)) {
        setSelectedNetwork(null);
        setWifiPassword("");
        setWifiConnectError(null);
        setWifiConnectSuccess(null);
      }
    }
  }, [selectedNetwork, status?.network?.availableNetworks]);

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

  const handleScanPress = useCallback(async () => {
    setIsScanningWifi(true);
    setWifiScanError(null);
    setWifiConnectError(null);
    setWifiConnectSuccess(null);

    try {
      const normalizedBase = canonicalizeUrl(
        baseUrl || DEFAULT_ROBOT_BASE_URL
      );
      console.log("Requesting Wi-Fi network scan", { baseUrl: normalizedBase });
      const { networks } = await api.listWifiNetworks();
      const validNetworks = Array.isArray(networks)
        ? networks.filter((item): item is string => typeof item === "string")
        : [];

      setWifiNetworks(validNetworks);

      if (!validNetworks.length) {
        setWifiScanError(
          "No Wi-Fi networks detected. Try again closer to the router."
        );
        setSelectedNetwork(null);
        setWifiPassword("");
      } else if (selectedNetwork && !validNetworks.includes(selectedNetwork)) {
        setSelectedNetwork(null);
        setWifiPassword("");
      }

      console.log("Wi-Fi network scan completed", {
        count: validNetworks.length,
      });
    } catch (error) {
      console.warn("Wi-Fi network scan failed", error);
      setWifiNetworks([]);
      setSelectedNetwork(null);
      setWifiPassword("");
      setWifiScanError(
        `Unable to reach the robot. Connect this device to the same Wi-Fi network as the robot or join the ${ROBOT_AP_SSID} hotspot, then try again.`
      );
    } finally {
      setIsScanningWifi(false);
    }
  }, [api, baseUrl, selectedNetwork]);

  const handleNetworkSelect = useCallback((network: string) => {
    setSelectedNetwork((previous) => {
      if (previous === network) {
        return previous;
      }
      setWifiPassword("");
      setWifiConnectError(null);
      setWifiConnectSuccess(null);
      return network;
    });
  }, []);

  const handleWifiCredentialSubmit = useCallback(async () => {
    if (!selectedNetwork) {
      return;
    }

    setIsSubmittingWifi(true);
    setWifiConnectError(null);
    setWifiConnectSuccess(null);

    try {
      const payload = {
        ssid: selectedNetwork,
        password: wifiPassword.trim(),
      };

      const normalizedBase = canonicalizeUrl(
        baseUrl || DEFAULT_ROBOT_BASE_URL
      );
      console.log("Submitting Wi-Fi credentials to robot", {
        ssid: selectedNetwork,
        hasPassword: payload.password.length > 0,
        baseUrl: normalizedBase,
      });

      const result = await api.connectWifi(payload);

      if (!result.success) {
        setWifiConnectError(
          "The robot rejected the Wi-Fi credentials. Try again."
        );
        return;
      }

      setWifiConnectSuccess(
        payload.password.length
          ? `Credentials sent. The robot is joining ${selectedNetwork}.`
          : `Connecting to ${selectedNetwork}.`
      );

      await refreshStatus();
    } catch (error) {
      console.warn("Failed to submit Wi-Fi credentials", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to submit Wi-Fi credentials.";
      setWifiConnectError(message);
    } finally {
      setIsSubmittingWifi(false);
    }
  }, [api, baseUrl, refreshStatus, selectedNetwork, wifiPassword]);

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

          <ThemedView style={styles.wifiCard}>
            <ThemedText type="subtitle">Available networks</ThemedText>
            <ThemedText style={styles.wifiHint}>
              Scan to view Wi-Fi networks the robot can detect. Pick the network
              you share with the robot (or plan to) and send credentials to
              bring it online.
            </ThemedText>

            <Pressable
              style={[
                styles.scanButton,
                isScanningWifi && styles.disabledButton,
              ]}
              disabled={isScanningWifi}
              onPress={handleScanPress}
            >
              {isScanningWifi ? (
                <ActivityIndicator color="#E5E7EB" />
              ) : (
                <ThemedText style={styles.secondaryButtonText}>
                  Scan for Wi-Fi networks
                </ThemedText>
              )}
            </Pressable>

            <View style={styles.networkList}>
              {wifiNetworks.length ? (
                wifiNetworks.map((network) => (
                  <Pressable
                    key={network}
                    onPress={() => handleNetworkSelect(network)}
                    style={({ pressed }) => [
                      styles.networkRow,
                      selectedNetwork === network && styles.networkRowActive,
                      pressed && styles.networkRowPressed,
                    ]}
                  >
                    <ThemedText style={styles.networkName}>
                      {network}
                    </ThemedText>
                    {selectedNetwork === network ? (
                      <ThemedText style={styles.networkSelectedHint}>
                        Selected
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ))
              ) : (
                <ThemedText style={styles.wifiMeta}>
                  {wifiScanError ??
                    `No scan results yet. Connect this device to the same Wi-Fi network as the robot or join the ${ROBOT_AP_SSID} hotspot, then scan again.`}
                </ThemedText>
              )}
            </View>

            {wifiNetworks.length > 0 && !selectedNetwork ? (
              <ThemedText style={styles.selectNetworkHint}>
                Select your Wi-Fi network from the list above to send
                credentials.
              </ThemedText>
            ) : null}

            {selectedNetwork ? (
              <View style={styles.wifiCredentials}>
                <ThemedText style={styles.credentialsHeading}>
                  Configure network: {selectedNetwork}
                </ThemedText>
                <ThemedText style={styles.credentialsHint}>
                  Enter the Wi-Fi password for this network. Leave blank for
                  open networks.
                </ThemedText>
                <TextInput
                  value={wifiPassword}
                  onChangeText={setWifiPassword}
                  style={styles.passwordInput}
                  placeholder="Wi-Fi password"
                  placeholderTextColor="#4B5563"
                  secureTextEntry
                  autoCapitalize="none"
                />
                {wifiConnectError ? (
                  <ThemedText style={styles.credentialsError}>
                    {wifiConnectError}
                  </ThemedText>
                ) : null}
                {wifiConnectSuccess ? (
                  <ThemedText style={styles.credentialsSuccess}>
                    {wifiConnectSuccess}
                  </ThemedText>
                ) : null}
                <Pressable
                  style={[
                    styles.primaryButton,
                    isSubmittingWifi && styles.disabledPrimary,
                  ]}
                  onPress={handleWifiCredentialSubmit}
                  disabled={isSubmittingWifi}
                >
                  {isSubmittingWifi ? (
                    <ActivityIndicator color="#04110B" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>
                      Send Wi-Fi credentials
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            ) : null}
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
    fontFamily: "Times New Roman",
  },
  subheading: {
    color: "#D1D5DB",
    fontFamily: "JetBrainsMono-Regular",
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
    fontFamily: "JetBrainsMono-Bold",
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusWarning: {
    color: "#FBBF24",
    fontFamily: "JetBrainsMono-Regular",
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
    fontFamily: "JetBrainsMono-Regular",
  },
  infoValue: {
    color: "#F9FAFB",
    fontFamily: "JetBrainsMono-Regular",
  },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusError: {
    color: "#F87171",
    fontFamily: "JetBrainsMono-Regular",
  },
  wifiCard: {
    gap: 16,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F0F10",
  },
  wifiHint: {
    color: "#D1D5DB",
    fontFamily: "JetBrainsMono-Regular",
  },
  scanButton: {
    borderWidth: 1,
    borderColor: "#1F2937",
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 0,
    backgroundColor: "#0A0A0B",
  },
  disabledButton: {
    opacity: 0.5,
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
    fontFamily: "JetBrainsMono-Regular",
  },
  networkList: {
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 0,
  },
  networkRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    backgroundColor: "#0A0A0B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  networkRowActive: {
    backgroundColor: "#111827",
  },
  networkRowPressed: {
    backgroundColor: "#1F2937",
  },
  networkName: {
    color: "#F9FAFB",
    fontFamily: "JetBrainsMono-Regular",
  },
  networkSelectedHint: {
    color: "#1DD1A1",
    fontFamily: "JetBrainsMono-Regular",
  },
  wifiMeta: {
    color: "#9CA3AF",
    fontFamily: "JetBrainsMono-Regular",
    paddingVertical: 12,
  },
  selectNetworkHint: {
    color: "#FBBF24",
    fontFamily: "JetBrainsMono-Regular",
  },
  wifiCredentials: {
    gap: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
    borderRadius: 0,
    backgroundColor: "#0A0A0B",
  },
  credentialsHeading: {
    color: "#E5E7EB",
    fontFamily: "JetBrainsMono-Regular",
  },
  credentialsHint: {
    color: "#9CA3AF",
    fontFamily: "JetBrainsMono-Regular",
  },
  passwordInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0A0A0B",
    color: "#F9FAFB",
    fontFamily: "JetBrainsMono-Regular",
  },
  credentialsError: {
    color: "#F87171",
    fontFamily: "JetBrainsMono-Regular",
  },
  credentialsSuccess: {
    color: "#1DD1A1",
    fontFamily: "JetBrainsMono-Regular",
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
    fontFamily: "JetBrainsMono-Regular",
  },
});
