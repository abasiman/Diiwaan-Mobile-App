// app/Shidaal/ReverseOilSaleModal.tsx
import api from "@/services/api";
import { Feather } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";


import { queueOilSaleReverseForSync } from "../dbsalereverse/oilSaleReverseOfflineRepo";


type Sale = {
  id: number;
  oil_type: string;
  unit_type: "liters" | "fuusto" | "caag" | "lot";
  liters_sold: number;
  total_native?: number | null;
  currency?: string | null;
};

export default function ReverseOilSaleModal({
  visible,
  onClose,
  token,
  ownerId,
  sale,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  token?: string | null;
  ownerId?: number;          // 🔹 add this
  sale: Sale | null;
  onSuccess?: (updated?: any) => void;
}) {
  const [liters, setLiters] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);

  // watch connectivity
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const parsedLiters = Number(liters);
  const litersValid =
    liters.trim().length > 0 && !Number.isNaN(parsedLiters) && parsedLiters > 0;

  const reset = () => {
    setLiters("");
    setNote("");
  };

  const submit = async () => {
    if (!sale?.id) return;
    if (!litersValid) {
      Alert.alert("Invalid liters", "Please enter a valid number of liters.");
      return;
    }

    setLoading(true);
    try {
      // 🔹 OFFLINE (or no token) → queue locally
      if (!token || !online) {
        if (!ownerId) {
          throw new Error("Missing owner id for offline reverse.");
        }

        await queueOilSaleReverseForSync(
          ownerId,
          sale.id,
          parsedLiters,
          note?.trim() || undefined
        );

        setLoading(false);
        reset();
        onClose();
        onSuccess?.(); // let parent refetch local data if it wants

        Alert.alert(
          "Saved offline",
          "Reverse will sync automatically when you're back online."
        );
        return;
      }

      // 🔹 ONLINE → normal API call
      await api.post(
        `/oilsale/${sale.id}/reverse`,
        { liters: parsedLiters, note },
        { headers: authHeader }
      );

      setLoading(false);
      reset();
      onClose();
      onSuccess?.();
    } catch (e: any) {
      setLoading(false);
      Alert.alert(
        "Reverse failed",
        e?.response?.data?.detail || e?.message || "Could not reverse."
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title} allowFontScaling={false}>
                Reverse Sale
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sub} allowFontScaling={false}>
              {sale
                ? `${sale.oil_type || "Oil"} • Sold: ${sale.liters_sold} L`
                : "—"}
            </Text>

            <View style={styles.inputWrap}>
              <Text style={styles.label} allowFontScaling={false}>
                Liters to reverse
              </Text>
              <TextInput
                value={liters}
                onChangeText={setLiters}
                keyboardType="decimal-pad"
                placeholder="e.g. 50"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                returnKeyType="done"
              />
            </View>

            <View style={[styles.inputWrap, { marginTop: 10 }]}>
              <Text style={styles.label} allowFontScaling={false}>
                Note (optional)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note…"
                placeholderTextColor="#94A3B8"
                style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                multiline
              />
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={onClose}>
                <Text style={styles.cancelTxt} allowFontScaling={false}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primary,
                  (!litersValid || loading) && { opacity: 0.6 },
                ]}
                onPress={submit}
                disabled={!litersValid || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="rotate-ccw" size={16} color="#fff" />
                    <Text
                      style={styles.primaryTxt}
                      allowFontScaling={false}
                    >
                      Process Reverse
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "94%",
    maxWidth: 460,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 10 },
    }),
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  sub: { marginTop: 6, color: "#64748B", fontSize: 11 },
  inputWrap: { marginTop: 12 },
  label: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
    color: "#6B7280",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  cancel: {
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelTxt: { color: "#0F172A", fontWeight: "800" },
  primary: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#0B2447",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },
});
