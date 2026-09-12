import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAbsentToday, useChildren, useEtas, useHistory, useMarkAbsent } from "../../../src/api/hooks";
import { AbsenceSheet } from "../../../src/components/AbsenceSheet";
import { Avatar } from "../../../src/components/ui/Avatar";
import { Chip } from "../../../src/components/ui/Chip";
import { ScreenHeader } from "../../../src/components/ui/ScreenHeader";
import { childName, formatClock, initials } from "../../../src/format";
import { colors } from "../../../src/theme";

export default function RiderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: children } = useChildren();
  const { data: etas } = useEtas();
  const { data: history } = useHistory();
  const absent = useMarkAbsent();
  const { data: absentIds } = useAbsentToday();
  const [sheet, setSheet] = useState(false);
  const child = (children || []).find((c) => c.id === id);
  const eta = (etas || []).find((e) => e.student_id === id);
  const name = child ? childName(child) : eta?.student_first_name || "Rider";
  const riding = eta && eta.status !== "unassigned" && eta.status !== "completed";
  const marked = Boolean(id && absentIds?.includes(id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        back
        title={name}
        right={
          <Pressable onPress={() => router.push({ pathname: "/(guardian)/track", params: { rider: id } })}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Track</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 36 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            padding: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Avatar label={initials(name)} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16.5, fontWeight: "600", color: colors.ink }}>{name}</Text>
            <Text style={{ marginTop: 3, fontSize: 13, color: colors.muted }}>
              Grade {child?.grade ?? "—"} · {child?.school_name || eta?.school_name || "School"}
            </Text>
          </View>
          <Chip label={riding ? "Riding" : "Scheduled"} tone={riding ? "success" : "neutral"} />
        </View>

        <Text style={label}>Morning pickup</Text>
        <View style={card}>
          <StopRow
            up
            title={eta?.stop_name || "Pickup stop"}
            subtitle={`${eta?.route_code || "Bus"} · ${formatClock(eta?.p50_eta || eta?.scheduled_pickup)}`}
          />
        </View>

        <Text style={label}>This week</Text>
        <View style={[card, { padding: 18 }]}>
          <WeekStrip history={history || []} scheduled={eta?.scheduled_pickup} />
          <Text style={{ marginTop: 14, fontSize: 12.5, lineHeight: 19, color: colors.muted }}>
            Morning runs this week. Off means the trip was canceled. Delay is from the recorded trip, not a clock.
          </Text>
        </View>

        <View style={{ marginTop: 18, gap: 10 }}>
          <Action
            icon="calendar-outline"
            label={marked ? `${eta?.student_first_name || "Rider"} marked absent` : "Report an absence"}
            onPress={() => (marked ? undefined : setSheet(true))}
          />
          <Action
            icon="chatbubble-outline"
            label={`Message the office about ${eta?.student_first_name || "this rider"}`}
            onPress={() => router.push("/(guardian)/message")}
          />
        </View>
      </ScrollView>
      <AbsenceSheet
        visible={sheet}
        rider={eta?.student_first_name || name}
        stop={eta?.stop_name}
        busy={absent.isPending}
        onClose={() => setSheet(false)}
        onConfirm={({ note, scope }) =>
          absent.mutate({ student_id: id, note, scope }, { onSuccess: () => setSheet(false) })
        }
      />
    </View>
  );
}

function StopRow({ title, subtitle, up }: { title: string; subtitle: string; up?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 13, borderTopWidth: up ? 0 : 1, borderTopColor: colors.hairline }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: up ? colors.primarySoft : colors.hairline,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={up ? "arrow-up" : "arrow-down"} size={16} color={up ? colors.primary : colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.ink }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.muted }}>{subtitle}</Text>
      </View>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 52,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 15,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Ionicons name={icon} size={17} color={colors.primary} />
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function WeekStrip({
  history,
  scheduled,
}: {
  history: { service_date: string; delay_seconds: number; status: string }[];
  scheduled?: string | null;
}) {
  const days = ["M", "T", "W", "T", "F"];
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {days.map((d, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const key = date.toISOString().slice(0, 10);
        const row = history.find((h) => String(h.service_date).slice(0, 10) === key);
        const isToday = date.toDateString() === today.toDateString();
        const future = date > today;
        const canceled = row?.status === "canceled" || row?.status === "cancelled";
        const late = (row?.delay_seconds || 0) >= 180;
        const label = future
          ? "—"
          : !row
            ? "—"
            : canceled
              ? "Off"
              : late
                ? `+${Math.round((row.delay_seconds || 0) / 60)}m`
                : formatClock(scheduled) === "—"
                  ? "On"
                  : formatClock(scheduled);
        return (
          <View key={`${d}-${i}`} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: isToday ? colors.ink : colors.faint }}>{d}</Text>
            <View
              style={{
                marginTop: 8,
                height: 34,
                width: "100%",
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: future ? colors.surface : canceled ? colors.hairline : row ? colors.successSoft : colors.hairline,
                borderWidth: isToday ? 1.5 : 1,
                borderColor: isToday ? colors.primary : late ? "rgba(217,119,6,.35)" : row && !canceled ? "rgba(5,150,105,.2)" : colors.border,
                borderStyle: future ? "dashed" : "solid",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: future ? "#CBD5E1" : canceled ? colors.faint : late ? colors.warn : isToday ? colors.primary : row ? colors.success : colors.faint,
                }}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const label = {
  marginTop: 24,
  fontSize: 11.5,
  fontWeight: "700" as const,
  letterSpacing: 0.8,
  textTransform: "uppercase" as const,
  color: colors.faint,
};

const card = {
  marginTop: 12,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 14,
  overflow: "hidden" as const,
};
