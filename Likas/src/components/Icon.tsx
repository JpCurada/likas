import React from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { StyleProp, TextStyle } from 'react-native';

export type IconType = 'material-community' | 'ionicons';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  type?: IconType;
  style?: StyleProp<TextStyle>;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = '#000',
  type = 'material-community',
  style,
}) => {
  if (type === 'ionicons') {
    return <Ionicons name={name} size={size} color={color} style={style} />;
  }
  return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
};
