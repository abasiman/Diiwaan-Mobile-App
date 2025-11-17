// app/DiiwaanExpenses/expenseflow.tsx

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import {
  AntDesign,
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CreateExpenseModal from '../expensemodal/createexpensemodal';

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

const ExpenseFlowScreen: React.FC = () => {
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Default: current month
  const [fromDate, setFromDate] = useState<Date | null>(
    dayjs().startOf('month').toDate(),
  );
  const [toDate, setToDate] = useState<Date | null>(new Date());

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [exporting, setExporting] = useState(false);

  // Filter modal
  const [filterVisible, setFilterVisible] = useState(false);

  // Category popup
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // Transaction details popup
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(
    null,
  );
  const [txnModalVisible, setTxnModalVisible] = useState(false);

  // Create expense modal
  const [createVisible, setCreateVisible] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  const fetchReport = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!token) return;

      if (opts?.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setFetchError(null);

      try {
        const params: any = {};
        if (fromDate) params.from_date = fromDate.toISOString();
        if (toDate) params.to_date = toDate.toISOString();

        const res = await api.get<ExpenseReport>('/diiwaan_expenses/report', {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });

        setReport(res.data);
      } catch (err: any) {
        console.error(
          'Failed to load expense report',
          err?.response?.data || err,
        );
        setFetchError(
          err?.response?.data?.detail ||
            'Failed to load expense report. Please try again.',
        );
      } finally {
        if (opts?.refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [token, fromDate, toDate],
  );

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      fetchReport();
    }, [fetchReport]),
  );

  // ✅ Hardware back → always go to /menu
  useEffect(() => {
    const onHardwareBackPress = () => {
      router.replace('/menu');
      return true;
    };

    const sub = BackHandler.addEventListener(
      'hardwareBackPress',
      onHardwareBackPress,
    );

    return () => sub.remove();
  }, [router]);

  const onChangeFromDate = (_: any, date?: Date) => {
    setShowFromPicker(false);
    if (date) {
      setFromDate(date);
    }
  };

  const onChangeToDate = (_: any, date?: Date) => {
    setShowToPicker(false);
    if (date) {
      setToDate(date);
    }
  };

  const handleExport = async () => {
    if (!report) {
      Alert.alert('No data', 'There is no report to export.');
      return;
    }

    try {
      setExporting(true);

      const fromText = fromDate
        ? dayjs(fromDate).format('DD MMM YYYY')
        : '—';
      const toText = toDate ? dayjs(toDate).format('DD MMM YYYY') : '—';

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px; }
              h1 { font-size: 20px; margin-bottom: 4px; }
              h2 { font-size: 16px; margin-top: 18px; margin-bottom: 6px; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; }
              th { background: #0f172a; color: #fff; }
              tr:nth-child(even) { background: #f9fafb; }
              .muted { color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <h1>Expense Report</h1>
            <p class="muted">From: ${fromText} &nbsp;&nbsp; To: ${toText}</p>

            <h2>Totals</h2>
            <table>
              <tr><th>Total amount</th><th>Total paid</th><th>Total due</th></tr>
              <tr>
                <td>${formatMoney(report.total_amount)}</td>
                <td>${formatMoney(report.total_paid)}</td>
                <td>${formatMoney(report.total_due)}</td>
              </tr>
            </table>

            <h2>By category</h2>
            <table>
              <tr>
                <th>Category</th>
                <th>Txns</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
              ${report.by_category
                .map(
                  (c) => `
                  <tr>
                    <td>${c.category || '-'}</td>
                    <td>${c.txn_count}</td>
                    <td>${formatMoney(c.total_amount)}</td>
                    <td>${formatMoney(c.total_paid)}</td>
                    <td>${formatMoney(c.total_due)}</td>
                  </tr>
                `,
                )
                .join('')}
            </table>

            <h2>Transactions</h2>
            <table>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Name</th>
                <th>Payee</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
              ${report.transactions
                .map(
                  (t) => `
                  <tr>
                    <td>${dayjs(t.expense_date).format('DD MMM YYYY')}</td>
                    <td>${t.expense_category || '-'}</td>
                    <td>${t.expense_name}</td>
                    <td>${t.payee || '-'}</td>
                    <td>${formatMoney(t.amount)}</td>
                    <td>${formatMoney(t.paid)}</td>
                    <td>${formatMoney(t.amount_due)}</td>
                  </tr>
                `,
                )
                .join('')}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Expense Report',
        });
      } else {
        Alert.alert('Exported', `Report saved to file:\n${uri}`);
      }
    } catch (err) {
      console.error('Export failed', err);
      Alert.alert('Export failed', 'Unable to export report.');
    } finally {
      setExporting(false);
    }
  };

  const openTxnModal = (row: ExpenseRow) => {
    setSelectedExpense(row);
    setTxnModalVisible(true);
  };

  const renderTransactionRow = ({ item }: { item: ExpenseRow }) => {
    const isDebt = item.deyn && item.amount_due > 0;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.9}
        onPress={() => openTxnModal(item)}
      >
        <View style={styles.rowLeft}>
          <View style={styles.txnIconCircle}>
            <MaterialCommunityIcons
              name="cash-minus"
              size={16}
              color="#15803D"
            />
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.expense_name}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {item.expense_category || '—'} ·{' '}
              {item.payee ? `Payee: ${item.payee}` : 'No payee'}
            </Text>
            <Text
              style={[
                styles.rowDate,
                isDebt && { color: '#DC2626', fontWeight: '600' },
              ]}
            >
              {dayjs(item.expense_date).format('DD MMM YYYY')}
            </Text>
          </View>
        </View>

        <View style={styles.rowRight}>
          <Text style={styles.rowAmount}>{formatMoney(item.amount)}</Text>
          <Text
            style={[
              styles.rowDue,
              isDebt && { color: '#DC2626', fontWeight: '700' },
            ]}
          >
            Due {formatMoney(item.amount_due)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const summaryTotal = report
    ? [
        {
          key: 'total',
          label: 'Total',
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
          label: 'Due',
          value: formatMoney(report.total_due),
          icon: 'alert-circle-outline' as const,
        },
      ]
    : [];

  const applyPreset = (
    preset: 'this_month' | 'last_month' | 'this_year' | 'all',
  ) => {
    const now = dayjs();

    if (preset === 'this_month') {
      setFromDate(now.startOf('month').toDate());
      setToDate(now.endOf('day').toDate());
    } else if (preset === 'last_month') {
      const last = now.subtract(1, 'month');
      setFromDate(last.startOf('month').toDate());
      setToDate(last.endOf('month').toDate());
    } else if (preset === 'this_year') {
      setFromDate(now.startOf('year').toDate());
      setToDate(now.endOf('day').toDate());
    } else if (preset === 'all') {
      setFromDate(null);
      setToDate(null);
    }
  };

  const currentRangeLabel = (() => {
    if (!fromDate && !toDate) return 'All time';
    const from = fromDate ? dayjs(fromDate).format('DD MMM YY') : '…';
    const to = toDate ? dayjs(toDate).format('DD MMM YY') : '…';
    return `${from} → ${to}`;
  })();

  // 🔍 Filtered transactions based on search
  const filteredTransactions = report
    ? report.transactions.filter((t) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;

        const haystack = (
          (t.expense_name || '') +
          ' ' +
          (t.expense_category || '') +
          ' ' +
          (t.payee || '')
        ).toLowerCase();

        return haystack.includes(q);
      })
    : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 0 }]}>
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
            onPress={() => router.replace('/menu')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Expense Dashboard</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {currentRangeLabel}
            </Text>
          </View>

          <View style={styles.headerRightIcons}>
            {/* Add new */}
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={() => setCreateVisible(true)}
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Export PDF */}
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialCommunityIcons
                  name="file-pdf-box"
                  size={20}
                  color="#FFFFFF"
                />
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Summary cards */}
      {report && (
        <View style={styles.summaryRow}>
          {summaryTotal.map((item) => (
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
      )}

      {/* Filter by date + Expense categories + Filter button */}
      {report && (
        <View style={styles.categoryButtonRow}>
          <Text style={styles.filterByDateLabel}>Filter by date</Text>
          <View style={styles.categoryFilterRow}>
            {report.by_category.length > 0 && (
              <TouchableOpacity
                style={styles.categoryButton}
                activeOpacity={0.9}
                onPress={() => setCategoryModalVisible(true)}
              >
                <MaterialCommunityIcons
                  name="view-list-outline"
                  size={16}
                  color={BRAND_BLUE}
                />
                <Text style={styles.categoryButtonText}>
                  Expense categories
                </Text>
                <Feather name="chevron-down" size={16} color={BRAND_BLUE} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.filterChip}
              activeOpacity={0.9}
              onPress={() => setFilterVisible(true)}
            >
              <Feather name="filter" size={16} color={BRAND_BLUE} />
              <Text style={styles.filterChipText}>Open filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search field */}
      {report && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, category or payee"
            placeholderTextColor={TEXT_MUTED}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {/* Error state */}
      {fetchError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      )}

      {/* Transactions header */}
      <View style={styles.tableHeader}>
        <Text style={styles.sectionTitle}>Transactions</Text>
        {report && (
          <Text style={styles.tableSub}>
            {filteredTransactions.length} rows
          </Text>
        )}
      </View>

      {loading && !report ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTransactionRow}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? 'No expenses match your search.'
                    : 'No expenses found for this period.'}
                </Text>
              </View>
            ) : null
          }
          refreshing={refreshing}
          onRefresh={() => fetchReport({ refresh: true })}
        />
      )}

      {/* Floating Add FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 90 }]}
        activeOpacity={0.9}
        onPress={() => setCreateVisible(true)}
      >
        <Feather name="plus" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Filter modal */}
      <Modal
        visible={filterVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFilterVisible(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.centerWrap}>
          <View style={styles.filterCard}>
            <Text style={styles.filterTitle}>Filter expenses</Text>
            <Text style={styles.filterSub}>
              Choose a quick preset or custom date range.
            </Text>

            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('this_month')}
              >
                <Text style={styles.presetText}>This month</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('last_month')}
              >
                <Text style={styles.presetText}>Last month</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('this_year')}
              >
                <Text style={styles.presetText}>This year</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('all')}
              >
                <Text style={styles.presetText}>All time</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.customRangeSection}>
              <Text style={styles.customRangeLabel}>Custom range</Text>
              <View style={styles.customRow}>
                <TouchableOpacity
                  style={styles.dateChip}
                  onPress={() => setShowFromPicker(true)}
                >
                  <AntDesign name="calendar" size={14} color={TEXT_MUTED} />
                  <Text style={styles.dateChipText}>
                    {fromDate
                      ? dayjs(fromDate).format('DD MMM YYYY')
                      : 'From'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dateChip}
                  onPress={() => setShowToPicker(true)}
                >
                  <AntDesign name="calendar" size={14} color={TEXT_MUTED} />
                  <Text style={styles.dateChipText}>
                    {toDate ? dayjs(toDate).format('DD MMM YYYY') : 'To'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.filterGhostBtn}
                onPress={() => {
                  setFilterVisible(false);
                }}
              >
                <Text style={styles.filterGhostText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => {
                  setFilterVisible(false);
                  fetchReport();
                }}
              >
                <Text style={styles.filterApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {showFromPicker && (
          <DateTimePicker
            value={fromDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeFromDate}
          />
        )}

        {showToPicker && (
          <DateTimePicker
            value={toDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeToDate}
          />
        )}
      </Modal>

      {/* Category modal */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setCategoryModalVisible(false)}
        >
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.centerWrap}>
          <View style={styles.categoryCard}>
            <Text style={styles.categoryTitle}>Expense categories</Text>
            <Text style={styles.categorySub}>
              Category breakdown for the selected period.
            </Text>

            <ScrollView
              style={{ maxHeight: 360, marginTop: 8 }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {report?.by_category.map((cat) => (
                <View
                  key={cat.category || 'uncategorized'}
                  style={styles.byCatRowModal}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.byCatName}>
                      {cat.category || 'Uncategorized'}
                    </Text>
                    <Text style={styles.byCatSub}>
                      {cat.txn_count} txns · Due{' '}
                      {formatMoney(cat.total_due)}
                    </Text>
                  </View>
                  <Text style={styles.byCatAmount}>
                    {formatMoney(cat.total_amount)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.categoryCloseBtn}
              onPress={() => setCategoryModalVisible(false)}
            >
              <Text style={styles.categoryCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Transaction details modal */}
      <Modal
        visible={txnModalVisible && !!selectedExpense}
        transparent
        animationType="fade"
        onRequestClose={() => setTxnModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setTxnModalVisible(false)}
        >
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.centerWrap}>
          {selectedExpense && (
            <View style={styles.txnCard}>
              <Text style={styles.txnTitle}>
                {selectedExpense.expense_name}
              </Text>
              <Text style={styles.txnSub}>
                {selectedExpense.expense_category || 'Uncategorized'}
                {selectedExpense.payee
                  ? ` · Payee: ${selectedExpense.payee}`
                  : ''}
              </Text>

              <View style={styles.txnSection}>
                <Text style={styles.txnSectionLabel}>
                  {dayjs(selectedExpense.expense_date).format(
                    'DD MMM YYYY',
                  )}
                </Text>
              </View>

              <View style={styles.txnAmountsRow}>
                <View style={styles.txnAmountBlock}>
                  <Text style={styles.txnAmountLabel}>Amount</Text>
                  <Text style={styles.txnAmountValue}>
                    {formatMoney(selectedExpense.amount)}
                  </Text>
                </View>
                <View style={styles.txnAmountBlock}>
                  <Text style={styles.txnAmountLabel}>Paid</Text>
                  <Text style={[styles.txnAmountValue, { color: '#16A34A' }]}>
                    {formatMoney(selectedExpense.paid)}
                  </Text>
                </View>
                <View style={styles.txnAmountBlock}>
                  <Text style={styles.txnAmountLabel}>Due</Text>
                  <Text
                    style={[
                      styles.txnAmountValue,
                      selectedExpense.deyn && {
                        color: '#DC2626',
                      },
                    ]}
                  >
                    {formatMoney(selectedExpense.amount_due)}
                  </Text>
                </View>
              </View>

              <View style={styles.txnFooterRow}>
                <Text style={styles.txnFooterText}>
                  Created{' '}
                  {dayjs(selectedExpense.created_at).format(
                    'DD MMM YYYY HH:mm',
                  )}
                </Text>
                <Text style={styles.txnFooterText}>
                  Updated{' '}
                  {dayjs(selectedExpense.updated_at).format(
                    'DD MMM YYYY HH:mm',
                  )}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.txnCloseBtn}
                onPress={() => setTxnModalVisible(false)}
              >
                <Text style={styles.txnCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Create expense modal */}
      <CreateExpenseModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={() => {
          setCreateVisible(false);
          fetchReport();
        }}
      />
    </View>
  );
};

export default ExpenseFlowScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    // make sure the gradient respects the radius
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
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
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

  // Category + Filter row
  categoryButtonRow: {
    marginTop: 10,
    paddingHorizontal: 16,
  },
  filterByDateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 6,
  },
  categoryFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5F5',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    flexShrink: 1,
  },
  categoryButtonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: BRAND_BLUE,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND_BLUE,
  },

  // Error
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
  },

  // Search
  searchRow: {
    marginTop: 10,
    paddingHorizontal: 16,
  },
  searchInput: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    fontSize: 12,
    color: TEXT_DARK,
  },

  // Transactions
  tableHeader: {
    marginTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  tableSub: {
    fontSize: 11,
    color: TEXT_MUTED,
  },
  loaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rowLeft: {
    flex: 1.2,
    flexDirection: 'row',
    gap: 8,
  },
  txnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_DARK,
  },
  rowSub: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  rowDate: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  rowRight: {
    flex: 0.9,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rowAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE,
  },
  rowDue: {
    marginTop: 2,
    fontSize: 11,
    color: '#6B7280',
  },

  emptyBox: {
    marginTop: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  // Overlay base
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

  // Filter modal
  filterCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  filterSub: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 3,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 12,
    color: BRAND_BLUE,
    fontWeight: '600',
  },

  headerWrap: {
    marginTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 4, // little spacing before the cards
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  customRangeSection: {
    marginTop: 12,
  },
  customRangeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 6,
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    gap: 6,
    flex: 1,
  },
  dateChipText: {
    fontSize: 12,
    color: TEXT_DARK,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  filterGhostBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  filterGhostText: {
    fontSize: 12,
    color: TEXT_DARK,
    fontWeight: '600',
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
  },
  filterApplyText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Category modal
  categoryCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  categorySub: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 3,
  },
  byCatRowModal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  byCatName: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_DARK,
  },
  byCatSub: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  byCatAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND_BLUE,
    marginLeft: 8,
  },
  categoryCloseBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#0F172A',
  },
  categoryCloseText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Transaction modal
  txnCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  txnTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  txnSub: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 3,
  },
  txnSection: {
    marginTop: 10,
  },
  txnSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_DARK,
  },
  txnAmountsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  txnAmountBlock: {
    flex: 1,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
  },
  txnAmountLabel: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginBottom: 2,
  },
  txnAmountValue: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_DARK,
  },
  txnFooterRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  txnFooterText: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  txnCloseBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
  },
  txnCloseText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
