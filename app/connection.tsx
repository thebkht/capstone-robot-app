import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';
import type { RobotConnectionState } from '@/services/robot-api';

const ROBOT_ART = require('../assets/images/partial-react-logo.png');

interface DiscoveredDevice {
  id: string;
  name?: string | null;
  rssi?: number | null;
}

const getSignalStrength = (rssi?: number | null) => {
  if (typeof rssi !== 'number') {
    return null;
  }

  if (rssi >= -60) {
    return 'Strong';
  }

  if (rssi >= -75) {
    return 'Medium';
  }

  return 'Low';
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
    <ThemedText style={styles.statusLabel}>{label}</ThemedText>
  </View>
);

export default function ConnectionScreen() {
  const {
    api,
    baseUrl,
    setBaseUrl,
    refreshStatus,
    status,
    bluetoothEnabled,
    bluetoothSupported,
    setBluetoothEnabled,
  } = useRobot();
  const router = useRouter();
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [connectionState, setConnectionState] = useState<RobotConnectionState>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showManualIpModal, setShowManualIpModal] = useState(false);
  const [manualUrl, setManualUrl] = useState(baseUrl);

  useEffect(() => {
    setManualUrl(baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (connectionState === 'connected' || status?.network?.ip) {
      setShowWifiModal(false);
      router.replace('/(tabs)/camera');
    }
  }, [connectionState, router, status?.network?.ip]);

  const wifiConnected = Boolean(status?.network?.ip);

  const availableNetworks = useMemo(() => {
    const networkInfo = status?.network as { availableNetworks?: string[] } | undefined;
    return networkInfo?.availableNetworks ?? [];
  }, [status?.network]);

  const handleConnect = useCallback(async () => {
    if (!ssid) {
      Alert.alert('Wi-Fi credentials', 'Please enter the network SSID.');
      return;
    }

    setConnectionState('connecting');
    setLastError(null);

    try {
      await api.connectWifi({ ssid, password });
      await refreshStatus();
      setConnectionState('connected');
    } catch (error) {
      setConnectionState('error');
      setLastError((error as Error).message);
    }
  }, [api, password, refreshStatus, ssid]);

  const handlePing = useCallback(async () => {
    setIsPinging(true);
    try {
      const data = await api.ping();
      Alert.alert('Robot reachable', JSON.stringify(data, null, 2));
    } catch (error) {
      Alert.alert('Ping failed', (error as Error).message);
    } finally {
      setIsPinging(false);
    }
  }, [api]);

  const connectionDescription = useMemo(() => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting to Wi-Fi…';
      case 'connected':
        return 'Connected. Robot status will refresh automatically.';
      case 'error':
        return lastError ?? 'An unknown error occurred.';
      default:
        return 'Update the robot Wi-Fi credentials to join your network.';
    }
  }, [connectionState, lastError]);

  const handleScan = useCallback(() => {
    if (!bluetoothSupported) {
      Alert.alert(
        'Bluetooth unavailable',
        'Install react-native-ble-plx and rebuild the app to enable Bluetooth discovery.',
      );
      return;
    }

    if (!bluetoothEnabled) {
      Alert.alert('Bluetooth disabled', 'Enable Bluetooth in Settings to scan for nearby robots.');
      return;
    }

    setDevices([]);
    setIsScanning(true);

    const simulatedDevices: DiscoveredDevice[] = [
      { id: 'mock-robot-1', name: 'Mock Robot (install BLE package)', rssi: -82 },
    ];

    setTimeout(() => {
      setDevices(simulatedDevices);
      setIsScanning(false);
    }, 800);
  }, [bluetoothEnabled, bluetoothSupported]);

  const handleToggleBluetooth = useCallback(() => {
    if (!bluetoothSupported) {
      Alert.alert(
        'Bluetooth unavailable',
        'Install react-native-ble-plx and rebuild the app to enable Bluetooth discovery.',
      );
      return;
    }

    setBluetoothEnabled(!bluetoothEnabled);
  }, [bluetoothEnabled, bluetoothSupported, setBluetoothEnabled]);

  const bluetoothStatus = useMemo(() => {
    if (!bluetoothSupported) {
      return { color: '#f97316', label: 'Unavailable' };
    }

    return bluetoothEnabled
      ? { color: '#22c55e', label: 'ON' }
      : { color: '#ef4444', label: 'OFF' };
  }, [bluetoothEnabled, bluetoothSupported]);

  const wifiStatus = useMemo(() => {
    if (connectionState === 'error') {
      return { color: '#ef4444', label: 'Error' };
    }

    return wifiConnected
      ? { color: '#22c55e', label: 'Connected' }
      : { color: '#f97316', label: 'Offline' };
  }, [connectionState, wifiConnected]);

  const handleSaveManualUrl = useCallback(() => {
    if (!manualUrl.trim()) {
      Alert.alert('Base URL', 'Please enter a valid robot URL.');
      return;
    }

    setBaseUrl(manualUrl.trim());
    setShowManualIpModal(false);
  }, [manualUrl, setBaseUrl]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText type="title">Connect to a robot</ThemedText>
          <ThemedText style={styles.helperText}>
            Manage Bluetooth discovery, Wi-Fi credentials, and manual IP configuration from a single place.
          </ThemedText>
        </View>

        <ThemedView style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <ThemedText style={styles.cardTitle} type="subtitle">
                Bluetooth
              </ThemedText>
              <ThemedText style={styles.cardSubtitle}>
                {bluetoothSupported
                  ? 'Discover nearby robots broadcasting over BLE.'
                  : 'Optional Bluetooth support is not installed.'}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle Bluetooth discovery"
              onPress={handleToggleBluetooth}
            >
              <StatusPill color={bluetoothStatus.color} label={`Bluetooth ${bluetoothStatus.label}`} />
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>Nearby devices</ThemedText>
            <Pressable
              style={styles.iconButton}
              onPress={handleScan}
              disabled={isScanning || !bluetoothSupported}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons
                  name="refresh"
                  size={18}
                  color={bluetoothSupported ? '#ffffff' : 'rgba(255,255,255,0.4)'}
                />
              )}
            </Pressable>
          </View>

          <View style={styles.deviceList}>
            {devices.length === 0 ? (
              <ThemedText style={styles.placeholderText}>
                {bluetoothSupported
                  ? 'Tap the refresh icon to look for nearby robots.'
                  : 'Enable Bluetooth support to discover robots.'}
              </ThemedText>
            ) : (
              devices.map((device) => {
                const signalStrength = getSignalStrength(device.rssi);
                return (
                  <Pressable key={device.id} style={styles.deviceItem}>
                    <View style={styles.deviceDetails}>
                      <ThemedText style={styles.deviceName} type="defaultSemiBold">
                        {device.name ?? 'Unnamed device'}
                      </ThemedText>
                      <ThemedText style={styles.deviceId}>{device.id}</ThemedText>
                    </View>
                    {signalStrength ? (
                      <View style={styles.signalBadge}>
                        <ThemedText style={styles.signalBadgeText}>{signalStrength}</ThemedText>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle} type="subtitle">
            Robot Wi-Fi Status
          </ThemedText>

          <View style={styles.metaRow}>
            <ThemedText style={styles.metaLabel}>Wi-Fi Connection</ThemedText>
            <StatusPill color={wifiStatus.color} label={wifiStatus.label} />
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaLabel}>Network Name</ThemedText>
            <ThemedText style={styles.metaValue}>
              {status?.network?.wifiSsid ?? 'Not connected'}
            </ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaLabel}>IP Address</ThemedText>
            <ThemedText style={styles.metaValue}>
              {status?.network?.ip ?? '—'}
            </ThemedText>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>Available networks</ThemedText>
            <Pressable style={styles.iconButton} onPress={refreshStatus}>
              <Ionicons name="refresh" size={18} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.networkList}>
            {availableNetworks.length === 0 ? (
              <ThemedText style={styles.placeholderText}>
                No networks discovered yet.
              </ThemedText>
            ) : (
              availableNetworks.map((network) => (
                <View key={network} style={styles.networkRow}>
                  <ThemedText style={styles.networkName}>{network}</ThemedText>
                </View>
              ))
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.primaryAction]}
              onPress={handlePing}
              disabled={isPinging}
            >
              {isPinging ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <ThemedText style={styles.primaryActionText}>Connect to Robot</ThemedText>
              )}
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.secondaryAction]}
              onPress={() => setShowWifiModal(true)}
            >
              <ThemedText style={styles.secondaryActionText}>Change Robot Wi-Fi</ThemedText>
            </Pressable>
          </View>

          <ThemedText style={styles.helperText}>{connectionDescription}</ThemedText>
          {lastError ? <ThemedText style={styles.errorText}>{lastError}</ThemedText> : null}
        </ThemedView>

        <Pressable
          style={styles.outlineButton}
          onPress={() => setShowManualIpModal(true)}
        >
          <ThemedText style={styles.outlineButtonText}>Connect to a specific IP</ThemedText>
        </Pressable>

        <Image source={ROBOT_ART} style={styles.footerArt} contentFit="contain" />
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={showWifiModal}
        onRequestClose={() => setShowWifiModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle} type="subtitle">
              Update Wi-Fi Credentials
            </ThemedText>
            <ThemedText style={styles.modalDescription}>
              Provide the Wi-Fi network name and password the robot should join.
            </ThemedText>

            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>SSID</ThemedText>
              <TextInput
                value={ssid}
                onChangeText={setSsid}
                placeholder="Robot Wi-Fi network"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>Password</ThemedText>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Network password"
                placeholderTextColor="rgba(255,255,255,0.4)"
                secureTextEntry
                style={styles.input}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalSecondaryButton]}
                onPress={() => setShowWifiModal(false)}
              >
                <ThemedText style={styles.secondaryActionText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalPrimaryButton]}
                onPress={handleConnect}
              >
                {connectionState === 'connecting' ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <ThemedText style={styles.primaryActionText}>Save &amp; Connect</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showManualIpModal}
        onRequestClose={() => setShowManualIpModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle} type="subtitle">
              Connect to a specific IP
            </ThemedText>
            <ThemedText style={styles.modalDescription}>
              Enter the robot&apos;s base URL or IP address to connect directly.
            </ThemedText>

            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>Robot URL</ThemedText>
              <TextInput
                value={manualUrl}
                onChangeText={setManualUrl}
                placeholder="http://10.0.0.10:8000"
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalSecondaryButton]}
                onPress={() => setShowManualIpModal(false)}
              >
                <ThemedText style={styles.secondaryActionText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalPrimaryButton]}
                onPress={handleSaveManualUrl}
              >
                <ThemedText style={styles.primaryActionText}>Save</ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  helperText: {
    opacity: 0.8,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    marginBottom: 4,
  },
  cardSubtitle: {
    opacity: 0.7,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  deviceList: {
    gap: 12,
  },
  deviceItem: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  deviceDetails: {
    flex: 1,
    gap: 4,
  },
  deviceName: {
    fontSize: 16,
  },
  deviceId: {
    opacity: 0.6,
    fontSize: 12,
  },
  signalBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(34,197,94,0.16)',
  },
  signalBadgeText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
  },
  placeholderText: {
    opacity: 0.6,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  metaLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 16,
    opacity: 0.8,
  },
  networkList: {
    gap: 8,
  },
  networkRow: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  networkName: {
    fontSize: 15,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    backgroundColor: '#38bdf8',
  },
  secondaryAction: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  primaryActionText: {
    fontWeight: '600',
    color: '#0f172a',
  },
  secondaryActionText: {
    fontWeight: '600',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
  },
  outlineButton: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerArt: {
    width: '100%',
    height: 160,
    marginTop: 12,
    opacity: 0.8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 24,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: 'rgba(15,15,15,0.96)',
    gap: 16,
  },
  modalTitle: {
    marginBottom: -4,
  },
  modalDescription: {
    opacity: 0.7,
    fontSize: 14,
    lineHeight: 20,
  },
  formRow: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(12,12,12,0.8)',
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButton: {
    backgroundColor: '#38bdf8',
  },
  modalSecondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
