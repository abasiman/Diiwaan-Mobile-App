// app/layout.tsx
import * as NavigationBar from 'expo-navigation-bar';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useLayoutEffect } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { initCustomerInvoiceDb } from './db/customerinvoicedb';
import { initCustomerLedgerDb } from './db/customerledgerdb';
import { initDb } from './db/db';

const BRAND_BLUE = '#0B2447';

export default function RootLayout() {

   React.useEffect(() => {
    initDb();
    initCustomerInvoiceDb();
     initCustomerLedgerDb();
  }, []);
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
/**
 * Silent background-ish updates:
 *  - Checks once when the app loads (production only).
 *  - If an update is available, downloads it quietly.
 *  - Does NOT reload the app; update applies on next cold start.
 *  - No AppState listener → less chance of "battery draining in background".
 */
function OTAUpdates() {
  useEffect(() => {
    if (__DEV__) return; // skip OTA checks in dev

    let cancelled = false;

    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!cancelled && res.isAvailable) {
          await Updates.fetchUpdateAsync(); // no reload here; apply next launch
        }
      } catch {
        // ignore network/update errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  useLayoutEffect(() => {
    applyNavBar();
  }, [applyNavBar]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyNavBar();
    });
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
  if (token && inAuth) return <Redirect href="/(tabs)/customerslist" />;

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
