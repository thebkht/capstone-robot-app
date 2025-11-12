import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';

const formatPercent = (value?: number) =>
  typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';

const determineHealthColor = (value?: number) => {
  if (typeof value !== 'number') {
    return { label: 'Unknown', color: '#9CA3AF' };
  }

  if (value >= 0.6) {
    return { label: 'Good', color: '#4ADE80' };
  }

  if (value >= 0.3) {
    return { label: 'Nominal', color: '#FBBF24' };
  }

  return { label: 'Low', color: '#FB7185' };
};

interface BehaviorCardConfig {
  id: string;
  name: string;
  tag: string;
  description: string;
  detail: string;
  status: string;
  statusColor: string;
  statusTint: string;
  tagTint: string;
}

export default function HomeScreen() {
  const { status, refreshStatus, lastUpdated } = useRobot();

  const batteryPercent = typeof status?.battery === 'number' ? status.battery : undefined;
  const { label: batteryHealthLabel, color: batteryHealthColor } = determineHealthColor(batteryPercent);
  const mode = (status?.mode ?? 'manual').toLowerCase();
  const manualActive = mode === 'manual';
  const agenticActive = mode !== 'manual';

  const behaviors = useMemo<BehaviorCardConfig[]>(
    () => [
      {
        id: 'hello_world',
        name: 'hello_world',
        tag: 'Innate',
        tagTint: 'rgba(74, 222, 128, 0.16)',
        description: 'Loads at startup',
        detail: manualActive ? 'Direct drive engaged' : 'Standing by for prompts',
        status: manualActive ? 'Manual' : 'Agentic ready',
        statusColor: manualActive ? '#4ADE80' : '#38BDF8',
        statusTint: manualActive ? 'rgba(74, 222, 128, 0.16)' : 'rgba(56, 189, 248, 0.16)',
      },
      {
        id: 'default_directive',
        name: 'default_directive',
        tag: 'Innate',
        tagTint: 'rgba(190, 242, 100, 0.12)',
        description: 'Fallback policy with safety guardrails',
        detail: 'Always resident in memory',
        status: 'Loaded',
        statusColor: '#BEF264',
        statusTint: 'rgba(190, 242, 100, 0.12)',
      },
      {
        id: 'tools_giving_directive',
        name: 'tools_giving_directive',
        tag: 'Mission',
        tagTint: 'rgba(129, 140, 248, 0.16)',
        description: 'Authorizes hardware tools during EVA',
        detail: 'Dormant • ready on demand',
        status: 'Available',
        statusColor: '#A5B4FC',
        statusTint: 'rgba(129, 140, 248, 0.16)',
      },
    ],
    [manualActive]
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.titleStack}>
            <ThemedText style={styles.label}>Mission robot</ThemedText>
            <ThemedText type="title">Mars</ThemedText>
            <ThemedText style={styles.metaText}>
              Linked to {status?.network?.wifiSsid ?? status?.network?.ssid ?? 'field router'}
            </ThemedText>
          </View>
          <Pressable style={styles.refreshButton} onPress={refreshStatus}>
            <MaterialIcons name="refresh" size={18} color="#E5E7EB" />
            <ThemedText style={styles.refreshLabel}>Sync</ThemedText>
          </Pressable>
        </View>

        <View style={styles.robotCard}>
          <View style={styles.robotInfo}>
            <ThemedText style={styles.robotCardTitle}>Mars rover</ThemedText>
            <ThemedText style={styles.robotCardSubtitle}>All systems nominal</ThemedText>
            <View style={styles.healthRow}>
              <View style={[styles.healthDot, { backgroundColor: batteryHealthColor }]} />
              <ThemedText style={styles.healthLabel}>{batteryHealthLabel}</ThemedText>
            </View>
          </View>
          <View style={styles.robotGlyph}>
            <MaterialIcons name="smart-toy" color="#F3F4F6" size={96} />
          </View>
        </View>

        <View style={styles.powerRow}>
          <View style={styles.batteryCard}>
            <ThemedText style={styles.label}>Battery</ThemedText>
            <ThemedText style={styles.metricValue}>{formatPercent(batteryPercent)}</ThemedText>
            <ThemedText style={styles.metaText}>Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</ThemedText>
          </View>
          <View style={styles.statusBadge}>
            <ThemedText style={styles.badgeLabel}>{batteryHealthLabel}</ThemedText>
          </View>
        </View>

        <View style={styles.modesRow}>
          <ModeCard
            label="Manual"
            description="Direct joystick control"
            icon="gamepad"
            active={manualActive}
          />
          <ModeCard
            label="Agentic"
            description="Autonomous behaviors"
            icon="auto-awesome"
            active={agenticActive}
          />
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle">Behaviors</ThemedText>
          <ThemedText style={styles.metaText}>Loaded in memory</ThemedText>
        </View>

        <View style={styles.behaviorsStack}>
          {behaviors.map((behavior) => (
            <BehaviorCard key={behavior.id} config={behavior} />
          ))}
        </View>
      </ThemedView>
    </ScrollView>
  );
}

function ModeCard({
  label,
  description,
  icon,
  active,
}: {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  active: boolean;
}) {
  return (
    <Pressable style={[styles.modeCard, active && styles.modeCardActive]}>
      <View style={[styles.modeIconWrapper, active && styles.modeIconWrapperActive]}>
        <MaterialIcons name={icon} size={24} color={active ? '#0D0D0F' : '#F3F4F6'} />
      </View>
      <ThemedText style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</ThemedText>
      <ThemedText style={styles.modeDescription}>{description}</ThemedText>
    </Pressable>
  );
}

function BehaviorCard({ config }: { config: BehaviorCardConfig }) {
  return (
    <View style={styles.behaviorCard}>
      <View style={styles.behaviorHeader}>
        <View style={[styles.behaviorTag, { backgroundColor: config.tagTint }]}> 
          <ThemedText style={styles.behaviorTagText}>{config.tag}</ThemedText>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
      </View>
      <ThemedText style={styles.behaviorName}>{config.name}</ThemedText>
      <ThemedText style={styles.behaviorDescription}>{config.description}</ThemedText>
      <View style={styles.behaviorFooter}>
        <View style={[styles.behaviorStatus, { backgroundColor: config.statusTint }]}> 
          <ThemedText style={[styles.behaviorStatusText, { color: config.statusColor }]}>
            {config.status}
          </ThemedText>
        </View>
        <ThemedText style={styles.behaviorDetail}>{config.detail}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.7,
  },
  titleStack: {
    gap: 4,
  },
  metaText: {
    color: '#9CA3AF',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  refreshLabel: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 14,
  },
  robotCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#0D0D0F',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  robotInfo: {
    gap: 12,
    flex: 1,
  },
  robotCardTitle: {
    fontSize: 24,
    fontFamily: 'Lora_600SemiBold',
  },
  robotCardSubtitle: {
    color: '#D1D5DB',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthLabel: {
    color: '#F3F4F6',
  },
  robotGlyph: {
    padding: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  powerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  batteryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: 6,
  },
  metricValue: {
    fontSize: 32,
    fontFamily: 'JetBrainsMono_600SemiBold',
  },
  statusBadge: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  badgeLabel: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    color: '#F3F4F6',
  },
  modesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCard: {
    flex: 1,
    padding: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0F0F12',
    gap: 12,
  },
  modeCardActive: {
    backgroundColor: '#E5E7EB',
    borderColor: '#E5E7EB',
  },
  modeIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIconWrapperActive: {
    backgroundColor: '#0D0D0F',
  },
  modeLabel: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 18,
    color: '#F3F4F6',
  },
  modeLabelActive: {
    color: '#0D0D0F',
  },
  modeDescription: {
    color: '#9CA3AF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  behaviorsStack: {
    gap: 12,
  },
  behaviorCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0C0C0F',
    gap: 12,
  },
  behaviorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  behaviorTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  behaviorTagText: {
    fontSize: 12,
    color: '#E5E7EB',
    letterSpacing: 0.5,
  },
  behaviorName: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 18,
  },
  behaviorDescription: {
    color: '#9CA3AF',
  },
  behaviorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  behaviorStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  behaviorStatusText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 14,
  },
  behaviorDetail: {
    color: '#9CA3AF',
    flex: 1,
    textAlign: 'right',
  },
});
