import { Redirect } from 'expo-router';

import { useRobot } from '@/context/robot-provider';

export default function Index() {
  const { status } = useRobot();
  const isConnected = Boolean(status?.network?.ip);

  return <Redirect href={isConnected ? '/(tabs)/camera' : '/connection'} />;
}
