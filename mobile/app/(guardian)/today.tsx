import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useChildren, useEtas, useNotifications } from "../../src/api/hooks";
import { useDistrictLive } from "../../src/live/DistrictLiveProvider";
import { mergeEta } from "../../src/live/mergeEta";
import { RiderCard } from "../../src/components/RiderCard";
import { RideLiveCard } from "../../src/components/track/RideLiveCard";
import { DartLogo } from "../../src/components/brand/DartLogo";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { greeting, stubEta } from "../../src/format";
import { colors, fonts } from "../../src/theme";

export default function Today() {
  const router = useRouter();
  const { data: etas } = useEtas();
  const { data: children } = useChildren();
  const { data: notes } = useNotifications();
  const { positions, connected } = useDistrictLive();
  const etaByStudent = new Map((etas || []).map((e) => [e.student_id, e]));
  const kids = children?.length ? children : [];
  const riders = kids.length
    ? kids.map((c) => {
        const raw = etaByStudent.get(c.id) || stubEta(c);
        return mergeEta(raw, raw.trip_id ? positions[raw.trip_id] : undefined);
      })
    : (etas || []).map((e) => mergeEta(e, e.trip_id ? positions[e.trip_id] : undefined));
  const unread = (notes || []).some((n) => !n.is_read);
  const latest = (notes || [])[0];
  const liveRider = riders.find((e) => e.status === "active" || (e.trip_id && positions[e.trip_id]));
  const onRoad = riders.filter((e) => e.status === "active" || (e.trip_id && positions[e.trip_id])).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        left={<DartLogo />}
        right={
          <Pressable
            accessibilityLabel="Updates"
            onPress={() => router.push("/(guardian)/updates")}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="notifications-outline" size={17} color={colors.muted} />
            {unread ? (
              <View
                style={{
                  position: "absolute",
                  top: 7,
                  right: 8,
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  backgroundColor: colors.warn,
                  borderWidth: 1.5,
                  borderColor: colors.white,
                }}
              />
            ) : null}
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 36 }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 27, letterSpacing: -0.6, color: colors.ink }}>{greeting()}</Text>
        <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.muted }}>
          {riders.length === 0
            ? "No riders are linked yet. Enter a rider code (like AVA001) — that is not the district join code."
            : onRoad
              ? `${onRoad} rider${onRoad === 1 ? "" : "s"} on the road. Estimates update as the buses move.`
              : connected
                ? "Waiting for the district to start the live demo. Your rider's bus will appear here."
                : "Estimates update as the buses move."}
        </Text>

        {liveRider ? (
          <View style={{ marginTop: 20 }}>
            <RideLiveCard eta={liveRider} />
          </View>
        ) : null}

        <View style={{ marginTop: 20, gap: 12 }}>
          {riders.map((e) => (
            <RiderCard
              key={e.student_id}
              eta={e}
              onTrack={() => router.push({ pathname: "/(guardian)/track", params: { rider: e.student_id } })}
              onPress={() => router.push(`/(guardian)/rider/${e.student_id}`)}
            />
          ))}
          {!riders.length && !children?.length ? (
            <Pressable
              onPress={() => router.push("/(guardian)/link")}
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                padding: 18,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>Link a rider</Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: colors.muted }}>
                Enter the rider code from Students (AVA001), not the district join code. Their bus appears when the
                live demo starts.
              </Text>
            </Pressable>
          ) : null}
        </View>

        {latest ? (
          <>
            <View style={{ marginTop: 24, flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.faint }}>
                Latest update
              </Text>
              <Pressable onPress={() => router.push("/(guardian)/updates")} style={{ marginLeft: "auto" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>See all</Text>
              </Pressable>
            </View>
            <View
              style={{
                marginTop: 12,
                flexDirection: "row",
                gap: 12,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <View
                style={{
                  marginTop: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  backgroundColor: latest.is_read ? colors.faint : colors.warn,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{latest.title}</Text>
                <Text style={{ marginTop: 5, fontSize: 13, lineHeight: 20, color: colors.muted }}>{latest.body}</Text>
              </View>
            </View>
          </>
        ) : null}

        <Text style={{ marginTop: 20, fontSize: 11.5, lineHeight: 18, color: colors.faint }}>
          Private arrival estimates. Other students are never shown. Demo data.
        </Text>
      </ScrollView>
    </View>
  );
}
