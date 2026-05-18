import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { NavigationContainer, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { COLORS, FONTS } from '../theme';
import { Icon } from '../components/Icon';
import { BrandedLoader } from '../components/BrandedLoader';
import { isOnboardingComplete, isSetupComplete, loadProfile } from '../database/storage';
import { useAppStore } from '../stores/appStore';

import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { PrepScreen } from '../screens/PrepScreen';
import { MapScreen } from '../screens/MapScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Setup: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
};

export type TabParamList = {
  Map: undefined;
  Prep: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_CONFIG: Record<string, { activeIcon: string; inactiveIcon: string; label: string }> = {
  Map: { activeIcon: 'map', inactiveIcon: 'map-outline', label: 'Map' },
  Prep: { activeIcon: 'bag-personal', inactiveIcon: 'bag-personal-outline', label: 'Prep' },
  Profile: { activeIcon: 'account', inactiveIcon: 'account-outline', label: 'Profile' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const cfg = TAB_CONFIG[name] ?? { activeIcon: 'circle-medium', inactiveIcon: 'circle-outline', label: name };
  const iconName = focused ? cfg.activeIcon : cfg.inactiveIcon;
  return (
    <View style={tabStyles.iconWrapper}>
      <Icon 
        name={iconName} 
        size={24} 
        color={focused ? COLORS.primaryGreen : '#4B5563'} 
      />
      <Text 
        style={[tabStyles.iconLabel, focused && tabStyles.iconLabelActive]}
        numberOfLines={1}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 2,
    minWidth: 72,
  },
  iconLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 11,
    color: '#4B5563',
  },
  iconLabelActive: {
    color: COLORS.primaryGreen,
    fontFamily: FONTS.primaryBold,
  },
});

function MainTabs() {
  return (
    <Tab.Navigator
        initialRouteName="Map"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name={route.name} focused={focused} />
          ),
          tabBarStyle: {
            backgroundColor: COLORS.white,
            borderTopColor: COLORS.lightGreen,
            borderTopWidth: 1.5,
            height: Platform.OS === 'ios' ? 84 : 60,
            paddingBottom: Platform.OS === 'ios' ? 24 : 6,
            paddingTop: 4,
            paddingHorizontal: 4,
            elevation: 12,
            shadowColor: COLORS.darkGreen,
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
          },
          tabBarItemStyle: { paddingVertical: 3 },
        })}
      >
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Prep" component={PrepScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
  );
}

export const AppNavigator: React.FC = () => {
  const [initialRoute, setInitialRoute] = useState<
    'Onboarding' | 'Setup' | 'Main' | null
  >(null);

  useEffect(() => {
    // Hold the branded splash for at least MIN_SPLASH_MS so the liquid-rise
    // animation gets one full cycle on-screen even if storage I/O resolves
    // instantly. The real bootstrap work races this timer; whichever wins
    // last is what unblocks navigation.
    const MIN_SPLASH_MS = 2000;
    const minDelay = new Promise<void>(resolve =>
      setTimeout(resolve, MIN_SPLASH_MS),
    );

    const bootstrap = (async () => {
      // Hydrate Zustand from AsyncStorage so the AI and routing see the
      // canonical profile captured during onboarding, not just defaults.
      const persisted = await loadProfile();
      if (persisted) {
        useAppStore.getState().updateProfile(persisted);
      }

      // First-launch flow is Setup → Onboarding → Main. Setup downloads
      // the offline tiles so the meeting-point map picker in Onboarding
      // Step 4 has a real basemap to drop a pin on. If setup ever
      // regresses (e.g. user wiped the asset cache) we land back there
      // before re-running onboarding.
      const setupDone = await isSetupComplete();
      if (!setupDone) return 'Setup' as const;
      const onboardingDone = await isOnboardingComplete();
      return onboardingDone ? ('Main' as const) : ('Onboarding' as const);
    })();

    Promise.all([bootstrap, minDelay]).then(([route]) => {
      setInitialRoute(route);
    });
  }, []);

  if (!initialRoute) {
    return <BrandedLoader />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Setup" component={SetupScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
