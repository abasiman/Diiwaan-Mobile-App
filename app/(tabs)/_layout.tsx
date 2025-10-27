// app/(tabs)/_layout.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { forwardRef, memo } from 'react';
import {
  Platform,
  StyleSheet as RNStyleSheet,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACTIVE = '#0B2447';
const INACTIVE = '#94A3B8';
const BORDER = '#E2E8F0';
const ICON_SIZE = 18; // was 20 → smaller

/** Compact side tabs with subtle halo on focus */
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
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        {focused && <View style={styles.halo} pointerEvents="none" />}
        {children}
      </TouchableOpacity>
    );
  })
);

/** Center tab icon: smaller raised "topless circle" */
function MenuRaisedIcon({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) {
  return (
    <View style={styles.menuWrap} pointerEvents="none">
      <View style={[styles.menuOuter, focused && styles.menuOuterFocused]}>
        <View style={[styles.menuInner, focused && styles.menuInnerFocused]}>
          <MaterialCommunityIcons
            name="menu" // ← changed from 'barrel-outline' to proper menu icon
            size={20}   // was 24 → smaller
            color={focused ? ACTIVE : '#1F2937'}
          />
        </View>
      </View>
      <Text style={[styles.menuLabel, { color: focused ? ACTIVE : INACTIVE }]}>
        Menu
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const SAFE_GAP = Math.max(insets.bottom, 12); // was 16 → smaller

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarButton: (props) => <ShadowyTabButton {...props} />,
        tabBarHideOnKeyboard: true,

        // Smaller bar height and paddings
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: BORDER,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 64 + Math.round(SAFE_GAP * 0.75), // was 64 + SAFE_GAP
          paddingBottom: Math.max(6, Math.round(SAFE_GAP * 0.75) - 2),
          paddingTop: 4, // was 6
          paddingHorizontal: 2,
          backgroundColor: '#FFFFFF',
          overflow: 'visible',
          ...(Platform.OS === 'android' ? { elevation: 10 } : { shadowOpacity: 0 }),
        },

        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 0,
          marginHorizontal: 2,
          paddingHorizontal: 0,
          borderRadius: 10,
          minWidth: 56, // was 64 → slimmer
          overflow: 'visible',
        },

        tabBarLabelStyle: {
          fontSize: 9,  // was 10 → smaller
          fontWeight: '600',
          marginTop: 0,
          marginBottom: 3, // was 4
          includeFontPadding: false as any,
          letterSpacing: -0.2,
        },

        tabBarIconStyle: {
          marginTop: 0,
        },
      }}
    >
      {/* LEFT — Home */}
      <Tabs.Screen
        name="customerslist"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size ?? ICON_SIZE}
              color={color}
            />
          ),
        }}
      />

      {/* CENTER — Menu (smaller raised circle) */}
      <Tabs.Screen
        name="menu"
        options={{
          title: ' ', // keep default label hidden
          tabBarIcon: ({ color, focused }) => (
            <View style={{ marginTop: -18 /* was -22 → less protrusion */ }}>
              <MenuRaisedIcon focused={!!focused} color={color as string} />
            </View>
          ),
          tabBarItemStyle: {
            minWidth: 74, // was 90 → tighter middle slot
          },
        }}
      />

      {/* RIGHT — Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={size ?? ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const styles = StyleSheet.create({
  itemBase: {
    borderRadius: 10,
  },

  // Halo stays subtle but fits smaller items - only shows when focused
  halo: {
    ...RNStyleSheet.absoluteFillObject,
    top: -2,
    bottom: -2,
    left: -5,  // was -6
    right: -5, // was -6
    borderRadius: 12,
    backgroundColor: 'transparent', // Remove background color
    ...Platform.select({
      ios: {
        shadowColor: '#60A5FA',
        shadowOpacity: 0.45,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 1,
        backgroundColor: 'rgba(59, 130, 246, 0.10)', // Keep subtle background on Android
      },
    }),
  },

  /* Center (Menu) smaller raised "topless circle" */
  menuWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  menuOuter: {
    width: 56,  // was 68
    height: 56, // was 68
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 6 },
    }),
  },
  menuOuterFocused: {
    borderColor: '#BFDBFE',
    ...Platform.select({
      ios: {
        shadowColor: '#60A5FA',
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 9 },
    }),
  },
  menuInner: {
    width: 48,  // was 58
    height: 48, // was 58
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuInnerFocused: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  menuLabel: {
    fontSize: 9,   // was 10
    fontWeight: '800',
    marginTop: 4,  // was 6
    letterSpacing: -0.2,
  }, 
});