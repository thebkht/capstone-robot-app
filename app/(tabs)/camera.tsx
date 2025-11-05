import { Image } from 'expo-image';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Joystick } from '@/components/joystick';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';

export default function CameraScreen() {
  const { api, baseUrl } = useRobot();
  const [refreshToken, setRefreshToken] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const streamUrl = useMemo(() => {
    if (!baseUrl) {
      return undefined;
    }

    return `${api.streamUrl}?refresh=${refreshToken}`;
  }, [api, baseUrl, refreshToken]);

  const handleRefreshStream = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const handlePullRefresh = useCallback(() => {
    setRefreshing(true);
    handleRefreshStream();
    setTimeout(() => setRefreshing(false), 500);
  }, [handleRefreshStream]);

  const handleSnapshot = useCallback(async () => {
    setIsCapturing(true);
    try {
      const result = await api.triggerSnapshot();
      setLastSnapshot(result.url);
    } catch (error) {
      setLastSnapshot(null);
      console.warn('Snapshot failed', error);
    } finally {
      setIsCapturing(false);
    }
  }, [api]);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} />}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Camera</ThemedText>
        <ThemedText style={styles.description}>
          Live robot feed. Pull down to refresh the stream token if the feed freezes.
        </ThemedText>
        <View style={styles.cameraFrame}>
          {streamUrl ? (
            <Image
              key={streamUrl}
              source={{ uri: streamUrl }}
              style={styles.camera}
              contentFit="contain"
            />
          ) : (
            <ThemedText>No stream available. Configure the robot IP first.</ThemedText>
          )}
        </View>
        <View style={styles.row}>
          <Pressable style={styles.secondaryButton} onPress={handleRefreshStream}>
            <ThemedText>Reload stream</ThemedText>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={handleSnapshot}>
            {isCapturing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryText}>Capture photo</ThemedText>
            )}
          </Pressable>
        </View>

        {lastSnapshot ? (
          <ThemedView style={styles.snapshotCard}>
            <ThemedText type="subtitle">Latest snapshot</ThemedText>
            <Image source={{ uri: lastSnapshot }} style={styles.snapshot} contentFit="cover" />
          </ThemedView>
        ) : null}

        <ThemedView style={styles.joystickCard}>
          <ThemedText type="title">Virtual joystick</ThemedText>
          <ThemedText style={styles.description}>
            Drag the control to practice teleoperation gestures. Values are logged locally only.
          </ThemedText>
          <Joystick onChange={setJoystick} />
          <ThemedText style={styles.joystickValue}>
            X: {joystick.x.toFixed(2)} Y: {joystick.y.toFixed(2)}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  description: {
    opacity: 0.8,
  },
  cameraFrame: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  snapshotCard: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  snapshot: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
  },
  joystickCard: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  joystickValue: {
    fontVariant: ['tabular-nums'],
  },
});
