import api from "@/services/api";
import { useAuth } from "@/src/context/AuthContext";
import { AntDesign, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EditOilSaleModal from "./Shidaal/editoilsalemodal";

/* ======================= Utilities ======================= */
const fmtNumber = (value: number | null | undefined, digits: number = 2) => {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
  } catch {
    return String(Number(value).toFixed(digits));
  }
};
const fmtMoney = (value: number | null | undefined, currency: string | null | undefined) => {
  if (value == null) return "—";
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return `$${fmtNumber(value, 2)}`;
  return `${fmtNumber(value, 2)} ${cur}`;
};
const fmtLocalDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};
const unitCapacity = (unit_type: string, liters_sold: number | null | undefined) => {
  if (unit_type === "liters") return 1;
  if (unit_type === "fuusto") return 20;
  if (unit_type === "caag") return 10;
  if (unit_type === "lot") return liters_sold ?? 0;
  return 1;
};

/* ======================= Types ======================= */
type TotalsPerType = {
  oil_type: string;
  count: number;
  revenue_native: number;
  revenue_usd?: number | null;
  revenue_native_label?: string;
  revenue_usd_label?: string;
};
type TotalsPerCurrency = {
  currency: string;
  revenue_native: number;
  revenue_usd: number;
  revenue_native_label?: string;
  revenue_usd_label?: string;
};
type TotalsPerUnit = {
  unit_type: "liters" | "fuusto" | "caag" | "lot";
  unit_qty_total: number;
  liters_total: number;
};
type TotalsPayload = {
  per_type: TotalsPerType[];
  per_currency: TotalsPerCurrency[];
  per_unit: TotalsPerUnit[];
  overall_count: number;
  overall_revenue_native: number;
  overall_revenue_usd: number;
  overall_revenue_native_label?: string;
  overall_revenue_usd_label?: string;
};
type SummaryResponse = {
  items: OilSaleRead[];
  totals: TotalsPayload;
  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;
};
type OilSaleRead = {
  id: number;
  oil_id: number;
  owner_id: number;
  customer?: string | null;
  customer_contact?: string | null;
  sale_type: "invoice" | "cashsale";
  oil_type: string;
  truck_plate?: string | null;
  unit_type: "liters" | "fuusto" | "caag" | "lot";
  unit_qty: number;
  unit_capacity_l?: number | null;
  liters_sold: number;
  currency: string;
  price_per_l?: number | null;
  price_per_unit_type?: number | null;
  subtotal_native?: number | null;
  discount_native?: number | null;
  tax_native?: number | null;
  total_native?: number | null;
  fx_rate_to_usd?: number | null;
  total_usd?: number | null;
  payment_status: "unpaid" | "partial" | "paid";
  payment_method?: "cash" | "bank" | "mobile" | "credit" | null;
  paid_native?: number | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
  truck_type?: string | null;
  truck_plate_extra?: string | null;
};

/* ======================= Visual helpers ======================= */
const getTypeVisuals = (oil: string, status: OilSaleRead["payment_status"]) => {
  const o = (oil || "").toLowerCase();
  const base = {
    diesel: {
      bg: "#ECFDF5",
      color: "#065F46",
      icon: <MaterialCommunityIcons name="fuel" size={16} color="#065F46" />,
    },
    petrol: {
      bg: "#EFF6FF",
      color: "#1D4ED8",
      icon: <MaterialCommunityIcons name="gas-station" size={16} color="#1D4ED8" />,
    },
    default: {
      bg: "#F1F5F9",
      color: "#334155",
      icon: <MaterialCommunityIcons name="oil" size={16} color="#334155" />,
    },
  } as const;
  const tone = o.includes("diesel") ? base.diesel : o.includes("petrol") ? base.petrol : base.default;
  const amountColor = status === "paid" ? "#10B981" : status === "partial" ? "#F59E0B" : "#111827";
  return { ...tone, amountColor };
};

const MoneyInline = ({
  amount,
  currency,
  style,
}: {
  amount: number | null | undefined;
  currency: string | null | undefined;
  style?: any;
}) => {
  const cur = (currency || "USD").toUpperCase();
  const num = fmtNumber(amount ?? 0, 2);
  if (cur === "USD") return <Text style={style} allowFontScaling={false}>${num}</Text>;
  const baseSize = (StyleSheet.flatten(style)?.fontSize as number) || 12;
  return (
    <Text style={style} allowFontScaling={false}>
      {num}{" "}
      <Text style={[style, { fontSize: Math.max(9, baseSize - 4), fontWeight: "800" }]} allowFontScaling={false}>
        {cur}
      </Text>
    </Text>
  );
};

/* ======================= Receipt (status removed) ======================= */
function ReceiptModal({
  visible,
  onClose,
  sale,
  onEdit,
  onAskDelete,
}: {
  visible: boolean;
  onClose: () => void;
  sale: OilSaleRead | null;
  onEdit: () => void;
  onAskDelete: () => void;
}) {
  if (!sale) return null;
  const isUSD = (sale.currency || "USD").toUpperCase() === "USD";
  const unitName = String(sale.unit_type || "—").toLowerCase();
  const units = sale.unit_type === "liters" ? (sale.liters_sold ?? sale.unit_qty ?? 0) : (sale.unit_qty ?? sale.liters_sold ?? 0);
  const ppu =
    sale.price_per_unit_type ??
    (sale.price_per_l != null ? sale.price_per_l * unitCapacity(unitName, sale.liters_sold) : null);
  const subTotal = (sale.total_native ?? 0) - (sale.tax_native ?? 0) + (sale.discount_native ?? 0);
  const subtotalUSD = !isUSD && sale.fx_rate_to_usd && sale.fx_rate_to_usd > 0 ? subTotal / sale.fx_rate_to_usd : sale.total_native ?? 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.rcBackdrop}>
        <View style={styles.rcPaper}>
          <View style={styles.rcTopBar}>
            <Text style={styles.rcBrand} allowFontScaling={false}>Oil Sale</Text>
            <TouchableOpacity onPress={onClose} style={styles.rcClose}>
              <Feather name="x" size={14} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 8 }} nestedScrollEnabled showsVerticalScrollIndicator>
            <View style={styles.rcHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rcTitle} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
                  {sale.oil_type || "—"}
                </Text>
                <Text style={styles.rcSub} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
                  {fmtLocalDate(sale.created_at)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.rcSub} allowFontScaling={false}>{(sale.payment_method || "—").toString()}</Text>
              </View>
            </View>

            {(sale.customer || sale.customer_contact) && (
              <View style={styles.rcBlock}>
                <Text style={styles.rcBlockTitle} allowFontScaling={false}>Customer</Text>
                {sale.customer ? <Text style={styles.rcLine} allowFontScaling={false}>{sale.customer}</Text> : null}
                {sale.customer_contact ? <Text style={styles.rcLine} allowFontScaling={false}>{sale.customer_contact}</Text> : null}
              </View>
            )}

            {(sale.truck_plate || "").trim().length > 0 && (
              <View style={styles.rcBlock}>
                <Text style={styles.rcBlockTitle} allowFontScaling={false}>Truck</Text>
                <Text style={styles.rcLine} allowFontScaling={false}>{(sale.truck_plate || "").trim()}</Text>
              </View>
            )}

            <View style={[styles.rcBlock, { paddingBottom: 6 }]}>
              <Text style={styles.rcBlockTitle} allowFontScaling={false}>Line</Text>
              <View style={styles.rcRowHead}>
                <Text style={[styles.rcHeadCell, { flex: 2 }]} allowFontScaling={false}>Description</Text>
                <Text style={[styles.rcHeadCell, { flex: 1, textAlign: "center" }]} allowFontScaling={false}>Qty</Text>
                <Text style={[styles.rcHeadCell, { flex: 1, textAlign: "right" }]} allowFontScaling={false}>Unit</Text>
                <Text style={[styles.rcHeadCell, { flex: 1.2, textAlign: "right" }]} allowFontScaling={false}>Amount</Text>
              </View>

              <View style={styles.rcRow}>
                <Text style={[styles.rcCell, { flex: 2 }]} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
                  {sale.oil_type} — {unitName === "liters" ? "L" : unitName}
                </Text>
                <Text style={[styles.rcCell, { flex: 1, textAlign: "center" }]} allowFontScaling={false}>
                  {fmtNumber(units ?? 0, 0)}
                </Text>
                <Text style={[styles.rcCell, { flex: 1, textAlign: "right" }]} allowFontScaling={false}>
                  {ppu != null ? fmtMoney(ppu, sale.currency) : "—"}
                </Text>
                <MoneyInline amount={sale.total_native} currency={sale.currency} style={[styles.rcCell, { flex: 1.2, textAlign: "right", fontWeight: "800" }]} />
              </View>

              {(sale.currency || "").toUpperCase() !== "USD" && (
                <View style={{ marginTop: 4 }}>
                  {sale.fx_rate_to_usd ? (
                    <Text style={styles.rcFx} allowFontScaling={false}>
                      $1 = {fmtNumber(sale.fx_rate_to_usd, 4)} {(sale.currency || "USD").toUpperCase()}
                    </Text>
                  ) : null}
                  {sale.total_usd != null ? (
                    <Text style={styles.rcFxUsd} allowFontScaling={false}>{fmtMoney(sale.total_usd, "USD")}</Text>
                  ) : null}
                </View>
              )}
            </View>

            {sale.note ? (
              <View style={styles.rcBlock}>
                <Text style={styles.rcBlockTitle} allowFontScaling={false}>Note</Text>
                <Text style={styles.rcLine} allowFontScaling={false}>{sale.note}</Text>
              </View>
            ) : null}

            <View style={styles.rcSummary}>
              <View style={styles.rcSumRow}>
                <Text style={styles.rcSumLabel}>Subtotal</Text>
                <MoneyInline amount={subTotal} currency={sale.currency} style={styles.rcSumValue} />
              </View>
              {(sale.currency || "").toUpperCase() !== "USD" && sale.fx_rate_to_usd ? (
                <View style={styles.rcSumRow}>
                  <Text style={[styles.rcSumLabel, { opacity: 0.9 }]}>Subtotal (USD)</Text>
                  <Text style={[styles.rcSumValue, { fontWeight: "800" }]}>{fmtMoney(subtotalUSD, "USD")}</Text>
                </View>
              ) : null}
              {sale.discount_native ? (
                <View style={styles.rcSumRow}>
                  <Text style={styles.rcSumLabel}>Discount</Text>
                  <MoneyInline amount={sale.discount_native} currency={sale.currency} style={styles.rcSumValue} />
                </View>
              ) : null}
              {sale.tax_native ? (
                <View style={styles.rcSumRow}>
                  <Text style={styles.rcSumLabel}>Tax</Text>
                  <MoneyInline amount={sale.tax_native} currency={sale.currency} style={styles.rcSumValue} />
                </View>
              ) : null}
              <View style={[styles.rcSumRow, styles.rcSumEm]}>
                <Text style={styles.rcSumLabel}>Total</Text>
                <MoneyInline amount={sale.total_native} currency={sale.currency} style={styles.rcSumValue} />
              </View>
            </View>
          </ScrollView>

          <View style={styles.rcActions}>
            <TouchableOpacity style={[styles.rcBtn, styles.rcBtnGhost]} onPress={onEdit}>
              <Feather name="edit-3" size={14} color="#0B2447" />
              <Text style={styles.rcBtnGhostTxt} allowFontScaling={false}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.rcBtn, styles.rcBtnDanger]} onPress={onAskDelete}>
              <Feather name="trash-2" size={14} color="#fff" />
              <Text style={styles.rcBtnDangerTxt} allowFontScaling={false}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Delete Confirm ======================= */
function DeleteConfirmModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.delBackdrop}>
        <View style={styles.delCard}>
          <View style={styles.delIconWrap}>
            <Feather name="alert-triangle" size={20} color="#DC2626" />
          </View>
          <Text style={styles.delTitle} allowFontScaling={false}>Delete this sale?</Text>
          <Text style={styles.delBody} allowFontScaling={false}>
            This will revert liters to the original lot and permanently remove the record.
          </Text>
          <View style={styles.delActions}>
            <TouchableOpacity style={styles.delCancel} onPress={onCancel}>
              <Text style={styles.delCancelTxt} allowFontScaling={false}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.delConfirm} onPress={handleConfirm} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="trash-2" size={14} color="#fff" />
                  <Text style={styles.delConfirmTxt} allowFontScaling={false}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Export Modal ======================= */
function ExportModal({
  visible,
  onClose,
  pdfUri,
}: {
  visible: boolean;
  onClose: () => void;
  pdfUri: string | null;
}) {
  const shareToWhatsApp = async () => {
    if (!pdfUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Sharing unavailable", "Sharing isn’t supported on this device/emulator.");
        return;
      }
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Send to WhatsApp",
      });
    } catch (e: any) {
      Alert.alert("Share failed", e?.message || "Could not share to WhatsApp.");
    }
  };

  const downloadShare = async () => {
    if (!pdfUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Sharing unavailable", "Sharing isn’t supported on this device/emulator.");
        return;
      }
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Share or Save PDF",
      });
    } catch (e: any) {
      Alert.alert("Share failed", e?.message || "Could not open share sheet.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.expBackdropCentered}>
        <View style={styles.expCardCentered}>
          <TouchableOpacity style={styles.expCloseAbsolute} onPress={onClose}>
            <AntDesign name="close" size={18} color="#334155" />
          </TouchableOpacity>

          <Text style={styles.expTitle} allowFontScaling={false}>Export PDF</Text>
          <Text style={styles.expSub} allowFontScaling={false}>Send to WhatsApp or download/share the PDF.</Text>

          <View style={styles.expActions}>
            <TouchableOpacity style={[styles.expBtn, styles.expBtnPrimary]} onPress={shareToWhatsApp} disabled={!pdfUri}>
              <Feather name="send" size={16} color="#fff" />
              <Text style={styles.expBtnPrimaryTxt} allowFontScaling={false}>Send to WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.expBtn, styles.expBtnGhost]} onPress={downloadShare} disabled={!pdfUri}>
              <Feather name="download" size={16} color="#0B2447" />
              <Text style={styles.expBtnGhostTxt} allowFontScaling={false}>Download / Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Main Page ======================= */
const { width } = Dimensions.get("window");
const CARD_MARGIN = 6;
const CARD_W_TWO = (width - 32 - CARD_MARGIN) / 2;
const CARD_W_THREE = (width - 36 - CARD_MARGIN * 2) / 3;

export default function OilSalesPage() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<OilSaleRead[]>([]);
  const [totals, setTotals] = useState<TotalsPayload | null>(null);

  const [selected, setSelected] = useState<OilSaleRead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [lastPdfUri, setLastPdfUri] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<"start" | "end" | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf("month").toDate(),
    endDate: dayjs().endOf("day").toDate(),
  });

  // NEW: plate filtering UI
  const [platePickerOpen, setPlatePickerOpen] = useState(false);
  const [plateQuery, setPlateQuery] = useState("");
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();
  const API_DATE_FMT = "YYYY-MM-DD";

  const fetchSummary = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const start = dayjs(dateRange.startDate).startOf("day").format(API_DATE_FMT);
      const end = dayjs(dateRange.endDate).add(1, "day").startOf("day").format(API_DATE_FMT);
      const res = await api.get<SummaryResponse>("/oilsale/summary", {
        params: { limit: 200, order: "created_desc", start: `${start}T00:00:00`, end: `${end}T00:00:00` },
      });
      const data = res.data;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotals(data?.totals || null);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.detail || e?.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSummary();
    } finally {
      setRefreshing(false);
    }
  }, [fetchSummary]);

  // Unique plates from items
  const allPlates = useMemo(() => {
    const s = new Set<string>();
    items.forEach((r) => {
      const plate = (r.truck_plate || "").trim();
      if (plate) s.add(plate);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredPlates = useMemo(() => {
    const q = plateQuery.trim().toLowerCase();
    if (!q) return allPlates;
    return allPlates.filter((p) => p.toLowerCase().includes(q));
  }, [allPlates, plateQuery]);

  // Filter items by search + selectedPlate
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (selectedPlate && (r.truck_plate || "").trim() !== selectedPlate) return false;
      if (!q) return true;
      const plate = (r.truck_plate || "").toLowerCase();
      const hay = `${r.oil_type ?? ""} ${plate} ${r.customer ?? ""} ${r.unit_type ?? ""} ${(r.currency || "").toUpperCase()}`.toLowerCase();
      const dateStr = fmtLocalDate(r.created_at).toLowerCase();
      return hay.includes(q) || dateStr.includes(q);
    });
  }, [items, search, selectedPlate]);

  // Derived KPI from filteredItems (USD revenue + unit counts)
  const derived = useMemo(() => {
    // Total revenue in USD (convert where needed)
    const toUSD = (r: OilSaleRead) => {
      const cur = (r.currency || "USD").toUpperCase();
      if (cur === "USD") return Number(r.total_native || 0);
      if (r.total_usd != null) return Number(r.total_usd || 0);
      if (r.fx_rate_to_usd && r.fx_rate_to_usd > 0) return Number(r.total_native || 0) / r.fx_rate_to_usd;
      return 0;
    };
    let totalUSD = 0;
    let liters = 0;
    let fuusto = 0;
    let caag = 0;
    let lot = 0;
    filteredItems.forEach((r) => {
      totalUSD += toUSD(r);
      switch (r.unit_type) {
        case "liters":
          liters += r.liters_sold || 0;
          break;
        case "fuusto":
          fuusto += r.unit_qty || 0;
          break;
        case "caag":
          caag += r.unit_qty || 0;
          break;
        case "lot":
          lot += r.unit_qty || 0;
          break;
      }
    });
    const unitLabels = [
      liters > 0 ? `${fmtNumber(liters, 0)} L` : null,
      fuusto > 0 ? `${fmtNumber(fuusto, 0)} fuusto` : null,
      caag > 0 ? `${fmtNumber(caag, 0)} caag` : null,
      lot > 0 ? `${fmtNumber(lot, 0)} lot` : null,
    ].filter(Boolean) as string[];
    return { totalUSD, unitLabels };
  }, [filteredItems]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (pathname !== "/menu") {
          router.replace("/menu");
        }
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [router, pathname])
  );

  /* ===== Row Renderer ===== */
  const getSaleTypeBadge = (qty?: number | null, unit?: OilSaleRead["unit_type"], liters?: number | null) => {
    const u = String(unit || "—").toLowerCase();
    const label = u === "liters" ? `${fmtNumber(liters ?? 0, 0)} liters` : u === "lot" ? "1 lot" : `${fmtNumber(qty ?? 0, 0)} ${u}`;
    const palette: Record<string, { bg: string; color: string }> = {
      fuusto: { bg: "#FFFBEB", color: "#92400E" },
      caag: { bg: "#ECFDF5", color: "#065F46" },
      liters: { bg: "#EFF6FF", color: "#1D4ED8" },
      lot: { bg: "#F3E8FF", color: "#6B21A8" },
      default: { bg: "#F1F5F9", color: "#334155" },
    };
    const tone = palette[u] || palette.default;
    return { ...tone, label };
  };

  const renderRow = (r: OilSaleRead, idx: number) => {
    const visuals = getTypeVisuals(r.oil_type, r.payment_status);
    const typeBadge = getSaleTypeBadge(r.unit_qty, r.unit_type, r.liters_sold);
    const isUSD = (r.currency || "USD").toUpperCase() === "USD";

    return (
      <React.Fragment key={r.id ?? idx}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setSelected(r);
            setDetailOpen(true);
          }}
          style={styles.txnItem}
        >
          <View style={[styles.txnIcon, { backgroundColor: visuals.bg }]}>{visuals.icon}</View>

          <View style={styles.txnText}>
            <Text style={styles.txnTitle} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
              {r.oil_type || "—"}
            </Text>
            {r.customer ? (
              <Text style={styles.txnRef} numberOfLines={1} allowFontScaling={false}>
                {r.customer}
              </Text>
            ) : null}
            <Text style={styles.txnDate} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
              {fmtLocalDate(r.created_at)}
            </Text>
          </View>

          <View style={styles.txnTypeWrap}>
            <View style={[styles.txnTypeBadge, { backgroundColor: typeBadge.bg }]}>
              <Text style={[styles.txnTypeText, { color: typeBadge.color }]} numberOfLines={1} ellipsizeMode="clip" allowFontScaling={false}>
                {typeBadge.label}
              </Text>
            </View>
          </View>

          <View style={styles.txnAmountWrap}>
            <MoneyInline amount={r.total_native} currency={r.currency} style={[styles.txnAmount, { color: visuals.amountColor }]} />
            {!isUSD && r.total_usd != null ? (
              <Text style={styles.txnAmountUsd} numberOfLines={1} allowFontScaling={false}>
                {fmtMoney(r.total_usd, "USD")}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
      </React.Fragment>
    );
  };

  /* ======================= EXPORT (dynamic currency columns) ======================= */
  const composeUnit = (r: OilSaleRead) => {
    const u = r.unit_type;
    if (u === "liters") return `${fmtNumber(r.liters_sold, 0)} L`;
    if (u === "lot") return "1 lot";
    return `${fmtNumber(r.unit_qty, 0)} ${u}`;
  };
  const pricePerUnit = (r: OilSaleRead) => {
    if (r.price_per_unit_type != null) return r.price_per_unit_type;
    if (r.price_per_l != null) {
      const cap = unitCapacity(r.unit_type, r.liters_sold);
      return r.price_per_l * cap;
    }
    return null;
  };

  const exportPDF = async () => {
    try {
      const nonUsdCurrencies = Array.from(
        new Set(
          filteredItems
            .map((r) => (r.currency || "USD").toUpperCase())
            .filter((c) => c !== "USD")
        )
      ).sort();

      const headLabels = ["Date", "Oil", "Customer", "Unit", "Price/Unit", "Rate", ...nonUsdCurrencies.map((c) => c), "Total (USD)"];
      const head = `<tr>${headLabels
        .map(
          (h) =>
            `<th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px">${h}</th>`
        )
        .join("")}</tr>`;

      const htmlCell = (t: string) =>
        `<td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;color:#111827">${t || ""}</td>`;

      const body = filteredItems
        .map((r) => {
          const date = dayjs(r.created_at).format("YYYY-MM-DD HH:mm");
          const oil = r.oil_type || "";
          const customer = r.customer || "";
          const unit = composeUnit(r);
          const ppu = pricePerUnit(r) != null ? fmtNumber(pricePerUnit(r)!, 4) : "";
          const rate = r.fx_rate_to_usd != null ? String(r.fx_rate_to_usd) : "";

          const cur = (r.currency || "USD").toUpperCase();
          const nativeCols = nonUsdCurrencies.map((c) =>
            c === cur && r.total_native != null ? String(Number(r.total_native).toFixed(2)) : ""
          );

          const usdVal =
            r.total_usd != null
              ? String(Number(r.total_usd).toFixed(2))
              : cur === "USD" && r.total_native != null
              ? String(Number(r.total_native).toFixed(2))
              : "";

          const row = [date, oil, customer, unit, ppu, rate, ...nativeCols, usdVal];
          return `<tr>${row.map(htmlCell).join("")}</tr>`;
        })
        .join("");

      const unitSummary = derived.unitLabels.map((l) => `<li>${l}</li>`).join("");

      const title = `Oil Sales • ${dayjs(dateRange.startDate).format("MMM D, YYYY")} – ${dayjs(dateRange.endDate).format(
        "MMM D, YYYY"
      )}`;

      const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 16px; color: #111827; }
            h1 { font-size: 16px; margin: 0 0 8px 0; }
            .meta { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
            table { border-collapse: collapse; width: 100%; }
            .card { border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#fff; }
            .spacer{ height: 12px }
            ul { margin: 6px 0 0 18px; padding: 0; font-size: 12px }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${title}</h1>
            <div class="meta">${dayjs().format("YYYY-MM-DD HH:mm")}</div>
            <table>
              <thead>${head}</thead>
              <tbody>${body || `<tr><td style="padding:10px">No rows</td></tr>`}</tbody>
            </table>
          </div>
          <div class="spacer"></div>
          <div class="card">
            <h1>Summary</h1>
            <div><b>Units</b><ul>${unitSummary}</ul></div>
            <div style="margin-top:8px"><b>Overall (USD)</b>: ${fmtMoney(derived.totalUSD, "USD")}</div>
          </div>
        </body>
      </html>`;

      const { uri } = await Print.printToFileAsync({ html });
      setLastPdfUri(uri);
      setExportOpen(true);
    } catch (e: any) {
      Alert.alert("PDF failed", e?.message || "Could not create PDF.");
    }
  };

  // Delete call
  const doDelete = useCallback(async () => {
    if (!selected?.id) return;
    try {
      await api.delete(`/oilsale/${selected.id}`, { headers: authHeader });
      setConfirmOpen(false);
      setDetailOpen(false);
      setSelected(null);
      await fetchSummary();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.response?.data?.detail || "Could not delete sale.");
    }
  }, [selected, authHeader, fetchSummary]);

  /* ======================= Dates & Filters ======================= */
  const todayStart = dayjs().startOf("day");
  const todayEnd = dayjs().endOf("day");
  const monthStart = dayjs().startOf("month");
  const monthEnd = dayjs().endOf("month");
  const yearStart = dayjs().startOf("year");
  const yearEnd = dayjs().endOf("day");
  const sameRange = (s: Date, e: Date, s2: dayjs.Dayjs, e2: dayjs.Dayjs) =>
    dayjs(s).startOf("day").valueOf() === s2.startOf("day").valueOf() &&
    dayjs(e).endOf("day").valueOf() === e2.endOf("day").valueOf();
  const isTodayActive = sameRange(dateRange.startDate, dateRange.endDate, todayStart, todayEnd);
  const isMonthActive = sameRange(dateRange.startDate, dateRange.endDate, monthStart, monthEnd);
  const isYearActive = sameRange(dateRange.startDate, dateRange.endDate, yearStart, yearEnd);

  const applyQuickRange = (key: "today" | "month" | "year") => {
    if (key === "today") setDateRange({ startDate: todayStart.toDate(), endDate: todayEnd.toDate() });
    else if (key === "month") setDateRange({ startDate: monthStart.toDate(), endDate: monthEnd.toDate() });
    else setDateRange({ startDate: yearStart.toDate(), endDate: yearEnd.toDate() });
    setShowFilters(false);
    setTimeout(fetchSummary, 0);
  };
  const handleDateChange = (_: any, sel?: Date) => {
    const mode = showDatePicker;
    setShowDatePicker(null);
    if (!sel || !mode) return;
    setDateRange((prev) =>
      mode === "start"
        ? { ...prev, startDate: dayjs(sel).startOf("day").toDate() }
        : { ...prev, endDate: dayjs(sel).endOf("day").toDate() }
    );
  };

  /* ======================= UI ======================= */
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 8 }]}>
      {/* Header */}
      <LinearGradient
        colors={["#0B2447", "#0B2447"]}
        style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.headerBar}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.replace("/menu")}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="arrow-left" size={16} color="#E0E7FF" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.headerBtn}>
              <Feather name="filter" size={14} color="#0B2447" />
              <Text style={styles.headerBtnTxt} allowFontScaling={false}>Filter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Centered title/date */}
        <View pointerEvents="none" style={[styles.headerCenter, { top: Math.max(insets.top + 8, 20) }]}>
          <Text style={styles.headerTitle} allowFontScaling={false}>Oil Sales</Text>
          <Text style={styles.headerDate} numberOfLines={1} allowFontScaling={false}>
            {dayjs(dateRange.startDate).format("MMM D, YYYY")} – {dayjs(dateRange.endDate).format("MMM D, YYYY")}
          </Text>
        </View>
      </LinearGradient>

      {!!error && (
        <TouchableOpacity style={styles.errorBanner} onPress={() => Alert.alert("Error", error)}>
          <Feather name="alert-triangle" size={12} color="#991b1b" />
          <Text style={styles.errorText} allowFontScaling={false}>{error}</Text>
        </TouchableOpacity>
      )}

      {/* === ONE KPI CARD (like vendor bills) === */}
      {!loading && (
        <View style={styles.kpiWrapper}>
          <View style={styles.kpiOneCard}>
            {/* Left: Total + units */}
            <View style={{ flex: 1 }}>
              <Text style={styles.kpiLabel} allowFontScaling={false}>Total Revenue</Text>
              <Text style={styles.kpiBig} allowFontScaling={false}>{fmtMoney(derived.totalUSD, "USD")}</Text>

              <View style={styles.unitChipsRow}>
                {(derived.unitLabels.length ? derived.unitLabels : ["—"]).slice(0, 4).map((lab, i) => (
                  <View key={`${lab}_${i}`} style={styles.unitChip}>
                    <Text style={styles.unitChipTxt} allowFontScaling={false}>{lab}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Right: plate dropdown */}
            <View style={styles.plateCol}>
              <Text style={styles.plateLabel} allowFontScaling={false}>Truck Plate</Text>
              <TouchableOpacity
                style={styles.plateBtn}
                onPress={() => {
                  setPlateQuery("");
                  setPlatePickerOpen(true);
                }}
                activeOpacity={0.9}
              >
                <Feather name="truck" size={14} color="#0B2447" />
                <Text style={styles.plateBtnTxt} allowFontScaling={false}>
                  {selectedPlate ? selectedPlate : "All plates"}
                </Text>
                <Feather name="chevron-down" size={16} color="#0B2447" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={() => router.push("/Shidaal/oilsaleformcashsale")} style={styles.iibBtn}>
          <Feather name="plus" size={18} color="#1E3A8A" />
          <Text style={styles.iibBtnTxt} allowFontScaling={false}>Iib Cusub</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={exportPDF} style={styles.pdfBtnBig}>
          <Feather name="share-2" size={18} color="#1E3A8A" />
          <Text style={styles.iibBtnTxt} allowFontScaling={false}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={14} color="#64748B" />
          <TextInput
            placeholder="Search sales (oil, plate, customer, date)..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Feed */}
      <View style={[styles.cardFeed, { overflow: "visible" }]}>
        <View style={{ borderRadius: 12, overflow: "hidden", flex: 1 }}>
          <FlatList
            data={filteredItems}
            keyExtractor={(r, i) => String(r.id ?? i)}
            renderItem={({ item, index }) => renderRow(item, index)}
            contentContainerStyle={{ paddingVertical: 4 }}
            refreshing={refreshing}
            onRefresh={onRefresh}
            showsVerticalScrollIndicator
            ListEmptyComponent={
              <View style={{ padding: 14, alignItems: "center" }}>
                <Feather name="package" size={28} color="#6b7280" />
                <Text style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }} allowFontScaling={false}>
                  No sales found
                </Text>
              </View>
            }
          />
        </View>
      </View>

      {/* Detail & Edit & Delete */}
      <ReceiptModal
        visible={detailOpen}
        sale={selected}
        onClose={() => setDetailOpen(false)}
        onEdit={() => setEditOpen(true)}
        onAskDelete={() => setConfirmOpen(true)}
      />
      <EditOilSaleModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        token={token}
        sale={selected}
        onSuccess={(updated) => {
          setEditOpen(false);
          setSelected(updated);
          fetchSummary();
        }}
      />
      <DeleteConfirmModal visible={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={doDelete} />

      {/* Filters Sheet */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "80%", paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.grabber} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} allowFontScaling={false}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <AntDesign name="close" size={18} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel} allowFontScaling={false}>Date Range</Text>
                <View style={styles.dateRangeContainer}>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker("start")}>
                    <Text style={styles.dateBtnText} allowFontScaling={false}>
                      {dayjs(dateRange.startDate).format("MMM D, YYYY")}
                    </Text>
                    <Feather name="calendar" size={14} color="#0B2447" />
                  </TouchableOpacity>
                  <Text style={styles.rangeSep} allowFontScaling={false}>to</Text>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker("end")}>
                    <Text style={styles.dateBtnText} allowFontScaling={false}>
                      {dayjs(dateRange.endDate).format("MMM D, YYYY")}
                    </Text>
                    <Feather name="calendar" size={14} color="#0B2447" />
                  </TouchableOpacity>
                </View>

                {showDatePicker && (
                  <DateTimePicker
                    value={showDatePicker === "start" ? dateRange.startDate : dateRange.endDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_: any, sel?: Date) => handleDateChange(_, sel)}
                  />
                )}

                <View style={styles.filterActions}>
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={() =>
                      setDateRange({
                        startDate: dayjs().startOf("month").toDate(),
                        endDate: dayjs().endOf("day").toDate(),
                      })
                    }
                  >
                    <Text style={styles.resetTxt} allowFontScaling={false}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => {
                      setShowFilters(false);
                      fetchSummary();
                    }}
                  >
                    <Text style={styles.applyTxt} allowFontScaling={false}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Truck Plate Picker Modal */}
      <Modal visible={platePickerOpen} transparent animationType="fade" onRequestClose={() => setPlatePickerOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setPlatePickerOpen(false)}>
          <View style={styles.plateOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.plateContent, { paddingBottom: (insets.bottom || 0) + 8 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle} allowFontScaling={false}>Select Truck Plate</Text>
                  <TouchableOpacity onPress={() => setPlatePickerOpen(false)}>
                    <AntDesign name="close" size={18} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <View style={styles.plateSearchBox}>
                  <Feather name="search" size={12} color="#64748B" />
                  <TextInput
                    value={plateQuery}
                    onChangeText={setPlateQuery}
                    placeholder="Search plate…"
                    placeholderTextColor="#94A3B8"
                    style={styles.plateSearchInput}
                    autoCapitalize="characters"
                    returnKeyType="search"
                  />
                  {!!plateQuery && (
                    <TouchableOpacity onPress={() => setPlateQuery("")}>
                      <Feather name="x-circle" size={12} color="#64748B" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.plateList}>
                  <TouchableOpacity
                    style={[styles.plateItem, !selectedPlate && styles.plateItemActive]}
                    onPress={() => {
                      setSelectedPlate(null);
                      setPlatePickerOpen(false);
                    }}
                  >
                    <Feather name="globe" size={12} color="#0B2447" />
                    <Text style={styles.plateItemTxt} allowFontScaling={false}>All plates</Text>
                  </TouchableOpacity>

                  {filteredPlates.length ? (
                    filteredPlates.map((pl) => (
                      <TouchableOpacity
                        key={pl}
                        style={[styles.plateItem, selectedPlate === pl && styles.plateItemActive]}
                        onPress={() => {
                          setSelectedPlate(pl);
                          setPlatePickerOpen(false);
                        }}
                      >
                        <Feather name="truck" size={12} color="#0B2447" />
                        <Text style={styles.plateItemTxt} allowFontScaling={false}>{pl}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.plateEmpty}>
                      <Text style={styles.plateEmptyTxt} allowFontScaling={false}>No matches</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Export modal */}
      <ExportModal visible={exportOpen} onClose={() => setExportOpen(false)} pdfUri={lastPdfUri} />
    </View>
  );
}

/* ======================= Styles ======================= */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    elevation: 3,
    position: "relative",
  },
  headerCenter: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  headerBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 14, fontWeight: "800", color: "#E0E7FF" },
  headerDate: { fontSize: 10, color: "#CBD5E1", marginTop: 2 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerBtnTxt: { color: "#0B2447", fontSize: 10, fontWeight: "900" },

  errorBanner: {
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: "#fee2e2",
    borderColor: "#ef4444",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorText: { color: "#991b1b", fontSize: 10 },

  actionsRow: {
    marginTop: 8,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iibBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DBEAFE",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1E3A8A",
  },
  iibBtnTxt: { color: "#1E3A8A", fontSize: 12, fontWeight: "900" },
  pdfBtnBig: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DBEAFE",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1E3A8A",
  },

  /* Search */
  searchRow: { marginHorizontal: 16, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  searchBox: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  searchInput: { flex: 1, fontSize: 11, paddingVertical: 3, color: "#0F172A" },

  /* Feed container */
  cardFeed: {
    backgroundColor: "white",
    borderRadius: 12,
    marginHorizontal: 8,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    flex: 1,
  },

  /* List rows */
  txnItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10 },
  txnIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 8 },
  txnText: { flex: 1, minWidth: 0, justifyContent: "center" },
  txnTitle: { fontSize: 12, fontWeight: "800", color: "#1F2937", marginBottom: 1 },
  txnRef: { fontSize: 10, color: "#334155" },
  txnDate: { fontSize: 9, color: "#6B7280", marginTop: 1 },
  txnTypeWrap: { width: 92, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, alignSelf: "center", marginHorizontal: 4 },
  txnTypeBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb", maxWidth: 100 },
  txnTypeText: { fontSize: 9.5, fontWeight: "900", letterSpacing: 0.3, textAlign: "center" },
  txnAmountWrap: { alignItems: "flex-end", minWidth: 96, flexShrink: 0, marginLeft: 4 },
  txnAmount: { fontSize: 12, fontWeight: "900" },
  txnAmountUsd: { fontSize: 12, fontWeight: "900", marginTop: 2, color: "#111827" },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 2 },

  /* === Single KPI Card (vendorbills style) === */
  kpiWrapper: { marginTop: 10, marginHorizontal: 12 },
  kpiOneCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  kpiLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  kpiBig: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "900",
    color: "#0B1221",
  },
  unitChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  unitChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#DDE3F0",
  },
  unitChipTxt: { fontSize: 10.5, fontWeight: "900", color: "#0B2447" },

  // Right column (plate control)
  plateCol: { width: 190, justifyContent: "flex-start" },
  plateLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  plateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE3F0",
  },
  plateBtnTxt: { color: "#0B2447", fontWeight: "900", fontSize: 12, flex: 1 },

  /* Filters sheet */
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 16,
    maxHeight: "90%",
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 999, backgroundColor: "#E5E7EB", marginBottom: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 14, fontWeight: "800", color: "#1F2937" },
  filterSection: { marginBottom: 10 },
  filterLabel: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.3,
    color: "#6B7280",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  dateRangeContainer: { flexDirection: "row", alignItems: "center" },
  dateBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
  },
  dateBtnText: { color: "#1F2937", fontSize: 11, fontWeight: "700" },
  rangeSep: { fontSize: 10, color: "#6B7280", marginHorizontal: 8 },
  filterActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  resetBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginRight: 8,
    alignItems: "center",
    backgroundColor: "white",
  },
  resetTxt: { fontSize: 11, fontWeight: "800", color: "#1F2937" },
  applyBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#0B2447", alignItems: "center" },
  applyTxt: { fontSize: 11, fontWeight: "800", color: "white" },

  /* Plate picker modal */
  plateOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  plateContent: {
    width: "94%",
    maxWidth: 480,
    maxHeight: "80%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF1F6",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 12 },
    }),
  },
  plateSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  plateSearchInput: { flex: 1, color: "#0B1221", fontSize: 12, padding: 0 },
  plateList: { maxHeight: "80%" },
  plateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  plateItemActive: { backgroundColor: "#EEF2FF" },
  plateItemTxt: { color: "#0B1221", fontSize: 12, fontWeight: "800" },
  plateEmpty: { paddingVertical: 16, alignItems: "center" },
  plateEmptyTxt: { color: "#64748B", fontSize: 12 },

  /* Receipt modal */
  rcBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 16 },
  rcPaper: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    maxHeight: 600,
  },
  rcTopBar: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  rcBrand: { fontWeight: "900", fontSize: 12, color: "#0B1220" },
  rcClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  rcHeaderRow: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, flexDirection: "row" },
  rcTitle: { fontSize: 15, fontWeight: "900", color: "#0B1220" },
  rcSub: { fontSize: 10, color: "#6B7280", marginTop: 2 },
  rcBlock: { paddingHorizontal: 12, paddingVertical: 8 },
  rcBlockTitle: { fontSize: 10, fontWeight: "900", color: "#6B7280", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 },
  rcLine: { fontSize: 11, color: "#111827" },
  rcRowHead: { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  rcHeadCell: { fontSize: 10, fontWeight: "800", color: "#111827", paddingHorizontal: 4 },
  rcRow: { flexDirection: "row", paddingVertical: 6 },
  rcCell: { fontSize: 11, color: "#111827", paddingHorizontal: 4 },
  rcFx: { fontSize: 9.5, color: "#64748B", paddingHorizontal: 4 },
  rcFxUsd: { fontSize: 10.5, fontWeight: "700", color: "#111827", paddingHorizontal: 4, marginTop: 2 },
  rcSummary: { borderTopWidth: 1, borderTopColor: "#E5E7EB", marginTop: 6, padding: 10, backgroundColor: "#F8FAFC" },
  rcSumRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  rcSumLabel: { fontSize: 11, color: "#374151", fontWeight: "700" },
  rcSumValue: { fontSize: 11, color: "#0F172A", fontWeight: "900" },
  rcSumEm: { marginTop: 6 },
  rcActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  rcBtn: { height: 34, paddingHorizontal: 12, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  rcBtnGhost: { backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E5E7EB" },
  rcBtnGhostTxt: { fontSize: 11, fontWeight: "800", color: "#0B2447" },
  rcBtnDanger: { backgroundColor: "#DC2626" },
  rcBtnDangerTxt: { fontSize: 11, fontWeight: "900", color: "#fff" },

  /* Delete */
  delBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 18 },
  delCard: { width: "100%", maxWidth: 440, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#F1F5F9" },
  delIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  delTitle: { marginTop: 8, textAlign: "center", fontWeight: "900", color: "#111827", fontSize: 14 },
  delBody: { marginTop: 6, textAlign: "center", color: "#6B7280", fontSize: 11, lineHeight: 17 },
  delActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  delCancel: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  delCancelTxt: { color: "#0F172A", fontWeight: "800" },
  delConfirm: { paddingHorizontal: 12, height: 34, borderRadius: 8, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  delConfirmTxt: { color: "#fff", fontWeight: "900" },

  /* Export modal — CENTERED */
  expBackdropCentered: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 16 },
  expCardCentered: {
    width: "92%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 12 } }, android: { elevation: 8 } }),
  },
  expCloseAbsolute: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  expTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  expSub: { fontSize: 11, color: "#64748B", marginTop: 4 },
  expActions: { marginTop: 12, gap: 8 },
  expBtn: { height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  expBtnPrimary: { backgroundColor: "#0B2447" },
  expBtnPrimaryTxt: { color: "#fff", fontWeight: "900" },
  expBtnGhost: { borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff" },
  expBtnGhostTxt: { color: "#0B2447", fontWeight: "900" },
});
