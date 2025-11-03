import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';

export default function SettingsScreen() {
  const {
    baseUrl,
    setBaseUrl,
    bluetoothEnabled,
    setBluetoothEnabled,
    refreshStatus,
    bluetoothSupported,
  } = useRobot();
  const [draftUrl, setDraftUrl] = useState(baseUrl);

  const handleSave = useCallback(() => {
    if (!draftUrl.startsWith('http')) {
      Alert.alert('Invalid URL', 'Please enter a full http:// or https:// address.');
      return;
    }

    setBaseUrl(draftUrl);
    refreshStatus();
  }, [draftUrl, refreshStatus, setBaseUrl]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Configuration</ThemedText>
      <ThemedText style={styles.description}>
        Set the robot address and communication preferences.
      </ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Robot IP / host</ThemedText>
        <TextInput
          value={draftUrl}
          onChangeText={setDraftUrl}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <ThemedText style={styles.primaryText}>Save</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.rowBetween}>
          <ThemedText type="subtitle">Enable Bluetooth discovery</ThemedText>
          <Switch
            value={bluetoothEnabled}
            onValueChange={setBluetoothEnabled}
            disabled={!bluetoothSupported}
          />
        </View>
        <ThemedText style={styles.description}>
          {bluetoothSupported
            ? 'Uses react-native-ble-plx to scan for nearby robots exposing BLE beacons.'
            : 'Install react-native-ble-plx and rebuild the app to enable Bluetooth scanning.'}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">About this app</ThemedText>
        <ThemedText>
          Robot companion dashboard with Wi-Fi setup, camera streaming, telemetry monitoring and BLE discovery.
        </ThemedText>
        <ThemedText style={styles.meta}>Version 0.1.0</ThemedText>
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
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  meta: {
    opacity: 0.7,
  },
});
