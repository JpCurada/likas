import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo, {type NetInfoState} from '@react-native-community/netinfo';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {COLORS, FONTS, SIZES} from '../theme';
import {Icon} from '../components/Icon';
import {isOnboardingComplete, setSetupComplete} from '../database/storage';
import {RootStackParamList} from '../navigation/AppNavigator';
import {
  AssetDownloadError,
  ChecksumMismatchError,
  DownloadProgress,
  Manifest,
  ManifestAsset,
  assetManager,
} from '../services/assetManager';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

type AssetStatus = 'checking' | 'ready' | 'pending' | 'downloading' | 'error';

type AssetState = {
  status: AssetStatus;
  progress: DownloadProgress | null;
  error: string | null;
};

// Human-readable display config per asset ID
const ASSET_DISPLAY: Record<
  string,
  {label: string; icon: string; description: string}
> = {
  'map-tiles': {
    label: 'Offline Map Tiles',
    icon: 'map',
    description: 'Philippines base map with evacuation routes & POIs',
  },
  'pedestrian-graph-db': {
    label: 'Walking Routes',
    icon: 'walk',
    description: 'Offline pedestrian navigation graph for routing',
  },
  'ai-model-gemma-4-e2b': {
    label: 'AI Guide (Gemma 4 Finetuned)',
    icon: 'robot-happy',
    description: 'On-device disaster advisor in Filipino & English',
  },
};

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
};

const OFFLINE_DL_TITLE = 'Internet required';
const OFFLINE_DL_MESSAGE =
  'Connect to Wi-Fi or mobile data to download these files. This one-time setup needs internet; afterward Likas works fully offline.';

/** User-facing copy for RNFS / DNS / timeout failures (avoids raw hostname errors on cards). */
const humanizeDownloadError = (err: unknown): string => {
  if (err instanceof ChecksumMismatchError) {
    return 'File integrity check failed. Please retry.';
  }
  const raw =
    err instanceof AssetDownloadError || err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';
  const lower = raw.toLowerCase();
  if (
    lower.includes('unable to resolve host') ||
    lower.includes('no address associated with hostname') ||
    lower.includes('network request failed') ||
    lower.includes('network is unreachable') ||
    lower.includes('failed to connect') ||
    lower.includes('could not connect') ||
    lower.includes('connection refused') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('internet connection appears to be offline')
  ) {
    return 'No internet connection or the download server could not be reached. Connect to Wi-Fi or mobile data and try again.';
  }
  if (err instanceof AssetDownloadError || err instanceof Error) {
    return raw.trim() || 'Download failed. Check your connection and try again.';
  }
  if (typeof err === 'string' && raw.trim()) {
    return raw.trim();
  }
  return 'Download failed. Check your connection and try again.';
};

export const SetupScreen: React.FC<Props> = ({navigation}) => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [assetStates, setAssetStates] = useState<Record<string, AssetState>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [net, setNet] = useState<NetInfoState | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(setNet);
    void NetInfo.fetch().then(setNet);
    return () => {
      unsub();
    };
  }, []);

  const downloadsBlocked = useMemo(() => {
    if (!net) return false;
    if (net.isConnected === false) return true;
    if (net.isInternetReachable === false) return true;
    return false;
  }, [net]);

  const patchAsset = useCallback((id: string, patch: Partial<AssetState>) => {
    setAssetStates(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {status: 'pending', progress: null, error: null}),
        ...patch,
      },
    }));
  }, []);

  // On mount: fetch manifest and check which assets are already installed
  useEffect(() => {
    (async () => {
      try {
        const m = await assetManager.fetchManifest();
        setManifest(m);
        const ids = Object.keys(m.assets);
        const checks = await Promise.all(
          ids.map(async id => ({
            id,
            ready: await assetManager.isInstalled(id),
          })),
        );
        const initial: Record<string, AssetState> = {};
        checks.forEach(({id, ready}) => {
          initial[id] = {
            status: ready ? 'ready' : 'pending',
            progress: null,
            error: null,
          };
        });
        setAssetStates(initial);
      } catch {
        // Will surface an error when user taps Download
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const notifyOfflineIfNeeded = useCallback(() => {
    if (!downloadsBlocked) return false;
    Alert.alert(OFFLINE_DL_TITLE, OFFLINE_DL_MESSAGE);
    return true;
  }, [downloadsBlocked]);

  const downloadOne = useCallback(
    async (id: string, asset: ManifestAsset) => {
      if (downloadingId) return;
      if (notifyOfflineIfNeeded()) return;
      setDownloadingId(id);
      patchAsset(id, {status: 'downloading', error: null, progress: null});
      try {
        await assetManager.downloadAsset(id, p =>
          patchAsset(id, {progress: p}),
        );
        const localPath = await assetManager.getLocalPath(id);
        if (localPath) {
          await assetManager.decompressArchive(asset, localPath);
        }
        patchAsset(id, {status: 'ready', progress: null});
      } catch (err) {
        const message = humanizeDownloadError(err);
        patchAsset(id, {status: 'error', error: message, progress: null});
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadingId, notifyOfflineIfNeeded, patchAsset],
  );

  const downloadAllRequired = useCallback(async () => {
    if (!manifest || downloadingId) return;
    if (notifyOfflineIfNeeded()) return;
    // Every manifest entry is required for offline operation, so we iterate
    // all of them and keep going past individual errors — the user can retry
    // failed cards individually.
    const pending = Object.entries(manifest.assets).filter(
      ([id]) => assetStates[id]?.status !== 'ready',
    );
    for (const [id, asset] of pending) {
      await downloadOne(id, asset);
    }
  }, [
    manifest,
    assetStates,
    downloadingId,
    downloadOne,
    notifyOfflineIfNeeded,
  ]);

  const handleContinue = async () => {
    await setSetupComplete();
    // Move on to onboarding (which now uses the offline map for the
    // meeting-point picker), unless the user is re-entering Setup after
    // already having completed onboarding (asset wipe / OTA refresh).
    const onboardingDone = await isOnboardingComplete();
    navigation.replace(onboardingDone ? 'Main' : 'Onboarding');
  };

  // Every manifest asset is required for offline operation; we treat the full
  // list as a single batch and don't expose a Skip path.
  const allIds = manifest ? Object.keys(manifest.assets) : [];
  const readyCount = allIds.filter(
    id => assetStates[id]?.status === 'ready',
  ).length;
  const canContinue = allIds.length > 0 && readyCount === allIds.length;

  // Bytes summary for the header — gives the user a sense of total work left.
  const totalBytes = manifest
    ? Object.values(manifest.assets).reduce((sum, a) => sum + a.size, 0)
    : 0;
  const remainingBytes = manifest
    ? Object.entries(manifest.assets)
        .filter(([id]) => assetStates[id]?.status !== 'ready')
        .reduce((sum, [, a]) => sum + a.size, 0)
    : 0;

  const renderCard = (id: string, asset: ManifestAsset) => {
    const state = assetStates[id] ?? {
      status: 'checking',
      progress: null,
      error: null,
    };
    const display = ASSET_DISPLAY[id] ?? {
      label: id,
      icon: 'download-box',
      description: '',
    };
    const isReady = state.status === 'ready';
    const isDownloading = state.status === 'downloading';
    const isError = state.status === 'error';
    const isOtherDownloading = downloadingId !== null && downloadingId !== id;
    const dlDisabled = downloadsBlocked || isOtherDownloading;

    return (
      <View
        key={id}
        style={[styles.card, isReady && styles.cardReady, isError && styles.cardError]}>
        {/* Card header row */}
        <View style={styles.cardRow}>
          <View style={[styles.iconBox, isReady && styles.iconBoxReady]}>
            {state.status === 'checking' ? (
              <ActivityIndicator size="small" color={COLORS.primaryGreen} />
            ) : (
              <Icon
                name={isReady ? 'check' : display.icon}
                size={20}
                color={isReady ? COLORS.white : COLORS.primaryGreen}
              />
            )}
          </View>
          <View style={styles.cardText}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardLabel}>{display.label}</Text>
            </View>
            <Text style={styles.cardDesc}>{display.description}</Text>
            <Text style={styles.cardSize}>{formatSize(asset.size)}</Text>
          </View>
        </View>

        {/* Download progress */}
        {isDownloading && (
          <View style={styles.progressBlock}>
            {state.progress ? (
              <>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(
                          state.progress.percent * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {Math.round(state.progress.percent * 100)}% ·{' '}
                  {formatSize(state.progress.bytesDownloaded)} of{' '}
                  {formatSize(state.progress.totalBytes)}
                </Text>
              </>
            ) : (
              <View style={styles.connectingRow}>
                <ActivityIndicator size="small" color={COLORS.primaryGreen} />
                <Text style={styles.progressText}>Connecting…</Text>
              </View>
            )}
          </View>
        )}

        {/* Error message */}
        {isError && (
          <Text style={styles.errorMsg} numberOfLines={4}>
            {humanizeDownloadError(state.error)}
          </Text>
        )}

        {/* Action buttons */}
        {!isReady && !isDownloading && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[
                styles.dlBtn,
                dlDisabled && styles.dlBtnDisabled,
              ]}
              onPress={() => {
                if (downloadsBlocked) {
                  notifyOfflineIfNeeded();
                  return;
                }
                if (!isOtherDownloading) {
                  void downloadOne(id, asset);
                }
              }}
              disabled={isOtherDownloading}>
              <Icon name="download" size={14} color={COLORS.white} />
              <Text style={styles.dlBtnText}>
                {isError ? 'Retry' : 'Download'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Get Likas Ready</Text>
        <Text style={styles.subtitle}>
          All assets below are required to run Likas offline. Download once,
          then the app works without internet.
        </Text>
        {downloadsBlocked && (
          <View style={styles.offlineBanner} accessibilityRole="alert">
            <Icon name="wifi-off" size={20} color={COLORS.error} />
            <Text style={styles.offlineBannerText}>
              You are offline or have no internet access. Connect to Wi-Fi or
              mobile data to download assets for this initial setup.
            </Text>
          </View>
        )}
        {!loading && allIds.length > 0 && (
          <View style={styles.summaryBlock}>
            <View style={styles.summaryTrack}>
              <View
                style={[
                  styles.summaryFill,
                  {
                    width: `${(readyCount / allIds.length) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.summaryText}>
              {readyCount} of {allIds.length} ready
              {remainingBytes > 0
                ? ` · ${formatSize(remainingBytes)} left to download`
                : ` · ${formatSize(totalBytes)} installed`}
            </Text>
          </View>
        )}
      </View>

      {/* Asset list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primaryGreen} />
            <Text style={styles.loadingText}>Fetching asset list…</Text>
          </View>
        ) : manifest ? (
          Object.entries(manifest.assets).map(([id, asset]) =>
            renderCard(id, asset),
          )
        ) : (
          <View style={styles.loadingBox}>
            <Icon name="wifi-off" size={40} color={COLORS.error} />
            <Text style={styles.errorMsg}>
              Could not load asset list. Check your internet connection.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      {!loading && (
        <View style={styles.footer}>
          {canContinue ? (
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={handleContinue}>
              <Icon name="check-circle" size={18} color={COLORS.white} />
              <Text style={styles.footerBtnText}>Continue to Likas</Text>
            </TouchableOpacity>
          ) : downloadingId ? (
            <View style={[styles.dlAllBtn, styles.dlAllBtnBusy]}>
              <ActivityIndicator size="small" color={COLORS.white} />
              <Text style={styles.footerBtnText}>Downloading…</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.dlAllBtn,
                downloadsBlocked && styles.dlAllBtnDisabled,
              ]}
              onPress={() => {
                if (downloadsBlocked) {
                  void notifyOfflineIfNeeded();
                  return;
                }
                void downloadAllRequired();
              }}>
              <Icon name="download-multiple" size={18} color={COLORS.white} />
              <Text style={styles.footerBtnText}>
                {downloadsBlocked
                  ? 'Waiting for internet…'
                  : remainingBytes > 0
                    ? `Download All · ${formatSize(remainingBytes)}`
                    : 'Download All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f8fdf9'},

  // Header
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.padding,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.lightGreen,
    gap: 6,
  },
  title: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 26,
    color: COLORS.darkGreen,
  },
  subtitle: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 19,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  offlineBannerText: {
    flex: 1,
    fontFamily: FONTS.primaryMedium,
    fontSize: 13,
    color: COLORS.darkGreen,
    lineHeight: 19,
  },
  summaryBlock: {gap: 6, marginTop: 10},
  summaryTrack: {
    height: 7,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 4,
    overflow: 'hidden',
  },
  summaryFill: {
    height: '100%',
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 4,
  },
  summaryText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: 12,
    color: COLORS.gray,
  },

  // List
  scroll: {flex: 1},
  scrollContent: {padding: 16, gap: 12, paddingBottom: 8},
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 14,
    color: COLORS.gray,
  },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    padding: 14,
    gap: 10,
    elevation: 2,
    shadowColor: COLORS.darkGreen,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardReady: {borderColor: COLORS.primaryGreen},
  cardError: {borderColor: '#fca5a5'},
  cardRow: {flexDirection: 'row', gap: 12, alignItems: 'flex-start'},
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxReady: {backgroundColor: COLORS.primaryGreen},
  cardText: {flex: 1, gap: 3},
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 15,
    color: COLORS.darkGreen,
  },
  cardDesc: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    lineHeight: 17,
  },
  cardSize: {
    fontFamily: FONTS.primaryMedium,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 1,
  },

  // Progress
  progressBlock: {gap: 6},
  progressTrack: {
    height: 7,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: 11,
    color: COLORS.darkGreen,
    textAlign: 'center',
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  // Error
  errorMsg: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.error,
    lineHeight: 17,
  },

  // Card actions
  cardActions: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  dlBtn: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: COLORS.primaryGreen,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  dlBtnDisabled: {backgroundColor: COLORS.accentGreen, opacity: 0.6},
  dlBtnText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 13,
    color: COLORS.white,
  },

  // Footer
  footer: {
    paddingHorizontal: SIZES.padding,
    paddingVertical: 14,
    borderTopWidth: 1.5,
    borderTopColor: COLORS.lightGreen,
    backgroundColor: COLORS.white,
  },
  dlAllBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.primaryGreen,
    paddingVertical: 16,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlAllBtnDisabled: {opacity: 0.55},
  dlAllBtnBusy: {opacity: 0.75},
  continueBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.darkGreen,
    paddingVertical: 16,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 16,
    color: COLORS.white,
  },
});

export default SetupScreen;
