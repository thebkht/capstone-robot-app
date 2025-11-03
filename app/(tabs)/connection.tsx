import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';
import type { RobotConnectionState } from '@/services/robot-api';

interface DiscoveredDevice {
  id: string;
  name?: string | null;
  rssi?: number | null;
}

export default function ConnectionScreen() {
  const { api, refreshStatus, status, bluetoothEnabled, bluetoothManager } = useRobot();
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [connectionState, setConnectionState] = useState<RobotConnectionState>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      bluetoothManager?.stopDeviceScan();
    };
  }, [bluetoothManager]);

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
        return 'Enter credentials to connect the robot to Wi-Fi.';
    }
  }, [connectionState, lastError]);

  const handleScan = useCallback(() => {
    if (!bluetoothEnabled || !bluetoothManager) {
      Alert.alert('Bluetooth disabled', 'Enable Bluetooth in Settings to scan for nearby robots.');
      return;
    }

    setDevices([]);
    setIsScanning(true);

    bluetoothManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        Alert.alert('Scan failed', error.message);
        setIsScanning(false);
        bluetoothManager.stopDeviceScan();
        return;
      }

      if (device) {
        setDevices((prev) => {
          const exists = prev.some((existing) => existing.id === device.id);
          if (exists) {
            return prev;
          }

          return [
            ...prev,
            {
              id: device.id,
              name: device.name,
              rssi: device.rssi,
            },
          ];
        });
      }
    });

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    scanTimeoutRef.current = setTimeout(() => {
      bluetoothManager.stopDeviceScan();
      setIsScanning(false);
    }, 8_000);
  }, [bluetoothEnabled, bluetoothManager]);

  const renderDevice = useCallback(({ item }: { item: DiscoveredDevice }) => (
    <View style={styles.deviceRow}>
      <ThemedText type="defaultSemiBold">{item.name ?? 'Unnamed device'}</ThemedText>
      <ThemedText type="small">{item.id}</ThemedText>
      {typeof item.rssi === 'number' ? (
        <ThemedText type="small">Signal: {item.rssi} dBm</ThemedText>
      ) : null}
    </View>
  ), []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Wi-Fi Connection</ThemedText>
      <ThemedText style={styles.description}>{connectionDescription}</ThemedText>

      <View style={styles.formRow}>
        <ThemedText type="subtitle">SSID</ThemedText>
        <TextInput
          value={ssid}
          onChangeText={setSsid}
          placeholder="Robot Wi-Fi network"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.formRow}>
        <ThemedText type="subtitle">Password</ThemedText>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Network password"
          secureTextEntry
          style={styles.input}
        />
      </View>

      <Pressable style={styles.primaryButton} onPress={handleConnect}>
        {connectionState === 'connecting' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.primaryText}>Connect</ThemedText>
        )}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={handlePing} disabled={isPinging}>
        {isPinging ? (
          <ActivityIndicator />
        ) : (
          <ThemedText>Ping robot</ThemedText>
        )}
      </Pressable>

      <ThemedView style={styles.section}>
        <ThemedText type="title">Bluetooth discovery</ThemedText>
        <ThemedText style={styles.description}>
          {bluetoothEnabled
            ? 'Scan for robots broadcasting over BLE. Tap a device to attempt a connection.'
            : 'Enable Bluetooth in settings to allow discovering nearby robots.'}
        </ThemedText>
        <Pressable
          style={[styles.secondaryButton, isScanning && styles.disabledButton]}
          onPress={handleScan}
          disabled={isScanning}
        >
          {isScanning ? <ActivityIndicator /> : <ThemedText>Scan for devices</ThemedText>}
        </Pressable>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={renderDevice}
          style={styles.list}
          ListEmptyComponent={<ThemedText>No devices discovered yet.</ThemedText>}
          contentContainerStyle={devices.length === 0 ? styles.emptyList : undefined}
        />
      </ThemedView>

      <ThemedView style={styles.statusCard}>
        <ThemedText type="subtitle">Current status</ThemedText>
        <ThemedText>{status?.network?.ip ? `IP: ${status.network.ip}` : 'Awaiting status update.'}</ThemedText>
        {status?.network?.wifiSsid ? (
          <ThemedText>Wi-Fi: {status.network.wifiSsid}</ThemedText>
        ) : null}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  description: {
    opacity: 0.8,
  },
  formRow: {
    gap: 8,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  disabledButton: {
    opacity: 0.6,
  },
  section: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  list: {
    maxHeight: 180,
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  deviceRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 2,
  },
  statusCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
    marginTop: 'auto',
  },
});
