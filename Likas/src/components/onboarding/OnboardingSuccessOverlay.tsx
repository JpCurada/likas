import React, {useEffect, useRef} from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {Circle, Path} from 'react-native-svg';

import {COLORS, FONTS, SIZES} from '../../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const BADGE_SIZE = 112;
const RING_R = 46;
const BADGE_CX = 52;
const BADGE_CY = 52;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
/** Centroid-aligned check inside the 104×104 badge viewBox (circle at 52,52). */
const CHECK_PATH = `M ${BADGE_CX - 14} ${BADGE_CY + 2} L ${BADGE_CX - 4} ${BADGE_CY + 12} L ${BADGE_CX + 14} ${BADGE_CY - 6}`;
const CHECK_LENGTH = 40;
const COMPLETED_STEPS = [
  'Identity',
  'Companions',
  'Health',
  'Location',
  'Contacts',
];

type Props = {
  visible: boolean;
  userName?: string;
  onComplete: () => void;
};

/**
 * Full-screen onboarding completion moment.
 *
 * Design rationale (UX research synthesis):
 * - **Closure before transition**: a brief success beat confirms the save
 *   landed before routing to Main — reduces "did that work?" anxiety.
 * - **One focal animation**: ring draw + check (universal success language)
 *   instead of confetti — appropriate for a disaster-preparedness app.
 * - **Reassuring copy**: capability framing ("offline profile ready") not hype.
 * - **Short & skippable**: ~1.3s to Map; ~0.65s when Reduce Motion is on.
 * - **Brand continuity**: LIKAS greens + soft pulse rings echo ProgressBar dots.
 */
export const OnboardingSuccessOverlay: React.FC<Props> = ({
  visible,
  userName,
  onComplete,
}) => {
  const {width} = useWindowDimensions();
  const completedRef = useRef(false);
  const reduceMotionRef = useRef(false);

  const backdrop = useSharedValue(0);
  const badgeScale = useSharedValue(0.72);
  const ringProgress = useSharedValue(0);
  const checkProgress = useSharedValue(0);
  const pulse = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(14);
  const subtitleOpacity = useSharedValue(0);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  useEffect(() => {
    if (!visible) {
      completedRef.current = false;
      backdrop.value = 0;
      badgeScale.value = 0.72;
      ringProgress.value = 0;
      checkProgress.value = 0;
      pulse.value = 0;
      titleOpacity.value = 0;
      titleY.value = 14;
      subtitleOpacity.value = 0;
      return;
    }

    let cancelled = false;
    let navigateTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNavigate = (ms: number) => {
      navigateTimer = setTimeout(() => {
        if (!cancelled) finish();
      }, ms);
    };

    const run = async () => {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      if (cancelled) return;
      reduceMotionRef.current = reduceMotion;

      if (reduceMotion) {
        backdrop.value = withTiming(1, {duration: 120});
        badgeScale.value = 1;
        ringProgress.value = 1;
        checkProgress.value = 1;
        titleOpacity.value = 1;
        titleY.value = 0;
        subtitleOpacity.value = 1;
        scheduleNavigate(650);
        return;
      }

      backdrop.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      });

      badgeScale.value = withDelay(
        120,
        withSpring(1, {damping: 14, stiffness: 180, mass: 0.85}),
      );

      ringProgress.value = withDelay(
        180,
        withTiming(1, {duration: 520, easing: Easing.out(Easing.cubic)}),
      );

      checkProgress.value = withDelay(
        560,
        withTiming(1, {duration: 340, easing: Easing.out(Easing.cubic)}),
      );

      pulse.value = withDelay(
        640,
        withTiming(1, {duration: 520, easing: Easing.out(Easing.quad)}),
      );

      titleOpacity.value = withDelay(
        720,
        withTiming(1, {duration: 380, easing: Easing.out(Easing.cubic)}),
      );
      titleY.value = withDelay(
        720,
        withSpring(0, {damping: 16, stiffness: 220}),
      );

      subtitleOpacity.value = withDelay(
        920,
        withTiming(1, {duration: 360, easing: Easing.out(Easing.cubic)}),
      );

      // Navigate while the success moment is still visible — Map mounts under
      // this screen and replaces it so the user is not stuck waiting ~2.6s.
      scheduleNavigate(1300);
    };

    void run();
    return () => {
      cancelled = true;
      if (navigateTimer !== null) clearTimeout(navigateTimer);
    };
  }, [
    visible,
    backdrop,
    badgeScale,
    ringProgress,
    checkProgress,
    pulse,
    titleOpacity,
    titleY,
    subtitleOpacity,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{scale: badgeScale.value}],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.35, 1], [0, 0.28, 0]),
    transform: [
      {scale: interpolate(pulse.value, [0, 1], [0.92, 1.55])},
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{translateY: titleY.value}],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - ringProgress.value),
  }));

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - checkProgress.value),
  }));

  if (!visible) return null;

  const headline =
    userName && userName.trim().length >= 2
      ? `You're ready, ${userName.trim()}`
      : "You're all set";

  return (
    <Animated.View
      style={[s.root, backdropStyle]}
      pointerEvents="auto"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Profile saved. Opening LIKAS."
    >
      <Animated.View style={[s.card, cardStyle, {maxWidth: width - 48}]}>
        <View style={s.badgeWrap}>
          <Animated.View style={[s.pulseRing, pulseStyle]} />
          <View style={s.badge}>
            <Svg width={BADGE_SIZE} height={BADGE_SIZE} viewBox="0 0 104 104">
              <Circle
                cx={BADGE_CX}
                cy={BADGE_CY}
                r={RING_R}
                stroke={COLORS.lightGreen}
                strokeWidth={5}
                fill={COLORS.white}
              />
              <AnimatedCircle
                cx={BADGE_CX}
                cy={BADGE_CY}
                r={RING_R}
                stroke={COLORS.primaryGreen}
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                animatedProps={ringProps}
                transform={`rotate(-90 ${BADGE_CX} ${BADGE_CY})`}
              />
              <AnimatedPath
                d={CHECK_PATH}
                stroke={COLORS.darkGreen}
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${CHECK_LENGTH} ${CHECK_LENGTH}`}
                animatedProps={checkProps}
              />
            </Svg>
          </View>
        </View>

        <Animated.Text style={[s.title, titleStyle]}>{headline}</Animated.Text>
        <Animated.Text style={[s.subtitle, subtitleStyle]}>
          Your offline disaster profile is saved. LIKAS is ready when you need
          it.
        </Animated.Text>

        <View style={s.stepsRow}>
          {COMPLETED_STEPS.map(label => (
              <View key={label} style={s.stepPill}>
                <View style={s.stepDot} />
                <Text style={s.stepTxt} numberOfLines={1}>
                  {label}
                </Text>
              </View>
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: 'rgba(240, 253, 244, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    alignItems: 'center',
    width: '100%',
  },
  badgeWrap: {
    width: BADGE_SIZE + 48,
    height: BADGE_SIZE + 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    width: BADGE_SIZE + 8,
    height: BADGE_SIZE + 8,
    borderRadius: (BADGE_SIZE + 8) / 2,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primaryGreen,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  title: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 22,
  },
  stepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 340,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  stepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primaryGreen,
  },
  stepTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 11,
    color: COLORS.darkGreen,
  },
});

export default OnboardingSuccessOverlay;
