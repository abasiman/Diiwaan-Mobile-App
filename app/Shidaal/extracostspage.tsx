// app/(tabs)/TrackVendorBills/Shidaal/extracosts.tsx
import { AntDesign, Feather } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ExtraCostItem = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
  oil_id?: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  extraCosts: ExtraCostItem[];
  onPayExtra: (ex: ExtraCostItem) => void;
  onAddExtra: () => void;
  formatCurrency: (n: number | undefined | null, currency?: string) => string;
};

const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_CARD_BORDER = '#E7ECF3';

const ExtraCostsSheet: React.FC<Props> = ({
  visible,
  onClose,
  extraCosts,
  onPayExtra,
  onAddExtra,
  formatCurrency,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.sheetBody,
                {
                  height: '94%',
                  paddingBottom: bottomPad, // let the content footer handle spacing
                },
              ]}
            >
              {/* drag handle + header */}
              <View style={styles.sheetHandle} />
              <View style={[styles.headerRow, { marginBottom: 8 }]}>
                <Text style={styles.title}>Extra Costs</Text>
                <TouchableOpacity onPress={onClose}>
                  <AntDesign name="close" size={16} color="#1F2937" />
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={{ paddingBottom: bottomPad }} // minimal extra space
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {extraCosts.length > 0 ? (
                  extraCosts.map((ex) => (
                    <View key={`ex_${ex.id}`} style={styles.cardRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {ex.category || 'Extra'}
                        </Text>
                        {!!ex.description && (
                          <Text style={styles.cardDesc} numberOfLines={2}>
                            {ex.description}
                          </Text>
                        )}

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
                          {ex.due <= 0 ? (
                            <View style={styles.paidPill}>
                              <Feather name="check-circle" size={12} />
                              <Text style={styles.paidPillText}>Fully Paid</Text>
                            </View>
                          ) : (
                            <TouchableOpacity style={styles.payBtn} onPress={() => onPayExtra(ex)}>
                              <Feather name="dollar-sign" size={12} color="#fff" />
                              <Text style={styles.payBtnTxt}>Pay</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.amountLine}>Amount: {formatCurrency(ex.amount)}</Text>
                        <Text style={[styles.amountLine, { color: '#059669', fontWeight: '800' }]}>
                          Paid: {formatCurrency(ex.total_paid)}
                        </Text>
                        <Text style={[styles.amountLine, { color: '#DC2626', fontWeight: '900' }]}>
                          Due: {formatCurrency(ex.due)}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.noExtras}>
                    <Feather name="file" size={12} color={COLOR_MUTED} />
                    <Text style={styles.noExtrasText}>No extra costs.</Text>
                  </View>
                )}

                {/* Put the Add Extra button right after the list */}
                <View style={styles.inlineFooter}>
                  <TouchableOpacity style={styles.addBtn} onPress={onAddExtra}>
                    <Feather name="plus" size={12} color="#0B2447" />
                    <Text style={styles.addBtnTxt}>Add Extra</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default ExtraCostsSheet;

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'flex-end',
  },
  sheetBody: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9EEF6',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 8,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '900', color: COLOR_TEXT },

  cardRow: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLOR_CARD_BORDER,
    borderRadius: 10,
    padding: 9,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FAFCFF',
  },
  cardTitle: { fontSize: 12, fontWeight: '800', color: COLOR_TEXT },
  cardDesc: { fontSize: 11, color: COLOR_MUTED, marginTop: 2 },

  // “Fully Paid” pill
  paidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#C7F4DE',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  paidPillText: { color: '#065F46', fontWeight: '900', fontSize: 11 },

  // pay button
  payBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  payBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 11 },

  amountLine: { fontSize: 11, color: COLOR_TEXT, marginTop: 2 },

  noExtras: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noExtrasText: { color: COLOR_MUTED, fontSize: 11 },

  // New: footer inside the scroll so it's closer to items
  inlineFooter: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  addBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  addBtnTxt: { color: '#0B2447', fontWeight: '900', fontSize: 11 },
});
