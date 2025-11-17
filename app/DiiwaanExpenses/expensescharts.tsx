// app/DiiwaanExpenses/expensescharts.tsx

import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

import { LineChart, PieChart } from 'react-native-gifted-charts';

const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#19376D';
const TEXT_MUTED = '#6B7280';
const TEXT_DARK = '#0F172A';
const CARD_BG = '#0F172A';
const BORDER = '#E5E7EB';

type ExpenseCategoryBreakdown = {
  category: string | null;
  txn_count: number;
  total_amount: number;
  total_paid: number;
  total_due: number;
};

type ExpenseNameBreakdown = {
  expense_name: string;
  txn_count: number;
  total_amount: number;
  total_paid: number;
  total_due: number;
};

type ExpenseRow = {
  id: number;
  owner_id: number;
  expense_category: string | null;
  expense_name: string;
  payee: string | null;
  expense_date: string;
  amount: number;
  paid: number;
  amount_due: number;
  deyn: boolean;
  created_at: string;
  updated_at: string;
};

type ExpenseReport = {
  from_date: string | null;
  to_date: string | null;
  total_amount: number;
  total_paid: number;
  total_due: number;
  by_category: ExpenseCategoryBreakdown[];
  by_name: ExpenseNameBreakdown[];
  transactions: ExpenseRow[];
};

type FilterMode = 'category' | 'name';

const formatMoney = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n || 0);

const ExpensesChartsScreen: React.FC = () => {
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>('category');
  const [selectedFilterValue, setSelectedFilterValue] =
    useState<string>('ALL'); // "ALL" means no filter
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get<ExpenseReport>('/diiwaan_expenses/report', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReport(res.data);
    } catch (err: any) {
      console.error(
        'Failed to load expense report (charts)',
        err?.response?.data || err,
      );
      setFetchError(
        err?.response?.data?.detail ||
          'Failed to load analytics. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // === Derived data ===

  const summaryCards = useMemo(
    () =>
      report
        ? [
            {
              key: 'total',
              label: 'Total spent',
              value: formatMoney(report.total_amount),
              icon: 'wallet-outline' as const,
            },
            {
              key: 'paid',
              label: 'Paid',
              value: formatMoney(report.total_paid),
              icon: 'checkmark-done-outline' as const,
            },
            {
              key: 'due',
              label: 'Unpaid',
              value: formatMoney(report.total_due),
              icon: 'alert-circle-outline' as const,
            },
          ]
        : [],
    [report],
  );

  const categoryOptions = useMemo(() => {
    if (!report) return ['ALL'];
    const unique = Array.from(
      new Set(report.by_category.map((c) => c.category || 'Uncategorized')),
    );
    return ['ALL', ...unique];
  }, [report]);

  const nameOptions = useMemo(() => {
    if (!report) return ['ALL'];
    const unique = Array.from(
      new Set(report.by_name.map((n) => n.expense_name)),
    );
    return ['ALL', ...unique];
  }, [report]);

  const currentOptions =
    filterMode === 'category' ? categoryOptions : nameOptions;

  const selectedLabel = (() => {
    if (selectedFilterValue === 'ALL') {
      return filterMode === 'category' ? 'All categories' : 'All expenses';
    }
    return selectedFilterValue;
  })();

  // Top 5 categories pie data (smaller chart + percentage text)
  const topCategoryPieData = useMemo(() => {
    if (!report || report.by_category.length === 0) return [];

    const sorted = [...report.by_category].sort(
      (a, b) => b.total_amount - a.total_amount,
    );

    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5);

    const colors = ['#4F46E5', '#0EA5E9', '#F97316', '#22C55E', '#EC4899'];

    const othersTotal = others.reduce(
      (sum, c) => sum + (c.total_amount || 0),
      0,
    );
    const totalAll =
      top5.reduce((sum, c) => sum + (c.total_amount || 0), 0) + othersTotal;

    const pieData: {
      value: number;
      text: string;
      label: string;
      color: string;
      amount: number;
      percentage: number;
    }[] = top5.map((cat, idx) => {
      const value = cat.total_amount || 0;
      const pct = totalAll > 0 ? (value / totalAll) * 100 : 0;
      return {
        value,
        text: `${Math.round(pct)}%`,
        label: cat.category || 'Uncategorized',
        color: colors[idx % colors.length],
        amount: value,
        percentage: pct,
      };
    });

    if (othersTotal > 0) {
      const pct = totalAll > 0 ? (othersTotal / totalAll) * 100 : 0;
      pieData.push({
        value: othersTotal,
        text: `${Math.round(pct)}%`,
        label: 'Others',
        color: '#9CA3AF',
        amount: othersTotal,
        percentage: pct,
      });
    }

    return pieData;
  }, [report]);

  // Paid vs unpaid pie (smaller + percentage text)
  const paidVsUnpaidPieData = useMemo(() => {
    if (!report) return [];

    const total =
      (report.total_paid || 0) + (report.total_due || 0) || 0;

    const base = [
      {
        rawValue: report.total_paid,
        label: 'Paid',
        color: '#22C55E',
      },
      {
        rawValue: report.total_due,
        label: 'Unpaid',
        color: '#EF4444',
      },
    ].filter((d) => d.rawValue > 0);

    return base.map((d) => {
      const pct = total > 0 ? (d.rawValue / total) * 100 : 0;
      return {
        value: d.rawValue,
        text: `${Math.round(pct)}%`,
        label: d.label,
        color: d.color,
        amount: d.rawValue,
        percentage: pct,
      };
    });
  }, [report]);

  // Line chart data: spending over time
  const lineData = useMemo(() => {
    if (!report || report.transactions.length === 0) return [];

    const filteredTx = report.transactions.filter((t) => {
      if (selectedFilterValue === 'ALL') return true;

      if (filterMode === 'category') {
        const label = t.expense_category || 'Uncategorized';
        return label === selectedFilterValue;
      } else {
        return t.expense_name === selectedFilterValue;
      }
    });

    if (filteredTx.length === 0) return [];

    const map = new Map<string, number>();

    filteredTx.forEach((t) => {
      const key = dayjs(t.expense_date).format('YYYY-MM-DD');
      const prev = map.get(key) || 0;
      map.set(key, prev + (t.amount || 0));
    });

    const entries = Array.from(map.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    );

    const data = entries.map(([dateKey, total]) => ({
      value: total,
      label: dayjs(dateKey).format('DD MMM'),
    }));

    return data;
  }, [report, filterMode, selectedFilterValue]);

  const hasAnyData =
    report &&
    (report.by_category.length > 0 ||
      report.transactions.length > 0 ||
      report.total_amount > 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={[BRAND_BLUE, BRAND_BLUE_2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Expense Analytics</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              Visual breakdown of your spending
            </Text>
          </View>

          <TouchableOpacity style={styles.iconCircle} onPress={fetchReport}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="refresh-cw" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Content */}
      {loading && !report ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      ) : !hasAnyData ? (
        <View style={styles.loaderCenter}>
          {fetchError ? (
            <Text style={styles.errorText}>{fetchError}</Text>
          ) : (
            <Text style={styles.emptyText}>
              No expense data to visualize yet.
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Error banner */}
          {fetchError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{fetchError}</Text>
            </View>
          )}

          {/* Summary cards */}
          <View style={styles.summaryRow}>
            {summaryCards.map((item) => (
              <View key={item.key} style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={styles.summaryIconCircle}>
                    <Ionicons name={item.icon} size={14} color="#E5E7EB" />
                  </View>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </View>
                <Text style={styles.summaryValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          {/* Combined pie charts: Expense breakdown */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Expense breakdown</Text>
                <Text style={styles.cardSub}>
                  Top categories and paid vs unpaid
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chart-pie"
                size={20}
                color={BRAND_BLUE}
              />
            </View>

            {topCategoryPieData.length === 0 &&
            paidVsUnpaidPieData.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 8 }]}>
                No breakdown data available.
              </Text>
            ) : (
              <>
                <View style={styles.dualPieRow}>
                  <View style={styles.pieSection}>
                    <Text style={styles.pieSectionTitle}>By category</Text>
                    {topCategoryPieData.length === 0 ? (
                      <Text style={styles.emptyText}>
                        No category breakdown.
                      </Text>
                    ) : (
                      <View style={styles.miniPieWrapper}>
                        <PieChart
                          data={topCategoryPieData}
                          radius={55}
                          innerRadius={32}
                          donut
                          showText
                          textColor="#FFFFFF"
                          textSize={8}
                          centerLabelComponent={() => (
                            <View style={{ alignItems: 'center' }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: TEXT_MUTED,
                                }}
                              >
                                Total
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: TEXT_DARK,
                                }}
                              >
                                {formatMoney(report!.total_amount)}
                              </Text>
                            </View>
                          )}
                        />
                      </View>
                    )}
                  </View>

                  <View style={styles.pieSection}>
                    <Text style={styles.pieSectionTitle}>Paid vs unpaid</Text>
                    {paidVsUnpaidPieData.length === 0 ? (
                      <Text style={styles.emptyText}>
                        No paid vs unpaid data.
                      </Text>
                    ) : (
                      <View style={styles.miniPieWrapper}>
                        <PieChart
                          data={paidVsUnpaidPieData}
                          radius={50}
                          innerRadius={30}
                          donut
                          showText
                          textColor="#FFFFFF"
                          textSize={8}
                          centerLabelComponent={() => (
                            <View style={{ alignItems: 'center' }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: TEXT_MUTED,
                                }}
                              >
                                Unpaid
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: '#EF4444',
                                }}
                              >
                                {formatMoney(report!.total_due)}
                              </Text>
                            </View>
                          )}
                        />
                      </View>
                    )}
                  </View>
                </View>

                {topCategoryPieData.length > 0 && (
                  <View style={styles.legendBlock}>
                    <Text style={styles.legendSectionTitle}>Categories</Text>
                    <View style={styles.legendWrap}>
                      {topCategoryPieData.map((d) => (
                        <View key={d.label} style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: d.color },
                            ]}
                          />
                          <Text
                            style={styles.legendLabel}
                            numberOfLines={1}
                          >
                            {d.label} · {formatMoney(d.amount)} (
                            {Math.round(d.percentage)}%)
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {paidVsUnpaidPieData.length > 0 && (
                  <View style={styles.legendBlock}>
                    <Text style={styles.legendSectionTitle}>Payment status</Text>
                    <View style={styles.legendWrap}>
                      {paidVsUnpaidPieData.map((d) => (
                        <View key={d.label} style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: d.color },
                            ]}
                          />
                          <Text style={styles.legendLabel}>
                            {d.label} · {formatMoney(d.amount)} (
                            {Math.round(d.percentage)}%)
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Line chart: spending over time */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Spending over time</Text>
                <Text style={styles.cardSub}>
                  View trends by category or expense name
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chart-line"
                size={20}
                color={BRAND_BLUE}
              />
            </View>

            {/* Filter mode toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleChip,
                  filterMode === 'category' && styles.toggleChipActive,
                ]}
                onPress={() => {
                  setFilterMode('category');
                  setSelectedFilterValue('ALL');
                }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    filterMode === 'category' && styles.toggleTextActive,
                  ]}
                >
                  By category
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.toggleChip,
                  filterMode === 'name' && styles.toggleChipActive,
                ]}
                onPress={() => {
                  setFilterMode('name');
                  setSelectedFilterValue('ALL');
                }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    filterMode === 'name' && styles.toggleTextActive,
                  ]}
                >
                  By expense name
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dropdown for category/name selection */}
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setDropdownVisible(true)}
              activeOpacity={0.9}
            >
              <Feather name="layers" size={14} color={TEXT_MUTED} />
              <Text style={styles.dropdownText} numberOfLines={1}>
                {selectedLabel}
              </Text>
              <Feather name="chevron-down" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>

            {/* Line chart */}
            {lineData.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 12 }]}>
                No spending data for this selection.
              </Text>
            ) : (
              <View style={{ marginTop: 12 }}>
                <LineChart
                  data={lineData}
                  thickness={3}
                  hideDataPoints={false}
                  dataPointsRadius={3}
                  initialSpacing={12}
                  spacing={24}
                  yAxisLabel="$"
                  yAxisTextStyle={{ color: TEXT_MUTED, fontSize: 10 }}
                  xAxisLabelTextStyle={{
                    color: TEXT_MUTED,
                    fontSize: 9,
                  }}
                  color={BRAND_BLUE}
                  hideRules
                  hideAxesAndRules={false}
                  xAxisColor="#E5E7EB"
                  yAxisColor="#E5E7EB"
                  areaChart
                  startFillColor="#4F46E5"
                  endFillColor="#4F46E5"
                  startOpacity={0.16}
                  endOpacity={0}
                  noOfSections={4}
                  animateOnDataChange
                  animationDuration={800}
                />
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Dropdown modal */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setDropdownVisible(false)}
        >
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.centerWrap}>
          <View style={styles.dropdownCard}>
            <Text style={styles.dropdownTitle}>
              {filterMode === 'category'
                ? 'Select category'
                : 'Select expense name'}
            </Text>
            <ScrollView
              style={{ maxHeight: 360, marginTop: 8 }}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              {currentOptions.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.dropdownItem,
                    selectedFilterValue === opt &&
                      styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setSelectedFilterValue(opt);
                    setDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selectedFilterValue === opt &&
                        styles.dropdownItemTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {opt === 'ALL'
                      ? filterMode === 'category'
                        ? 'All categories'
                        : 'All expenses'
                      : opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.dropdownCloseBtn}
              onPress={() => setDropdownVisible(false)}
            >
              <Text style={styles.dropdownCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ExpensesChartsScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  headerWrap: {
    paddingHorizontal: 0,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(226,232,240,0.9)',
    marginTop: 2,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: 'rgba(226,232,240,0.9)',
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Card
  card: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  cardSub: {
    marginTop: 2,
    fontSize: 11,
    color: TEXT_MUTED,
  },

  // Dual pie layout
  dualPieRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  pieSection: {
    flex: 1,
    alignItems: 'center',
  },
  pieSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  miniPieWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  legendBlock: {
    marginTop: 10,
  },
  legendSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendLabel: {
    fontSize: 11,
    color: TEXT_DARK,
    maxWidth: 150,
  },

  errorBox: {
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: 'center',
  },

  // Filter toggle
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  toggleChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  toggleChipActive: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  toggleText: {
    fontSize: 12,
    color: TEXT_DARK,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#F9FAFB',
    gap: 6,
  },
  dropdownText: {
    flex: 1,
    fontSize: 12,
    color: TEXT_DARK,
  },

  // Modal base
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  dropdownCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  dropdownItem: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  dropdownItemActive: {
    backgroundColor: '#EEF2FF',
  },
  dropdownItemText: {
    fontSize: 12,
    color: TEXT_DARK,
  },
  dropdownItemTextActive: {
    color: BRAND_BLUE,
    fontWeight: '700',
  },
  dropdownCloseBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#0F172A',
  },
  dropdownCloseText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
