import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {assetManager} from '../services/assetManager';
import {useNavigation} from '@react-navigation/native';
import {ProgressBar} from '../components/onboarding/ProgressBar';

// Update this with your actual public R2 bucket manifest URL
const MANIFEST_URL = 'https://pub-53341d238cbc41aa9b79be79ef34d866.r2.dev/likas/manifest.json';

export const SetupLoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Checking for updates...');
  const navigation = useNavigation();

  useEffect(() => {
    const runSetup = async () => {
      try {
        // 1. Fetch live manifest
        setCurrentStep('Fetching remote manifest...');
        const response = await fetch(MANIFEST_URL);
        const manifest = await response.json();

        const assetIds = Object.keys(manifest.assets);

        for (let i = 0; i < assetIds.length; i++) {
          const id = assetIds[i];
          const asset = manifest.assets[id];

          if (await assetManager.isInstalled(id)) continue;

          setCurrentStep(`Downloading ${id.replace(/-/g, ' ')}...`);

          // Download and verify
          await assetManager.downloadAsset(id, (p) => {
            const currentAssetWeight = 1 / assetIds.length;
            const completedWeight = i / assetIds.length;
            setProgress(completedWeight + (p.percent * currentAssetWeight));
          });

          // Auto-decompress archives
          if (asset.localFilename.endsWith('.zip')) {
            setCurrentStep(`Extracting ${id}...`);
            await assetManager.decompressArchive(asset, await assetManager.getLocalPath(id) as string);
          }
        }

        navigation.navigate('OnboardingScreen' as never);
      } catch (error) {
        console.error('Setup failed:', error);
        setCurrentStep('Setup Failed. Please check your connection.');
      }
    };

    runSetup();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Likas Initial Setup</Text>
      <ActivityIndicator size="large" color="#059669" />
      <Text style={styles.step}>{currentStep}</Text>
      <View style={styles.progressWrapper}>
        <ProgressBar currentStep={Math.round(progress * 100)} totalSteps={100} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f0fdf4'},
  title: {fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#064e3b'},
  step: {marginVertical: 10, fontSize: 16, color: '#374151', textAlign: 'center'},
  progressWrapper: {width: '100%', marginTop: 20}
});
