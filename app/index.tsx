import { Redirect } from 'expo-router';

import { useRobot } from '@/context/robot-provider';

export default function Index() {
  const { status, controlToken } = useRobot();
  const isConnected = Boolean(status?.network?.ip);

  if (!isConnected) {
    return <Redirect href="/connection" />;
  }

  // If connected but not paired, redirect to pairing
  if (!controlToken) {
    return <Redirect href="/pairing" />;
  }

  // Connected and paired - go to main app
  return <Redirect href="/(tabs)/home" />;
}
