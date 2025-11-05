const { withInfoPlist } = require('@expo/config-plugins');

const BLE_BACKGROUND_MODES = {
  peripheral: 'bluetooth-peripheral',
  central: 'bluetooth-central',
};

function applyInfoPlist(config, options) {
  return withInfoPlist(config, (config) => {
    const infoPlist = config.modResults ?? {};
    const {
      bluetoothAlwaysPermission,
      isBackgroundEnabled = false,
      modes = [],
    } = options;

    if (typeof bluetoothAlwaysPermission === 'string' && bluetoothAlwaysPermission.length > 0) {
      infoPlist.NSBluetoothAlwaysUsageDescription = bluetoothAlwaysPermission;
    } else if (!infoPlist.NSBluetoothAlwaysUsageDescription) {
      infoPlist.NSBluetoothAlwaysUsageDescription =
        'Allow $(PRODUCT_NAME) to connect to nearby Bluetooth devices.';
    }

    if (!infoPlist.NSBluetoothPeripheralUsageDescription) {
      infoPlist.NSBluetoothPeripheralUsageDescription =
        'Allow $(PRODUCT_NAME) to communicate with nearby Bluetooth accessories.';
    }

    if (isBackgroundEnabled) {
      const allowedModes = new Set(infoPlist.UIBackgroundModes ?? []);
      for (const mode of modes) {
        const plistValue = BLE_BACKGROUND_MODES[mode];
        if (plistValue) {
          allowedModes.add(plistValue);
        }
      }

      if (allowedModes.size > 0) {
        infoPlist.UIBackgroundModes = Array.from(allowedModes);
      }
    }

    config.modResults = infoPlist;
    return config;
  });
}

function withReactNativeBlePlx(config, options = {}) {
  const resolvedOptions = {
    bluetoothAlwaysPermission: options.bluetoothAlwaysPermission,
    isBackgroundEnabled: Boolean(options.isBackgroundEnabled),
    modes: Array.isArray(options.modes) ? options.modes : [],
  };

  return applyInfoPlist(config, resolvedOptions);
}

module.exports = withReactNativeBlePlx;
module.exports.default = withReactNativeBlePlx;
