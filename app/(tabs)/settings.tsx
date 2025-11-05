import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';

export default function SettingsScreen() {
  const { baseUrl, setBaseUrl, refreshStatus } = useRobot();
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
        <ThemedText type="subtitle">About this app</ThemedText>
        <ThemedText>
          Robot companion dashboard with Wi-Fi setup, camera streaming, and telemetry monitoring.
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
