/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#00C2FF';
const tintColorDark = '#00C2FF';

export const Colors = {
  light: {
    text: '#E8E8E8',
    background: '#080808',
    tint: tintColorLight,
    icon: '#6B7280',
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#E8E8E8',
    background: '#080808',
    tint: tintColorDark,
    icon: '#8B929E',
    tabIconDefault: '#4B5563',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'Lato_400Regular',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'Lato_700Bold',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'JetBrainsMono_400Regular',
  },
  default: {
    sans: 'Lato_400Regular',
    serif: 'Lato_700Bold',
    rounded: 'normal',
    mono: 'JetBrainsMono_400Regular',
  },
  web: {
    sans: "'Lato', 'Helvetica Neue', Arial, sans-serif",
    serif: "'Lato', 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
