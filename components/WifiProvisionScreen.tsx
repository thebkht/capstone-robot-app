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
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import {
  DEFAULT_ROBOT_BASE_URL,
  useRobot,
} from "@/context/robot-provider";
import { useRovyBle } from "@/hooks/use-rovy-ble";
import type { RovyDevice } from "@/services/rovy-ble";

const deriveHost = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return parsed.host || parsed.hostname || null;
  } catch (error) {
    console.warn("Unable to parse host from value", value, error);
    return value;
  }
};

const formatBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  return `http://${trimmed.replace(/\/$/, "")}`;
};

const StatusPill = ({
  color,
  label,
}: {
  color: string;
  label: string;
}) => (
  <View style={styles.statusPill}>
    <View style={[styles.statusDot, { backgroundColor: color }]} />
    <ThemedText style={styles.statusPillText}>{label}</ThemedText>
  </View>
);

/**
 * Wi-Fi Provision Screen Component
 * Guides the user through finding the robot over BLE and
 * managing the Wi-Fi connection.
 */
export function WifiProvisionScreen() {
  const {
    isScanning,
    isConnecting,
    isSendingConfig,
    isConnected,
    wifiStatus,
    error,
    scanForRovy,
    connectToRovy,
    sendWifiConfig,
    disconnect,
  } = useRovyBle();

  const {
    refreshStatus,
    status,
    statusError,
    baseUrl,
    setBaseUrl,
  } = useRobot();

  const router = useRouter();

  const [devices, setDevices] = useState<RovyDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<RovyDevice | null>(
    null
  );
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showWifiConfig, setShowWifiConfig] = useState(false);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [isOnSameNetwork, setIsOnSameNetwork] = useState<boolean | null>(null);
  const [isRobotConnecting, setIsRobotConnecting] = useState(false);
  const [isManualModalVisible, setIsManualModalVisible] = useState(false);
  const [manualIpInput, setManualIpInput] = useState("");
  const [manualIpEdited, setManualIpEdited] = useState(false);
  const [manualConnectError, setManualConnectError] = useState<string | null>(
    null
  );
  const [isManualConnecting, setIsManualConnecting] = useState(false);

  const isCheckingNetworkRef = useRef(false);
  const refreshStatusRef = useRef(refreshStatus);

  // Keep ref updated
  useEffect(() => {
    refreshStatusRef.current = refreshStatus;
  }, [refreshStatus]);

  useEffect(() => {
    if (manualIpEdited) {
      return;
    }

    const fallback =
      status?.network?.ip ||
      deriveHost(baseUrl) ||
      deriveHost(DEFAULT_ROBOT_BASE_URL);

    if (fallback) {
      setManualIpInput(fallback);
    }
  }, [baseUrl, manualIpEdited, status?.network?.ip]);

  /**
   * Step 1: Scan for ROVY devices
   */
  const handleScan = useCallback(async () => {
    try {
      setDevices([]);
      setSelectedDevice(null);
      const foundDevices = await scanForRovy();
      setDevices(foundDevices);

      if (foundDevices.length === 0) {
        Alert.alert(
          "No Devices Found",
          "No ROVY devices were found. Make sure the robot is powered on and in pairing mode."
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to scan for devices";
      Alert.alert("Scan Error", message);
    }
  }, [scanForRovy]);

  /**
   * Get phone's current network info
   */
  const refreshPhoneNetwork = useCallback(async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const ipAddress = await Network.getIpAddressAsync();
      const resolvedIp =
        ipAddress && ipAddress !== "0.0.0.0" ? ipAddress : null;

      // Try to get SSID (may not be available on all platforms)
      let ssidValue: string | null = null;
      if (networkState.type === "WIFI") {
        ssidValue = null;
      }

      console.log("Phone network:", { ssidValue, ipAddress: resolvedIp });
    } catch (error) {
      console.warn("Failed to get phone network info:", error);
    }
  }, []);

  /**
   * Check if robot is on the same network as phone
   */
  const checkSameNetwork = useCallback(async () => {
    if (isCheckingNetworkRef.current) {
      return;
    }

    isCheckingNetworkRef.current = true;
    setIsCheckingNetwork(true);
    setIsOnSameNetwork(null);

    try {
      await refreshStatusRef.current();

      setTimeout(() => {
        setIsOnSameNetwork(true);
        setShowWifiConfig(false);
        setIsCheckingNetwork(false);
        isCheckingNetworkRef.current = false;
      }, 500);
    } catch (error) {
      console.log("Robot not on same network:", error);
      setIsOnSameNetwork(false);
      setIsCheckingNetwork(false);
      isCheckingNetworkRef.current = false;
    }
  }, []);

  /**
   * Step 2: Connect to selected device via Bluetooth
   */
  const handleConnect = useCallback(
    async (device: RovyDevice) => {
      try {
        setSelectedDevice(device);
        setShowWifiConfig(false);
        setIsOnSameNetwork(null);
        await connectToRovy(device.id);
        await refreshPhoneNetwork();
        await checkSameNetwork();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect to device";
        Alert.alert("Connection Error", message);
        setSelectedDevice(null);
        setIsOnSameNetwork(null);
      }
    },
    [connectToRovy, refreshPhoneNetwork, checkSameNetwork]
  );

  /**
   * Handle "Connect" button - robot is on same network
   */
  const handleNetworkConnect = useCallback(async () => {
    try {
      setIsRobotConnecting(true);
      await refreshStatus();
      Alert.alert(
        "Connected",
        "Robot is connected on the same network. You can now control it."
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to robot";
      Alert.alert("Connection Error", message);
    } finally {
      setIsRobotConnecting(false);
    }
  }, [refreshStatus]);

  /**
   * Show Wi-Fi configuration form
   */
  const handleChangeWifi = useCallback(() => {
    setShowWifiConfig(true);
  }, []);

  /**
   * Step 3: Send Wi-Fi configuration
   */
  const handleSendConfig = useCallback(async () => {
    if (!ssid.trim()) {
      Alert.alert("Invalid Input", "Please enter a Wi-Fi network name (SSID)");
      return;
    }

    try {
      await sendWifiConfig(ssid.trim(), password);
      setTimeout(async () => {
        if (wifiStatus === "connected") {
          await checkSameNetwork();
        }
      }, 2000);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to send Wi-Fi configuration";
      Alert.alert("Configuration Error", message);
    }
  }, [ssid, password, sendWifiConfig, wifiStatus, checkSameNetwork]);

  /**
   * Disconnect from device
   */
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      setSelectedDevice(null);
      setSsid("");
      setPassword("");
      setShowWifiConfig(false);
      setIsOnSameNetwork(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect";
      Alert.alert("Disconnect Error", message);
    }
  }, [disconnect]);

  const handleManualConnect = useCallback(async () => {
    const formatted = formatBaseUrl(manualIpInput);
    if (!formatted) {
      setManualConnectError("Enter a valid IP address or URL.");
      return;
    }

    setManualConnectError(null);
    setIsManualConnecting(true);

    try {
      setBaseUrl(formatted);
      await refreshStatus();
      setIsManualModalVisible(false);
      router.replace("/wifi");
    } catch (error) {
      setManualConnectError(
        error instanceof Error
          ? error.message
          : "Failed to reach the robot. Double-check the IP and try again."
      );
    } finally {
      setIsManualConnecting(false);
    }
  }, [manualIpInput, refreshStatus, router, setBaseUrl]);

  // Refresh phone network on mount (only once)
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await refreshPhoneNetwork();
      } catch (error) {
        if (mounted) {
          console.warn("Failed to refresh phone network on mount:", error);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshPhoneNetwork]);

  const getStatusText = (): string => {
    switch (wifiStatus) {
      case "idle":
        return "Idle";
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
      case "failed":
        return "Failed";
      default:
        return "Unknown";
    }
  };

  const getStatusColor = (): string => {
    switch (wifiStatus) {
      case "idle":
        return "#67686C";
      case "connecting":
        return "#FBBF24";
      case "connected":
        return "#1DD1A1";
      case "failed":
        return "#F87171";
      default:
        return "#67686C";
    }
  };

  const bluetoothStatus = useMemo(() => {
    if (error) {
      return { label: "Error", color: "#F87171" };
    }
    if (isConnecting) {
      return { label: "Connecting", color: "#FBBF24" };
    }
    if (isConnected) {
      return { label: "Connected", color: "#1DD1A1" };
    }
    return { label: "ON", color: "#5CC8FF" };
  }, [error, isConnecting, isConnected]);

  const wifiConnectionStatus = useMemo(() => {
    if (status?.network?.ip) {
      return { label: "Connected", color: "#1DD1A1" };
    }
    if (statusError) {
      return { label: "Offline", color: "#F87171" };
    }
    return { label: "Pending", color: "#FBBF24" };
  }, [status?.network?.ip, statusError]);

  const previousNetworks = useMemo(() => {
    const seen = new Set<string>();
    const candidates = [
      status?.network?.wifiSsid,
      status?.network?.ssid,
      status?.health?.network?.wifiSsid,
      status?.health?.network?.ssid,
    ];
    for (const candidate of candidates) {
      if (candidate && candidate.trim()) {
        seen.add(candidate.trim());
      }
    }
    return Array.from(seen);
  }, [status]);

  const overlayVisible =
    isConnecting ||
    isManualConnecting ||
    isRobotConnecting ||
    isCheckingNetwork ||
    isSendingConfig;

  const overlayMessage = (() => {
    if (isManualConnecting) {
      return "Establishing connection to your robot";
    }
    if (isRobotConnecting) {
      return "Refreshing robot status";
    }
    if (isSendingConfig) {
      return "Sending Wi-Fi credentials";
    }
    if (isCheckingNetwork) {
      return "Checking network connection";
    }
    return "Connecting to device";
  })();

  const wifiNetworkName =
    status?.network?.wifiSsid ||
    status?.network?.ssid ||
    status?.health?.network?.wifiSsid ||
    status?.health?.network?.ssid ||
    "Unknown network";

  const wifiIpAddress = status?.network?.ip || "Unavailable";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Connect to a robot
            </ThemedText>
          </View>

          {error ? (
            <ThemedView style={styles.errorCard}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </ThemedView>
          ) : null}

          {statusError ? (
            <ThemedView style={styles.errorCard}>
              <ThemedText style={styles.errorText}>{statusError}</ThemedText>
            </ThemedView>
          ) : null}

          <ThemedView style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <ThemedText style={styles.sectionTitle}>Bluetooth</ThemedText>
              </View>
              <StatusPill
                color={bluetoothStatus.color}
                label={bluetoothStatus.label}
              />
            </View>

            <View style={styles.blockHeader}>
              <ThemedText style={styles.blockTitle}>Nearby devices</ThemedText>
              {isScanning ? (
                <View style={styles.inlineStatus}>
                  <ActivityIndicator size="small" color="#1DD1A1" />
                  <ThemedText style={styles.statusLabelText}>
                    Scanning for devices...
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <View style={styles.deviceList}>
              {devices.length === 0 && !isScanning ? (
                <ThemedText style={styles.emptyStateText}>
                  {isConnected
                    ? "Connected to a robot. Disconnect to scan again."
                    : "No nearby robots detected yet."}
                </ThemedText>
              ) : (
                devices.map((device) => (
                  <Pressable
                    key={device.id}
                    style={[
                      styles.deviceItem,
                      selectedDevice?.id === device.id && styles.deviceSelected,
                    ]}
                    onPress={() => handleConnect(device)}
                    disabled={isConnecting}
                  >
                    <View>
                      <ThemedText style={styles.deviceName}>
                        {device.name || "ROVY"}
                      </ThemedText>
                      <ThemedText style={styles.deviceId}>{device.id}</ThemedText>
                    </View>
                    {selectedDevice?.id === device.id && isConnected ? (
                      <ThemedText style={styles.connectedBadge}>
                        Connected
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ))
              )}
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                (isScanning || isConnecting) && styles.disabledPrimary,
              ]}
              onPress={handleScan}
              disabled={isScanning || isConnecting}
            >
              {isScanning ? (
                <ActivityIndicator color="#04110B" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>
                  Scan for ROVY
                </ThemedText>
              )}
            </Pressable>

            {isConnected ? (
              <Pressable
                style={[styles.secondaryButton, styles.outlineButton]}
                onPress={handleDisconnect}
                disabled={isSendingConfig}
              >
                <ThemedText style={styles.outlineButtonText}>
                  Disconnect
                </ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>

          {/* <ThemedView style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <ThemedText style={styles.sectionTitle}>Wi-Fi</ThemedText>
                <ThemedText style={styles.sectionHint}>
                  Make sure the robot joins the same Wi-Fi network as your phone.
                </ThemedText>
              </View>
              <StatusPill
                color={wifiConnectionStatus.color}
                label={wifiConnectionStatus.label}
              />
            </View>

            <View style={styles.statusBoard}>
              <View style={styles.statusRow}>
                <ThemedText style={styles.statusLabel}>Wi-Fi connection</ThemedText>
                <View style={styles.statusValueRow}>
                  <View
                    style={[
                      styles.statusIndicator,
                      { backgroundColor: wifiConnectionStatus.color },
                    ]}
                  />
                  <ThemedText style={styles.statusValue}>
                    {wifiConnectionStatus.label}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.statusRow}>
                <ThemedText style={styles.statusLabel}>Network name</ThemedText>
                <ThemedText style={styles.statusValue}>
                  {wifiNetworkName}
                </ThemedText>
              </View>
              <View style={styles.statusRow}>
                <ThemedText style={styles.statusLabel}>IP address</ThemedText>
                <ThemedText style={styles.statusValue}>{wifiIpAddress}</ThemedText>
              </View>
            </View>

            {isConnected && isOnSameNetwork === false && !showWifiConfig ? (
              <ThemedView style={styles.infoCard}>
                <ThemedText style={styles.infoText}>
                  The robot is not on the same Wi-Fi network. Send updated Wi-Fi
                  credentials below.
                </ThemedText>
              </ThemedView>
            ) : null}

            {previousNetworks.length ? (
              <View style={styles.blockHeader}>
                <ThemedText style={styles.blockTitle}>
                  Previously connected
                </ThemedText>
              </View>
            ) : null}

            {previousNetworks.map((network) => (
              <View key={network} style={styles.previousItem}>
                <View style={styles.previousDot} />
                <ThemedText style={styles.previousText}>{network}</ThemedText>
              </View>
            ))}

            {showWifiConfig ? (
              <View style={styles.form}>
                <ThemedText style={styles.label}>Network Name (SSID)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={ssid}
                  onChangeText={setSsid}
                  placeholder="Enter Wi-Fi network name"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSendingConfig}
                />

                <ThemedText style={styles.label}>Password</ThemedText>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter Wi-Fi password (optional)"
                  placeholderTextColor="#6B7280"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSendingConfig}
                />

                <Pressable
                  style={[
                    styles.primaryButton,
                    (isSendingConfig || !ssid.trim()) && styles.disabledPrimary,
                  ]}
                  onPress={handleSendConfig}
                  disabled={isSendingConfig || !ssid.trim()}
                >
                  {isSendingConfig ? (
                    <ActivityIndicator color="#04110B" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>
                      Connect Wi-Fi
                    </ThemedText>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.secondaryButton, styles.outlineButton]}
                  onPress={() => {
                    setShowWifiConfig(false);
                    setSsid("");
                    setPassword("");
                  }}
                >
                  <ThemedText style={styles.outlineButtonText}>Cancel</ThemedText>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  style={[
                    styles.primaryButton,
                    isRobotConnecting && styles.disabledPrimary,
                  ]}
                  onPress={handleNetworkConnect}
                  disabled={isRobotConnecting}
                >
                  {isRobotConnecting ? (
                    <ActivityIndicator color="#04110B" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>
                      Connect to Robot
                    </ThemedText>
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.secondaryButton,
                    (!isConnected || isSendingConfig) && styles.buttonDisabled,
                  ]}
                  onPress={handleChangeWifi}
                  disabled={!isConnected || isSendingConfig}
                >
                  <ThemedText style={styles.secondaryButtonText}>
                    Change Robot WiFi
                  </ThemedText>
                </Pressable>
              </>
            )}

            <View style={styles.provisionStatusRow}>
              <ThemedText style={styles.statusLabel}>
                Setup status ({selectedDevice?.name || "Bluetooth"})
              </ThemedText>
              <StatusPill
                color={getStatusColor()}
                label={getStatusText()}
              />
            </View>
          </ThemedView> */}

          <Pressable
            style={styles.connectIpButton}
            onPress={() => {
              setManualConnectError(null);
              setIsManualModalVisible(true);
            }}
          >
            <ThemedText style={styles.connectIpText}>
              Connect to a specific IP
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ScrollView>

      <Modal
        visible={isManualModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsManualModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalWrapper}
          >
            <ThemedView style={styles.modalCard}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                Connect to a specific IP
              </ThemedText>
              <ThemedText style={styles.modalHint}>
                Enter the robot’s IP address or base URL.
              </ThemedText>
              <TextInput
                style={styles.input}
                value={manualIpInput}
                onChangeText={(text) => {
                  setManualIpInput(text);
                  setManualIpEdited(true);
                  setManualConnectError(null);
                }}
                placeholder="10.0.0.5 or https://robot.local"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {manualConnectError ? (
                <ThemedText style={styles.errorText}>
                  {manualConnectError}
                </ThemedText>
              ) : null}
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.secondaryButton, styles.outlineButton]}
                  onPress={() => setIsManualModalVisible(false)}
                  disabled={isManualConnecting}
                >
                  <ThemedText style={styles.outlineButtonText}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryButton,
                    isManualConnecting && styles.disabledPrimary,
                  ]}
                  onPress={handleManualConnect}
                  disabled={isManualConnecting}
                >
                  {isManualConnecting ? (
                    <ActivityIndicator color="#04110B" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>Connect</ThemedText>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={overlayVisible} transparent animationType="fade">
        <View style={styles.overlayBackdrop}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color="#1DD1A1" />
            <ThemedText style={styles.overlayText}>{overlayMessage}</ThemedText>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#161616",
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
    backgroundColor: "#161616",
  },
  header: {
    gap: 12,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    color: "#67686C",
  },
  errorCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#F87171",
    backgroundColor: "#1F1A1A",
  },
  errorText: {
    color: "#F87171",
  },
  sectionCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "#1C1C1C",
    gap: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "JetBrainsMono_600SemiBold",
    color: "#F9FAFB",
  },
  sectionHint: {
    color: "#67686C",
    marginTop: 4,
    fontSize: 14,
  },
  blockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockTitle: {
    fontSize: 14,
    color: "#D1D5DB",
    fontFamily: "JetBrainsMono_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inlineStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deviceList: {
    gap: 12,
  },
  deviceItem: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "#1B1B1B",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deviceSelected: {
    borderColor: "#1DD1A1",
  },
  deviceName: {
    color: "#F9FAFB",
    fontSize: 16,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  deviceId: {
    color: "#6B7280",
    fontSize: 12,
  },
  connectedBadge: {
    color: "#1DD1A1",
    fontFamily: "JetBrainsMono_600SemiBold",
    fontSize: 14,
  },
  emptyStateText: {
    color: "#67686C",
    fontStyle: "italic",
  },
  primaryButton: {
    backgroundColor: "#1DD1A1",
    paddingVertical: 12,
    paddingInline: 16,
    alignItems: "center",
  },
  disabledPrimary: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#04110B",
    fontFamily: "JetBrainsMono_600SemiBold",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingInline: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#E5E7EB",
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "transparent",
  },
  outlineButtonText: {
    color: "#E5E7EB",
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  statusBoard: {
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "#1B1B1B",
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusLabel: {
    color: "#67686C",
    fontSize: 14,
  },
  statusValue: {
    color: "#F9FAFB",
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  statusValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
  },
  infoCard: {
    padding: 16,

    backgroundColor: "#202020",
  },
  infoText: {
    color: "#E5E7EB",
    fontSize: 14,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    color: "#D1D5DB",
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  input: {
    backgroundColor: "#1C1C1C",
    borderWidth: 1,
    borderColor: "#202020",

    padding: 16,
    color: "#F9FAFB",
    fontSize: 16,
    fontFamily: "monospace",
  },
  statusLabelText: {
    color: "#D1D5DB",
    fontSize: 12,
  },
  previousItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previousDot: {
    width: 6,
    height: 6,
    backgroundColor: "#4B5563",
  },
  previousText: {
    color: "#D1D5DB",
  },
  provisionStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  connectIpButton: {
    borderWidth: 1,
    borderColor: "#202020",
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#1B1B1B",
  },
  connectIpText: {
    color: "#E5E7EB",
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#202020",
  },
  statusDot: {
    width: 8,
    height: 8,
  },
  statusPillText: {
    color: "#F9FAFB",
    fontSize: 12,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalWrapper: {
    width: "100%",
  },
  modalCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "#161616",
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    color: "#F9FAFB",
  },
  modalHint: {
    color: "#67686C",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayCard: {
    padding: 24,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#202020",
    alignItems: "center",
    gap: 16,
  },
  overlayText: {
    color: "#F9FAFB",
    fontSize: 16,
    textAlign: "center",
  },
});
