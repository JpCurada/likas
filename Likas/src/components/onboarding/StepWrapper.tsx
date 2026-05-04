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
import { Icon } from '../Icon';

interface Props {
  title: string;
  subtitle?: string;
  iconName?: string;
  iconType?: 'material-community' | 'ionicons';
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
  iconName,
  iconType,
  children,
  onNext,
  onBack,
  nextLabel = 'Continue',
  nextDisabled = false,
  isLastStep = false,
}) => (
  <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
    <ScrollView
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        {iconName ? <Icon name={iconName} type={iconType} size={40} style={s.iconContainer} color={COLORS.primaryGreen} /> : null}
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={s.content}>{children}</View>
      <View style={s.footer}>
        {onBack && (
          <TouchableOpacity style={s.backBtn} onPress={onBack}>
            <Icon name="arrow-left" size={20} color={COLORS.primaryGreen} style={{ marginRight: 4 }} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            s.nextBtn,
            nextDisabled && s.nextOff,
            isLastStep && s.finishBtn,
            onBack ? s.nextWithBack : s.nextFull,
          ]}
          onPress={onNext}
          disabled={nextDisabled}
          activeOpacity={0.8}
        >
          <Text style={[s.nextTxt, nextDisabled && s.nextTxtOff]}>
            {isLastStep ? "Let's Go!" : nextLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
);

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: SIZES.padding, paddingBottom: 32 },
  header: { paddingTop: 8, paddingBottom: 24 },
  iconContainer: { marginBottom: 12 },
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
  content: { flex: 1, gap: 16 },
  footer: { flexDirection: 'row', gap: 12, marginTop: 32 },
  backBtn: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.primaryGreen,
  },
  nextBtn: {
    paddingVertical: 16,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextFull: { flex: 1 },
  nextWithBack: { flex: 1 },
  nextOff: { backgroundColor: COLORS.lightGreen },
  finishBtn: { backgroundColor: COLORS.darkGreen },
  nextTxt: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  nextTxtOff: { color: COLORS.gray },
});

export default StepWrapper;
