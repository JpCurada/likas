import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, FONTS, SIZES } from '../../theme';

interface Props {
  title: string;
  subtitle?: string;
  emoji?: string;
  children: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLastStep?: boolean;
}

export const StepWrapper: React.FC<Props> = ({
  title,
  subtitle,
  emoji,
  children,
  onNext,
  onBack,
  nextLabel = 'Continue',
  nextDisabled = false,
  isLastStep = false,
}) => {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* Content */}
        <View style={styles.content}>{children}</View>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          {onBack && (
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.nextButton,
              nextDisabled && styles.nextButtonDisabled,
              isLastStep && styles.finishButton,
              onBack ? styles.nextButtonWithBack : styles.nextButtonFull,
            ]}
            onPress={onNext}
            disabled={nextDisabled}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.nextText, nextDisabled && styles.nextTextDisabled]}
            >
              {isLastStep ? "🌿 Let's Go!" : nextLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SIZES.padding,
    paddingBottom: 32,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: 'flex-start',
  },
  emoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
    lineHeight: 32,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.gray,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    gap: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.primaryGreen,
  },
  nextButton: {
    paddingVertical: 16,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonWithBack: {
    flex: 1,
  },
  nextButtonDisabled: {
    backgroundColor: COLORS.lightGreen,
  },
  finishButton: {
    backgroundColor: COLORS.darkGreen,
  },
  nextText: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  nextTextDisabled: {
    color: COLORS.gray,
  },
});

export default StepWrapper;
