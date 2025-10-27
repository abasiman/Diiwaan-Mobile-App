// app/(tabs)/_layout.tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { forwardRef, memo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet as RNStyleSheet,
  StyleSheet,
  View,
  type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACTIVE = '#0B2447';
const INACTIVE = '#94A3B8';
const ICON_SIZE = 20;

/** Custom tab bar button with halo + shadow on focus, scale on press */
const ShadowyTabButton = memo(
  forwardRef<RNView, BottomTabBarButtonProps>(function ShadowyTabButton(
    { accessibilityState, children, style, ...rest },
    ref
  ) {
    const focused = !!accessibilityState?.selected;

    return (
      <Pressable
        ref={ref}
        {...rest}
        android_ripple={undefined}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          style,
          styles.itemBase,
          focused && styles.itemFocused,
          pressed && styles.itemPressed,
        ]}
      >
        {focused && <View style={styles.halo} pointerEvents="none" />}
        {children}
      </Pressable>
    );
  })
);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const SAFE_GAP = Math.max(insets.bottom, 16);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarButton: (props) => <ShadowyTabButton {...props} />,
        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 58 + SAFE_GAP,
          paddingBottom: SAFE_GAP - 2,
          paddingTop: 4,
          paddingHorizontal: 2,
          backgroundColor: '#FFFFFF',
          overflow: 'visible',
          ...(Platform.OS === 'android' ? { elevation: 12 } : { shadowOpacity: 0 }),
        },

        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 2,
          marginHorizontal: 2,
          paddingHorizontal: 0,
          borderRadius: 12,
          minWidth: 64,
        },

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 0,
          marginBottom: 4,
          includeFontPadding: false as any,
          letterSpacing: -0.2,
        },

        tabBarIconStyle: {
          marginTop: 0,
        },
      }}
    >
      {/* Oil Costs -> gas station icon (outline when unfocused, filled when focused) */}
      <Tabs.Screen
        name="vendorbills"
        options={{
          title: 'Oil Costs',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'gas-station' : 'gas-station-outline'}
              size={(size ?? ICON_SIZE) + (focused ? 2 : 0)}
              color={color}
            />
          ),
        }}
      />

      {/* Transactions -> bank transfer icon (clear finance/flow vibe) */}
      <Tabs.Screen
        name="vendorpayments"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'bank-transfer' : 'swap-horizontal'}
              size={(size ?? ICON_SIZE) + (focused ? 2 : 0)}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  itemBase: {
    borderRadius: 12,
  },
  itemFocused: {
    // focused shadow/elevation on the tab *container*
    ...Platform.select({
      ios: {
        shadowColor: '#60A5FA',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        backgroundColor: 'transparent',
      },
      android: {
        elevation: 4,
        backgroundColor: 'transparent',
      },
    }),
  },
  itemPressed: {
    transform: [{ scale: 0.96 }],
  },
  halo: {
    ...RNStyleSheet.absoluteFillObject,
    top: -2,
    bottom: -2,
    left: -6,
    right: -6,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    ...Platform.select({
      ios: {
        backgroundColor: 'transparent',
        shadowColor: '#60A5FA',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 1,
      },
    }),
  },
});
