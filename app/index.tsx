import { Redirect } from 'expo-router';

import { useAuth } from '@/context/auth-provider';
import { useRobot } from '@/context/robot-provider';

export default function Index() {
  const { isAuthenticated } = useAuth();
  const { status } = useRobot();
  const isConnected = Boolean(status?.network?.ip);

  if (!isAuthenticated) {
    return <Redirect href="/connection" />;
  }

  return <Redirect href={isConnected ? '/(tabs)/camera' : '/connection'} />;
}
