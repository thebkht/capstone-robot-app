import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const monoRegular = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'JetBrainsMono-Regular',
  default: 'JetBrainsMono-Regular',
});

const monoSemiBold = Platform.select({
  ios: 'JetBrainsMono-SemiBold',
  android: 'JetBrainsMono-SemiBold',
  default: 'JetBrainsMono-SemiBold',
});

const serifHeading = Platform.select({
  ios: 'Times New Roman',
  android: 'serif',
  default: 'Times New Roman',
});

const styles = StyleSheet.create({
  default: {
    fontFamily: monoRegular,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  defaultSemiBold: {
    fontFamily: monoSemiBold,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  title: {
    fontFamily: serifHeading,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '600',
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: serifHeading,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    includeFontPadding: false,
  },
  link: {
    fontFamily: monoSemiBold,
    lineHeight: 30,
    fontSize: 16,
    color: '#5CC8FF',
    includeFontPadding: false,
  },
});
