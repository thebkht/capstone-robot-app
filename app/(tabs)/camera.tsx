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
      style={styles.scrollView}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullRefresh}
          tintColor="#1DD1A1"
          titleColor="#1DD1A1"
        />
      }>
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
              <ActivityIndicator color="#04110B" />
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
  scrollView: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 24,
    backgroundColor: '#050505',
  },
  description: {
    color: '#D1D5DB',
  },
  cameraFrame: {
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2937',
    aspectRatio: 16 / 9,
    backgroundColor: '#0A0A0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1DD1A1',
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: '#04110B',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0A0A0B',
  },
  snapshotCard: {
    gap: 16,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0F0F10',
  },
  snapshot: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 0,
  },
  joystickCard: {
    gap: 16,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0F0F10',
    alignItems: 'center',
  },
  joystickValue: {
    fontVariant: ['tabular-nums'],
    color: '#E5E7EB',
  },
});
