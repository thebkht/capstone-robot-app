import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';
import type { RobotStatus } from '@/services/robot-api';

const formatPercent = (value?: number) =>
  typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Unknown';

const formatTemperature = (value?: number) =>
  typeof value === 'number' ? `${value.toFixed(1)} °C` : 'Unknown';

const formatHumidity = (value?: number) =>
  typeof value === 'number' ? `${value.toFixed(1)} %` : 'Unknown';

const formatDuration = (value?: number) => {
  if (typeof value !== 'number') {
    return 'Unknown';
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
};

const groupEntries = (status: RobotStatus | null) => {
  if (!status) {
    return [];
  }

  const { network, ...rest } = status;

  return Object.entries(rest)
    .filter(([, value]) => typeof value !== 'object')
    .map(([key, value]) => ({ key, value }));
};

export default function StatusScreen() {
  const { status, refreshStatus, lastUpdated, isPolling, setIsPolling } = useRobot();
  const [refreshing, setRefreshing] = useState(false);

  const extraEntries = useMemo(() => groupEntries(status ?? null), [status]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshStatus();
    setRefreshing(false);
  }, [refreshStatus]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ThemedView style={styles.container}>
          <ThemedText type="title">Robot status</ThemedText>
          <ThemedText style={styles.description}>
            Polls every 10 seconds. Toggle live updates or pull to refresh.
          </ThemedText>

        <ThemedView style={styles.card}>
          <View style={styles.rowBetween}>
            <ThemedText type="subtitle">Live polling</ThemedText>
            <ThemedText>{isPolling ? 'Enabled' : 'Paused'}</ThemedText>
          </View>
          <ThemedText
            style={styles.link}
            onPress={() => setIsPolling(!isPolling)}>
            {isPolling ? 'Pause updates' : 'Resume updates'}
          </ThemedText>
          <ThemedText style={styles.meta}>
            {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'No data yet'}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Power</ThemedText>
          <ThemedText>Battery: {formatPercent(status?.battery)}</ThemedText>
          <ThemedText>CPU load: {formatPercent(status?.cpuLoad)}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Environment</ThemedText>
          <ThemedText>Temperature: {formatTemperature(status?.temperatureC)}</ThemedText>
          <ThemedText>Humidity: {formatHumidity(status?.humidity)}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Network</ThemedText>
          <ThemedText>IP: {status?.network?.ip ?? 'Unknown'}</ThemedText>
          <ThemedText>Wi-Fi: {status?.network?.wifiSsid ?? 'Unknown'}</ThemedText>
          <ThemedText>
            Signal strength:{' '}
            {typeof status?.network?.signalStrength === 'number'
              ? `${status?.network?.signalStrength} dBm`
              : 'Unknown'}
          </ThemedText>
          <ThemedText>Uptime: {formatDuration(status?.uptimeSeconds)}</ThemedText>
        </ThemedView>

          {extraEntries.length ? (
            <ThemedView style={styles.card}>
              <ThemedText type="subtitle">Additional data</ThemedText>
              {extraEntries.map(({ key, value }) => (
                <ThemedText key={key}>
                  {key}: {String(value)}
                </ThemedText>
              ))}
            </ThemedView>
          ) : null}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
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
  card: {
    gap: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  meta: {
    opacity: 0.7,
  },
});
