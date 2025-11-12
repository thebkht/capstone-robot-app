import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useRobot } from '@/context/robot-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { status, controlToken } = useRobot();

  const isConnected = Boolean(status?.network?.ip);

  if (!isConnected) {
    return <Redirect href="/connection" />;
  }

  // If connected but not paired, redirect to pairing
  if (!controlToken) {
    return <Redirect href="/pairing" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="camera.on.rectangle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="gauge" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="gearshape" color={color} />,
        }}
      />
    </Tabs>
  );
}
