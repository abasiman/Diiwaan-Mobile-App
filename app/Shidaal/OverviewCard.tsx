// app/components/FinancialOverviewCard.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

type AccountType = 'ar' | 'ap' | 'revenue' | 'cash' | 'inventory';

type AccountBalance = {
  account_type: AccountType;
  balance_native: number;
  balance_usd: number;
};

type AccountSummary = {
  per_account: AccountBalance[];
  oil_asset_usd: number;
  cogs_usd: number;
  net_profit_usd: number;
};

type AccountSummaryResponse = {
  overall: AccountSummary;
};

type DateRange = {
  start: string;
  end: string;
  label: string;
};

// Professional color palette
const COLORS = {
  primary: '#1E40AF',
  primaryLight: '#DBEAFE',
  secondary: '#047857',
  secondaryLight: '#D1FAE5',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF'
  },
  border: '#E5E7EB',
  background: '#FFFFFF',
  cardBackground: '#F8FAFC'
};

const numFace = Platform.OS === 'android'
  ? { fontFamily: 'monospace' as const }
  : { fontVariant: ['tabular-nums'] as const };

const normalizeUSD = (c?: string | null) => {
  const cur = (c || 'USD').toUpperCase().trim();
  if (cur === 'USD' || cur === 'US' || cur === 'US$' || cur === 'USD$') return 'USD';
  return cur;
};

const money = (n?: number | null, currency?: string | null) => {
  const cur = normalizeUSD(currency);
  const val = n ?? 0;
  if (cur === 'USD') {
    const num = new Intl.NumberFormat(undefined, { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(Math.abs(val));
    return `${val < 0 ? '-' : ''}$${num}`;
  }
  return new Intl.NumberFormat(undefined, { 
    style: 'currency', 
    currency: cur, 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(val);
};

const getMonthRangeUTC = (d = new Date()): DateRange => {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString();
  const end   = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString();
  const label = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, end, label };
};

const getQuarterRangeUTC = (d = new Date()): DateRange => {
  const y = d.getFullYear();
  const m = d.getMonth();
  const quarter = Math.floor(m / 3);
  const startMonth = quarter * 3;
  const endMonth = startMonth + 2;
  
  const start = new Date(Date.UTC(y, startMonth, 1)).toISOString();
  const end   = new Date(Date.UTC(y, endMonth + 1, 0, 23, 59, 59)).toISOString();
  const label = `Q${quarter + 1} ${y}`;
  return { start, end, label };
};

const getYearRangeUTC = (d = new Date()): DateRange => {
  const y = d.getFullYear();
  const start = new Date(Date.UTC(y, 0, 1)).toISOString();
  const end   = new Date(Date.UTC(y, 11, 31, 23, 59, 59)).toISOString();
  const label = `${y}`;
  return { start, end, label };
};

const FinancialOverviewCard: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [selectedRange, setSelectedRange] = useState<DateRange>(getMonthRangeUTC());
  const [dateModalVisible, setDateModalVisible] = useState(false);

  const dateRanges = useMemo(() => [
    getMonthRangeUTC(),
    getQuarterRangeUTC(),
    getYearRangeUTC(),
  ], []);

  const getUsd = (s: AccountSummary | null | undefined, t: AccountType) =>
    s?.per_account.find(p => p.account_type === t)?.balance_usd ?? 0;

  const cash      = getUsd(summary, 'cash');
  const ar        = getUsd(summary, 'ar');
  const revenue   = getUsd(summary, 'revenue');
  const inventory = getUsd(summary, 'inventory');
  const cogs      = summary?.cogs_usd ?? Math.max(0, - (summary?.oil_asset_usd ?? 0));
  const net       = summary?.net_profit_usd ?? (revenue - cogs);
  const totalAssets = cash + ar + inventory;

  const fetchSummary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get<AccountSummaryResponse>('/diiwaantenantsaccounts/summary', {
        headers: { Authorization: `Bearer ${token}` },
        params: { start: selectedRange.start, end: selectedRange.end },
      });
      setSummary(res.data?.overall ?? null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [token, selectedRange]);

  useEffect(() => { 
    fetchSummary(); 
  }, [fetchSummary]);

  const getValueColor = (value: number) => {
    if (value > 0) return COLORS.secondary;
    if (value < 0) return COLORS.danger;
    return COLORS.text.secondary;
  };

  const FinancialMetric: React.FC<{
    icon: string;
    label: string;
    value: number;
    isProfit?: boolean;
    isTotal?: boolean;
  }> = ({ icon, label, value, isProfit = false, isTotal = false }) => (
    <View style={[styles.metricRow, isTotal && styles.totalRow]}>
      <View style={styles.metricLeft}>
        <Ionicons 
          name={icon as any} 
          size={16} 
          color={isTotal ? COLORS.primary : COLORS.text.secondary} 
        />
        <Text style={[
          styles.metricLabel, 
          isTotal && styles.totalLabel
        ]}>
          {label}
        </Text>
      </View>
      <Text style={[
        styles.metricValue,
        numFace,
        { color: isProfit ? getValueColor(value) : COLORS.text.primary },
        isTotal && styles.totalValue
      ]}>
        {money(value)}
      </Text>
    </View>
  );

  return (
    <View style={styles.card}>
      {/* Header with Date Selection */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Financial Overview</Text>
          <Text style={styles.subtitle}>Key performance indicators</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.dateSelector}
          onPress={() => setDateModalVisible(true)}
        >
          <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.dateText}>{selectedRange.label}</Text>
          <Ionicons name="chevron-down" size={12} color={COLORS.text.light} />
        </TouchableOpacity>
      </View>

      {/* Date Range Quick Select */}
      {dateModalVisible && (
        <View style={styles.dateModal}>
          {dateRanges.map((range) => (
            <TouchableOpacity
              key={range.label}
              style={[
                styles.dateOption,
                selectedRange.label === range.label && styles.dateOptionSelected
              ]}
              onPress={() => {
                setSelectedRange(range);
                setDateModalVisible(false);
              }}
            >
              <Text style={[
                styles.dateOptionText,
                selectedRange.label === range.label && styles.dateOptionTextSelected
              ]}>
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Financial Metrics */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading financial data...</Text>
        </View>
      ) : (
        <View style={styles.metricsContainer}>
          <FinancialMetric
            icon="trending-up-outline"
            label="Net Profit"
            value={net}
            isProfit
          />
          
          <View style={styles.sectionDivider} />
          
          <FinancialMetric
            icon="business-outline"
            label="Revenue"
            value={revenue}
          />
          
          <FinancialMetric
            icon="cart-outline"
            label="COGS"
            value={cogs}
          />
          
          <View style={styles.sectionDivider} />
          
          <FinancialMetric
            icon="wallet-outline"
            label="Cash"
            value={cash}
          />
          
          <FinancialMetric
            icon="document-text-outline"
            label="Accounts Receivable"
            value={ar}
          />
          
          <FinancialMetric
            icon="cube-outline"
            label="Inventory"
            value={inventory}
          />
          
          <View style={styles.sectionDivider} />
          
          <FinancialMetric
            icon="layers-outline"
            label="Total Assets"
            value={totalAssets}
            isTotal
          />
        </View>
      )}
    </View>
  );
};

export default FinancialOverviewCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  dateModal: {
    position: 'absolute',
    top: 60,
    right: 0,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 1000,
    minWidth: 120,
  },
  dateOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  dateOptionSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  dateOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  dateOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  metricsContainer: {
    gap: 4,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  totalRow: {
    backgroundColor: COLORS.cardBackground,
    marginTop: 4,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  metricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  totalLabel: {
    color: COLORS.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
});