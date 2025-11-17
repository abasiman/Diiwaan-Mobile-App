// app/Wakaalad/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { forwardRef, memo } from 'react';
import {
    Platform,
    StyleSheet as RNStyleSheet,
    StyleSheet,
    TouchableOpacity,
    View,
    type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACTIVE = '#0B2447';
const INACTIVE = '#94A3B8';
const ICON_SIZE = 20;

const ShadowyTabButton = memo(
  forwardRef<RNView, BottomTabBarButtonProps>(function ShadowyTabButton(
    { accessibilityState, children, style, ...rest },
    ref
  ) {
    const focused = !!accessibilityState?.selected;

    return (
      <TouchableOpacity
        ref={ref}
        {...rest}
        activeOpacity={0.9}
        style={[style, styles.itemBase]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {focused && <View style={styles.halo} pointerEvents="none" />}
        {children}
      </TouchableOpacity>
    );
  })
);

export default function TransactionsTabsLayout() {
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
          paddingHorizontal: 8,
          backgroundColor: '#FFFFFF',
          overflow: 'visible',
          // 👇 no need for justifyContent hacks
          ...(Platform.OS === 'android' ? { elevation: 12 } : { shadowOpacity: 0 }),
        },

        // 👇 key change: stretch each tab to take half the width
        tabBarItemStyle: {
          flex: 1,            // <— THIS pushes them to opposite ends
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 2,
          marginHorizontal: 2,
          paddingHorizontal: 0,
          borderRadius: 10,
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




<Tabs.Screen
  name="expenseflow"
  options={{
    title: 'Expense Flow',
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="swap-vertical" size={size ?? ICON_SIZE} color={color} />
      
    ),
  }}
/>
      <Tabs.Screen
  name="expensescharts"
  options={{
    title: 'Charts',
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="speedometer-outline" size={size ?? ICON_SIZE} color={color} />
    ),
  }}
/>


      

      
    </Tabs>
  );
}

const styles = StyleSheet.create({
  itemBase: {
    borderRadius: 10,
  },
  halo: {
    ...RNStyleSheet.absoluteFillObject,
    top: -2,
    bottom: -2,
    left: -6,
    right: -6,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    ...Platform.select({
      ios: {
        backgroundColor: 'transparent',
        shadowColor: '#60A5FA',
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 1,
      },
    }),
  },
});
