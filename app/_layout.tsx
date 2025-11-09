// app/layout.tsx
import * as NavigationBar from 'expo-navigation-bar';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useLayoutEffect } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';


import { syncPendingPayments } from './ManageInvoice/paymentOfflineRepo';
import { syncPendingOilReprices } from './dbform/oilRepriceOfflineRepo';

import { initOilModalDb } from './OilModalOffline/oilModalDb';
import { syncPendingOilModalForms } from './OilModalOffline/oilModalSync';

import { initPaymentOfflineDb } from './ManageInvoice/paymentOfflineRepo';

import { syncPendingVendorPayments } from './offlinecreatevendorpayment/vendorPaymentCreateSync';


import { getVendorBillsWithSync } from './OilPurchaseOffline/oilpurchasevendorbillsync';
// at top
import { syncOilSummaryAndWakaaladStats } from './OilPurchaseOffline/oilSummaryStatsSync';

import { initVendorPaymentDb } from './OilPurchaseOffline/vendorPaymentDb';
import { getWakaaladMovementScreenWithSync } from './wakaaladMovementoffline/wakaaladMovementScreenSync';

import NetInfo from '@react-native-community/netinfo';
import { initVendorPaymentsScreenDb } from './vendorPaymentTransactionsOffline/vendorPaymentsScreenDb';
import { getVendorPaymentsScreenWithSync } from './vendorPaymentTransactionsOffline/vendorPaymentsScreenSync';
import { initWakaaladActionsOfflineDb } from './wakaaladActionsOffline/wakaaladActionsOfflineDb';
import { initWakaaladMovementScreenDb } from './wakaaladMovementoffline/wakaaladMovementScreenDb';

import { AuthProvider, useAuth } from '../src/context/AuthContext';

import { initCustomerInvoiceDb } from './db/customerinvoicedb';
import { initCustomerLedgerDb } from './db/customerledgerdb';
import { initDb } from './db/db';
import { initOilSalesPageDb } from './db/oilSalesPageDb';

import { syncPendingOilSales } from './dbform/invocieoilSalesOfflineRepo';
import { initWakaaladSellOptionsDb, syncAllWakaaladSellOptions } from './dbform/wakaaladSellOptionsRepo';
import { syncPendingOilSaleReversals } from './dbsalereverse/oilSaleReverseOfflineRepo';

import { initOilSellOptionsDb } from './WakaaladOffline/oilSellOptionsRepo';
import { syncAllOilSellOptions } from './WakaaladOffline/oilSellOptionsSync';
import { initWakaaladDb } from './WakaaladOffline/wakaaladOfflineDb';
import { syncWakaaladFromServer } from './WakaaladOffline/wakaaladSync';

import { initWakaaladFormDb } from './wakaaladformoffline/wakaaladFormDb';
import { syncPendingWakaaladForms } from './wakaaladformoffline/wakaaladFormSync';

import { syncAllOilSales } from './db/oilSalesPageSync';

// 🔹 NEW: offline extra-costs cache + create-queue
import { initExtraCostsDb } from './ExtraCostsOffline/extraCostsDb';

import { syncAllExtraCosts } from './ExtraCostsOffline/extraCostsSync';
import { initExtraCostCreateDb } from './FormExtraCostsOffline/extraCostCreateDb';
import { syncPendingWakaaladActions } from './wakaaladActionsOffline/wakaaladActionsSync';


import { syncPendingOilExtraCosts } from './FormExtraCostsOffline/extraCostCreateSync';

const BRAND_BLUE = '#0B2447';

export default function RootLayout() {
  useEffect(() => {
    // DB schemas – runs once on app start
    initDb();
    initCustomerInvoiceDb();
    initCustomerLedgerDb();
    initOilSalesPageDb();
    
    // 🔹 NEW: vendor payments screen cache
    initVendorPaymentsScreenDb();

    initWakaaladSellOptionsDb();
    initWakaaladDb(); // wakaalad offline table
    initOilSellOptionsDb();
    initWakaaladFormDb();


     // 🔹 wakaalad movements screen cache
  initWakaaladMovementScreenDb();

     // 🔹 NEW: oil create offline queue
    initOilModalDb();


   

    initVendorPaymentDb();
    // 🔹 NEW: extra-costs offline tables
    initExtraCostsDb();        // cache used by ExtraCostsPage
    initExtraCostCreateDb();   // queue for offline-created extra-costs


     initWakaaladActionsOfflineDb();
     initPaymentOfflineDb();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={BRAND_BLUE} style="light" translucent={false} />
      <AndroidNavBarStyler color={BRAND_BLUE} />
      <TopInsetTint color={BRAND_BLUE} />
      <BottomInsetTint color={BRAND_BLUE} />
      <AuthProvider>
        <OTAUpdates />
        <GlobalSync />          {/* full pull/push once after login */}
        <OfflineOilSaleSync />  {/* pending queue sync on connectivity */}
        <GuardedNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/* ----------------------------- Global sync (once per login + online) ----------------------------- */
function GlobalSync() {
  const { token, user } = useAuth();
  const [online, setOnline] = React.useState(true);
  const syncingRef = React.useRef(false);

  // track connectivity
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

 useEffect(() => {
  if (!token || !user?.id || !online) return;
  if (syncingRef.current) return;
  syncingRef.current = true;

  (async () => {
    try {
      const ownerId = user.id;
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // 🔹 0) FIRST: push any offline oilmodal forms
      await syncPendingOilModalForms(ownerId, token);

      // 1) offline-created invoice oil sales
      await syncPendingOilSales(token, ownerId);


        // 1a) offline reprices
      await syncPendingOilReprices(token, ownerId);

      // 1b) extra-costs
      await syncPendingOilExtraCosts(token, ownerId);


       await syncPendingPayments(token, ownerId);

      // 2) reversals
      await syncPendingOilSaleReversals(token, ownerId);

      // 2a) vendor payments list
      await getVendorPaymentsScreenWithSync({
        token,
        ownerId,
        force: true,
        fromDate: ninetyDaysAgo.toISOString(),
        toDate: now.toISOString(),
      });

      await syncPendingWakaaladActions(token, ownerId);
      await syncPendingWakaaladForms(ownerId, token);

      // 3) oil sales & options
      await syncAllOilSales(ownerId, token);
      await syncAllWakaaladSellOptions(ownerId, token);
      await syncAllOilSellOptions(ownerId, token);

      await getWakaaladMovementScreenWithSync({
        token,
        ownerId,
        force: true,
        fromDate: ninetyDaysAgo.toISOString(),
        toDate: now.toISOString(),
      });

      // 🔹 now that oils are synced, vendor bills make sense
      await getVendorBillsWithSync({
        token,
        ownerId,
        force: true,
      });

      await syncAllExtraCosts(ownerId, token);
      await syncPendingVendorPayments(token, ownerId);
      await syncOilSummaryAndWakaaladStats(token, ownerId);
      await syncWakaaladFromServer({ token, ownerId, startDate: ninetyDaysAgo, endDate: now });
    } catch (e) {
      console.warn('Global sync failed', e);
    } finally {
      syncingRef.current = false;
    }
  })();
}, [token, user?.id, online]);


  return null;
}

/* ----------------------------- Global offline queue sync on connectivity ----------------------------- */
function OfflineOilSaleSync() {
  const { token, user } = useAuth();
  const [online, setOnline] = React.useState(true);

  // track connectivity
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  // whenever we are online + authenticated → push pending queues
  useEffect(() => {
    if (!online || !token || !user?.id) return;

    // invoice oil sales
    /* syncPendingOilSales(token, user.id).catch((e) =>
      console.warn('syncPendingOilSales failed', e)
    ); */


     // 🔹 NEW: offline reprices
    syncPendingOilReprices(token, user.id).catch((e) =>
      console.warn('syncPendingOilReprices failed', e)
    );

    // 🔹 extra-costs create queue
    syncPendingOilExtraCosts(token, user.id).catch((e) =>
      console.warn('syncPendingOilExtraCosts failed', e)
    );

    // 🔹 NEW: oil create modal forms (single / both)
    syncPendingOilModalForms(user.id, token).catch((e) =>
      console.warn('syncPendingOilModalForms failed', e)
    );



     // 💳 NEW: payments queue
    syncPendingPayments(token, user.id).catch((e) =>
      console.warn('syncPendingPayments failed', e)
    );
  }, [online, token, user?.id]);

  return null;
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
  useEffect(() => {
    if (__DEV__) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!cancelled && res.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {
        // ignore
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
      <Slot />
    </Boundary>
  );
}
