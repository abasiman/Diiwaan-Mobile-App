// app/Shidaal/oilmodal.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  getVendorBillsForOwner,
  saveVendorBillsForOwner,
  SupplierDueItem,
} from '../OilPurchaseOffline/oilpurchasevendorbillsrepo';
import VendorPaymentMultiSheet from './VendorPaymentMultiSheet';


import {
  addLocalVendorPayment,
  VendorPaymentWithContext,
} from '../vendorPaymentTransactionsOffline/vendorPaymentsScreenRepo';


import { queueOilModalForSync } from '../OilModalOffline/oilModalRepo';
import VendorPaymentCreateSheet from './vendorpayment';




/* ──────────────────────────────────────────────────────────
   Layout & Colors
────────────────────────────────────────────────────────── */
const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_PLACEHOLDER = '#64748B';
const COLOR_BORDER = '#94A3B8';
const COLOR_BORDER_FOCUS = '#475569';
const COLOR_DIVIDER = '#E5E7EB';
const COLOR_HEADER_DIVIDER = '#F1F5F9';
const COLOR_INPUT_BG = '#F9FAFB';
const COLOR_PRIMARY = '#0B2447';

/** Compact sizing for summary popup */
const COMPACT_FONT = 12;
const COMPACT_LABEL = 11.5;

/** Keep types */
type OilType = 'diesel' | 'petrol';
type OilTypeOrBoth = OilType | 'both';
type TruckType = 'pulin' | 'samateral';
type CurrencyKey = 'USD' | 'shimaal';

const OIL_TYPES: OilTypeOrBoth[] = ['diesel', 'petrol', 'both'];
const TRUCK_TYPES: TruckType[] = ['pulin', 'samateral'];

const CURRENCY_OPTIONS: { label: string; key: CurrencyKey; code: string }[] = [
  { label: 'USD (US Dollar)', key: 'USD', code: 'USD' },
  { label: 'Shimaal', key: 'shimaal', code: 'SOS' },
];

/* ──────────────────────────────────────────────────────────
   Small utils
────────────────────────────────────────────────────────── */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Allow digits + single dot; also normalize commas to dots */
const filterNumeric = (s: string) => {
  let out = s.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const parts = out.split('.');
  if (parts.length > 2) {
    out = parts[0] + '.' + parts.slice(1).join('');
    // ensure only the *first* dot remains
    out = out.replace(/\./g, (m, i) => (i === out.indexOf('.') ? '.' : ''));
  }
  return out;
};

const filterInt = (s: string) => s.replace(/[^0-9]/g, '');

/* ──────────────────────────────────────────────────────────
   Floating Label Base (shared by Text & Select)
   NOTE: `styles.control` enforces a shared height across inputs & selects.
────────────────────────────────────────────────────────── */
type FloatingCommonProps = {
  label: string;
  active?: boolean;
  hasValue?: boolean;
  children: React.ReactNode;
  style?: any;
  onFocus?: () => void;
  onBlur?: () => void;
  onPressArea?: () => void;
};

function FloatingFieldFrame({
  label,
  active,
  hasValue,
  children,
  style,
  onFocus,
  onBlur,
  onPressArea,
}: FloatingCommonProps) {
  const shouldFloat = !!active || !!hasValue;
  const anim = useRef(new Animated.Value(shouldFloat ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: shouldFloat ? 1 : 0,
      duration: 140,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
  }, [shouldFloat]);

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLOR_BORDER, COLOR_BORDER_FOCUS],
  });

  const labelTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, -10],
  });

  const labelScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.88],
  });

  const labelColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLOR_PLACEHOLDER, COLOR_TEXT],
  });

  const Inner = onPressArea ? TouchableOpacity : View;

  return (
    <Animated.View style={[styles.field, { borderColor }, style, styles.inputBase]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.floatingChip,
          { top: labelTop, transform: [{ scale: labelScale }], backgroundColor: COLOR_BG },
        ]}
      >
        <Animated.Text style={[styles.floatingText, { color: labelColor }]}>{label}</Animated.Text>
      </Animated.View>

      <Inner
        activeOpacity={onPressArea ? 0.9 : 1}
        style={[styles.innerPad, styles.control]}
        onPress={onPressArea}
        onTouchStart={onFocus}
        onTouchEnd={onBlur}
      >
        {children}
      </Inner>
    </Animated.View>
  );
}

/* ──────────────────────────────────────────────────────────
   Floating TextInput
────────────────────────────────────────────────────────── */
type FloatingTextInputProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  containerStyle?: any;
  value?: string;
};

function FloatingTextInput({
  label,
  containerStyle,
  value,
  onFocus,
  onBlur,
  style,
  ...rest
}: FloatingTextInputProps) {
  const [focused, setFocused] = useState(false);
  const handleFocus = () => {
    setFocused(true);
    onFocus?.();
  };
  const handleBlur = () => {
    setFocused(false);
    onBlur?.();
  };

  return (
    <FloatingFieldFrame
      label={label}
      active={focused}
      hasValue={!!value && value.length > 0}
      style={containerStyle}
    >
      <TextInput
        {...rest}
        value={value}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder=""
        style={[styles.inputText, styles.inputTextCompact, { paddingVertical: 0 }, style]}
        selectionColor={COLOR_BORDER_FOCUS}
      />
    </FloatingFieldFrame>
  );
}

/* ──────────────────────────────────────────────────────────
   Floating Select (dropdown)
────────────────────────────────────────────────────────── */
function FloatingSelect<T extends string>({
  label,
  value,
  onSelect,
  options,
  renderLabel,
  containerStyle,
}: {
  label: string;
  value?: T;
  onSelect: (v: T) => void;
  options: T[];
  renderLabel?: (v: T) => string;
  containerStyle?: any;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const display = useMemo(() => {
    if (!value) return '';
    return renderLabel ? renderLabel(value) : String(value);
  }, [value, renderLabel]);

  const toggle = () => {
    setOpen((s) => !s);
    setFocused(true);
  };

  return (
    <View style={{ position: 'relative' }}>
      <FloatingFieldFrame
        label={label}
        active={focused || open}
        hasValue={!!value}
        style={containerStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPressArea={toggle}
      >
        <View style={styles.selectRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.inputText,
              styles.inputTextCompact,
              { color: display ? COLOR_TEXT : COLOR_PLACEHOLDER },
            ]}
          >
            {display || ' '}
          </Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLOR_TEXT} />
        </View>
      </FloatingFieldFrame>

      {open && (
        <View style={styles.dropdown}>
          {options.map((opt) => {
            const lbl = renderLabel ? renderLabel(opt) : String(opt);
            return (
              <TouchableOpacity
                key={opt}
                activeOpacity={0.85}
                onPress={() => {
                  onSelect(opt as T);
                  setOpen(false);
                  setFocused(false);
                }}
                style={styles.dropdownItem}
              >
                <Text style={styles.dropdownText}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* ──────────────────────────────────────────────────────────
   Grid helpers
────────────────────────────────────────────────────────── */
const GridRow = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.gridRow}>{children}</View>
);
const GridCol = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.gridCol}>{children}</View>
);

/* ──────────────────────────────────────────────────────────
   Allocation types (for payment sheets)
────────────────────────────────────────────────────────── */
type Allocation = {
  oilCost: number;
  extras: { category: string; amount: number }[];
  currency: string;
  total: number;
};
type RowAlloc = {
  oilId: number;
  allocation: Allocation;
};

/* ──────────────────────────────────────────────────────────
   Page (Two-step Tabs)
────────────────────────────────────────────────────────── */
export default function OilCreatePage() {
  const { token, user } = useAuth();    
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(true); // <— NEW



    // 👇 ADD THIS
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      console.log('[OilCreatePage] NetInfo changed', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online: ok,
      });
      setOnline(ok);
    });
    return () => sub();
  }, []);

  // Step tabs: 0 = Truck & Oil Info, 1 = Extras & Costs
  const [step, setStep] = useState<0 | 1>(0);

  // Truck & Oil Info
  const [truckPlate, setTruckPlate] = useState('');
  const [truckType, setTruckType] = useState<TruckType | undefined>(undefined);
  const [oilType, setOilType] = useState<OilTypeOrBoth | undefined>(undefined);
 
  const [liters, setLiters] = useState('');
  const [supplierName, setSupplierName] = useState(''); // optional
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [oilWell, setOilWell] = useState('');

  // Extras & Costs (single)
  const [truckRent, setTruckRent] = useState('');
  const [depotCost, setDepotCost] = useState('');
  const [landedCostPerL, setLandedCostPerL] = useState('');
  const [tax, setTax] = useState('');
  const [currencyKey, setCurrencyKey] = useState<CurrencyKey>('USD');

  // BOTH mode
  const [dieselLiters, setDieselLiters] = useState('');
  const [petrolLiters, setPetrolLiters] = useState('');
  const [dieselCostPerL, setDieselCostPerL] = useState('');
  const [petrolCostPerL, setPetrolCostPerL] = useState('');

  const [createdLotId, setCreatedLotId] = useState<number | null>(null);  // NEW

  // Summary modal
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Post-save choice + vendor payment sheet
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [createdOilId, setCreatedOilId] = useState<number | null>(null);
  const [vendorSheetOpen, setVendorSheetOpen] = useState(false);
  const [vendorDisplayName, setVendorDisplayName] = useState<string | null>(null);
  const [currentPayable, setCurrentPayable] = useState<number>(0);

  // Allocations to drive "Pay now" correct split
  const [singleAllocation, setSingleAllocation] = useState<Allocation | null>(null);
  const [multiAllocations, setMultiAllocations] = useState<RowAlloc[] | null>(null);

  // Multi sheet states (for "both")
  const [multiSheetOpen, setMultiSheetOpen] = useState(false);
  const [multiRows, setMultiRows] = useState<
    { oilId: number; oilType: 'diesel' | 'petrol'; truckPlate?: string | null; currentPayable: number }[]
  >([]);
  const [multiVendorName, setMultiVendorName] = useState<string>('');
  const [multiCurrency, setMultiCurrency] = useState<string>('USD');

  type ChoiceMode = 'single' | 'multi';
  const [choiceMode, setChoiceMode] = useState<ChoiceMode>('single');

  // Derived (single)
  const litersNum = Number(liters || 0);
  const landedNum = Number(landedCostPerL || 0);
  const taxNum = Number(tax || 0);
  const truckRentNum = Number(truckRent || 0);
  const depotCostNum = Number(depotCost || 0);
  const totalOilCost = litersNum * landedNum;
  const extrasTotalSingle = taxNum + truckRentNum + depotCostNum;
  const grandTotalSingle = totalOilCost + extrasTotalSingle;

  // Derived (both)
  const isBoth = oilType === 'both';
  const dLit = Number(dieselLiters || 0);
  const pLit = Number(petrolLiters || 0);
  const dCost = Number(dieselCostPerL || 0);
  const pCost = Number(petrolCostPerL || 0);
  const dLandedTotal = dLit * dCost;
  const pLandedTotal = pLit * pCost;
  const landedSum = dLandedTotal + pLandedTotal;
  const taxShared = Number(tax || 0);
  const extrasTotalBoth = taxShared + truckRentNum + depotCostNum;
  const grandTotalBoth = landedSum + extrasTotalBoth;

 const validateStep0 = () => {
  if (!oilType) return false;
  if (!isBoth && !liters) return false;
  return true;
 };

  const validateStep1 = () => {
    if (isBoth) {
      if (!dieselLiters || !petrolLiters) return false;
      if (!dieselCostPerL || !petrolCostPerL) return false;
    } else {
      if (!landedCostPerL) return false;
    }
    return true;
  };

  const onNext = () => {
    if (step === 0) {
      if (!validateStep0()) return;
      setStep(1);
    }
  };
  const onBack = () => {
    if (step === 1) setStep(0);
  };

  const openSummaryOrValidate = () => {
    if (!validateStep0()) {
      setStep(0);
      return;
    }
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    setSummaryOpen(true);
  };

  const currencyCode = useMemo(
    () => (CURRENCY_OPTIONS.find((c) => c.key === currencyKey)?.code) ?? 'USD',
    [currencyKey]
  );

  const moneyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });
    } catch {
      return new Intl.NumberFormat('en-US');
    }
  }, [currencyCode]);
  const formatMoney = (n: number) => (Number.isFinite(n) ? moneyFormatter.format(n) : '—');

  const extraCostsSingle = useMemo(
    () => ({ truckRent: truckRentNum, depotCost: depotCostNum, tax: taxNum, currency: currencyCode }),
    [truckRentNum, depotCostNum, taxNum, currencyCode]
  );

  const extraCostsShared = useMemo(
    () => ({ truckRent: truckRentNum, depotCost: depotCostNum, tax: taxShared, currency: currencyCode }),
    [truckRentNum, depotCostNum, taxShared, currencyCode]
  );

  const createExtra = async (oilId: number, category: string, amount: number) => {
    try {
      if (!oilId || !amount || amount <= 0) return;
      await api.post(
        `/diiwaanoil/${oilId}/extra-costs`,
        { category, amount, currency: currencyCode },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
    } catch {
      // non-blocking
    }
  };


  const handleSubmit = async () => {
  try {
    setSubmitting(true);

    const commonHeader = {
      truck_plate: truckPlate || undefined,
      truck_type: truckType || undefined,
      supplier_name: supplierName || undefined,
      from_location: fromLocation || undefined,
      to_location: toLocation || undefined,
      currency: currencyCode,
      status: 'available' as const,
    };

    const isBoth = oilType === 'both';

    // Build the exact payload(s) we use online
    const bothPayload: any = isBoth
      ? {
          ...commonHeader,
          depot: false,
          depot_name: undefined,
          location_notes: undefined,
          pay_ment_status: undefined,
          lines: [
            {
              oil_type: 'diesel',
              qty: undefined,
              liters: Number(dLit),
              landed_cost_per_l: dCost || undefined,
              oil_well: oilWell || undefined,
              oil_well_cost: 0,
            },
            {
              oil_type: 'petrol',
              qty: undefined,
              liters: Number(pLit),
              landed_cost_per_l: pCost || undefined,
              oil_well: oilWell || undefined,
              oil_well_cost: 0,
            },
          ],
        }
      : null;

    const singlePayload: any = !isBoth
      ? {
          oil_type: oilType,
          qty: undefined,
          liters: Number(liters),
          ...commonHeader,
          landed_cost_per_l: landedCostPerL ? Number(landedCostPerL) : undefined,
          oil_well: oilWell || undefined,
        }
      : null;

    const mode: 'single' | 'both' = isBoth ? 'both' : 'single';
    const payload: any = isBoth ? bothPayload : singlePayload;

    const truckRentVal = Number(truckRent || 0);
    const depotCostVal = Number(depotCost || 0);
    const taxVal = Number(tax || 0);

    // 🔴 OFFLINE: queue for sync + add a local vendor bill + SHOW CHOICE POPUP
    if (!online || !token) {
      if (!user?.id) {
        setSubmitting(false);
        setSummaryOpen(false);
        console.warn('Missing user – cannot queue oil form for sync');
        return;
      }

      // queue the form for later sync
     const localFormId = queueOilModalForSync(user.id, {
      mode,
      payload,
      truck_rent: truckRentVal,
      depot_cost: depotCostVal,
      tax: taxVal,
      currency: currencyCode,
    });


      try {
        const existing = await getVendorBillsForOwner(user.id);
        const todayIso = new Date().toISOString();
        const extrasTotal = truckRentVal + depotCostVal + taxVal;
        const fallbackSupplier =
          (supplierName && supplierName.trim()) ||
          (oilWell && oilWell.trim()) ||
          '—';

        let bill: SupplierDueItem;

        if (isBoth) {
          const dLitVal = Number(dLit || 0);
          const pLitVal = Number(pLit || 0);
          const dCostPerL = Number(dCost || 0);
          const pCostPerL = Number(pCost || 0);

          const dOilCost = dLitVal * dCostPerL;
          const pOilCost = pLitVal * pCostPerL;
          const totalOilCost = dOilCost + pOilCost;
          const overall = totalOilCost + extrasTotal;
          const halfExtras = extrasTotal / 2;

          bill = {
            supplier_name: fallbackSupplier,
            lot_id: null,
            oil_id: null,
            oil_type: null,
            liters: dLitVal + pLitVal,
            truck_plate: truckPlate || null,
            truck_type: truckType || null,
            oil_total_landed_cost: totalOilCost,
            total_extra_cost: extrasTotal,
            over_all_cost: overall,
            total_paid: 0,
            amount_due: overall,
            child_oils: [
              {
                oil_id: 0,
                oil_type: 'diesel',
                liters: dLitVal,
                sold_l: 0,
                in_stock_l: dLitVal,
                oil_total_landed_cost: dOilCost,
                total_extra_cost: halfExtras,
                over_all_cost: dOilCost + halfExtras,
                total_paid: 0,
                amount_due: dOilCost + halfExtras,
                extra_costs: [],
              },
              {
                oil_id: 0,
                oil_type: 'petrol',
                liters: pLitVal,
                sold_l: 0,
                in_stock_l: pLitVal,
                oil_total_landed_cost: pOilCost,
                total_extra_cost: halfExtras,
                over_all_cost: pOilCost + halfExtras,
                total_paid: 0,
                amount_due: pOilCost + halfExtras,
                extra_costs: [],
              },
            ],
            extra_costs: [],
            date: todayIso,


            local_oil_form_id: localFormId,
          };

          await saveVendorBillsForOwner(user.id, [...existing, bill]);

          // Build offline multi rows + allocations so popup works
          const rows: {
            oilId: number;
            oilType: 'diesel' | 'petrol';
            truckPlate?: string | null;
            currentPayable: number;
          }[] = [
            {
              oilId: 0,
              oilType: 'diesel',
              truckPlate: truckPlate || null,
              currentPayable: dOilCost,
            },
            {
              oilId: 0,
              oilType: 'petrol',
              truckPlate: truckPlate || null,
              currentPayable: pOilCost,
            },
          ];

          const vendor = fallbackSupplier;

          setMultiRows(rows);
          setMultiVendorName(vendor);
          setMultiCurrency(currencyCode || 'USD');

          if (rows.length >= 1) {
            const halfTruck = truckRentVal / (rows.length || 1);
            const halfDepot = depotCostVal / (rows.length || 1);
            const halfTax = taxVal / (rows.length || 1);

            const allocationsPerRow: RowAlloc[] = rows.map((r) => ({
              oilId: r.oilId,
              allocation: {
                oilCost: Number(r.currentPayable || 0),
                extras: [
                  { category: 'truck_rent', amount: halfTruck },
                  { category: 'depot_cost', amount: halfDepot },
                  { category: 'tax', amount: halfTax },
                ],
                currency: currencyCode,
                total: Number(r.currentPayable || 0) + halfTruck + halfDepot + halfTax,
              },
            }));

            setMultiAllocations(allocationsPerRow);
            setChoiceMode('multi');
            setChoiceOpen(true);
          } else {
            // fallback: just go to vendor bills
            router.push('/TrackVendorBills/vendorbills');
          }
        } else {
          const litVal = Number(liters || 0);
          const costPerL = Number(landedCostPerL || 0);
          const oilCost = litVal * costPerL;
          const overall = oilCost + extrasTotal;

          bill = {
            supplier_name: fallbackSupplier,
            lot_id: null,
            oil_id: null,
            oil_type: oilType === 'both' ? null : (oilType as any),
            liters: litVal,
            truck_plate: truckPlate || null,
            truck_type: truckType || null,
            oil_total_landed_cost: oilCost,
            total_extra_cost: extrasTotal,
            over_all_cost: overall,
            total_paid: 0,
            amount_due: overall,
            child_oils: [],
            extra_costs: [],
            local_oil_form_id: localFormId,
            date: todayIso,
          };

          await saveVendorBillsForOwner(user.id, [...existing, bill]);

          // Build offline single allocation + open choice popup
          const allocation: Allocation = {
            oilCost,
            extras: [
              { category: 'truck_rent', amount: truckRentVal },
              { category: 'depot_cost', amount: depotCostVal },
              { category: 'tax', amount: taxVal },
            ],
            currency: currencyCode,
            total: overall,
          };

          const vendor = fallbackSupplier;

          setSingleAllocation(allocation);
          setCreatedOilId(0); // local placeholder
          setCreatedLotId(null);
          setVendorDisplayName(vendor);
          setCurrentPayable(Math.max(0, overall));
          setChoiceMode('single');
          setChoiceOpen(true);
        }
      } catch (err) {
        console.warn('[oilmodal] failed to add local vendor bill for offline create', err);
      }

      setSubmitting(false);
      setSummaryOpen(false);
      return;
    }

    // 🟢 ONLINE: existing behaviour
    if (isBoth) {
      const res = await api.post('/diiwaanoil', bothPayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSubmitting(false);
      setSummaryOpen(false);

      const data = res?.data;
      const items: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];
      const rows = (items || [])
        .map((o) => ({
          oilId: Number(o?.id),
          oilType: String(o?.oil_type || '').toLowerCase() === 'diesel' ? 'diesel' : 'petrol',
          truckPlate: o?.truck_plate ?? truckPlate,
          currentPayable: Number(o?.total_landed_cost || 0),
        }))
        .filter((r) => r.oilId && (r.oilType === 'diesel' || r.oilType === 'petrol'))
        .slice(0, 2);

      if (rows.length > 0) {
        await createExtra(rows[0].oilId, 'truck_rent', truckRentVal);
        await createExtra(rows[0].oilId, 'depot_cost', depotCostVal);
        const fullTax = taxVal;
        if (fullTax > 0) await createExtra(rows[0].oilId, 'tax', fullTax);
      }

      const vendor =
        (oilWell && oilWell.trim()) ||
        (supplierName && supplierName.trim()) ||
        '—';

      setMultiRows(rows);
      setMultiVendorName(vendor);
      setMultiCurrency(currencyCode || 'USD');

      if (rows.length >= 1) {
        const halfTruck = truckRentVal / (rows.length || 1);
        const halfDepot = depotCostVal / (rows.length || 1);
        const halfTax = taxVal / (rows.length || 1);

        const allocationsPerRow: RowAlloc[] = rows.map((r) => ({
          oilId: r.oilId,
          allocation: {
            oilCost: Number(r.currentPayable || 0),
            extras: [
              { category: 'truck_rent', amount: halfTruck },
              { category: 'depot_cost', amount: halfDepot },
              { category: 'tax', amount: halfTax },
            ],
            currency: currencyCode,
            total: Number(r.currentPayable || 0) + halfTruck + halfDepot + halfTax,
          },
        }));
        setMultiAllocations(allocationsPerRow);
        setChoiceMode('multi');
        setChoiceOpen(true);
      } else {
        router.push('/TrackVendorBills/vendorbills');
      }

      return;
    }

    // ONLINE SINGLE
    const res = await api.post('/diiwaanoil', singlePayload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setSubmitting(false);
    setSummaryOpen(false);

    const oil = res?.data || {};
    const newId = Number(oil?.id);

    // Resolve LOT id for vendor payment sheet
    let newLotId: number | null =
      Number.isFinite(oil?.lot_id) ? Number(oil.lot_id) :
      Number.isFinite(oil?.lot?.id) ? Number(oil.lot.id) :
      null;

    if (!newLotId && Number.isFinite(newId)) {
      try {
        const r = await api.get(`/diiwaanoil/${newId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = r?.data || {};
        newLotId =
          Number.isFinite(d?.lot_id) ? Number(d.lot_id) :
          Number.isFinite(d?.lot?.id) ? Number(d.lot.id) :
          null;
      } catch {
        // ignore
      }
    }

    if (Number.isFinite(newId)) {
      await createExtra(newId, 'truck_rent', truckRentVal);
      await createExtra(newId, 'depot_cost', depotCostVal);
      await createExtra(newId, 'tax', taxVal);
    }

    const vendor =
      (oil?.oil_well && String(oil.oil_well).trim()) ||
      (oil?.supplier_name && String(oil.supplier_name).trim()) ||
      (supplierName || '').trim() ||
      null;

    const extrasSum = truckRentVal + depotCostVal + taxVal;

    const payableGuess =
      Number(oil?.total_landed_cost || 0) + extrasSum;

    const allocation: Allocation = {
      oilCost: Number(oil?.total_landed_cost || 0),
      extras: [
        { category: 'truck_rent', amount: truckRentVal },
        { category: 'depot_cost', amount: depotCostVal },
        { category: 'tax', amount: taxVal },
      ],
      currency: currencyCode,
      total: Number(oil?.total_landed_cost || 0) + extrasSum,
    };

    setSingleAllocation(allocation);
    setCreatedOilId(Number.isFinite(newId) ? newId : null);
    setCreatedLotId(newLotId);
    setVendorDisplayName(vendor);
    setCurrentPayable(Math.max(0, payableGuess));

    setChoiceMode('single');
    setChoiceOpen(true);
  } catch (e: any) {
    setSubmitting(false);
    console.warn('Oil create failed', e?.response?.data || e?.message || e);
  }
};


  const onChoosePayNow = () => {
    setChoiceOpen(false);
    if (choiceMode === 'single') setVendorSheetOpen(true);
    else setMultiSheetOpen(true);
  };

  const onChooseRecordAP = async () => {
  setChoiceOpen(false);

  const ownerId = user?.id ?? 0;
  if (!ownerId) {
    // No local owner context – just go back to bills.
    router.push('/TrackVendorBills/vendorbills');
    return;
  }

  // Only need a synthetic row when we're offline / no token.
  if (!online || !token) {
    try {
      const nowIso = new Date().toISOString();

      // currentPayable already holds the total amount due you computed
      // when creating the oil record (overall cost).
      const vp: VendorPaymentWithContext = {
        id: -Date.now(), // temporary local ID
        amount: 0, // no cash paid yet, it's an AP
        amount_due: Math.max(0, currentPayable || 0),
        note: 'Recorded as AP (offline)',
        payment_method: 'equity',
        payment_date: nowIso,
        supplier_name: vendorDisplayName ?? null,
        lot_id: createdLotId ?? null,
        oil_id: createdOilId ?? null,
        extra_cost_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        truck_plate: truckPlate || null,
        truck_type: truckType || null,
        transaction_type: 'ap_record_offline', // any distinct label you like
        currency: currencyCode,
        fx_rate_to_usd: null,
        supplier_due_context: null,
        extra_cost_context: null,
      };

      await addLocalVendorPayment(ownerId, vp);
      console.log('[oilmodal] added offline AP placeholder to vendor payments cache');
    } catch (err) {
      console.warn('[oilmodal] failed to add offline AP placeholder payment', err);
    }
  }

  // Navigate as before
  router.push('/TrackVendorBills/vendorbills');
};


  const onVendorPaymentDone = () => {
    setVendorSheetOpen(false);
    router.push('/TrackVendorBills/vendorbills');
  };

  /* ────────────────────────────────────────────────────────
     Summary helpers (COMPACT "label: value")
  ───────────────────────────────────────────────────────── */
  const Line = ({
    label,
    value,
    emphasize,
  }: {
    label: string;
    value: string | number;
    emphasize?: boolean;
  }) => (
    <View style={summaryStyles.lineWrap}>
      <Text style={summaryStyles.lineText}>
        <Text style={summaryStyles.lineLabel}>{label}: </Text>
        <Text style={[summaryStyles.lineValue, emphasize && { fontWeight: '900' }]}>{String(value)}</Text>
      </Text>
    </View>
  );

  const Pill = ({ text }: { text: string }) => (
    <View style={summaryStyles.pill}><Text style={summaryStyles.pillTxt}>{text}</Text></View>
  );

  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.push('/TrackVendorBills/vendorbills')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={18} color={COLOR_TEXT} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.headerIcon}>
            <Feather name="droplet" size={14} color={COLOR_TEXT} />
          </View>
          <Text style={styles.title}>New Oil Record</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: 'height' })} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 0 ? (
            <>
              {/* Row: Truck plate + Oil type */}
              <GridRow>
                <GridCol>
                  <FloatingTextInput label="Truck plate" value={truckPlate} onChangeText={setTruckPlate} autoCapitalize="characters" returnKeyType="next" containerStyle={styles.inputCompact} />
                </GridCol>
                <GridCol>
                  <FloatingSelect label="Oil type *" value={oilType} onSelect={setOilType} options={OIL_TYPES} renderLabel={(v) => (v === 'both' ? 'Both (Diesel + Petrol)' : cap(v))} containerStyle={styles.inputCompact} />
                </GridCol>
              </GridRow>

              {/* Row: Truck type + Supplier */}
              <GridRow>
                <GridCol>
                  <FloatingSelect label="Truck type" value={truckType} onSelect={setTruckType} options={TRUCK_TYPES} renderLabel={(v) => (v === 'pulin' ? 'Pulin' : 'Samateral')} containerStyle={styles.inputCompact} />
                </GridCol>
                <GridCol>
                  <FloatingTextInput label="Supplier" value={oilWell} onChangeText={setOilWell} returnKeyType="next" containerStyle={styles.inputCompact} />
                </GridCol>
              </GridRow>

              {/* Qty & liters (single) OR just qty (both) */}
              
              {/* Liters (single only) */}
            {!isBoth && (
              <GridRow>
                <GridCol>
                  <FloatingTextInput
                    label="Liters *"
                    value={liters}
                    onChangeText={(t) => setLiters(filterInt(t))}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    containerStyle={styles.inputCompact}
                  />
                </GridCol>
                <GridCol>
                  <View />
                </GridCol>
              </GridRow>
            )}


              {/* From / To */}
              <GridRow>
                <GridCol>
                  <FloatingTextInput label="From location" value={fromLocation} onChangeText={setFromLocation} containerStyle={styles.inputCompact} />
                </GridCol>
                <GridCol>
                  <FloatingTextInput label="To location (optional)" value={toLocation} onChangeText={setToLocation} containerStyle={styles.inputCompact} />
                </GridCol>
              </GridRow>

              <TouchableOpacity style={styles.nextBtn} onPress={onNext} activeOpacity={0.9}>
                <Text style={styles.nextTxt}>Next</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Extras common: Truck rent + Depot cost (DEFAULT keyboard + sanitize) */}
              <GridRow>
                <GridCol>
                  <FloatingTextInput
                    label="Truck rent"
                    value={truckRent}
                    onChangeText={(t) => setTruckRent(filterNumeric(t))}
                    returnKeyType="next"
                    containerStyle={styles.inputCompact}
                  />
                </GridCol>
                <GridCol>
                  <FloatingTextInput
                    label="Qarashka Ceelka"
                    value={depotCost}
                    onChangeText={(t) => setDepotCost(filterNumeric(t))}
                    returnKeyType="next"
                    containerStyle={styles.inputCompact}
                  />
                </GridCol>
              </GridRow>

              {/* Costs (NO SELL PRICE) */}
              {!isBoth ? (
                <GridRow>
                  <GridCol>
                    <FloatingTextInput
                      label="Cost / Liter *"
                      value={landedCostPerL}
                      onChangeText={(t) => setLandedCostPerL(filterNumeric(t))}
                      containerStyle={styles.inputCompact}
                    />
                  </GridCol>
                  <GridCol><View /></GridCol>
                </GridRow>
              ) : (
                <>
                  <Text style={{ color: COLOR_TEXT, fontWeight: '800', marginBottom: 6 }}>Diesel</Text>
                  <GridRow>
                    <GridCol>
                      <FloatingTextInput
                        label="Liters *"
                        value={dieselLiters}
                        onChangeText={(t) => setDieselLiters(filterInt(t))}
                        keyboardType="number-pad"
                        containerStyle={styles.inputCompact}
                      />
                    </GridCol>
                    <GridCol>
                      <FloatingTextInput
                        label="Cost / L *"
                        value={dieselCostPerL}
                        onChangeText={(t) => setDieselCostPerL(filterNumeric(t))}
                        containerStyle={styles.inputCompact}
                      />
                    </GridCol>
                  </GridRow>

                  <Text style={{ color: COLOR_TEXT, fontWeight: '800', marginBottom: 6, marginTop: 6 }}>Petrol</Text>
                  <GridRow>
                    <GridCol>
                      <FloatingTextInput
                        label="Liters *"
                        value={petrolLiters}
                        onChangeText={(t) => setPetrolLiters(filterInt(t))}
                        keyboardType="number-pad"
                        containerStyle={styles.inputCompact}
                      />
                    </GridCol>
                    <GridCol>
                      <FloatingTextInput
                        label="Cost / L *"
                        value={petrolCostPerL}
                        onChangeText={(t) => setPetrolCostPerL(filterNumeric(t))}
                        containerStyle={styles.inputCompact}
                      />
                    </GridCol>
                  </GridRow>
                </>
              )}

              {/* Currency + Tax */}
              <GridRow>
                <GridCol>
                  <FloatingSelect
                    label="Currency"
                    value={currencyKey}
                    onSelect={setCurrencyKey}
                    options={['USD', 'shimaal'] as CurrencyKey[]}
                    renderLabel={(v) => CURRENCY_OPTIONS.find((c) => c.key === v)?.label || v}
                    containerStyle={styles.inputCompact}
                  />
                </GridCol>
                <GridCol>
                  <FloatingTextInput
                    label="Tax"
                    value={tax}
                    onChangeText={(t) => setTax(filterNumeric(t))}
                    containerStyle={styles.inputCompact}
                  />
                </GridCol>
              </GridRow>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[styles.navBtn, styles.navGhost]} onPress={onBack} activeOpacity={0.9}>
                  <Feather name="arrow-left" size={16} color={COLOR_PRIMARY} />
                  <Text style={styles.navGhostTxt}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.7 }]} onPress={openSummaryOrValidate} disabled={submitting} activeOpacity={0.9}>
                  {submitting ? <ActivityIndicator color="#fff" /> : (<><Feather name="save" size={16} color="#fff" style={{ marginRight: 6 }} /><Text style={styles.submitText}>Save</Text></>)}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Summary popup — simplified "label: value" lines */}
      <Modal visible={summaryOpen} transparent animationType="fade" onRequestClose={() => setSummaryOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setSummaryOpen(false)}>
          <View style={summaryStyles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={summaryStyles.centerWrap}>
          <View style={summaryStyles.card}>
            <Text style={summaryStyles.title}>Fadlan Iska Hubi</Text>

            {/* Header chips */}
            <View style={summaryStyles.section}>
              <Line label="Truck plate" value={truckPlate || '—'} />
              <Line label="Truck type" value={truckType ? (truckType === 'pulin' ? 'Pulin' : 'Samateral') : '—'} />
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                {!!oilType && <Pill text={oilType === 'both' ? 'Diesel + Petrol' : cap(oilType)} />}
                <Pill text={CURRENCY_OPTIONS.find((c) => c.key === currencyKey)?.code || 'USD'} />
              </View>
            </View>

            {/* 1) Oil Cost */}
            <View style={summaryStyles.section}>
              <Text style={summaryStyles.sectionTitle}>Oil cost</Text>
              {!isBoth ? (
                <>
                  <Line label="Liters" value={litersNum} />
                  <Line label="Cost / L" value={formatMoney(landedNum)} />
                  <View style={summaryStyles.divider} />
                  <Line label="Oil cost subtotal" value={formatMoney(totalOilCost)} emphasize />
                </>
              ) : (
                <>
                  <Text style={summaryStyles.subTitle}>Diesel</Text>
                  <Line label="Liters" value={dLit} />
                  <Line label="Cost / L" value={formatMoney(dCost)} />
                  <Line label="Line cost" value={formatMoney(dLandedTotal)} />

                  <Text style={[summaryStyles.subTitle, { marginTop: 6 }]}>Petrol</Text>
                  <Line label="Liters" value={pLit} />
                  <Line label="Cost / L" value={formatMoney(pCost)} />
                  <Line label="Line cost" value={formatMoney(pLandedTotal)} />

                  <View style={summaryStyles.divider} />
                  <Line label="Oil cost subtotal" value={formatMoney(landedSum)} emphasize />
                </>
              )}
            </View>

            {/* 2) Other charges (extra costs) */}
            <View style={summaryStyles.section}>
              <Text style={summaryStyles.sectionTitle}>Other charges</Text>
              <Line label="Truck rent" value={formatMoney(truckRentNum)} />
              <Line label="Depot cost" value={formatMoney(depotCostNum)} />
              <Line label="Tax" value={formatMoney(isBoth ? taxShared : taxNum)} />
              <View style={summaryStyles.divider} />
              <Line
                label="Extra costs subtotal"
                value={formatMoney(isBoth ? extrasTotalBoth : extrasTotalSingle)}
                emphasize
              />
            </View>

            {/* 3) Total */}
            <View style={[summaryStyles.section, { backgroundColor: '#0B1220' }]}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'right' }}>
                Total: {formatMoney(isBoth ? grandTotalBoth : grandTotalSingle)}
              </Text>
            </View>

            <View style={summaryStyles.actions}>
              <TouchableOpacity style={[summaryStyles.btn, summaryStyles.ghost]} onPress={() => setSummaryOpen(false)} activeOpacity={0.9}>
                <Text style={summaryStyles.ghostTxt}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={summaryStyles.btn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.9}>
                <Feather name="check-circle" size={16} color="#fff" />
                <Text style={summaryStyles.btnTxt}>{submitting ? 'Saving...' : 'Confirm & Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Choice popup */}
      <Modal visible={choiceOpen} transparent animationType="fade" onRequestClose={() => setChoiceOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setChoiceOpen(false)}>
          <View style={choiceStyles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={choiceStyles.centerWrap}>
          <View style={choiceStyles.card}>
            <Text style={choiceStyles.title}>Pay oil well now?</Text>
            <Text style={choiceStyles.sub}>Waxaad abuurtay diiwaan shidaal. Ma rabtaa inaad hadda bixiso alaab-qeybiyaha mise inaad u diiwaangeliso sida AP?</Text>

            <View style={choiceStyles.actions}>
              <TouchableOpacity style={[choiceStyles.btn, choiceStyles.ghost]} onPress={onChooseRecordAP}>
                <Text style={choiceStyles.ghostTxt}>Record as AP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={choiceStyles.btn} onPress={onChoosePayNow} disabled={choiceMode === 'single' && !createdOilId} activeOpacity={0.9}>
                <Feather name="credit-card" size={16} color="#fff" />
                <Text style={choiceStyles.btnTxt}>Pay now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Vendor payment sheets */}
      <VendorPaymentCreateSheet
        visible={vendorSheetOpen}
        onClose={() => setVendorSheetOpen(false)}
        token={token ?? null}
        oilId={createdOilId ?? 0}                 // fallback
        lotId={createdLotId ?? undefined}         // <— ADD THIS: forces lot-allocated payment
        vendorNameOverride={vendorDisplayName ?? undefined}
        currentPayable={currentPayable}
        onCreated={onVendorPaymentDone}
        companyName={undefined}
        companyContact={undefined}
        extraCosts={extraCostsSingle}
        allocation={singleAllocation ?? undefined}
      />

      <VendorPaymentMultiSheet
        visible={multiSheetOpen}
        onClose={() => setMultiSheetOpen(false)}
        token={token ?? null}
        vendorName={multiVendorName || '-'}
        currencyCode={multiCurrency}
        rows={multiRows}
        allocations={multiAllocations ?? undefined} // <-- per-row allocations for both flow
        onCreated={() => {
          setMultiSheetOpen(false);
          router.push('/TrackVendorBills/vendorbills');
        }}
        companyName={undefined}
        companyContact={undefined}
        extraCostsShared={extraCostsShared}
      />
    </View>
  );
}

/* ──────────────────────────────────────────────────────────
   Styles (compact summary)
────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR_BG },

  // Header
  pageHeader: {
    paddingHorizontal: 14,
    paddingTop: Platform.select({ ios: 12, android: 8 }),
    paddingBottom: 10,
    marginTop: 44,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_HEADER_DIVIDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerIcon: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: COLOR_TEXT },

  // Grid
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 14 },
  gridCol: { width: '48%' },

  // Fields
  field: { marginBottom: 14, borderWidth: 1.2, borderRadius: 12, backgroundColor: COLOR_INPUT_BG },
  control: { minHeight: 44, justifyContent: 'center' },
  innerPad: { paddingHorizontal: 12, paddingVertical: 8 },
  floatingChip: { position: 'absolute', left: 12, paddingHorizontal: 6 },
  floatingText: { fontSize: 12, fontWeight: '700' },
  inputBase: {},
  inputCompact: {},
  inputText: { fontSize: 14, color: COLOR_TEXT },
  inputTextCompact: { fontSize: 14 },

  // Select row
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Dropdown
  dropdown: { marginTop: 6, borderWidth: 1.2, borderColor: COLOR_BORDER, borderRadius: 12, overflow: 'hidden', backgroundColor: COLOR_BG, zIndex: 20, elevation: 8 },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR_DIVIDER },
  dropdownText: { fontSize: 14, color: COLOR_TEXT },

  // Navigation + submit
  nextBtn: { marginTop: 8, backgroundColor: COLOR_PRIMARY, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  nextTxt: { color: 'white', fontSize: 14, fontWeight: '900' },
  navBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  navGhost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#D1D5DB' },
  navGhostTxt: { color: COLOR_PRIMARY, fontWeight: '900' },
  submitBtn: { flex: 1, backgroundColor: '#0F172A', borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', shadowColor: '#0F172A', shadowOpacity: Platform.OS === 'ios' ? 0.16 : 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  submitText: { color: 'white', fontSize: 15, fontWeight: '800' },
});

/* ── Summary & Choice modal styles (COMPACT) ───────────── */
const summaryStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  centerWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '78%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  title: { fontSize: 14, fontWeight: '900', color: '#0B1220', marginBottom: 8, textAlign: 'center' },
  section: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 8, marginBottom: 8 },
  sectionTitle: { fontSize: COMPACT_FONT, fontWeight: '900', color: '#0B1220', marginBottom: 6 },
  subTitle: { fontSize: COMPACT_FONT - 0.5, fontWeight: '800', color: '#0B1220', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },

  // New line style (label: value)
  lineWrap: { paddingVertical: 2 },
  lineText: { fontSize: COMPACT_FONT, color: '#0B1220' },
  lineLabel: { fontSize: COMPACT_LABEL, color: '#475569', fontWeight: '700' },
  lineValue: { fontSize: COMPACT_FONT, color: '#0B1220', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, height: 42, borderRadius: 10, backgroundColor: COLOR_PRIMARY, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnTxt: { color: '#fff', fontWeight: '900', fontSize: 12.5 },
  ghost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#D1D5DB' },
  ghostTxt: { color: '#0B1220', fontWeight: '900', fontSize: 12.5 },
  pill: { backgroundColor: '#EEF2FF', borderColor: '#DDE3F0', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pillTxt: { color: '#0B2447', fontWeight: '800', fontSize: 11.5 },
});

const choiceStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  centerWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEF1F6', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  title: { fontSize: 16, fontWeight: '900', color: '#0B1220', marginBottom: 4, textAlign: 'center' },
  sub: { fontSize: 12, color: '#6B7280', marginBottom: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: COLOR_PRIMARY, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnTxt: { color: '#fff', fontWeight: '900' },
  ghost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#D1D5DB' },
  ghostTxt: { color: '#0B1220', fontWeight: '900' },
});
