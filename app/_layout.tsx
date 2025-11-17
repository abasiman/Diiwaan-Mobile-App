// app/layout.tsx
import * as NavigationBar from 'expo-navigation-bar';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';

import { syncAllCustomerInvoices } from './db/customerinvoiceoilsaleSync';
import { initOilSalesDb } from './oilSalesfOfflineRepo/oilSalesRepo';

import { syncOilSales } from './oilSalesfOfflineRepo/oilSalesSync';
import { initOilSalesOfflineDb, syncPendingOilSales } from './oilSalesfOfflineRepo/oilSalesformOfflineRepo';



import NetInfo from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useLayoutEffect } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';


import { AuthProvider, useAuth } from '../src/context/AuthContext';

// 🔹 DB init imports
import { initPaymentOfflineDb } from './ManageInvoice/paymentOfflineRepo';
import { initOilModalDb } from './OilModalOffline/oilModalDb';
import { initVendorPaymentDb } from './OilPurchaseOffline/vendorPaymentDb';
import { initOilSellOptionsDb } from './WakaaladOffline/oilSellOptionsRepo';
import { initWakaaladDb } from './WakaaladOffline/wakaaladOfflineDb';
import { initCustomerInvoiceDb } from './db/customerinvoicedb';
import { initCustomerLedgerDb } from './db/customerledgerdb';
import { initDb } from './db/db.native';
import { initIncomeStatementDb } from './offlineincomestatement/incomeStatementDb';
import { initMeProfileDb } from './profile/meProfileDb';
import { initVendorPaymentsScreenDb } from './vendorPaymentTransactionsOffline/vendorPaymentsScreenDb';
import { initWakaaladActionsOfflineDb } from './wakaaladActionsOffline/wakaaladActionsOfflineDb';
import { initWakaaladMovementScreenDb } from './wakaaladMovementoffline/wakaaladMovementScreenDb';
import { initWakaaladFormDb } from './wakaaladformoffline/wakaaladFormDb';

import { initExtraCostsDb } from './ExtraCostsOffline/extraCostsDb';
import { initExtraCostCreateDb } from './FormExtraCostsOffline/extraCostCreateDb';

import { initWakaaladSellOptionsDb } from './dbform/wakaaladSellOptionsRepo';


// 🔹 Sync imports
import { syncAllExtraCosts } from './ExtraCostsOffline/extraCostsSync';
import { syncPendingOilExtraCosts } from './FormExtraCostsOffline/extraCostCreateSync';
import { syncPendingPayments } from './ManageInvoice/paymentOfflineRepo';
import { syncPendingOilModalForms } from './OilModalOffline/oilModalSync';
import { syncOilSummaryAndWakaaladStats } from './OilPurchaseOffline/oilSummaryStatsSync';
import { syncAllOilSellOptions } from './WakaaladOffline/oilSellOptionsSync';
import { syncWakaaladFromServer } from './WakaaladOffline/wakaaladSync';

import { syncPendingOilReprices } from './dbform/oilRepriceOfflineRepo';
import { syncAllWakaaladSellOptions } from './dbform/wakaaladSellOptionsRepo';
import { syncPendingOilSaleReversals } from './dbsalereverse/oilSaleReverseOfflineRepo';
import { syncPendingVendorPayments } from './offlinecreatevendorpayment/vendorPaymentCreateSync';
import { syncIncomeStatement } from './offlineincomestatement/incomeStatementSync';
import { syncMeProfile } from './profile/meProfileSync';
import { syncPendingWakaaladActions } from './wakaaladActionsOffline/wakaaladActionsSync';
import { syncPendingWakaaladForms } from './wakaaladformoffline/wakaaladFormSync';

import { getVendorBillsWithSync } from './OilPurchaseOffline/oilpurchasevendorbillsync';
import { getVendorPaymentsScreenWithSync } from './vendorPaymentTransactionsOffline/vendorPaymentsScreenSync';
import { getWakaaladMovementScreenWithSync } from './wakaaladMovementoffline/wakaaladMovementScreenSync';

const BRAND_BLUE = '#0B2447';

export default function RootLayout() {
  useEffect(() => {
    // DB schemas – runs once on app start
    initDb();
    initCustomerInvoiceDb();
    initCustomerLedgerDb();

    initIncomeStatementDb();

    // vendor payments screen cache
    initVendorPaymentsScreenDb();

    initWakaaladSellOptionsDb();
    initWakaaladDb(); // wakaalad offline table
    initOilSellOptionsDb();
    initWakaaladFormDb();

     

    // wakaalad movements screen cache
    initWakaaladMovementScreenDb();

    // oil create offline queue
    initOilModalDb();

    initVendorPaymentDb();

    // extra-costs offline tables
    initExtraCostsDb();      // cache used by ExtraCostsPage
    initExtraCostCreateDb(); // queue for offline-created extra-costs

    initWakaaladActionsOfflineDb();
    initPaymentOfflineDb();
    initMeProfileDb();

      initOilSalesDb();



        // ✅ oil sales cache + queue
  initOilSalesDb();
  initOilSalesOfflineDb();

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
        <OfflineOilSaleSync />  {/* pending queue sync on connectivity + foreground */}
        <GuardedNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/* ----------------------------- Global sync (once per login + online) ----------------------------- */
/* ----------------------------- Global sync (once per login + online) ----------------------------- */
function GlobalSync() {
  const { token, user } = useAuth();
  const [online, setOnline] = React.useState(true);
  const syncingRef = React.useRef(false);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      setOnline(ok);
    });

    // seed once
    NetInfo.fetch().then((state) => {
      const ok = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      setOnline(ok);
    });
    return () => sub();
  }, []);

  useEffect(() => {
    if (!token || !user?.id || !online) return;
    if (syncingRef.current) return;
    syncingRef.current = true;

    (async () => {
      const ownerId = user.id;
      const now = new Date();
      
      // Use 90 days ago for *other* syncs as you had before
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      
      

      const run = async (label: string, fn: () => Promise<unknown> | unknown) => {
        try {
          await fn();
        } catch (e) {
          console.warn(`${label} failed`, e);
        }
      };

      try {
        // income statement first, so it's always prefetched
        await run('syncIncomeStatement', () => syncIncomeStatement(ownerId, token));

        await run('syncPendingOilModalForms', () =>
          syncPendingOilModalForms(ownerId, token)
        );

        await run('syncPendingOilReprices', () =>
          syncPendingOilReprices(token, ownerId)
        );
        await run('syncPendingOilExtraCosts', () =>
          syncPendingOilExtraCosts(token, ownerId)
        );
        await run('syncPendingPayments', () =>
          syncPendingPayments(token, ownerId)
        );
        await run('syncPendingOilSaleReversals', () =>
          syncPendingOilSaleReversals(token, ownerId)
        );

        await run('getVendorPaymentsScreenWithSync', () =>
          getVendorPaymentsScreenWithSync({
            token,
            ownerId,
            force: true,
            fromDate: ninetyDaysAgo.toISOString(),
            toDate: now.toISOString(),
          })
        );

        await run('syncPendingWakaaladActions', () =>
          syncPendingWakaaladActions(token, ownerId)
        );
        await run('syncPendingWakaaladForms', () =>
          syncPendingWakaaladForms(ownerId, token)
        );

       
      await run('syncPendingOilSales', () =>
  syncPendingOilSales(token, ownerId)
);

        

        await run('syncAllWakaaladSellOptions', () =>
          syncAllWakaaladSellOptions(ownerId, token)
        );
        await run('syncAllOilSellOptions', () =>
          syncAllOilSellOptions(ownerId, token)
        );

        await run('getWakaaladMovementScreenWithSync', () =>
          getWakaaladMovementScreenWithSync({
            token,
            ownerId,
            force: true,
            fromDate: ninetyDaysAgo.toISOString(),
            toDate: now.toISOString(),
          })
        );

        await run('syncMeProfile', () => syncMeProfile(token));

        await run('getVendorBillsWithSync', () =>
          getVendorBillsWithSync({ token, ownerId, force: true })
        );

        await run('syncAllExtraCosts', () =>
          syncAllExtraCosts(ownerId, token)
        );
        await run('syncPendingVendorPayments', () =>
          syncPendingVendorPayments(token, ownerId)
        );
        await run('syncOilSummaryAndWakaaladStats', () =>
          syncOilSummaryAndWakaaladStats(token, ownerId)
        );


        // ✅ new: full oil sales sync (last 90 days)
      await run('syncOilSales', () =>
        syncOilSales({
          token,
          ownerId,
          fromDate: ninetyDaysAgo.toISOString(),
          toDate: now.toISOString(),
        })
      );

      await run('syncAllCustomerInvoices', () =>
  syncAllCustomerInvoices(ownerId, token)
);

      await run('syncWakaaladFromServer', () =>
        syncWakaaladFromServer({
          token,
            ownerId,
            startDate: ninetyDaysAgo,
            endDate: now,
          })
        );
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [token, user?.id, online]);

  return null;
}
/* ----------------------------- Global offline queue sync on connectivity + foreground ----------------------------- */
function OfflineOilSaleSync() {
  const { token, user } = useAuth();
  const [online, setOnline] = React.useState(true);
  const appState = React.useRef(AppState.currentState);

  // track connectivity (make it match GlobalSync)
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      setOnline(ok);
    });

    // 🔹 seed initial state, just like GlobalSync
    NetInfo.fetch().then((state) => {
      const ok = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      setOnline(ok);
    });

    return () => sub();
  }, []);

  const runSync = React.useCallback(() => {
    if (!online || !token || !user?.id) return;

    const ownerId = user.id;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);


    // reprices
    syncPendingOilReprices(token, ownerId).catch((e) =>
      console.warn('syncPendingOilReprices failed', e)
    );

    // extra-costs
    syncPendingOilExtraCosts(token, ownerId).catch((e) =>
      console.warn('syncPendingOilExtraCosts failed', e)
    );

    // oil create forms
    syncPendingOilModalForms(ownerId, token).catch((e) =>
      console.warn('syncPendingOilModalForms failed', e)
    );

    // payments
    syncPendingPayments(token, ownerId).catch((e) =>
      console.warn('syncPendingPayments failed', e)
    );

    // wakaalad queues
    syncPendingWakaaladActions(token, ownerId).catch((e) =>
      console.warn('syncPendingWakaaladActions failed', e)
    );
    syncPendingWakaaladForms(ownerId, token).catch((e) =>
      console.warn('syncPendingWakaaladForms failed', e)
    );

    syncPendingVendorPayments(token, ownerId).catch((e) =>
      console.warn('syncPendingVendorPayments failed', e)
    );

    syncPendingOilSaleReversals(token, ownerId).catch((e) =>
      console.warn('syncPendingOilSaleReversals failed', e)
    );


    
  // ✅ NEW: oil sales queue
  syncPendingOilSales(token, ownerId).catch((e) =>
    console.warn('syncPendingOilSales failed', e)
  );

    
  }, [online, token, user?.id]);

  // when connectivity becomes online → sync
  useEffect(() => {
    if (online) runSync();
  }, [online, runSync]);

  // when app comes to foreground → sync again
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appState.current;
      appState.current = nextState;

      if (prev.match(/inactive|background/) && nextState === 'active') {
        runSync();
      }
    });

    return () => sub.remove();
  }, [runSync]);

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
    if (this.state.err) {
      return <Text style={{ padding: 12, color: 'red' }}>Render error</Text>;
    }
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
