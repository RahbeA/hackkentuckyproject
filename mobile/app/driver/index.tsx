import { Link, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View, FlatList } from "react-native";
import { api } from "../../src/api/client";
import { useDemoStatus } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/AuthProvider";
import { useDistrictLive } from "../../src/live/DistrictLiveProvider";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { colors, shadow, uiFont } from "../../src/theme";

type TripRow = {
  id: string;
  route_code: string;
  school_name?: string;
  status: string;
  current_delay_seconds: number;
  is_simulated?: boolean;
};

export default function DriverHome() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { positions, connected } = useDistrictLive();
  const { data: demo } = useDemoStatus(user?.district);
  const { data, isLoading, error } = useQuery({
    queryKey: ["driver-trips"],
    queryFn: async () => (await api.get("/trips/")).data,
    refetchInterval: 5000,
  });
  const rows: TripRow[] = data?.results || [];
  const liveIds = new Set(demo?.trip_ids || []);
  const liveRow = rows.find((t) => liveIds.has(t.id) || positions[t.id]);
  const live = Boolean(demo?.running && liveRow);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Today's run"
        subtitle={user?.district_name || "Assigned routes only"}
        right={
          <Pressable
            onPress={async () => {
              await signOut();
              router.replace("/welcome");
            }}
            hitSlop={8}
          >
            <Text style={{ ...uiFont, fontSize: 13, fontWeight: "600", color: colors.primary }}>Sign out</Text>
          </Pressable>
        }
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 22, paddingBottom: 36, gap: 12 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 8, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ ...uiFont, fontSize: 26, fontWeight: "700", color: colors.ink, flex: 1 }}>
                {live ? "Live now" : connected ? "Waiting for dispatch" : "Your routes"}
              </Text>
              {live ? (
                <View style={{ backgroundColor: "rgba(220,38,38,.08)", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ ...uiFont, fontSize: 11, fontWeight: "700", color: colors.danger }}>Live</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ ...uiFont, fontSize: 14, lineHeight: 21, color: colors.muted }}>
              {live
                ? "The district live demo is moving your bus. Open drive to follow the map and the next turn."
                : "The bus moves when an admin starts the live demo. You do not start the run from here."}
            </Text>
            {liveRow && live ? (
              <Pressable
                onPress={() => router.push(`/driver/${liveRow.id}`)}
                style={{
                  backgroundColor: colors.night,
                  borderRadius: 16,
                  padding: 18,
                  ...shadow.card,
                }}
              >
                <Text style={{ ...uiFont, fontSize: 11.5, fontWeight: "700", color: "rgba(255,255,255,.55)" }}>
                  {liveRow.school_name || "Route"}
                </Text>
                <Text style={{ ...uiFont, marginTop: 4, fontSize: 28, fontWeight: "700", color: colors.white }}>
                  {liveRow.route_code}
                </Text>
                <Text style={{ ...uiFont, marginTop: 8, fontSize: 14, fontWeight: "600", color: colors.white }}>
                  Open live directions
                  {(liveRow.current_delay_seconds || 0) >= 180
                    ? ` · +${Math.round(liveRow.current_delay_seconds / 60)} min`
                    : ""}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const moving = Boolean(positions[item.id]) || (demo?.running && liveIds.has(item.id));
          const late = (item.current_delay_seconds || 0) >= 180;
          return (
            <Link href={`/driver/${item.id}`} asChild>
              <Pressable
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  padding: 16,
                  minHeight: 72,
                  ...shadow.card,
                }}
              >
                <Text style={{ ...uiFont, fontSize: 11.5, fontWeight: "700", color: colors.primary }}>
                  {item.school_name || "Route"}
                </Text>
                <Text style={{ ...uiFont, marginTop: 4, fontSize: 18, fontWeight: "700", color: colors.ink }}>{item.route_code}</Text>
                <Text style={{ ...uiFont, marginTop: 4, fontSize: 13, color: colors.muted }}>
                  {moving ? "Live now" : item.status.replace("_", " ")}
                  {item.is_simulated || moving ? " · simulated GPS" : ""}
                  {late ? ` · +${Math.round(item.current_delay_seconds / 60)} min` : ""}
                </Text>
              </Pressable>
            </Link>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <Text style={{ color: colors.muted }}>Loading…</Text>
          ) : error ? (
            <Text style={{ color: colors.danger }}>Could not load trips.</Text>
          ) : (
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                padding: 18,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>No assigned trips</Text>
              <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.muted }}>
                A planner needs to publish a plan that includes your driver profile. After that, dispatch starts the live
                demo and your run appears here.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
