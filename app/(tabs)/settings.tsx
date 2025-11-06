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
    padding: 24,
    gap: 20,
    backgroundColor: '#050505',
  },
  description: {
    color: '#D1D5DB',
  },
  card: {
    gap: 16,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0F0F10',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0A0A0B',
    color: '#F9FAFB',
    fontFamily: 'JetBrainsMono-Regular',
    letterSpacing: 0.25,
  },
  primaryButton: {
    backgroundColor: '#1DD1A1',
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: '#04110B',
  },
  meta: {
    color: '#6B7280',
  },
});
