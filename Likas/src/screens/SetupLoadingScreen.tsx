import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {assetManager} from '../services/assetManager';
import {useNavigation} from '@react-navigation/native';
import {ProgressBar} from '../components/onboarding/ProgressBar';

// Update this with your actual public R2 bucket manifest URL
const MANIFEST_URL = 'https://cdn.likas-ai.com/likas/manifest.json';

export const SetupLoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Checking for updates...');
  const navigation = useNavigation();

  useEffect(() => {
    const runSetup = async () => {
      console.log('[SetupLoadingScreen] Starting runSetup...');
      try {
        // 1. Fetch live manifest
        setCurrentStep('Fetching remote manifest...');
        console.log(`[SetupLoadingScreen] Fetching manifest from ${MANIFEST_URL}`);
        const response = await fetch(MANIFEST_URL);
        const manifest = await response.json();
        console.log('[SetupLoadingScreen] Manifest fetched successfully:', Object.keys(manifest.assets));

        const assetIds = Object.keys(manifest.assets);

        for (let i = 0; i < assetIds.length; i++) {
          const id = assetIds[i];
          const asset = manifest.assets[id];

          console.log(`[SetupLoadingScreen] Checking if asset is installed: ${id}`);
          if (await assetManager.isInstalled(id)) {
            console.log(`[SetupLoadingScreen] Asset already installed: ${id}`);
            continue;
          }

          setCurrentStep(`Downloading ${id.replace(/-/g, ' ')}...`);
          console.log(`[SetupLoadingScreen] Starting download for asset: ${id}`);

          // Download and verify
          await assetManager.downloadAsset(id, (p) => {
            const currentAssetWeight = 1 / assetIds.length;
            const completedWeight = i / assetIds.length;
            const totalProgress = completedWeight + (p.percent * currentAssetWeight);
            setProgress(totalProgress);
            
            // Log every 10% or so to avoid spamming the console too much
            if (p.percent === 0 || p.percent === 1 || Math.round(p.percent * 100) % 10 === 0) {
              console.log(`[SetupLoadingScreen] Download progress for ${id}: ${Math.round(p.percent * 100)}%`);
            }
          });

          console.log(`[SetupLoadingScreen] Download complete for asset: ${id}`);

          // Auto-decompress archives
          if (asset.localFilename.endsWith('.zip')) {
            setCurrentStep(`Extracting ${id}...`);
            console.log(`[SetupLoadingScreen] Extracting asset: ${id}`);
            await assetManager.decompressArchive(asset, await assetManager.getLocalPath(id) as string);
            console.log(`[SetupLoadingScreen] Extraction complete for asset: ${id}`);
          }
        }

        console.log('[SetupLoadingScreen] All assets processed. Navigating to OnboardingScreen.');
        navigation.navigate('OnboardingScreen' as never);
      } catch (error) {
        console.error('[SetupLoadingScreen] Setup failed:', error);
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
