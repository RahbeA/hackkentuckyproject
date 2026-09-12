import { Text, View } from "react-native";
import { colors, uiFont } from "../../theme";

export function Chip({
  label,
  tone = "success",
}: {
  label: string;
  tone?: "success" | "warn" | "neutral";
}) {
  const map = {
    success: { fg: colors.success, bg: colors.successSoft, border: "rgba(5,150,105,.22)" },
    warn: { fg: colors.warn, bg: colors.warnSoft, border: "rgba(217,119,6,.22)" },
    neutral: { fg: colors.muted, bg: colors.field, border: colors.border },
  }[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: map.border,
        backgroundColor: map.bg,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: map.fg }} />
      <Text style={{ ...uiFont, color: map.fg, fontSize: 11.5, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
