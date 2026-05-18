import React, { useState } from 'react';
import { View, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { COLORS } from '../theme';
import { ProgressBar } from '../components/onboarding/ProgressBar';
import { OnboardingSuccessOverlay } from '../components/onboarding/OnboardingSuccessOverlay';
import { Step1Identity } from '../components/onboarding/Step1Identity';
import { Step2Companions } from '../components/onboarding/Step2Companions';
import { Step3Health } from '../components/onboarding/Step3Health';
import { Step4Location } from '../components/onboarding/Step4Location';
import { Step5Contacts } from '../components/onboarding/Step5Contacts';
import {
  DEFAULT_PROFILE,
  UserProfile,
  saveProfile,
  setOnboardingComplete,
} from '../database/storage';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAppStore } from '../stores/appStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const TOTAL_STEPS = 5;
const STEP_LABELS = [
  'Identity',
  'Companions',
  'Health',
  'Location',
  'Contacts',
];

export const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleFinish = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveProfile(profile);
      useAppStore.getState().updateProfile(profile);
      await setOnboardingComplete();
      setShowSuccess(true);
    } catch (error) {
      Alert.alert(
        'Oops!',
        'There was a problem saving your profile. Please try again.',
        [{ text: 'Try Again', onPress: () => setIsSaving(false) }],
      );
    }
  };

  const handleSuccessComplete = () => {
    useAppStore.getState().completeOnboarding();
    navigation.replace('Main', { screen: 'Map' });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1Identity
            profile={profile}
            onChange={updateProfile}
            onNext={goNext}
          />
        );
      case 2:
        return (
          <Step2Companions
            profile={profile}
            onChange={updateProfile}
            onNext={goNext}
            onBack={goBack}
          />
        );
      case 3:
        return (
          <Step3Health
            profile={profile}
            onChange={updateProfile}
            onNext={goNext}
            onBack={goBack}
          />
        );
      case 4:
        return (
          <Step4Location
            profile={profile}
            onChange={updateProfile}
            onNext={goNext}
            onBack={goBack}
          />
        );
      case 5:
        return (
          <Step5Contacts
            profile={profile}
            onChange={updateProfile}
            onNext={handleFinish}
            onBack={goBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.lightGreen} />

      {/* Progress Bar */}
      {!showSuccess && (
        <View style={styles.progressContainer}>
          <ProgressBar
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            stepLabels={STEP_LABELS}
          />
        </View>
      )}

      {/* Step Content */}
      <View style={styles.stepContainer}>{renderStep()}</View>

      <OnboardingSuccessOverlay
        visible={showSuccess}
        userName={profile.name}
        onComplete={handleSuccessComplete}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4', // very light green tint
  },
  progressContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  stepContainer: {
    flex: 1,
  },
});

export default OnboardingScreen;
