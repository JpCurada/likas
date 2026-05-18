import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { COLORS, FONTS } from '../theme';
import { Icon } from '../components/Icon';
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
  Main: undefined;
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
    (async () => {
      // Hydrate Zustand from AsyncStorage so the AI and routing see the
      // canonical profile captured during onboarding, not just defaults.
      const persisted = await loadProfile();
      if (persisted) {
        useAppStore.getState().updateProfile(persisted);
      }

      const onboardingDone = await isOnboardingComplete();
      if (!onboardingDone) {
        setInitialRoute('Onboarding');
        return;
      }
      const setupDone = await isSetupComplete();
      // If setup isn't done, return to Setup screen so the user can
      // resume downloading maps / skipping the AI model intentionally.
      setInitialRoute(setupDone ? 'Main' : 'Setup');
    })();
  }, []);

  if (!initialRoute) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.darkGreen,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        {/* <Image
          source={{ uri: 'ic_launcher_round' }}
          style={{ width: 120, height: 120, marginBottom: 16 }}
          resizeMode="contain"
        /> */}
        <ActivityIndicator color={COLORS.accentGreen} size="large" />
        <Text
          style={{
            color: COLORS.accentGreen,
            fontFamily: FONTS.primaryRegular,
            fontSize: 14,
          }}
        >
          Loading Likas...
        </Text>
      </View>
    );
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
