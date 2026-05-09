import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { LogManager } from '@maplibre/maplibre-react-native';

const App: React.FC = () => {
  useEffect(() => {
    if (!__DEV__) return;

    LogManager.setLogLevel('info');
    LogManager.onLog((log) => {
      if (log.tag === 'Mbgl-HttpRequest') {
        console.warn(`[MapLibre HTTP] ${log.message}`);
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
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
};

export default App;
