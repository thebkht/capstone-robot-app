import * as Network from "expo-network";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useRobot } from "@/context/robot-provider";
import { useRovyBle } from "@/hooks/use-rovy-ble";
import type { RovyDevice } from "@/services/rovy-ble";

/**
 * Wi-Fi Provision Screen Component
 * Example UI for configuring ROVY robot Wi-Fi via BLE
 *
 * Flow:
 * 1. Scan for ROVY devices
 * 2. Press on robot to connect via Bluetooth
 * 3. Check if robot is on same network as phone
 * 4. If yes: Show "Connect" button
 * 5. If no: Show "Change Robot WiFi" to configure Wi-Fi
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

  const { refreshStatus } = useRobot();

  const [devices, setDevices] = useState<RovyDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<RovyDevice | null>(
    null
  );
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showWifiConfig, setShowWifiConfig] = useState(false);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [isOnSameNetwork, setIsOnSameNetwork] = useState<boolean | null>(null);
  const isCheckingNetworkRef = useRef(false);
  const refreshStatusRef = useRef(refreshStatus);

  // Keep ref updated
  useEffect(() => {
    refreshStatusRef.current = refreshStatus;
  }, [refreshStatus]);

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
      let ssid: string | null = null;
      if (networkState.type === "WIFI") {
        // SSID might not be available without additional permissions
        // This is okay - we'll check network connectivity instead
      }

      // Network info retrieved (stored for potential future use)
      console.log("Phone network:", { ssid, ipAddress: resolvedIp });
    } catch (error) {
      console.warn("Failed to get phone network info:", error);
    }
  }, []);

  /**
   * Check if robot is on the same network as phone
   */
  const checkSameNetwork = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (isCheckingNetworkRef.current) {
      return;
    }

    isCheckingNetworkRef.current = true;
    setIsCheckingNetwork(true);
    setIsOnSameNetwork(null);

    try {
      // Try to refresh robot status via network API
      // If this succeeds, the robot is reachable on the network
      // Use ref to avoid dependency on refreshStatus changing
      await refreshStatusRef.current();

      // Give a small delay for status to update, then check
      setTimeout(() => {
        // If refreshStatus succeeded without throwing, robot is reachable
        setIsOnSameNetwork(true);
        setShowWifiConfig(false);
        setIsCheckingNetwork(false);
        isCheckingNetworkRef.current = false;
      }, 500);
    } catch (error) {
      // Robot not reachable via network
      console.log("Robot not on same network:", error);
      setIsOnSameNetwork(false);
      setIsCheckingNetwork(false);
      isCheckingNetworkRef.current = false;
    }
  }, []); // No dependencies - uses ref

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
        // After BLE connection, check if robot is on same network
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
      // Refresh status to ensure we have latest info
      await refreshStatus();
      // Navigation or connection handling would happen here
      // For now, just show success
      Alert.alert(
        "Connected",
        "Robot is connected on the same network. You can now control it."
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to robot";
      Alert.alert("Connection Error", message);
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
      // Status updates will come via notifications
      // After successful connection, check network again
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  /**
   * Get status display text
   */
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

  /**
   * Get status color
   */
  const getStatusColor = (): string => {
    switch (wifiStatus) {
      case "idle":
        return "#9CA3AF";
      case "connecting":
        return "#FBBF24";
      case "connected":
        return "#1DD1A1";
      case "failed":
        return "#F87171";
      default:
        return "#9CA3AF";
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.title}>
            ROVY Wi-Fi Setup
          </ThemedText>

          {/* Error Display */}
          {error && (
            <ThemedView style={styles.errorCard}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </ThemedView>
          )}

          {/* Step 1: Scan for Devices */}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Scan for ROVY
            </ThemedText>
            <Pressable
              style={[
                styles.button,
                styles.primaryButton,
                (isScanning || isConnecting) && styles.buttonDisabled,
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

            {/* Device List */}
            {devices.length > 0 && (
              <ThemedView style={styles.deviceList}>
                {devices.map((device) => (
                  <Pressable
                    key={device.id}
                    style={[
                      styles.deviceItem,
                      selectedDevice?.id === device.id &&
                      styles.deviceItemSelected,
                    ]}
                    onPress={() => handleConnect(device)}
                    disabled={isConnecting || isConnected}
                  >
                    <ThemedText style={styles.deviceName}>
                      {device.name}
                    </ThemedText>
                    <ThemedText style={styles.deviceId}>{device.id}</ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            )}
          </ThemedView>

          {/* Connection Status */}
          {isConnecting && (
            <ThemedView style={styles.statusCard}>
              <ActivityIndicator size="small" color="#1DD1A1" />
              <ThemedText style={styles.statusText}>
                Connecting via Bluetooth...
              </ThemedText>
            </ThemedView>
          )}

          {/* Checking Network Status */}
          {isConnected && isCheckingNetwork && (
            <ThemedView style={styles.statusCard}>
              <ActivityIndicator size="small" color="#FBBF24" />
              <ThemedText style={styles.statusText}>
                Checking network connection...
              </ThemedText>
            </ThemedView>
          )}

          {/* Connected - Same Network */}
          {isConnected &&
            !isCheckingNetwork &&
            isOnSameNetwork === true &&
            !showWifiConfig && (
              <ThemedView style={styles.section}>
                <ThemedView style={styles.successCard}>
                  <ThemedText style={styles.successText}>
                    ✓ Robot is on the same network as your phone
                  </ThemedText>
                </ThemedView>
                <Pressable
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleNetworkConnect}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    Connect
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.secondaryButton]}
                  onPress={handleChangeWifi}
                >
                  <ThemedText style={styles.secondaryButtonText}>
                    Change Robot WiFi
                  </ThemedText>
                </Pressable>
              </ThemedView>
            )}

          {/* Connected - Different Network or Change WiFi Selected */}
          {isConnected &&
            !isCheckingNetwork &&
            (isOnSameNetwork === false || showWifiConfig) && (
              <ThemedView style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  {showWifiConfig
                    ? "Change Robot WiFi"
                    : "Robot is not on the same network"}
                </ThemedText>

                {!showWifiConfig && (
                  <ThemedView style={styles.infoCard}>
                    <ThemedText style={styles.infoText}>
                      The robot is not on the same network as your phone. Configure
                      it to connect to your Wi-Fi network.
                    </ThemedText>
                  </ThemedView>
                )}

                {showWifiConfig && (
                  <ThemedView style={styles.form}>
                    <ThemedText style={styles.label}>
                      Network Name (SSID)
                    </ThemedText>
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
                        styles.button,
                        styles.primaryButton,
                        isSendingConfig && styles.buttonDisabled,
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
                  </ThemedView>
                )}

                {!showWifiConfig && (
                  <Pressable
                    style={[styles.button, styles.primaryButton]}
                    onPress={handleChangeWifi}
                  >
                    <ThemedText style={styles.primaryButtonText}>
                      Change Robot WiFi
                    </ThemedText>
                  </Pressable>
                )}
              </ThemedView>
            )}

          {/* Wi-Fi Status Display */}
          {isConnected && (
            <ThemedView style={styles.statusCard}>
              <ThemedText style={styles.statusLabel}>Wi-Fi Status:</ThemedText>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusIndicator,
                    { backgroundColor: getStatusColor() },
                  ]}
                />
                <ThemedText style={styles.statusText}>
                  {getStatusText()}
                </ThemedText>
              </View>
            </ThemedView>
          )}

          {/* Disconnect Button */}
          {isConnected && (
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={handleDisconnect}
              disabled={isSendingConfig}
            >
              <ThemedText style={styles.secondaryButtonText}>
                Disconnect
              </ThemedText>
            </Pressable>
          )}
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
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryButton: {
    backgroundColor: "#1DD1A1",
  },
  primaryButtonText: {
    color: "#04110B",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0A0A0B",
  },
  secondaryButtonText: {
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deviceList: {
    gap: 12,
    marginTop: 12,
  },
  deviceItem: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    backgroundColor: "#0F0F10",
  },
  deviceItemSelected: {
    borderColor: "#1DD1A1",
    backgroundColor: "#0A1F18",
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F9FAFB",
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "monospace",
  },
  form: {
    gap: 16,
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D1D5DB",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#0F0F10",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    padding: 16,
    color: "#F9FAFB",
    fontSize: 16,
    fontFamily: "monospace",
  },
  statusCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    backgroundColor: "#0F0F10",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#F9FAFB",
  },
  errorCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#F87171",
    borderRadius: 8,
    backgroundColor: "#1F1A1A",
  },
  errorText: {
    color: "#F87171",
    fontSize: 14,
  },
  successCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#1DD1A1",
    borderRadius: 8,
    backgroundColor: "#0A1F18",
    marginBottom: 16,
  },
  successText: {
    color: "#1DD1A1",
    fontSize: 14,
    fontWeight: "500",
  },
  infoCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    backgroundColor: "#0F0F10",
    marginBottom: 16,
  },
  infoText: {
    color: "#D1D5DB",
    fontSize: 14,
  },
});

