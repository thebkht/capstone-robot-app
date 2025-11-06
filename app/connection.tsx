// eslint-disable-next-line import/no-unresolved
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ROBOT_BASE_URL_STORAGE_KEY,
  useRobot,
} from '@/context/robot-provider';

const DEFAULT_HOTSPOT_URL = 'http://192.168.4.1:8000';
const RECENT_URLS_STORAGE_KEY = 'robot_recent_urls';

type ConnectionPhase = 'idle' | 'connecting' | 'connected' | 'error';

const normalizeUrl = (value: string) => value.trim().replace(/\/$/, '');

const ensureHttpScheme = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `http://${value}`;

const STATUS_META: Record<ConnectionPhase, { label: string; color: string }> = {
  idle: { label: 'Not connected', color: '#F87171' },
  connecting: { label: 'Trying to connect…', color: '#FBBF24' },
  connected: { label: 'Connected', color: '#2DD4BF' },
  error: { label: 'Not connected', color: '#F87171' },
};

export default function ConnectionScreen() {
  const { baseUrl, setBaseUrl, refreshStatus } = useRobot();
  const [inputUrl, setInputUrl] = useState(baseUrl);
  const [phase, setPhase] = useState<ConnectionPhase>('idle');
  const [statusMessage, setStatusMessage] = useState('Enter the robot address to connect.');
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const hasAutoAttemptedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setInputUrl(baseUrl);
  }, [baseUrl]);

  const persistRecentUrls = useCallback((urls: string[]) => {
    void AsyncStorage.setItem(RECENT_URLS_STORAGE_KEY, JSON.stringify(urls)).catch((error) => {
      console.warn('Failed to persist recent robot URLs', error);
    });
  }, []);

  const recordRecentUrl = useCallback(
    (url: string) => {
      setRecentUrls((prev) => {
        const next = [url, ...prev.filter((item) => item !== url)].slice(0, 5);
        persistRecentUrls(next);
        return next;
      });
    },
    [persistRecentUrls],
  );

  const attemptConnection = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        if (isMountedRef.current) {
          setPhase('error');
          setStatusMessage('Please enter a robot URL (including http:// or https://).');
        }
        return false;
      }

      const prepared = ensureHttpScheme(normalizeUrl(trimmed));
      try {
        // Validate the URL before attempting to fetch so we can surface immediate feedback.
        // Assign to a throwaway variable to avoid lint complaints about unused expressions.
        const _validated = new URL(prepared);
        void _validated;
      } catch {
        if (isMountedRef.current) {
          setPhase('error');
          setStatusMessage('Please provide a valid URL including host and protocol.');
        }
        return false;
      }
      if (isMountedRef.current) {
        setPhase('connecting');
        setStatusMessage(`Trying ${prepared} …`);
        setInputUrl(prepared);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${prepared}/health`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Robot responded with status ${response.status}`);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          console.warn('Robot health response was not JSON', error);
        }

        const robotName =
          payload && typeof payload === 'object' && 'name' in payload && typeof payload.name === 'string'
            ? payload.name
            : undefined;

        if (isMountedRef.current) {
          setPhase('connected');
          setStatusMessage(
            robotName ? `Connected to ${robotName} at ${prepared}` : `Connected to ${prepared}`,
          );
        }

        setBaseUrl(prepared);
        recordRecentUrl(prepared);
        await refreshStatus().catch((error) => {
          console.warn('Failed to refresh robot status after connecting', error);
        });

        return true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        if (isMountedRef.current) {
          setPhase('error');
          setStatusMessage(`Could not connect to ${prepared}: ${reason}`);
        }
        return false;
      } finally {
        clearTimeout(timeout);
      }
    },
    [recordRecentUrl, refreshStatus, setBaseUrl],
  );

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const [storedUrl, storedRecentUrls] = await Promise.all([
          AsyncStorage.getItem(ROBOT_BASE_URL_STORAGE_KEY),
          AsyncStorage.getItem(RECENT_URLS_STORAGE_KEY),
        ]);

        if (!isActive) {
          return;
        }

        if (storedRecentUrls) {
          try {
            const parsed = JSON.parse(storedRecentUrls);
            if (Array.isArray(parsed)) {
              setRecentUrls(parsed.filter((item): item is string => typeof item === 'string'));
            }
          } catch (error) {
            console.warn('Failed to parse stored recent URLs', error);
          }
        }

        if (storedUrl && !hasAutoAttemptedRef.current) {
          hasAutoAttemptedRef.current = true;
          await attemptConnection(storedUrl);
        }
      } catch (error) {
        console.warn('Failed to hydrate connection screen state', error);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [attemptConnection]);

  const statusMeta = useMemo(() => {
    return STATUS_META[phase];
  }, [phase]);

  const handleConnectPress = useCallback(() => {
    hasAutoAttemptedRef.current = true;
    void attemptConnection(inputUrl);
  }, [attemptConnection, inputUrl]);

  const handleHotspotPress = useCallback(() => {
    hasAutoAttemptedRef.current = true;
    void attemptConnection(DEFAULT_HOTSPOT_URL);
  }, [attemptConnection]);

  const handleRecentPress = useCallback(
    (url: string) => {
      hasAutoAttemptedRef.current = true;
      void attemptConnection(url);
    },
    [attemptConnection],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.heading}>
            Connect to Robot
          </ThemedText>
          <ThemedText style={styles.subheading}>
            Tell the app where the rover is hosted. We will try your last working address automatically
            and remember any IPs you confirm.
          </ThemedText>

          <View style={[styles.statusCard, { borderColor: statusMeta.color }]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusIndicator, { backgroundColor: statusMeta.color }]} />
              <ThemedText style={styles.statusLabel}>{statusMeta.label}</ThemedText>
            </View>
            <ThemedText style={styles.statusMessage}>{statusMessage}</ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.fieldLabel}>Robot IP / Host</ThemedText>
            <TextInput
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.0.52:8000"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.input}
            />
            <Pressable
              style={[styles.primaryButton, phase === 'connecting' && styles.disabledButton]}
              onPress={handleConnectPress}
              disabled={phase === 'connecting'}
            >
              {phase === 'connecting' ? (
                <ActivityIndicator color="#04110B" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>Connect</ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <ThemedText style={styles.dividerText}>Or connect to robot hotspot</ThemedText>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={[styles.secondaryButton, phase === 'connecting' && styles.disabledSecondary]}
            onPress={handleHotspotPress}
            disabled={phase === 'connecting'}
          >
            <ThemedText style={styles.secondaryButtonText}>
              Try hotspot ({DEFAULT_HOTSPOT_URL})
            </ThemedText>
          </Pressable>

          {recentUrls.length > 1 ? (
            <View style={styles.recentsContainer}>
              <ThemedText style={styles.recentsLabel}>Recent addresses</ThemedText>
              <View style={styles.recentsList}>
                {recentUrls.map((url) => (
                  <Pressable
                    key={url}
                    style={({ pressed }) => [
                      styles.recentChip,
                      pressed && { opacity: 0.75 },
                      phase === 'connecting' && styles.disabledChip,
                    ]}
                    onPress={() => handleRecentPress(url)}
                    disabled={phase === 'connecting'}
                  >
                    <ThemedText style={styles.recentChipText}>{url}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.currentConfig}>
            <ThemedText style={styles.currentConfigLabel}>Current base URL</ThemedText>
            <ThemedText style={styles.currentConfigValue}>{baseUrl}</ThemedText>
          </View>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scrollContent: {
    padding: 24,
  },
  container: {
    gap: 24,
    backgroundColor: '#050505',
  },
  heading: {
    marginBottom: 8,
    color: '#F3F4F6',
  },
  subheading: {
    opacity: 0.75,
    lineHeight: 22,
    color: '#D1D5DB',
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 20,
    gap: 10,
    backgroundColor: '#0F0F10',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIndicator: {
    width: 14,
    height: 14,
    borderRadius: 0,
  },
  statusLabel: {
    color: '#E5E7EB',
  },
  statusMessage: {
    opacity: 0.9,
    lineHeight: 22,
    color: '#9CA3AF',
  },
  section: {
    gap: 14,
  },
  fieldLabel: {
    color: '#F9FAFB',
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
  primaryButtonText: {
    color: '#04110B',
  },
  disabledButton: {
    opacity: 0.6,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#1F2937',
  },
  dividerText: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.65,
    color: '#6B7280',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
    borderColor: '#1F2937',
    backgroundColor: '#0A0A0B',
  },
  secondaryButtonText: {
    color: '#E5E7EB',
  },
  disabledSecondary: {
    opacity: 0.6,
  },
  recentsContainer: {
    gap: 12,
  },
  recentsLabel: {
    color: '#E5E7EB',
  },
  recentsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recentChip: {
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0B',
  },
  disabledChip: {
    opacity: 0.6,
  },
  recentChipText: {
    color: '#E5E7EB',
  },
  currentConfig: {
    marginTop: 16,
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0F0F10',
    gap: 6,
  },
  currentConfigLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.65,
    color: '#6B7280',
  },
  currentConfigValue: {
    color: '#F3F4F6',
  },
});
