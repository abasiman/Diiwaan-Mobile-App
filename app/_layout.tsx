// app/layout.tsx
import * as NavigationBar from 'expo-navigation-bar';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Alert, AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

const BRAND_BLUE = '#0B2447';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={BRAND_BLUE} style="light" translucent={false} />
      <AndroidNavBarStyler color={BRAND_BLUE} />
      <TopInsetTint color={BRAND_BLUE} />
      <BottomInsetTint color={BRAND_BLUE} />
      <AuthProvider>
        <OTAUpdates />
        <GuardedNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/* ----------------------------- Inset tints ----------------------------- */
function TopInsetTint({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: color,
        zIndex: 9999,
      }}
    />
  );
}

function BottomInsetTint({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  if (!insets.bottom) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: insets.bottom,
        backgroundColor: color,
        zIndex: 9999,
      }}
    />
  );
}

/* ----------------------------- OTA updates ----------------------------- */
function OTAUpdates() {
  const promptedRef = useRef(false);
  const checkingRef = useRef(false);

  const checkAndPrompt = useCallback(async () => {
    if (__DEV__ || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        if (!promptedRef.current) {
          promptedRef.current = true;
          Alert.alert('Update available', 'Restart to apply the latest updates?', [
            { text: 'Later', onPress: () => { promptedRef.current = false; } },
            { text: 'Restart', onPress: () => Updates.reloadAsync() },
          ]);
        }
      }
    } catch {
      // ignore
    }
    checkingRef.current = false;
  }, []);

  useEffect(() => { checkAndPrompt(); }, [checkAndPrompt]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') checkAndPrompt(); });
    return () => sub.remove();
  }, [checkAndPrompt]);

  return null;
}

/* ----------------------------- Android nav bar ----------------------------- */
function AndroidNavBarStyler({ color }: { color: string }) {
  const applyNavBar = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await NavigationBar.setBehaviorAsync('inset-swipe');
      await NavigationBar.setVisibilityAsync('visible');
      await NavigationBar.setButtonStyleAsync('light');
      await NavigationBar.setBackgroundColorAsync(color);
    } catch (e) {
      console.error('NavigationBar error:', e);
    }
  }, [color]);

  useLayoutEffect(() => { applyNavBar(); }, [applyNavBar]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') applyNavBar(); });
    return () => sub.remove();
  }, [applyNavBar]);

  return null;
}

/* ----------------------------- Error boundary ----------------------------- */
class Boundary extends React.Component<{ children: React.ReactNode }, { err?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: any) {
    return { err };
  }
  componentDidCatch(error: any, info: any) {
    // This prints the component stack to Metro to help locate bad renderers (e.g., bare strings)
    console.error('Render error componentStack:\n', info?.componentStack);
  }
  render() {
    if (this.state.err) return <Text style={{ padding: 12, color: 'red' }}>Render error</Text>;
    return this.props.children;
  }
}

/* ----------------------------- Guarded navigator ----------------------------- */
function GuardedNavigator() {
  const { token, loading } = useAuth();
  const pathname = usePathname() || '/';

  if (loading) return null;

  const inAuth = pathname.startsWith('/(auth)/');
  const inTabs = pathname.startsWith('/(tabs)/');
  const inContent = pathname.startsWith('/(content)/');

  if (!token && (inTabs || inContent)) return <Redirect href="/(auth)/login" />;
  if (token && pathname === '/') return <Redirect href="/(tabs)/customerslist" />;
  if (token && inAuth)          return <Redirect href="/(tabs)/customerslist" />;

  return (
    <Boundary>
      {/* For debugging a crashing first route, you can force one:
         <Slot initialRouteName="/(auth)/login" />
         <Slot initialRouteName="/(tabs)/customerslist" />
      */}
      <Slot />
    </Boundary>
  );
}
