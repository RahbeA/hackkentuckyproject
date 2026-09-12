import { Text, View } from "react-native";
import { Button } from "../ui/Button";
import { colors, uiFont } from "../../theme";

export type Guidance = {
  instruction?: string;
  then?: string;
  next_stop_name?: string | null;
  distance_to_next_km?: number;
  eta_minutes?: number;
  remaining_stops?: number;
  upcoming_turns?: { instruction: string; street: string; distance_m: number }[];
  disclaimer?: string;
};

export function GuidanceSheet({
  live,
  lateMinutes,
  guidance,
  nextStopName,
  riders,
  hidePractice,
  practicing,
  onArrive,
  onBoarded,
  onPractice,
  onStopPractice,
}: {
  live: boolean;
  lateMinutes: number;
  guidance?: Guidance | null;
  nextStopName?: string | null;
  riders: string[];
  hidePractice: boolean;
  practicing: boolean;
  onArrive: () => void;
  onBoarded: () => void;
  onPractice: () => void;
  onStopPractice: () => void;
}) {
  const instruction = guidance?.instruction || (live ? "Continue along the route" : "Waiting for the run to start");
  const then = guidance?.then;
  const stop = nextStopName || guidance?.next_stop_name || "Next stop";
  const miles = guidance?.distance_to_next_km != null ? (guidance.distance_to_next_km * 0.621371).toFixed(1) : null;
  const eta = guidance?.eta_minutes;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 18,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: live ? "rgba(220,38,38,.08)" : colors.field,
            borderRadius: 99,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: live ? colors.danger : colors.faint }} />
          <Text style={{ ...uiFont, fontSize: 12, fontWeight: "700", color: live ? colors.danger : colors.muted }}>
            {live ? "Live demo" : "Not moving yet"}
          </Text>
        </View>
        <Text style={{ ...uiFont, marginLeft: "auto", fontSize: 13, fontWeight: "700", color: lateMinutes > 0 ? colors.warn : colors.success }}>
          {lateMinutes > 0 ? `+${lateMinutes} min` : "On time"}
        </Text>
      </View>

      <Text style={{ ...uiFont, fontSize: 13, fontWeight: "600", color: colors.muted }}>
        {live ? "Next turn — follow this on the map" : "Directions appear when the district starts the live demo"}
      </Text>
      <Text style={{ ...uiFont, marginTop: 6, fontSize: 22, fontWeight: "700", lineHeight: 28, color: colors.ink }}>
        {instruction}
      </Text>
      {then ? (
        <Text style={{ ...uiFont, marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.muted }}>Then {then}</Text>
      ) : null}

      <View style={{ marginTop: 16, flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...uiFont, fontSize: 12, fontWeight: "600", color: colors.faint }}>Next stop</Text>
          <Text style={{ ...uiFont, marginTop: 4, fontSize: 15, fontWeight: "600", color: colors.ink }}>{stop}</Text>
          <Text style={{ ...uiFont, marginTop: 2, fontSize: 13, color: colors.muted }}>
            {[miles ? `${miles} mi` : null, eta != null ? `${eta} min` : null].filter(Boolean).join("  ·  ") || "Updating"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...uiFont, fontSize: 12, fontWeight: "600", color: colors.faint }}>Pickup here</Text>
          <Text style={{ ...uiFont, marginTop: 4, fontSize: 15, fontWeight: "600", color: colors.ink }}>
            {riders.length ? riders.join(", ") : "—"}
          </Text>
        </View>
      </View>

      {live ? (
        <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Arrive at stop" variant="secondary" onPress={onArrive} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="All boarded" onPress={onBoarded} />
          </View>
        </View>
      ) : null}

      {!hidePractice ? (
        <View style={{ marginTop: 12 }}>
          {practicing ? (
            <Button label="Stop practice" variant="secondary" onPress={onStopPractice} />
          ) : (
            <Button label="Practice this route" variant="ghost" onPress={onPractice} />
          )}
        </View>
      ) : null}

      <Text style={{ ...uiFont, marginTop: 12, fontSize: 12, lineHeight: 17, color: colors.faint }}>
        Simulated GPS for the demo. Not certified school-bus navigation.
      </Text>
    </View>
  );
}
