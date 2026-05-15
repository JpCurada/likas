import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  Platform,
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
import { HomeScreen } from '../screens/HomeScreen';
import { PrepScreen } from '../screens/PrepScreen';
import { MapScreen } from '../screens/MapScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Setup: undefined;
  Main: undefined;
};

export type TabParamList = {
  Home: undefined;
  Prep: undefined;
  Map: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_CONFIG: Record<string, { icon: string; label: string }> = {
  Home: { icon: 'home', label: 'Home' },
  Prep: { icon: 'bag-personal', label: 'Prep' },
  Map: { icon: 'map', label: 'Map' },
  Profile: { icon: 'account', label: 'Profile' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const cfg = TAB_CONFIG[name] ?? { icon: 'circle-medium', label: name };
  return (
    <View
      style={[tabStyles.iconWrapper, focused && tabStyles.iconWrapperActive]}
    >
      <Icon 
        name={cfg.icon} 
        size={24} 
        color={focused ? COLORS.primaryGreen : COLORS.darkGreen} 
      />
      <Text style={[tabStyles.iconLabel, focused && tabStyles.iconLabelActive]}>
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
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 3,
    minWidth: 58,
  },
  iconWrapperActive: {
    backgroundColor: COLORS.lightGreen,
  },
  iconLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 11,
    color: COLORS.gray,
  },
  iconLabelActive: {
    color: COLORS.primaryGreen,
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
          height: Platform.OS === 'ios' ? 92 : 76,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          paddingHorizontal: 4,
          elevation: 12,
          shadowColor: COLORS.darkGreen,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarItemStyle: { paddingVertical: 4 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Prep" component={PrepScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
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
