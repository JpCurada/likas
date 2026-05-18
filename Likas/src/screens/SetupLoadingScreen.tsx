import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {assetManager} from '../services/assetManager';
import {useNavigation} from '@react-navigation/native';
import {ProgressBar} from '../components/onboarding/ProgressBar';

export const SetupLoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const navigation = useNavigation();

  useEffect(() => {
    const runSetup = async () => {
      try {
        const manifest = await assetManager.fetchManifest();
        const assetIds = Object.keys(manifest.assets);
        
        for (let i = 0; i < assetIds.length; i++) {
          const id = assetIds[i];
          const asset = manifest.assets[id];
          
          if (await assetManager.isInstalled(id)) continue;

          setCurrentStep(`Downloading ${id}...`);
          await assetManager.downloadAsset(id, (p) => {
            setProgress((i / assetIds.length) + (p.percent / assetIds.length));
          });
          
          await assetManager.decompressArchive(asset, await assetManager.getLocalPath(id) as string);
        }

        navigation.navigate('OnboardingScreen' as never);
      } catch (error) {
        console.error('Setup failed:', error);
        setCurrentStep('Setup Failed. Please restart the app.');
      }
    };

    runSetup();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Likas Setup</Text>
      <ActivityIndicator size="large" />
      <Text style={styles.step}>{currentStep}</Text>
      <ProgressBar progress={progress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20},
  title: {fontSize: 24, fontWeight: 'bold', marginBottom: 20},
  step: {marginVertical: 10, fontSize: 16}
});
