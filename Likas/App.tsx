import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigator } from './src/navigation/AppNavigator';
import { LogManager } from '@maplibre/maplibre-react-native';

const App: React.FC = () => {
  useEffect(() => {
    if (!__DEV__) return;

    LogManager.setLogLevel('info');
    LogManager.onLog((log) => {
      if (log.tag === 'Mbgl-HttpRequest') {
        // Use console.info with yellow text so it prints in Metro like a warning, 
        // but DOES NOT trigger the on-device LogBox
        console.info('\x1b[33m%s\x1b[0m', `[MapLibre HTTP] ${log.message}`);
        return true;
      }
      return false;
    });
    LogManager.start();

    return () => {
      LogManager.stop();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
