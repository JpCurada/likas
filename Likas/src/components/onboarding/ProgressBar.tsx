import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SIZES } from '../../theme';

interface Props {
  currentStep: number; // 1-based
  totalSteps: number;
  stepLabels?: string[];
}

export const ProgressBar: React.FC<Props> = ({
  currentStep,
  totalSteps,
  stepLabels = [],
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <React.Fragment key={i}>
              {/* Connector line (except before first step) */}
              {i > 0 && (
                <View
                  style={[
                    styles.connector,
                    isCompleted || isActive
                      ? styles.connectorActive
                      : styles.connectorInactive,
                  ]}
                />
              )}
              {/* Step dot */}
              <View
                style={[
                  styles.dot,
                  isCompleted && styles.dotCompleted,
                  isActive && styles.dotActive,
                  !isCompleted && !isActive && styles.dotInactive,
                ]}
              >
                {isCompleted ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Text
                    style={[styles.dotText, isActive && styles.dotTextActive]}
                  >
                    {stepNum}
                  </Text>
                )}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Step label */}
      {stepLabels[currentStep - 1] && (
        <Text style={styles.label}>{stepLabels[currentStep - 1]}</Text>
      )}

      {/* Progress text */}
      <Text style={styles.progress}>
        Step {currentStep} of {totalSteps}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  connector: {
    height: 2,
    width: 36,
  },
  connectorActive: {
    backgroundColor: COLORS.primaryGreen,
  },
  connectorInactive: {
    backgroundColor: COLORS.lightGreen,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: COLORS.primaryGreen,
    shadowColor: COLORS.primaryGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  dotCompleted: {
    backgroundColor: COLORS.accentGreen,
  },
  dotInactive: {
    backgroundColor: COLORS.lightGreen,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
  },
  dotText: {
    fontFamily: FONTS.primaryBold,
    fontSize: 13,
    color: COLORS.gray,
  },
  dotTextActive: {
    color: COLORS.white,
  },
  checkmark: {
    fontFamily: FONTS.primaryBold,
    fontSize: 13,
    color: COLORS.darkGreen,
  },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
    marginBottom: 2,
  },
  progress: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
  },
});

export default ProgressBar;
