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
      return { color: '#fb923c', label: 'Unavailable' };
    }

    return bluetoothEnabled
      ? { color: '#22d3ee', label: 'ON' }
      : { color: '#f472b6', label: 'OFF' };
  }, [bluetoothEnabled, bluetoothSupported]);

  const wifiStatus = useMemo(() => {
    if (connectionState === 'error') {
      return { color: '#f87171', label: 'Error' };
    }

    return wifiConnected
      ? { color: '#34d399', label: 'Connected' }
      : { color: '#facc15', label: 'Offline' };
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
    <View style={styles.gradient}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroAccent} />
            <View style={styles.heroHeader}>
              <View style={styles.heroHeading}>
                <ThemedText style={styles.heroEyebrow}>Robot Control</ThemedText>
                <ThemedText style={styles.heroTitle} type="title">
                  Connection Control Center
                </ThemedText>
              </View>
              <StatusPill color={wifiStatus.color} label={wifiStatus.label} />
            </View>
            <ThemedText style={styles.heroSubtitle}>
              Pair the robot over Wi-Fi or Bluetooth with a crisp interface inspired by the reference mockup.
            </ThemedText>
            <View style={styles.heroMeta}>
              <View style={styles.heroMetaItem}>
                <ThemedText style={styles.heroMetaLabel}>Current SSID</ThemedText>
                <ThemedText style={styles.heroMetaValue}>
                  {status?.network?.wifiSsid ?? 'Not connected'}
                </ThemedText>
              </View>
              <View style={styles.heroMetaDivider} />
              <View style={styles.heroMetaItem}>
                <ThemedText style={styles.heroMetaLabel}>IP Address</ThemedText>
                <ThemedText style={styles.heroMetaValue}>
                  {status?.network?.ip ?? '—'}
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <View style={styles.cardHeader}>
              <View>
                <ThemedText style={styles.cardTitle} type="subtitle">
                  Bluetooth Discovery
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
                style={({ pressed }) => [pressed && styles.pressablePressed]}
              >
                <StatusPill color={bluetoothStatus.color} label={`Bluetooth ${bluetoothStatus.label}`} />
              </Pressable>
            </View>

            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionLabel}>Nearby devices</ThemedText>
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  (isScanning || !bluetoothSupported) && styles.iconButtonDisabled,
                  pressed && styles.pressablePressed,
                ]}
                onPress={handleScan}
                disabled={isScanning || !bluetoothSupported}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color="#0f172a" />
                ) : (
                  <Ionicons
                    name="refresh"
                    size={18}
                    color={bluetoothSupported ? '#041021' : 'rgba(4,16,33,0.4)'}
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
                    <Pressable
                      key={device.id}
                      style={({ pressed }) => [styles.deviceItem, pressed && styles.pressablePressed]}
                    >
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
          </View>

          <View style={styles.card}>
            <View style={styles.cardAccent} />
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
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressablePressed]}
                onPress={refreshStatus}
              >
                <Ionicons name="refresh" size={18} color="#041021" />
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
              <View style={[styles.actionButton, styles.primaryAction]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryActionPressable,
                    pressed && styles.pressablePressed,
                    isPinging && styles.pressableDisabled,
                  ]}
                  onPress={handlePing}
                  disabled={isPinging}
                >
                  {isPinging ? (
                    <ActivityIndicator color="#020617" />
                  ) : (
                    <ThemedText style={styles.primaryActionText}>Test Robot Link</ThemedText>
                  )}
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.secondaryAction,
                  pressed && styles.pressablePressed,
                ]}
                onPress={() => setShowWifiModal(true)}
              >
                <ThemedText style={styles.secondaryActionText}>Update Credentials</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={styles.helperText}>{connectionDescription}</ThemedText>
            {lastError ? <ThemedText style={styles.errorText}>{lastError}</ThemedText> : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressablePressed]}
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
                  placeholderTextColor="rgba(226,232,240,0.35)"
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
                  placeholderTextColor="rgba(226,232,240,0.35)"
                  secureTextEntry
                  style={styles.input}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalSecondaryButton,
                    pressed && styles.pressablePressed,
                  ]}
                  onPress={() => setShowWifiModal(false)}
                >
                  <ThemedText style={styles.secondaryActionText}>Cancel</ThemedText>
                </Pressable>
                <View style={[styles.modalButton, styles.modalPrimaryButton]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryActionPressable,
                      pressed && styles.pressablePressed,
                      connectionState === 'connecting' && styles.pressableDisabled,
                    ]}
                    onPress={handleConnect}
                    disabled={connectionState === 'connecting'}
                  >
                    {connectionState === 'connecting' ? (
                      <ActivityIndicator color="#020617" />
                    ) : (
                      <ThemedText style={styles.primaryActionText}>Save &amp; Connect</ThemedText>
                    )}
                  </Pressable>
                </View>
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
                  placeholderTextColor="rgba(226,232,240,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalSecondaryButton,
                    pressed && styles.pressablePressed,
                  ]}
                  onPress={() => setShowManualIpModal(false)}
                >
                  <ThemedText style={styles.secondaryActionText}>Cancel</ThemedText>
                </Pressable>
                <View style={[styles.modalButton, styles.modalPrimaryButton]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryActionPressable,
                      pressed && styles.pressablePressed,
                    ]}
                    onPress={handleSaveManualUrl}
                  >
                    <ThemedText style={styles.primaryActionText}>Save</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    padding: 28,
    paddingBottom: 120,
    gap: 28,
  },
  helperText: {
    opacity: 0.8,
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    borderRadius: 30,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
    backgroundColor: 'rgba(1,8,20,0.92)',
    gap: 20,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 48,
    elevation: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  heroAccent: {
    position: 'absolute',
    width: '160%',
    height: '160%',
    top: -120,
    right: -80,
    backgroundColor: 'rgba(59,130,246,0.35)',
    opacity: 0.45,
    transform: [{ rotate: '28deg' }],
    zIndex: -1,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroHeading: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(148,163,184,0.85)',
  },
  heroTitle: {
    flex: 1,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(226,232,240,0.88)',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(8,47,73,0.55)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 20,
  },
  heroMetaItem: {
    flex: 1,
    gap: 4,
  },
  heroMetaLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(148,163,184,0.88)',
  },
  heroMetaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.96)',
  },
  heroMetaDivider: {
    width: StyleSheet.hairlineWidth,
    height: '100%',
    backgroundColor: 'rgba(148,163,184,0.25)',
  },
  card: {
    borderRadius: 26,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.16)',
    backgroundColor: 'rgba(1,8,20,0.9)',
    gap: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 40,
    elevation: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  cardAccent: {
    position: 'absolute',
    width: '120%',
    height: '120%',
    top: -80,
    right: -60,
    backgroundColor: 'rgba(56,189,248,0.18)',
    transform: [{ rotate: '20deg' }],
    zIndex: -1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardTitle: {
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(148,163,184,0.88)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(15,23,42,0.75)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.92)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(148,163,184,0.9)',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(125,211,252,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  deviceList: {
    gap: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: 'rgba(148,163,184,0.75)',
  },
  deviceItem: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    backgroundColor: 'rgba(8,25,48,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceDetails: {
    gap: 4,
  },
  deviceName: {
    fontSize: 15,
  },
  deviceId: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.75)',
  },
  signalBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(129,140,248,0.28)',
  },
  signalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.9)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.85)',
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.94)',
  },
  networkList: {
    gap: 10,
  },
  networkRow: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    backgroundColor: 'rgba(1,8,20,0.78)',
  },
  networkName: {
    fontSize: 15,
    color: 'rgba(226,232,240,0.92)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryAction: {
    borderWidth: 0,
    backgroundColor: '#4f46e5',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 32,
    elevation: 16,
  },
  primaryActionPressable: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  pressablePressed: {
    opacity: 0.85,
  },
  pressableDisabled: {
    opacity: 0.6,
  },
  primaryActionText: {
    fontWeight: '700',
    color: '#020617',
  },
  secondaryAction: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(8,25,48,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryActionText: {
    fontWeight: '600',
    color: 'rgba(226,232,240,0.9)',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
  },
  outlineButton: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(8,25,48,0.55)',
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.94)',
  },
  footerArt: {
    width: '100%',
    height: 160,
    marginTop: 8,
    opacity: 0.8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(1,2,6,0.82)',
    padding: 24,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 28,
    padding: 26,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.18)',
    gap: 18,
    backgroundColor: 'rgba(5,14,34,0.96)',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 48,
    elevation: 20,
  },
  modalTitle: {
    marginBottom: -4,
  },
  modalDescription: {
    opacity: 0.82,
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(226,232,240,0.9)',
  },
  formRow: {
    gap: 8,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(148,163,184,0.85)',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    backgroundColor: 'rgba(2,6,23,0.94)',
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  modalPrimaryButton: {
    borderWidth: 0,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 30,
    elevation: 16,
  },
  modalSecondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(8,25,48,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
});
