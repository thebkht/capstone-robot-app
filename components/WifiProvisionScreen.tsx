import React, { useCallback, useState } from "react";
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
import { useRovyBle } from "@/hooks/use-rovy-ble";
import type { RovyDevice } from "@/services/rovy-ble";

/**
 * Wi-Fi Provision Screen Component
 * Example UI for configuring ROVY robot Wi-Fi via BLE
 *
 * Flow:
 * 1. Scan for ROVY devices
 * 2. Select a device to connect
 * 3. Enter SSID and password
 * 4. Send configuration and monitor status
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

  const [devices, setDevices] = useState<RovyDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<RovyDevice | null>(
    null
  );
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");

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
   * Step 2: Connect to selected device
   */
  const handleConnect = useCallback(
    async (device: RovyDevice) => {
      try {
        setSelectedDevice(device);
        await connectToRovy(device.id);
        // Connection successful - status updates will come via notifications
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect to device";
        Alert.alert("Connection Error", message);
        setSelectedDevice(null);
      }
    },
    [connectToRovy]
  );

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
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to send Wi-Fi configuration";
      Alert.alert("Configuration Error", message);
    }
  }, [ssid, password, sendWifiConfig]);

  /**
   * Disconnect from device
   */
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      setSelectedDevice(null);
      setSsid("");
      setPassword("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect";
      Alert.alert("Disconnect Error", message);
    }
  }, [disconnect]);

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
              Step 1: Scan for ROVY
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
                    <ThemedText style={styles.deviceName}>{device.name}</ThemedText>
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
              <ThemedText style={styles.statusText}>Connecting...</ThemedText>
            </ThemedView>
          )}

          {/* Step 2: Wi-Fi Configuration Form */}
          {isConnected && (
            <ThemedView style={styles.section}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Step 2: Configure Wi-Fi
              </ThemedText>

              <ThemedView style={styles.form}>
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
});

