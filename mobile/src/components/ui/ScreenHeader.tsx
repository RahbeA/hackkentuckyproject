import { type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, uiFont } from "../../theme";
import { BackButton } from "./BackButton";

export function ScreenHeader({
  title,
  subtitle,
  back,
  right,
  left,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  left?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingTop: Math.max(insets.top, 12) + 8,
        paddingHorizontal: 22,
        paddingBottom: 14,
        minHeight: 72,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {back ? <BackButton /> : left}
      {title ? (
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={{ ...uiFont, fontSize: 15, fontWeight: "600", color: colors.ink }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ ...uiFont, marginTop: 1, fontSize: 11.5, color: colors.muted }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}
