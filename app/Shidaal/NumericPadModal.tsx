// components/NumericPadModal.tsx
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_BORDER = '#94A3B8';
const COLOR_DIVIDER = '#E5E7EB';
const COLOR_PRIMARY = '#0B2447';

type Props = {
  visible: boolean;
  title?: string;
  value: string;                 // current string value (e.g. "12.34")
  onChange: (next: string) => void;
  onDone: () => void;
  onCancel: () => void;
  maxDecimals?: number;          // optional: e.g., 2 for money
  allowNegative?: boolean;       // default false
};

export default function NumericPadModal({
  visible,
  title = 'Enter value',
  value,
  onChange,
  onDone,
  onCancel,
  maxDecimals = 4,
  allowNegative = false,
}: Props) {

  const hasDot = useMemo(() => value.includes('.'), [value]);
  const decimalsCount = useMemo(() => {
    const i = value.indexOf('.');
    return i === -1 ? 0 : value.slice(i + 1).length;
  }, [value]);

  const append = (char: string) => {
    // only one dot
    if (char === '.' && (hasDot || maxDecimals === 0)) return;
    // decimal places limit
    if (char !== '.' && hasDot && decimalsCount >= maxDecimals) return;
    // prevent leading zeros like "00" unless a dot is next
    if (value === '0' && char !== '.') {
      onChange(char); 
      return;
    }
    onChange(value + char);
  };

  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');

  const toggleSign = () => {
    if (!allowNegative) return;
    if (!value) return;
    if (value.startsWith('-')) onChange(value.slice(1));
    else onChange('-' + value);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>{title}</Text>
          <View style={s.displayBox}>
            <Text style={s.displayText}>{value || ' '}</Text>
          </View>

          <View style={s.grid}>
            {/* Row 1 */}
            <PadButton label="1" onPress={() => append('1')} />
            <PadButton label="2" onPress={() => append('2')} />
            <PadButton label="3" onPress={() => append('3')} />

            {/* Row 2 */}
            <PadButton label="4" onPress={() => append('4')} />
            <PadButton label="5" onPress={() => append('5')} />
            <PadButton label="6" onPress={() => append('6')} />

            {/* Row 3 */}
            <PadButton label="7" onPress={() => append('7')} />
            <PadButton label="8" onPress={() => append('8')} />
            <PadButton label="9" onPress={() => append('9')} />

            {/* Row 4 */}
            <PadButton label={allowNegative ? '+/-' : 'C'} onPress={allowNegative ? toggleSign : clear} />
            <PadButton label="0" onPress={() => append('0')} />
            <PadButton label="." onPress={() => append('.')} disabled={hasDot || maxDecimals === 0} />
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={[s.actionBtn, s.ghost]} onPress={onCancel} activeOpacity={0.9}>
              <Text style={s.ghostTxt}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionBtn} onPress={onDone} activeOpacity={0.9}>
              <Feather name="check-circle" size={16} color="#fff" />
              <Text style={s.actionTxt}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.actionIconBtn]} onPress={backspace} activeOpacity={0.9}>
              <Feather name="delete" size={18} color={COLOR_TEXT} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PadButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.key, disabled && { opacity: 0.4 }]}
      onPress={!disabled ? onPress : undefined}
      activeOpacity={0.9}
    >
      <Text style={s.keyText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: COLOR_BG,
    paddingTop: 12,
    paddingBottom: 10 + (Platform.OS === 'ios' ? 18 : 8),
    paddingHorizontal: 12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  title: { fontSize: 14, fontWeight: '900', color: COLOR_TEXT, textAlign: 'center', marginBottom: 8 },
  displayBox: {
    borderWidth: 1.2, borderColor: COLOR_BORDER, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10,
    backgroundColor: '#F9FAFB',
  },
  displayText: { fontSize: 20, fontWeight: '800', color: COLOR_TEXT, textAlign: 'right' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  key: {
    width: '31%',
    aspectRatio: 1.5,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLOR_DIVIDER,
  },
  keyText: { fontSize: 20, fontWeight: '900', color: COLOR_TEXT },

  actions: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  actionBtn: {
    flex: 1, height: 46, borderRadius: 12,
    backgroundColor: COLOR_PRIMARY,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  actionTxt: { color: '#fff', fontWeight: '900' },
  ghost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#D1D5DB' },
  ghostTxt: { color: COLOR_TEXT, fontWeight: '900' },
  actionIconBtn: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLOR_DIVIDER,
  },
});
