// eslint-disable-next-line import/no-unresolved
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
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
const ROVER_LOCAL_URL = 'http://rover.local:8000';
const RECENT_URLS_STORAGE_KEY = 'robot_recent_urls';

type ConnectionPhase = 'idle' | 'connecting' | 'connected' | 'error';

type NetworkScanOptions = {
  statusMessage?: string;
  presetSubnets?: string[];
};

const normalizeUrl = (value: string) => value.trim().replace(/\/$/, '');

const ensureHttpScheme = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `http://${value}`;

const canonicalizeUrl = (value: string) => ensureHttpScheme(normalizeUrl(value));

const extractIpv4Subnet = (value: string) => {
  try {
    const parsed = new URL(canonicalizeUrl(value));
    const match = parsed.hostname.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
    if (match) {
      return `${match[1]}.${match[2]}.${match[3]}`;
    }
  } catch {
    // Ignore parsing failures – non-IP hosts cannot yield a subnet.
  }

  return null;
};

const STATUS_META: Record<ConnectionPhase, { label: string; color: string }> = {
  idle: { label: 'Not connected', color: '#F87171' },
  connecting: { label: 'Trying to connect', color: '#FBBF24' },
  connected: { label: 'Connected', color: '#2DD4BF' },
  error: { label: 'Not connected', color: '#F87171' },
};

export default function ConnectionScreen() {
  const { baseUrl, setBaseUrl, refreshStatus } = useRobot();
  const [phase, setPhase] = useState<ConnectionPhase>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Looking for the robot automatically. We will try saved addresses and common defaults.',
  );
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const hasAutoAttemptedRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastAttemptedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  type ProbeResult = { success: boolean; robotName?: string; reason?: string };

  const probeRobotUrl = useCallback(async (normalizedUrl: string, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${normalizedUrl}/health`, {
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

      return { success: true, robotName } satisfies ProbeResult;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, reason } satisfies ProbeResult;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  interface AttemptOptions {
    statusMessage?: string;
    skipRecent?: boolean;
  }

  interface AttemptResult {
    success: boolean;
    normalizedUrl?: string;
  }

  const attemptConnection = useCallback(
    async (rawUrl: string, options: AttemptOptions = {}): Promise<AttemptResult> => {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        if (isMountedRef.current) {
          setPhase('error');
          setStatusMessage('No robot address was provided for the connection attempt.');
        }
        return { success: false };
      }

      const prepared = canonicalizeUrl(trimmed);
      lastAttemptedUrlRef.current = prepared;
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
        return { success: false };
      }

      if (isMountedRef.current) {
        setPhase('connecting');
        setStatusMessage(options.statusMessage ?? 'Attempting to reach the robot…');
      }

      console.log('Attempting robot connection', { url: prepared });

      const { success, robotName, reason } = await probeRobotUrl(prepared);

      if (success) {
        if (isMountedRef.current) {
          setPhase('connected');
          setStatusMessage(
            robotName ? `Connected to ${robotName} at ${prepared}` : `Connected to ${prepared}`,
          );
        }

        console.log('Robot connection succeeded', { url: prepared, robotName });

        setBaseUrl(prepared);
        if (!options.skipRecent) {
          recordRecentUrl(prepared);
        }
        await refreshStatus().catch((error) => {
          console.warn('Failed to refresh robot status after connecting', error);
        });

        return { success: true, normalizedUrl: prepared };
      }

      if (isMountedRef.current) {
        setPhase('error');
        setStatusMessage('Unable to connect. Try scanning or use the hotspot options below.');
      }

      console.warn('Robot connection failed', { url: prepared, reason });

      return { success: false, normalizedUrl: prepared };
    },
    [probeRobotUrl, recordRecentUrl, refreshStatus, setBaseUrl],
  );

  const runLocalNetworkScan = useCallback(
    async (
      attempted: Set<string>,
      additionalSeeds: string[] = [],
      options: NetworkScanOptions = {},
    ) => {
      if (isMountedRef.current) {
        setPhase('connecting');
        setStatusMessage(options.statusMessage ?? 'Scanning local network for the robot…');
      }

      const candidateSubnets = new Set<string>(options.presetSubnets ?? []);

      const seedUrls: (string | null | undefined)[] = [
        baseUrl,
        lastAttemptedUrlRef.current,
        ...recentUrls,
        ...additionalSeeds,
      ];
      seedUrls.forEach((value) => {
        if (!value) {
          return;
        }
        const subnet = extractIpv4Subnet(value);
        if (subnet) {
          candidateSubnets.add(subnet);
        }
      });

      if (candidateSubnets.size === 0) {
        candidateSubnets.add('192.168.0');
        candidateSubnets.add('192.168.1');
        candidateSubnets.add('10.0.0');
      }

      const candidates: string[] = [];
      candidateSubnets.forEach((subnet) => {
        for (let host = 1; host <= 254; host += 1) {
          const candidate = `http://${subnet}.${host}:8000`;
          if (!attempted.has(candidate)) {
            candidates.push(candidate);
          }
        }
      });

      console.log('Starting local network scan', {
        subnets: Array.from(candidateSubnets),
        totalCandidates: candidates.length,
      });

      if (candidates.length === 0) {
        if (isMountedRef.current) {
          setPhase('error');
          setStatusMessage(
            'Robot not found. Connect to the robot hotspot and use “Try hotspot (http://192.168.4.1:8000)”.',
          );
        }
        return false;
      }

      const queue = [...candidates];
      const concurrency = Math.min(20, queue.length);
      let resolvedUrl: string | null = null;
      let resolvedName: string | undefined;

      const worker = async () => {
        while (isMountedRef.current) {
          if (resolvedUrl) {
            return;
          }

          const candidate = queue.shift();
          if (!candidate) {
            return;
          }

          attempted.add(candidate);
          console.log('Scanning robot candidate', candidate);

          const { success, robotName } = await probeRobotUrl(candidate, 2000);

          if (success && !resolvedUrl) {
            resolvedUrl = candidate;
            resolvedName = robotName;
            return;
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      if (resolvedUrl) {
        if (isMountedRef.current) {
          setPhase('connected');
          setStatusMessage(
            resolvedName
              ? `Connected to ${resolvedName} at ${resolvedUrl}`
              : `Connected to ${resolvedUrl}`,
          );
        }

        console.log('Network scan connected to robot', { url: resolvedUrl, name: resolvedName });

        setBaseUrl(resolvedUrl);
        recordRecentUrl(resolvedUrl);
        await refreshStatus().catch((error) => {
          console.warn('Failed to refresh robot status after network scan', error);
        });

        return true;
      }

      console.warn('Network scan did not locate the robot');
      if (isMountedRef.current) {
        setPhase('error');
        setStatusMessage(
          'Robot not found. Connect to the robot hotspot and use “Try hotspot (http://192.168.4.1:8000)”.',
        );
      }

      return false;
    },
    [baseUrl, probeRobotUrl, recentUrls, recordRecentUrl, refreshStatus, setBaseUrl],
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

        let hydratedRecentUrls: string[] = [];

        if (storedRecentUrls) {
          try {
            const parsed = JSON.parse(storedRecentUrls);
            if (Array.isArray(parsed)) {
              hydratedRecentUrls = parsed.filter((item): item is string => typeof item === 'string');
              setRecentUrls(hydratedRecentUrls);
            }
          } catch (error) {
            console.warn('Failed to parse stored recent URLs', error);
          }
        }

        if (!hasAutoAttemptedRef.current) {
          hasAutoAttemptedRef.current = true;

          const attempted = new Set<string>();

          if (storedUrl) {
            console.log('Auto-attempting stored robot address', storedUrl);
            const result = await attemptConnection(storedUrl);
            if (result.normalizedUrl) {
              attempted.add(result.normalizedUrl);
            }
            if (result.success) {
              return;
            }
          }

          console.log('Auto-attempting rover.local fallback', ROVER_LOCAL_URL);
          const fallbackResult = await attemptConnection(ROVER_LOCAL_URL, {
            skipRecent: true,
          });
          if (fallbackResult.normalizedUrl) {
            attempted.add(fallbackResult.normalizedUrl);
          }
          if (fallbackResult.success) {
            return;
          }

          await runLocalNetworkScan(attempted, hydratedRecentUrls);
        }
      } catch (error) {
        console.warn('Failed to hydrate connection screen state', error);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [attemptConnection, runLocalNetworkScan]);

  const statusMeta = useMemo(() => {
    return STATUS_META[phase];
  }, [phase]);

  const handleHotspotPress = useCallback(() => {
    hasAutoAttemptedRef.current = true;
    void (async () => {
      const attempted = new Set<string>();
      console.log('Manually attempting hotspot address', DEFAULT_HOTSPOT_URL);
      const result = await attemptConnection(DEFAULT_HOTSPOT_URL, {
        skipRecent: true,
      });

      if (result.normalizedUrl) {
        attempted.add(result.normalizedUrl);
      }

      if (result.success) {
        return;
      }

      await runLocalNetworkScan(attempted, [DEFAULT_HOTSPOT_URL], {
        statusMessage: 'Scanning hotspot network for the robot…',
        presetSubnets: ['192.168.4'],
      });
    })();
  }, [attemptConnection, runLocalNetworkScan]);

  const handleRetrySavedPress = useCallback(() => {
    if (!baseUrl) {
      return;
    }
    hasAutoAttemptedRef.current = true;
    console.log('Retrying saved robot address', baseUrl);
    void attemptConnection(baseUrl);
  }, [attemptConnection, baseUrl]);

  const handleRoverLocalPress = useCallback(() => {
    hasAutoAttemptedRef.current = true;
    console.log('Manually attempting rover.local fallback', ROVER_LOCAL_URL);
    void attemptConnection(ROVER_LOCAL_URL, { skipRecent: true });
  }, [attemptConnection]);

  const handleScanPress = useCallback(() => {
    hasAutoAttemptedRef.current = true;
    const attempted = new Set<string>();
    const seeds: (string | null | undefined)[] = [
      baseUrl,
      lastAttemptedUrlRef.current,
      ...recentUrls,
    ];
    seeds.forEach((value) => {
      if (!value) {
        return;
      }
      try {
        attempted.add(canonicalizeUrl(value));
      } catch {
        // Ignore invalid URLs in the attempted set.
      }
    });
    console.log('Manually starting local network scan');
    void runLocalNetworkScan(attempted);
  }, [baseUrl, recentUrls, runLocalNetworkScan]);

  const handleRecentPress = useCallback(
    (url: string) => {
      hasAutoAttemptedRef.current = true;
      console.log('Attempting recent robot address', url);
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
            We automatically try your last working address and the rover.local fallback. Use the options
            below if the robot is not detected right away.
          </ThemedText>

          <View style={[styles.statusCard, { borderColor: statusMeta.color }]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusIndicator, { backgroundColor: statusMeta.color }]} />
              <ThemedText style={styles.statusLabel}>{statusMeta.label}</ThemedText>
            </View>
            <ThemedText style={styles.statusMessage}>{statusMessage}</ThemedText>
          </View>

          {baseUrl ? (
            <Pressable
              style={[styles.primaryButton, phase === 'connecting' && styles.disabledPrimary]}
              onPress={handleRetrySavedPress}
              disabled={phase === 'connecting'}
            >
              {phase === 'connecting' ? (
                <ActivityIndicator color="#04110B" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>
                  Retry saved address ({baseUrl})
                </ThemedText>
              )}
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.secondaryButton, phase === 'connecting' && styles.disabledSecondary]}
            onPress={handleRoverLocalPress}
            disabled={phase === 'connecting'}
          >
            <ThemedText style={styles.secondaryButtonText}>
              Try rover.local ({ROVER_LOCAL_URL})
            </ThemedText>
          </Pressable>

          <Pressable
            style={[styles.scanButton, phase === 'connecting' && styles.disabledSecondary]}
            onPress={handleScanPress}
            disabled={phase === 'connecting'}
          >
            <ThemedText style={styles.secondaryButtonText}>Scan local network</ThemedText>
          </Pressable>

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

          {recentUrls.length > 0 ? (
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
  primaryButton: {
    backgroundColor: '#1DD1A1',
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#04110B',
    textAlign: 'center',
  },
  disabledPrimary: {
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
  scanButton: {
    borderWidth: 1,
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
    borderColor: '#1F2937',
    backgroundColor: '#111112',
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
