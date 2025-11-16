import {PermissionsAndroid, Platform} from 'react-native';
import {BleManager, Characteristic, Device, Subscription} from 'react-native-ble-plx';
import {Buffer} from 'buffer';

export type WifiStatus = 'idle' | 'connecting' | 'connected' | 'failed';

type StatusListener = (status: WifiStatus) => void;

export class RovyWifiManager {
  private bleManager: BleManager;
  private wifiServiceUUID = '1234abcd-0000-1000-8000-00805f9b34fb';
  private wifiConfigCharacteristicUUID = '1234abcd-0001-1000-8000-00805f9b34fb';
  private wifiStatusCharacteristicUUID = '1234abcd-0002-1000-8000-00805f9b34fb';
  private connectedDevice?: Device;
  private statusSubscription?: Subscription;
  private listeners: StatusListener[] = [];

  constructor() {
    this.bleManager = new BleManager();
  }

  /**
   * Requests platform BLE permissions when required.
   */
  private async ensurePermissions(): Promise<void> {
    if (Platform.OS === 'android') {
      const needsFineLocation = Platform.Version >= 23;
      if (needsFineLocation) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'Rovy provisioning requires Bluetooth scanning.',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Bluetooth permission denied');
        }
      }
      // TODO: Request Android 12+ specific BLE permissions (BLUETOOTH_SCAN/CONNECT)
    }
    // iOS permissions should be configured via Info.plist (no runtime request).
  }

  /**
   * Scans nearby BLE devices for ROVY robots.
   */
  async scanForRovy(timeoutMs = 5000): Promise<Device[]> {
    await this.ensurePermissions();
    console.log('[RovyWifi] Starting BLE scan');

    const discovered = new Map<string, Device>();

    return new Promise((resolve, reject) => {
      const stopScan = (error?: Error) => {
        console.log('[RovyWifi] Stopping BLE scan');
        this.bleManager.stopDeviceScan();
        if (error) {
          reject(error);
        } else {
          resolve(Array.from(discovered.values()));
        }
      };

      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('[RovyWifi] Scan error', error);
          stopScan(error);
          return;
        }

        if (device?.name?.startsWith('ROVY-')) {
          console.log('[RovyWifi] Found device', device.name, device.id);
          discovered.set(device.id, device);
        }
      });

      setTimeout(() => stopScan(), timeoutMs);
    });
  }

  async connectToRovy(deviceId: string): Promise<void> {
    console.log('[RovyWifi] Connecting to device', deviceId);
    await this.disconnect();

    const device = await this.bleManager.connectToDevice(deviceId);
    this.connectedDevice = await device.discoverAllServicesAndCharacteristics();

    const services = await this.bleManager.servicesForDevice(device.id);
    const wifiService = services.find(
      service => service.uuid.toLowerCase() === this.wifiServiceUUID.toLowerCase(),
    );
    if (!wifiService) {
      throw new Error('Wi-Fi service not found on device');
    }

    const characteristics = await this.bleManager.characteristicsForDevice(
      device.id,
      wifiService.uuid,
    );
    const wifiConfig = characteristics.find(
      c => c.uuid.toLowerCase() === this.wifiConfigCharacteristicUUID.toLowerCase(),
    );
    const wifiStatus = characteristics.find(
      c => c.uuid.toLowerCase() === this.wifiStatusCharacteristicUUID.toLowerCase(),
    );

    if (!wifiConfig || !wifiStatus) {
      throw new Error('Wi-Fi characteristics missing on device');
    }

    this.monitorStatus(device, wifiService.uuid, wifiStatus.uuid);
    console.log('[RovyWifi] Connected and monitoring Wi-Fi status');
  }

  private monitorStatus(device: Device, serviceUUID: string, characteristicUUID: string) {
    this.statusSubscription?.remove();
    this.statusSubscription = this.bleManager.monitorCharacteristicForDevice(
      device.id,
      serviceUUID,
      characteristicUUID,
      (error, characteristic) => {
        if (error) {
          console.error('[RovyWifi] Status monitor error', error);
          return;
        }
        if (characteristic?.value) {
          const statusStr = Buffer.from(characteristic.value, 'base64').toString('utf-8');
          console.log('[RovyWifi] Wi-Fi status update', statusStr);
          this.listeners.forEach(listener => listener(statusStr as WifiStatus));
        }
      },
    );
  }

  async sendWifiConfig(ssid: string, password: string): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No connected device');
    }

    const payload = JSON.stringify({ssid, password});
    console.log('[RovyWifi] Sending Wi-Fi config', payload);
    const buffer = Buffer.from(payload, 'utf-8');
    const base64Payload = buffer.toString('base64');

    await this.bleManager.writeCharacteristicWithResponseForDevice(
      this.connectedDevice.id,
      this.wifiServiceUUID,
      this.wifiConfigCharacteristicUUID,
      base64Payload,
    );
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  async disconnect(): Promise<void> {
    if (this.statusSubscription) {
      this.statusSubscription.remove();
      this.statusSubscription = undefined;
    }

    if (this.connectedDevice) {
      console.log('[RovyWifi] Disconnecting device');
      try {
        await this.bleManager.cancelDeviceConnection(this.connectedDevice.id);
      } catch (error) {
        console.warn('[RovyWifi] Error disconnecting device', error);
      }
      this.connectedDevice = undefined;
    }
  }
}

export const rovyWifiManager = new RovyWifiManager();

