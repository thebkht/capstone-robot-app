// eslint-disable-next-line import/no-unresolved
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
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
  shouldScanWifi?: boolean;
  wifiScanBaseUrl?: string;
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

const extractSubnetFromIpAddress = (value: string) => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
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
  const { baseUrl, setBaseUrl, refreshStatus, status } = useRobot();
  const [phase, setPhase] = useState<ConnectionPhase>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Looking for the robot automatically. We will try saved addresses and common defaults.',
  );
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [wifiNetworks, setWifiNetworks] = useState<string[]>([]);
  const [isScanningWifi, setIsScanningWifi] = useState(false);
  const [wifiScanError, setWifiScanError] = useState<string | null>(null);
  const hasAutoAttemptedRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastAttemptedUrlRef = useRef<string | null>(null);
  const deviceSubnetRef = useRef<string | null>(null);

  const ensureDeviceSubnet = useCallback(async () => {
    if (deviceSubnetRef.current) {
      return deviceSubnetRef.current;
    }

    const hostCandidates: (string | null | undefined)[] = [
      Constants.debuggerHost,
      Constants.expoConfig?.hostUri,
      // @ts-expect-error Expo SDK versions expose manifest/manifest2 differently; guard access.
      Constants.manifest?.hostUri,
      // @ts-expect-error Guard access to optional manifest fields for legacy runtimes.
      Constants.manifest2?.extra?.expoClient?.hostUri,
    ];

    for (const candidate of hostCandidates) {
      if (!candidate) {
        continue;
      }

      let host = candidate;
      try {
        if (!candidate.includes('://')) {
          const fauxUrl = `http://${candidate}`;
          host = new URL(fauxUrl).hostname;
        } else {
          host = new URL(candidate).hostname;
        }
      } catch {
        host = candidate.split(':')[0] ?? candidate;
      }

      const subnet = host ? extractSubnetFromIpAddress(host) : null;
      if (subnet) {
        deviceSubnetRef.current = subnet;
        console.log('Detected device subnet', { source: candidate, subnet });
        return subnet;
      }
    }

    console.warn('Unable to infer device subnet from Expo constants');
    return null;
  }, []);

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

  const wifiStatusMeta = useMemo(() => {
    const connectedSsid = status?.network?.wifiSsid;
    const isConnected = Boolean(connectedSsid);

    return {
      color: isConnected ? '#1DD1A1' : '#F87171',
      label: isConnected ? 'Connected' : 'Not connected',
      ssid: connectedSsid ?? 'Unknown',
      ip: status?.network?.ip ?? 'Unknown',
    };
  }, [status]);

  const performWifiScanRequest = useCallback(async (targetBaseUrl: string) => {
    const normalizedBase = canonicalizeUrl(targetBaseUrl);
    const response = await fetch(`${normalizedBase}/wifi/networks`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Robot Wi-Fi scan failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { networks?: unknown };
    const networks = Array.isArray(payload.networks)
      ? payload.networks.filter((item): item is string => typeof item === 'string')
      : [];

    return networks;
  }, []);

  const scanWifiNetworks = useCallback(
    async (wifiBaseOverride?: string) => {
      const targetBase = wifiBaseOverride ?? baseUrl;
      if (!targetBase) {
        setWifiNetworks([]);
        setWifiScanError('Connect to the robot to request a Wi-Fi scan.');
        return false;
      }

      const normalizedTarget = canonicalizeUrl(targetBase);

    setIsScanningWifi(true);
    setWifiScanError(null);

    try {
      console.log('Requesting Wi-Fi network scan', { baseUrl: normalizedTarget });
      const networks = await performWifiScanRequest(normalizedTarget);

      setWifiNetworks(networks);

      if (!networks.length) {
        setWifiScanError('No Wi-Fi networks detected. Try rescanning closer to the router.');
      }

      console.log('Wi-Fi network scan completed', { count: networks.length });
      return networks.length > 0;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to scan for Wi-Fi networks.';
      setWifiScanError(message);
      console.warn('Wi-Fi network scan failed', error);
      return false;
    } finally {
      setIsScanningWifi(false);
    }
    },
    [baseUrl, performWifiScanRequest],
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
    shouldScanWifi?: boolean;
    wifiScanBaseUrl?: string;
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

        if (options.shouldScanWifi) {
          const wifiBase = options.wifiScanBaseUrl ?? prepared;
          await scanWifiNetworks(wifiBase);
        }

        return { success: true, normalizedUrl: prepared };
      }

      if (isMountedRef.current) {
        setPhase('error');
        setStatusMessage('Unable to connect. Try scanning or use the hotspot options below.');
      }

      console.warn('Robot connection failed', { url: prepared, reason });

      return { success: false, normalizedUrl: prepared };
    },
    [probeRobotUrl, recordRecentUrl, refreshStatus, scanWifiNetworks, setBaseUrl],
  );

  const runLocalNetworkScan = useCallback(
    async (
      attempted: Set<string>,
      additionalSeeds: string[] = [],
      options: NetworkScanOptions = {},
    ) => {
      await ensureDeviceSubnet();

      if (isMountedRef.current) {
        setPhase('connecting');
        setStatusMessage(options.statusMessage ?? 'Scanning local network for the robot…');
      }

      const candidateSubnets = new Set<string>(options.presetSubnets ?? []);

      if (deviceSubnetRef.current) {
        candidateSubnets.add(deviceSubnetRef.current);
      }

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

        if (options.shouldScanWifi) {
          const wifiBase = options.wifiScanBaseUrl ?? resolvedUrl;
          await scanWifiNetworks(wifiBase);
        }

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
    [
      baseUrl,
      ensureDeviceSubnet,
      probeRobotUrl,
      recentUrls,
      recordRecentUrl,
      refreshStatus,
      scanWifiNetworks,
      setBaseUrl,
    ],
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

          if (!storedUrl) {
            await ensureDeviceSubnet();
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
  }, [attemptConnection, ensureDeviceSubnet, runLocalNetworkScan]);

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
        shouldScanWifi: true,
        wifiScanBaseUrl: DEFAULT_HOTSPOT_URL,
      });

      if (result.normalizedUrl) {
        attempted.add(result.normalizedUrl);
      }

      if (result.success) {
        return;
      }

      const found = await runLocalNetworkScan(attempted, [DEFAULT_HOTSPOT_URL], {
        statusMessage: 'Scanning hotspot network for the robot…',
        presetSubnets: ['192.168.4'],
        shouldScanWifi: true,
        wifiScanBaseUrl: DEFAULT_HOTSPOT_URL,
      });

      if (!found) {
        setWifiNetworks([]);
      }
    })();
  }, [attemptConnection, runLocalNetworkScan, setWifiNetworks]);

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
    void (async () => {
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

      const initialTarget = baseUrl ?? lastAttemptedUrlRef.current ?? DEFAULT_HOTSPOT_URL;

      if (phase !== 'connected') {
        if (initialTarget) {
          const attempt = await attemptConnection(initialTarget, {
            shouldScanWifi: true,
            wifiScanBaseUrl: initialTarget,
            skipRecent: initialTarget === DEFAULT_HOTSPOT_URL,
            statusMessage: 'Attempting to reach the robot before scanning…',
          });

          if (attempt.normalizedUrl) {
            attempted.add(attempt.normalizedUrl);
          }

          if (attempt.success) {
            return;
          }
        }

        if (initialTarget !== DEFAULT_HOTSPOT_URL) {
          const hotspotAttempt = await attemptConnection(DEFAULT_HOTSPOT_URL, {
            skipRecent: true,
            shouldScanWifi: true,
            wifiScanBaseUrl: DEFAULT_HOTSPOT_URL,
            statusMessage: 'Attempting hotspot before scanning…',
          });

          if (hotspotAttempt.normalizedUrl) {
            attempted.add(hotspotAttempt.normalizedUrl);
          }

          if (hotspotAttempt.success) {
            return;
          }
        }

        const found = await runLocalNetworkScan(attempted, [DEFAULT_HOTSPOT_URL], {
          statusMessage: 'Scanning hotspot network for the robot…',
          presetSubnets: ['192.168.4'],
          shouldScanWifi: true,
          wifiScanBaseUrl: DEFAULT_HOTSPOT_URL,
        });

        if (!found) {
          setWifiNetworks([]);
        }

        return;
      }

      if (initialTarget) {
        try {
          const normalized = canonicalizeUrl(initialTarget);
          attempted.add(normalized);
          await scanWifiNetworks(normalized);
        } catch (error) {
          console.warn('Failed to normalize scan target URL', error);
          await scanWifiNetworks();
        }
      } else {
        await scanWifiNetworks();
      }
    })();
  }, [
    attemptConnection,
    baseUrl,
    phase,
    recentUrls,
    runLocalNetworkScan,
    scanWifiNetworks,
    setWifiNetworks,
  ]);

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

          <ThemedView style={styles.wifiCard}>
            <ThemedText type="subtitle">Robot Wi-Fi status</ThemedText>
            <View style={styles.wifiStatusRow}>
              <View style={[styles.statusIndicator, { backgroundColor: wifiStatusMeta.color }]} />
              <View style={styles.wifiStatusText}>
                <ThemedText style={styles.wifiStatusLabel}>
                  Wi-Fi connection: {wifiStatusMeta.label}
                </ThemedText>
                <ThemedText style={styles.wifiMeta}>
                  Network name: {wifiStatusMeta.ssid}
                </ThemedText>
                <ThemedText style={styles.wifiMeta}>IP address: {wifiStatusMeta.ip}</ThemedText>
              </View>
            </View>

            <ThemedText style={styles.wifiSectionLabel}>Available networks</ThemedText>
            <View style={styles.networkList}>
              {wifiNetworks.length ? (
                wifiNetworks.map((network) => (
                  <ThemedView key={network} style={styles.networkRow}>
                    <ThemedText style={styles.networkName}>{network}</ThemedText>
                  </ThemedView>
                ))
              ) : (
                <ThemedText style={styles.wifiMeta}>
                  {wifiScanError ??
                    (isScanningWifi
                      ? 'Scanning for Wi-Fi networks…'
                      : 'No scan results yet. Connect to the robot hotspot and scan to continue.')}
                </ThemedText>
              )}
            </View>

            <Pressable
              style={[styles.scanButton, isScanningWifi && styles.disabledSecondary]}
              disabled={isScanningWifi}
              onPress={handleScanPress}
            >
              {isScanningWifi ? (
                <ActivityIndicator color="#E5E7EB" />
              ) : (
                <ThemedText style={styles.secondaryButtonText}>Scan robot Wi-Fi networks</ThemedText>
              )}
            </Pressable>
          </ThemedView>

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
  wifiCard: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderRadius: 0,
    borderColor: '#1F2937',
    backgroundColor: '#0F0F10',
  },
  wifiStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  wifiStatusText: {
    gap: 6,
    flex: 1,
  },
  wifiStatusLabel: {
    color: '#F3F4F6',
  },
  wifiMeta: {
    color: '#9CA3AF',
  },
  wifiSectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#6B7280',
  },
  networkList: {
    gap: 8,
  },
  networkRow: {
    borderWidth: 1,
    borderRadius: 0,
    borderColor: '#1F2937',
    backgroundColor: '#0A0A0B',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  networkName: {
    color: '#E5E7EB',
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
