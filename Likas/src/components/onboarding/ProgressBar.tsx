import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../../theme';
import { Icon } from '../Icon';

interface Props {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
}

export const ProgressBar: React.FC<Props> = ({
  currentStep,
  totalSteps,
  stepLabels = [],
}) => (
  <View style={s.container}>
    <View style={s.row}>
      {Array.from({ length: totalSteps }).map((_, i) => {
        const n = i + 1;
        const done = n < currentStep;
        const active = n === currentStep;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={[s.line, done || active ? s.lineOn : s.lineOff]} />
            )}
            <View
              style={[
                s.dot,
                done && s.dotDone,
                active && s.dotActive,
                !done && !active && s.dotOff,
              ]}
            >
              {done ? (
                <Icon name="check" size={18} color={COLORS.darkGreen} />
              ) : (
                <Text style={[s.num, active && s.numActive]}>{n}</Text>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </View>
    {stepLabels[currentStep - 1] && (
      <Text style={s.label}>{stepLabels[currentStep - 1]}</Text>
    )}
    <Text style={s.sub}>
      Step {currentStep} of {totalSteps}
    </Text>
  </View>
);

const s = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  line: { height: 2, width: 34 },
  lineOn: { backgroundColor: COLORS.primaryGreen },
  lineOff: { backgroundColor: COLORS.lightGreen },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: COLORS.primaryGreen,
    elevation: 4,
    shadowColor: COLORS.primaryGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  dotDone: { backgroundColor: COLORS.accentGreen },
  dotOff: {
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: COLORS.accentGreen,
  },
  check: {
    fontFamily: FONTS.primaryBold,
    fontSize: 13,
    color: COLORS.darkGreen,
  },
  num: { fontFamily: FONTS.primaryBold, fontSize: 13, color: COLORS.gray },
  numActive: { color: COLORS.white },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.primaryGreen,
    marginBottom: 1,
  },
  sub: { fontFamily: FONTS.primaryRegular, fontSize: 11, color: COLORS.gray },
});

export default ProgressBar;
