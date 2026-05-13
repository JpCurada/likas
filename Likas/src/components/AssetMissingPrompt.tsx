import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from './Icon';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = {
  iconName: string;
  title: string;
  body: string;
  ctaLabel?: string;
};

export const AssetMissingPrompt: React.FC<Props> = ({
  iconName,
  title,
  body,
  ctaLabel = 'Open setup',
}) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.container}>
      <Icon name={iconName} size={56} color={COLORS.primaryGreen} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Setup')}
      >
        <Text style={styles.buttonText}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.padding,
    gap: 14,
  },
  title: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  button: {
    marginTop: 8,
    backgroundColor: COLORS.primaryGreen,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: SIZES.radius,
  },
  buttonText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.white,
  },
});

export default AssetMissingPrompt;
