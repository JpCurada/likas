// Manual Jest mock for react-native-device-info.
// Battery level is overridable per-test via __setBatteryLevel().
let batteryLevel = 0.9;

module.exports = {
  __setBatteryLevel: lvl => {
    batteryLevel = lvl;
  },
  getBatteryLevel: jest.fn(async () => batteryLevel),
};
