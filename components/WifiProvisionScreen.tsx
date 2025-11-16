import React, {useState} from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import {Device} from 'react-native-ble-plx';
import {useRovyWifi} from '../hooks/useRovyWifi';

const statusLabels: Record<string, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  connected: 'Connected',
  failed: 'Failed',
};

export const WifiProvisionScreen: React.FC = () => {
  const {manager, status} = useRovyWifi();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setError(null);
    setLoading(true);
    try {
      const found = await manager.scanForRovy();
      setDevices(found);
      if (!found.length) {
        Alert.alert('Scan Complete', 'No ROVY robots found nearby.');
      }
    } catch (scanError) {
      console.error('[WifiProvisionScreen] Scan error', scanError);
      setError((scanError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (device: Device) => {
    setError(null);
    setSelectedDevice(device);
    setLoading(true);
    try {
      await manager.connectToRovy(device.id);
    } catch (connectError) {
      console.error('[WifiProvisionScreen] Connect error', connectError);
      setError((connectError as Error).message);
      setSelectedDevice(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSendConfig = async () => {
    if (!ssid || !password) {
      setError('SSID and password are required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await manager.sendWifiConfig(ssid, password);
    } catch (sendError) {
      console.error('[WifiProvisionScreen] Wi-Fi config error', sendError);
      setError((sendError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const renderDevice = ({item}: {item: Device}) => (
    <TouchableOpacity style={styles.deviceRow} onPress={() => handleConnect(item)}>
      <Text style={styles.deviceName}>{item.name ?? 'Unnamed'}</Text>
      <Text style={styles.deviceId}>{item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>ROVY Wi-Fi Provisioning</Text>
      <Button title={loading ? 'Scanning…' : 'Scan for ROVY'} onPress={handleScan} disabled={loading} />

      <FlatList
        data={devices}
        keyExtractor={item => item.id}
        renderItem={renderDevice}
        style={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No devices yet. Tap "Scan".</Text>}
      />

      {selectedDevice && (
        <View style={styles.form}>
          <Text style={styles.subheading}>Connected to {selectedDevice.name}</Text>
          <TextInput
            placeholder="Wi-Fi SSID"
            style={styles.input}
            value={ssid}
            onChangeText={setSsid}
            autoCapitalize="none"
          />
          <TextInput
            placeholder="Wi-Fi Password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Button
            title={loading ? 'Sending…' : 'Connect Wi-Fi'}
            onPress={handleSendConfig}
            disabled={loading}
          />
        </View>
      )}

      <Text style={styles.status}>Status: {statusLabels[status] ?? status}</Text>
      {error && <Text style={styles.error}>Error: {error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
    maxHeight: 180,
    marginVertical: 12,
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 16,
  },
  deviceRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
  },
  form: {
    marginTop: 24,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
  },
  status: {
    marginTop: 24,
    fontSize: 16,
    fontWeight: '500',
  },
  error: {
    marginTop: 8,
    color: 'red',
  },
});

export default WifiProvisionScreen;

