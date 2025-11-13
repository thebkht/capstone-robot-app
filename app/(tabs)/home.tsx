import { Ionicons } from '@expo/vector-icons';
import React, { ComponentProps, useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';

const robotRender = require('../../assets/images/partial-react-logo.png');

const BEHAVIORS = [
  {
    id: 'hello_world',
    label: 'hello_world',
    description: 'Loads at startup',
    status: 'Innate',
    mode: 'Loads at startup',
    active: true,
  },
  {
    id: 'default_directive',
    label: 'default_directive',
    description: 'Defaults for default_directive.',
    status: 'Innate',
    mode: 'Waiting for cue',
    active: false,
  },
  {
    id: 'tools_giving_directive',
    label: 'tools_giving_directive',
    description: 'Directive for toolkit enablement.',
    status: 'Innate',
    mode: 'Loads at startup',
    active: false,
  },
];

export default function HomeScreen() {
  const { status, lastUpdated } = useRobot();

  const batteryPercentage = useMemo(() => {
    const raw = status?.battery ?? status?.telemetry?.battery ?? status?.health?.battery;
    if (raw == null) {
      return null;
    }
    if (raw <= 1) {
      return Math.round(raw * 100);
    }
    return Math.round(raw);
  }, [status?.battery, status?.telemetry?.battery, status?.health?.battery]);

  const batteryLabel = batteryPercentage != null ? `${batteryPercentage}%` : '--';
  const healthLabel = batteryPercentage == null ? 'Unknown' : batteryPercentage >= 60 ? 'Good' : 'Needs charge';
  const wifiSsid = status?.network?.wifiSsid ?? status?.network?.ssid ?? 'Offline';
  const uptime = status?.uptimeSeconds ?? status?.health?.uptimeSeconds;
  const formattedUptime = useMemo(() => {
    if (!uptime) {
      return '--';
    }
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }, [uptime]);

  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : 'Updating…';

  type IoniconName = ComponentProps<typeof Ionicons>['name'];

  const controlCards: {
    key: string;
    title: string;
    description: string;
    icon: IoniconName;
    active: boolean;
  }[] = [
    {
      key: 'manual',
      title: 'Manual',
      description: 'Drive directly with joystick controls.',
      icon: 'game-controller',
      active: (status?.mode ?? '').toLowerCase() === 'manual',
    },
    {
      key: 'agentic',
      title: 'Agentic',
      description: 'Let routines run autonomously.',
      icon: 'planet',
      active: (status?.mode ?? '').toLowerCase() !== 'manual',
    },
  ];

  const insights = [
    { label: 'Mode', value: status?.mode ?? 'Manual' },
    { label: 'Wi-Fi', value: wifiSsid },
    { label: 'Uptime', value: formattedUptime },
  ];

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <ThemedText type="subtitle" style={styles.heroLabel}>
              Mars
            </ThemedText>
            <View style={styles.statusRow}>
              <View style={styles.badge}>
                <Ionicons name="battery-half" size={16} color="#9CA3AF" />
                <ThemedText style={styles.badgeText}>{batteryLabel}</ThemedText>
              </View>
              <View style={[styles.badge, styles.goodBadge]}>
                <Ionicons name="leaf" size={16} color="#22C55E" />
                <ThemedText style={styles.goodBadgeText}>{healthLabel}</ThemedText>
              </View>
            </View>
            <ThemedText type="title" style={styles.heroTitle}>
              Mars Rover Companion
            </ThemedText>
            <ThemedText style={styles.heroDescription}>
              Monitor vitals, switch between modes, and orchestrate behaviors from a single console.
            </ThemedText>
          </View>
          <View style={styles.robotCard}>
            <Image source={robotRender} style={styles.robotImage} resizeMode="contain" />
            <View style={styles.robotShadow} />
          </View>
        </View>

        <View style={styles.cardsRow}>
          {controlCards.map((card) => (
            <Pressable
              key={card.key}
              style={[styles.controlCard, card.active && styles.controlCardActive]}
              accessibilityRole="button">
              <View style={styles.controlIconWrap}>
                <Ionicons name={card.icon} size={20} color="#F3F4F6" />
              </View>
              <ThemedText type="subtitle" style={styles.controlTitle}>
                {card.title}
              </ThemedText>
              <ThemedText style={styles.controlDescription}>{card.description}</ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={styles.insightsRow}>
          {insights.map((insight) => (
            <View key={insight.label} style={styles.insightCard}>
              <ThemedText style={styles.insightLabel}>{insight.label}</ThemedText>
              <ThemedText type="subtitle" style={styles.insightValue} numberOfLines={1}>
                {insight.value}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.behaviorHeader}>
          <ThemedText type="subtitle">Behaviors</ThemedText>
          <ThemedText style={styles.behaviorSubtitle}>Last updated {lastUpdatedLabel}</ThemedText>
        </View>

        <View style={styles.behaviorList}>
          {BEHAVIORS.map((behavior) => (
            <View key={behavior.id} style={styles.behaviorCard}>
              <View style={styles.behaviorTop}>
                <View style={styles.behaviorTitleWrap}>
                  <ThemedText style={styles.behaviorTitle}>{behavior.label}</ThemedText>
                  <View style={styles.behaviorBadge}>
                    <ThemedText style={styles.behaviorBadgeText}>{behavior.status}</ThemedText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" color="#6B7280" size={18} />
              </View>
              <ThemedText style={styles.behaviorDescription}>{behavior.description}</ThemedText>
              <View style={styles.behaviorFooter}>
                <View style={[styles.stateChip, behavior.active ? styles.stateChipActive : styles.stateChipIdle]}>
                  <View style={[styles.stateDot, behavior.active ? styles.stateDotActive : styles.stateDotIdle]} />
                  <ThemedText style={styles.stateText}>{behavior.mode}</ThemedText>
                </View>
                <ThemedText style={styles.behaviorAction}>Details</ThemedText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050505',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 24,
  },
  hero: {
    backgroundColor: '#0B0B0B',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
  },
  heroText: {
    flex: 1,
    gap: 12,
  },
  heroLabel: {
    color: '#9CA3AF',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderRadius: 999,
    gap: 6,
  },
  badgeText: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  goodBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  goodBadgeText: {
    color: '#4ADE80',
    fontSize: 14,
  },
  heroTitle: {
    color: '#F9FAFB',
    fontSize: 28,
    lineHeight: 32,
  },
  heroDescription: {
    color: '#9CA3AF',
  },
  robotCard: {
    width: 120,
    height: 160,
    borderRadius: 20,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  robotImage: {
    width: 96,
    height: 96,
  },
  robotShadow: {
    position: 'absolute',
    bottom: 24,
    width: 72,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  controlCard: {
    flex: 1,
    backgroundColor: '#0B0B0B',
    borderRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  controlCardActive: {
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  controlIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlTitle: {
    color: '#F3F4F6',
  },
  controlDescription: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  insightsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  insightCard: {
    flex: 1,
    backgroundColor: '#0B0B0B',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  insightLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 6,
  },
  insightValue: {
    color: '#F9FAFB',
    fontSize: 18,
    lineHeight: 24,
  },
  behaviorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  behaviorSubtitle: {
    color: '#6B7280',
    fontSize: 14,
  },
  behaviorList: {
    gap: 16,
  },
  behaviorCard: {
    backgroundColor: '#0B0B0B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  behaviorTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  behaviorTitleWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexShrink: 1,
  },
  behaviorTitle: {
    color: '#F3F4F6',
    fontSize: 16,
  },
  behaviorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  behaviorBadgeText: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  behaviorDescription: {
    color: '#9CA3AF',
  },
  behaviorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  stateChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  stateChipIdle: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateDotActive: {
    backgroundColor: '#3B82F6',
  },
  stateDotIdle: {
    backgroundColor: '#9CA3AF',
  },
  stateText: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  behaviorAction: {
    color: '#60A5FA',
    fontSize: 14,
  },
});
