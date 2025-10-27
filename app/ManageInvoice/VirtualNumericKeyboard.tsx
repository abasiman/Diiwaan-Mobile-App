// components/VirtualNumericKeyboard.tsx
import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (next: string) => void;
  // Optional: block multiple decimals or commas
  allowDot?: boolean;
  allowComma?: boolean;
};

const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['.','0',',']];

export default function VirtualNumericKeyboard({
  visible,
  onClose,
  value,
  onChange,
  allowDot = true,
  allowComma = true,
}: Props) {
  const deletingRef = useRef<NodeJS.Timeout | null>(null);
  const [height] = useState(320); // make it tall so it won't clash with your bottom tab

  useEffect(() => () => {
    if (deletingRef.current) clearInterval(deletingRef.current);
  }, []);

  if (!visible) return null;

  const push = (k: string) => {
    if (k === '.' && !allowDot) return;
    if (k === ',' && !allowComma) return;
    if (k === '.' && value.includes('.')) return;
    if (k === ',' && value.includes(',')) return;
    // prevent leading zero spam like 000... unless after dot/comma
    if ((k === '0') && (value === '0')) return;
    const next = (value === '0' && /\d/.test(k)) ? k : (value + k);
    onChange(next);
  };

  const backspaceOnce = () => {
    if (!value) return;
    onChange(value.slice(0, -1));
  };

  const startRepeatDelete = () => {
    backspaceOnce();
    deletingRef.current = setInterval(backspaceOnce, 70);
  };
  const stopRepeatDelete = () => {
    if (deletingRef.current) {
      clearInterval(deletingRef.current);
      deletingRef.current = null;
    }
  };

  const clearAll = () => onChange('');

  return (
    <View style={[styles.wrap, { height }]}>
      {/* Top actions */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={clearAll}>
          <Feather name="x-circle" size={18} color="#111827" />
          <Text style={styles.actionTxt}>Clear</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[styles.actionBtn, { paddingRight: 0 }]}
          onPress={onClose}
        >
          <Feather name="chevrons-down" size={20} color="#111827" />
          <Text style={styles.actionTxt}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {KEYS.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((k) => (
              <TouchableOpacity
                key={k}
                style={styles.key}
                activeOpacity={0.8}
                onPress={() => push(k)}
              >
                <Text style={styles.keyTxt}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Backspace full-width */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.key, styles.backspaceKey]}
            activeOpacity={0.8}
            onPress={backspaceOnce}
            onLongPress={startRepeatDelete}
            onPressOut={stopRepeatDelete}
            delayLongPress={200}
          >
            <Feather name="delete" size={18} color="#111827" />
            <Text style={[styles.keyTxt, { marginLeft: 6 }]}>Backspace</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 8,
    paddingHorizontal: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionTxt: { fontSize: 12, color: '#111827', fontWeight: '700' },

  grid: { flex: 1, justifyContent: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: {
    flex: 1,
    height: 56,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyTxt: { fontSize: 20, fontWeight: '900', color: '#111827' },
  backspaceKey: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
