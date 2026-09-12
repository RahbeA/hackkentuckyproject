import { Pressable, Text, View } from "react-native";
import type { AppNotification } from "../types";
import { formatWhen } from "../format";
import { colors, fonts } from "../theme";

export function NotificationRow({
  item,
  onTrack,
}: {
  item: AppNotification;
  onTrack?: () => void;
}) {
  const delay = item.event_type?.includes("delay") || /late/i.test(item.title);
  const payloadType = typeof item.payload?.alert_type === "string" ? item.payload.alert_type : "";
  const emergency =
    item.event_type === "alert.guardian" ||
    ["accident", "breakdown", "running_late", "other"].includes(payloadType);
  const accent = emergency ? colors.danger : delay ? colors.warn : colors.border;
  const showAccent = (emergency || delay) && !item.is_read;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: showAccent ? 3 : 1,
        borderLeftColor: showAccent ? accent : colors.border,
        borderRadius: 12,
        padding: 16,
        opacity: item.is_read ? 0.72 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.ink }}>{item.title}</Text>
        <Text style={{ fontSize: 11.5, color: colors.faint }}>{formatWhen(item.created_at)}</Text>
      </View>
      {item.body ? (
        <Text style={{ marginTop: 6, fontSize: 13.5, lineHeight: 21, color: colors.muted }}>{item.body}</Text>
      ) : null}
      {delay && onTrack ? (
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.field,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 9,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontFamily: fonts.heading, fontSize: 17 }}>Live</Text>
          <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: "600", color: colors.muted }}>revised</Text>
          <Pressable onPress={onTrack} style={{ marginLeft: "auto" }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.primary }}>Track →</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
