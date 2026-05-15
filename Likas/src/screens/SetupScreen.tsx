import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import RNFS from 'react-native-fs';

import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from '../components/Icon';
import { setSetupComplete } from '../database/storage';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  AssetDownloadError,
  ChecksumMismatchError,
  DownloadProgress,
  assetManager,
} from '../services/assetManager';
import { isOfflineMapReady } from '../utils/mapAssetManager';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

const MAP_TILES_ASSET_ID = 'map-tiles';
const AI_MODEL_ASSET_ID = 'ai-model-gemma-4-e2b';

type Step = 'maps' | 'ai' | 'finished';
type Status = 'idle' | 'checking' | 'downloading' | 'done' | 'error';

const formatGB = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

export const SetupScreen: React.FC<Props> = ({ navigation }) => {
  const [step, setStep] = useState<Step>('maps');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState<number>(0);
  const [modelSize, setModelSize] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const manifest = await assetManager.fetchManifest();
        if (cancelled) return;
        setMapSize(manifest.assets[MAP_TILES_ASSET_ID]?.size ?? 0);
        setModelSize(manifest.assets[AI_MODEL_ASSET_ID]?.size ?? 0);

        const mapsReady = await isOfflineMapReady();
        if (cancelled) return;
        if (mapsReady) {
          setStep('ai');
          if (await assetManager.isInstalled(AI_MODEL_ASSET_ID)) {
            setStatus('done');
          }
        }
      } catch {
        // Manifest may be unreachable in dev; surface only when user acts.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = async () => {
    await setSetupComplete();
    navigation.replace('Main');
  };

  const startDownload = async (assetId: string, next: Step | 'finish') => {
    setStatus('checking');
    setErrorMessage(null);
    setProgress(null);
    try {
      setStatus('downloading');
      await assetManager.downloadAsset(assetId, p => setProgress(p));
      if (next === 'finish') {
        await finish();
        return;
      }
      setStep(next);
      setStatus('idle');
      setProgress(null);
    } catch (err) {
      let message = 'Download failed. Check your connection and try again.';
      if (err instanceof ChecksumMismatchError) {
        message = 'Downloaded file failed integrity check. Please try again.';
      } else if (err instanceof AssetDownloadError) {
        message = err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setErrorMessage(message);
      setStatus('error');
    }
  };

  const handleSkipAi = () => {
    Alert.alert(
      'Skip AI download?',
      'The app will still work with offline maps and protocols. You can add the AI guide later from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip for now', onPress: finish },
      ],
    );
  };

  const handleDownloadMaps = () => {
    startDownload(MAP_TILES_ASSET_ID, 'ai');
  };

  const handleDownloadAi = () => {
    startDownload(AI_MODEL_ASSET_ID, 'finish');
  };

  const requestManageStorage = () => {
    if (Platform.OS === 'android' && Platform.Version >= 30) {
      Alert.alert(
        "Storage Access Needed",
        "To use sideloaded AI models, you must enable 'All files access' for Likas in the next screen.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: () => Linking.sendIntent('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION') 
          } 
        ]
      );
    }
  };

  const handleSideload = async (assetId: string, next: Step | 'finish') => {
    console.log(`handleSideload triggered for ${assetId}`);
    setStatus('checking');
    setErrorMessage(null);
    try {
      console.log('Fetching manifest...');
      const manifest = await assetManager.fetchManifest();
      const asset = manifest.assets[assetId];
      if (!asset) {
        console.log(`Asset ${assetId} not in manifest.`);
        setErrorMessage(`Asset ${assetId} not in manifest.`);
        setStatus('error');
        return;
      }
      const sideloadDir =
        Platform.OS === 'android' ? '/sdcard/likas' : RNFS.DocumentDirectoryPath;
      const sourcePath = `${sideloadDir}/${asset.localFilename}`;
      console.log(`Checking source path: ${sourcePath}`);
      if (!(await RNFS.exists(sourcePath))) {
        console.log('File not found.');
        setErrorMessage(
          `File not found at ${sourcePath}. Push it with:\nadb push ${asset.localFilename} ${sideloadDir}/`,
        );
        setStatus('error');
        return;
      }
      console.log('Importing from path...');
      await assetManager.importFromPath(assetId, sourcePath);
      console.log('Import successful.');
      if (next === 'finish') {
        await finish();
        return;
      }
      setStep(next);
      setStatus('idle');
    } catch (err: any) {
      console.error('Sideload failed:', err);
      // Check if it's a permission-related error
      if (err.message.includes('EACCES') || err.message.includes('Permission denied')) {
        requestManageStorage();
      }
      let message = 'Sideload failed.';
      if (err instanceof Error) message = err.message;
      setErrorMessage(message);
      setStatus('error');
    }
  };

  const handleSideloadMaps = () => handleSideload(MAP_TILES_ASSET_ID, 'ai');
  const handleSideloadAi = () => handleSideload(AI_MODEL_ASSET_ID, 'finish');

  const renderProgress = () => {
    if (status !== 'downloading' || !progress) return null;
    const percent = Math.round(progress.percent * 100);
    return (
      <View style={styles.progressBlock}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {percent}% · {formatGB(progress.bytesDownloaded)} of {formatGB(progress.totalBytes)}
        </Text>
      </View>
    );
  };

  const renderBusy = (title: string) => (
    <View style={styles.statusBlock}>
      <ActivityIndicator size="large" color={COLORS.primaryGreen} />
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusBody}>
        Keep the app open. Use Wi-Fi if possible — this is a one-time download.
      </Text>
      {renderProgress()}
    </View>
  );

  const renderError = () => (
    <View style={styles.statusBlock}>
      <Icon name="alert-circle" size={48} color={COLORS.error} />
      <Text style={styles.statusTitle}>Download failed</Text>
      <Text style={styles.statusBody}>{errorMessage}</Text>
      {errorMessage?.includes('permanently denied') && (
        <TouchableOpacity 
          style={[styles.primaryButton, { marginTop: 10 }]} 
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.primaryButtonText}>Open Settings</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderMapsStep = () => {
    if (status === 'downloading' || status === 'checking') {
      return renderBusy('Downloading offline maps…');
    }
    if (status === 'error') return renderError();
    return (
      <View style={styles.statusBlock}>
        <Icon name="map" size={48} color={COLORS.primaryGreen} />
        <Text style={styles.statusTitle}>Download offline maps</Text>
        <Text style={styles.statusBody}>
          LIKAS needs offline map data to show evacuation centers and routes without internet.
          You can sideload from /sdcard/likas instead for offline installs.
        </Text>
        <Text style={styles.metaText}>
          Download size: ~{mapSize ? formatGB(mapSize) : '0.85 GB'} · Wi-Fi recommended
        </Text>
        <Text style={styles.stepIndicator}>Step 1 of 2 · Required</Text>
      </View>
    );
  };

  const renderAiStep = () => {
    if (status === 'done') {
      return (
        <View style={styles.statusBlock}>
          <Icon name="check-circle" size={48} color={COLORS.primaryGreen} />
          <Text style={styles.statusTitle}>AI assistant ready</Text>
          <Text style={styles.statusBody}>
            You can now ask the offline AI guide for help with disaster protocols.
          </Text>
        </View>
      );
    }
    if (status === 'downloading' || status === 'checking') {
      return renderBusy('Downloading AI model…');
    }
    if (status === 'error') return renderError();
    return (
      <View style={styles.statusBlock}>
        <Icon name="robot-happy" size={48} color={COLORS.primaryGreen} />
        <Text style={styles.statusTitle}>Set up your offline AI guide</Text>
        <Text style={styles.statusBody}>
          Optional. The AI assistant works fully offline once installed and answers
          disaster-related questions in English and Filipino.
        </Text>
        <Text style={styles.metaText}>
          Download size: ~{modelSize ? formatGB(modelSize) : '3.0 GB'} · Wi-Fi recommended
        </Text>
        <Text style={styles.stepIndicator}>Step 2 of 2 · Optional</Text>
      </View>
    );
  };

  const renderActions = () => {
    if (status === 'downloading' || status === 'checking') return null;

    if (step === 'maps') {
      if (status === 'error') {
        return (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={handleDownloadMaps}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tertiaryButton} onPress={handleSideloadMaps}>
              <Text style={styles.tertiaryButtonText}>Use sideloaded file</Text>
            </TouchableOpacity>
          </>
        );
      }
      return (
        <>
          <TouchableOpacity style={styles.primaryButton} onPress={handleDownloadMaps}>
            <Text style={styles.primaryButtonText}>Download maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tertiaryButton} onPress={handleSideloadMaps}>
            <Text style={styles.tertiaryButtonText}>Use sideloaded file</Text>
          </TouchableOpacity>
        </>
      );
    }

    // step === 'ai'
    if (status === 'done') {
      return (
        <TouchableOpacity style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      );
    }
    if (status === 'error') {
      return (
        <>
          <TouchableOpacity style={styles.primaryButton} onPress={handleDownloadAi}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tertiaryButton} onPress={handleSideloadAi}>
            <Text style={styles.tertiaryButtonText}>Use sideloaded file</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSkipAi}>
            <Text style={styles.secondaryButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </>
      );
    }
    return (
      <>
        <TouchableOpacity style={styles.primaryButton} onPress={handleDownloadAi}>
          <Text style={styles.primaryButtonText}>Download AI model</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tertiaryButton} onPress={handleSideloadAi}>
          <Text style={styles.tertiaryButtonText}>Use sideloaded file</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleSkipAi}>
          <Text style={styles.secondaryButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {step === 'maps' ? renderMapsStep() : renderAiStep()}
      </View>
      <View style={styles.actions}>{renderActions()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: SIZES.padding,
    paddingTop: SIZES.padding * 2,
    justifyContent: 'center',
  },
  statusBlock: {
    alignItems: 'center',
    gap: 12,
  },
  statusTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
    textAlign: 'center',
    marginTop: 8,
  },
  statusBody: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  metaText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    marginTop: 8,
  },
  stepIndicator: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginTop: 4,
  },
  progressBlock: {
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primaryGreen,
  },
  progressText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: SIZES.padding,
    paddingBottom: SIZES.padding,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primaryGreen,
    paddingVertical: 16,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.white,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.body,
    color: COLORS.gray,
  },
  tertiaryButton: {
    paddingVertical: 12,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  tertiaryButtonText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
});

export default SetupScreen;
