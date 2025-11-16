import {useEffect, useMemo, useState} from 'react';
import {WifiStatus, RovyWifiManager} from '../services/RovyWifiManager';

export const useRovyWifi = () => {
  const manager = useMemo(() => new RovyWifiManager(), []);
  const [status, setStatus] = useState<WifiStatus>('idle');

  useEffect(() => {
    const unsubscribe = manager.onStatusChange(setStatus);
    return () => {
      unsubscribe();
      manager.disconnect();
    };
  }, [manager]);

  return {manager, status};
};

