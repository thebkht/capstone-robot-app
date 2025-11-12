import React from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function CameraScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Camera temporarily disabled</ThemedText>
      <ThemedText style={styles.description}>
        Live streaming and teleoperation controls are currently unavailable while we work on
        stability improvements. Please check back soon.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    padding: 24,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: '#050505',
  },
  description: {
    color: '#D1D5DB',
  },
});
