// app/(tabs)/menu.tsx
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const H_PADDING = 14;
const GAP = 10;
const COL = (width - H_PADDING * 2 - GAP) / 2;

const COLORS = {
  text: "#0F172A",
  subtext: "#475569",
  placeholder: "#94A3B8",
  bg: "#F3F4F6",
  card: "#FFFFFF",
  border: "#E5E7EB",
  blue: "#3B82F6",
  amber: "#F59E0B",
  teal: "#10B981",
  indigo: "#0EA5E9",
};

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function Menu() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [timeStr, setTimeStr] = useState(formatTime());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const id = setInterval(() => setTimeStr(formatTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  const navigate = (path: string) => {
    setLoading(true);
    router.replace(path);
  };

  // Main tiles (simple names + subtitles)
  const menuItems = [
    {
      key: "oil-purchases",
      title: "Oil Purchases",
      icon: <MaterialIcons name="shopping-cart" size={20} color={COLORS.amber} />,
      tint: COLORS.amber,
      path: "/TrackVendorBills/vendorbills",
      priority: 1,
    },
    {
      key: "oil-sales",
      title: "Oil Sales",
      icon: <MaterialCommunityIcons name="gas-station" size={20} color={COLORS.blue} />,
      tint: COLORS.blue,
      path: "/oilsalesdashboard",
      priority: 1,
    },
    {
      key: "supplier-payments",
      title: "Wakaalad Dashboard",
      icon: <MaterialIcons name="account-balance-wallet" size={20} color={COLORS.teal} />,
      tint: COLORS.teal,
      path: "/Wakaalad/wakaalad_dashboard",
      priority: 2,
    },
    {
      key: "financial-reports",
      title: "Financial Reports",
      icon: <MaterialCommunityIcons name="file-chart-outline" size={20} color={COLORS.indigo} />,
      tint: COLORS.indigo,
      path: "/tenant-accounts",
      priority: 3,
    },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.subtitle || "").toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#0B2447", "#0B2447"]}
        style={[styles.hero, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerSide} />
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Menu</Text>
          </View>
          <View style={[styles.headerSide, styles.clockWrap]}>
            <MaterialCommunityIcons name="clock-outline" size={18} color="#E0E7FF" />
            <Text style={styles.headerTime}>{timeStr}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Search (optional, simple wording) */}
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search menu…"
          placeholderTextColor={COLORS.placeholder}
          selectionColor={COLORS.text}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="cancel" size={18} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Two big primary tiles first, then the rest */}
      <ScrollView contentContainerStyle={styles.content}>
        {filtered
          .sort((a, b) => a.priority - b.priority)
          .map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.tile, { borderColor: item.tint }]}
              activeOpacity={0.85}
              onPress={() => navigate(item.path)}
            >
              <View style={[styles.iconCircle, { borderColor: item.tint, backgroundColor: `${item.tint}1A` }]}>
                {item.icon}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.tileTitle}>{item.title}</Text>
              </View>

              <MaterialIcons name="keyboard-arrow-right" size={22} color={item.tint} />
            </TouchableOpacity>
          ))}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* Header */
  hero: {
    paddingBottom: 18,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSide: { width: 98, alignItems: "flex-start", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "white", fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },
  subtitle: { color: "#C7D2FE", fontSize: 12, marginTop: 2, fontWeight: "600" },
  clockWrap: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  headerTime: { color: "#E0E7FF", fontSize: 13, fontWeight: "700" },

  /* Search */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    marginHorizontal: 14,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, paddingVertical: 0 },

  /* Content grid – big, friendly tiles */
  content: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 26,
    rowGap: GAP,
    columnGap: GAP,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  tile: {
    width: COL,
    minHeight: 44,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  tileTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.text,
  },
  tileSub: {
    fontSize: 12,
    color: COLORS.subtext,
    marginTop: 2,
  },

  /* Loading overlay */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(243,244,246,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
});
