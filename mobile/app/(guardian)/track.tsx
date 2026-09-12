import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useAbsentToday, useEtas, useGuardianTrip, useMarkAbsent } from "../../src/api/hooks";
import { useDistrictLive } from "../../src/live/DistrictLiveProvider";
import { mergeEta } from "../../src/live/mergeEta";
import { AbsenceSheet } from "../../src/components/AbsenceSheet";
import { EtaClock } from "../../src/components/track/EtaClock";
import { RideLiveCard } from "../../src/components/track/RideLiveCard";
import { LiveMap } from "../../src/components/track/LiveMap";
import { StopTimeline } from "../../src/components/track/StopTimeline";
import { Button } from "../../src/components/ui/Button";
import { Chip } from "../../src/components/ui/Chip";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { delayLabel } from "../../src/format";
import { colors } from "../../src/theme";

export default function Track() {
  const { rider } = useLocalSearchParams<{ rider?: string }>();
  const { data: etas } = useEtas();
  const { positions } = useDistrictLive();
  const selected = useMemo(() => {
    if (!etas?.length) return undefined;
    const raw = etas.find((e) => e.student_id === rider) || etas.find((e) => e.trip_id) || etas[0];
    return raw ? mergeEta(raw, raw.trip_id ? positions[raw.trip_id] : undefined) : undefined;
  }, [etas, rider, positions]);
  const { data: trip } = useGuardianTrip(selected?.student_id);
  const absent = useMarkAbsent();
  const { data: absentIds } = useAbsentToday();
  const [sheet, setSheet] = useState(false);
  const marked = Boolean(selected && absentIds?.includes(selected.student_id));

  const late = selected ? !selected.on_time && selected.delay_seconds >= 180 : false;
  const path = (trip?.path || []).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  const stops = (trip?.stops || []).map((s) => ({
    ...s,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
  }));
  const myStop = stops.find((s) => s.sequence === (selected?.my_stop_sequence ?? trip?.my_stop_sequence));
  const liveBus =
    selected?.latitude != null && selected?.longitude != null
      ? { latitude: Number(selected.latitude), longitude: Number(selected.longitude) }
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        back
        title={selected ? `${selected.student_first_name} · ${selected.route_code || "Bus"}` : "Track"}
        right={
          selected ? (
            <Chip label={delayLabel(selected)} tone={late ? "warn" : "success"} />
          ) : undefined
        }
      />
      <ScrollView>
        <LiveMap
          bus={liveBus}
          heading={selected?.heading}
          progress={selected?.progress}
          path={path}
          stops={stops}
          myStopId={myStop?.id}
          title={selected ? `${selected.student_first_name} · ${selected.route_code || "Bus"}` : "Live map"}
        />
        {!liveBus ? (
          <Text style={{ paddingHorizontal: 22, paddingTop: 10, fontSize: 13, color: colors.muted }}>
            Waiting for the bus to roll. The route is shown; the pin appears when the district starts the live demo.
          </Text>
        ) : null}
        <View style={{ padding: 22, paddingBottom: 36 }}>
          {selected?.trip_id ? (
            <View style={{ marginBottom: 22 }}>
              <RideLiveCard eta={selected} />
              <Text style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18, color: colors.muted }}>
                Lock the phone to see the Uber-style ride card under the clock. The banner you get when it runs late is a
                normal notification — the Live Activity is the dark pickup card.
              </Text>
            </View>
          ) : null}
          <EtaClock
            eta={selected?.p50_eta || trip?.current_p50_eta}
            stop={selected?.stop_name || trip?.my_stop_name}
            scheduled={selected?.scheduled_pickup}
          />
          <View style={{ marginTop: 24 }}>
            <StopTimeline
              stops={trip?.stops || []}
              current={selected?.current_stop_sequence || trip?.current_stop_sequence || 0}
              mine={selected?.my_stop_sequence ?? trip?.my_stop_sequence}
              rider={selected?.student_first_name}
            />
          </View>
          {selected ? (
            <View style={{ marginTop: 18, gap: 10 }}>
              <Button
                label={marked ? `${selected.student_first_name} marked absent` : `Mark ${selected.student_first_name} absent`}
                variant={marked ? "secondary" : "primary"}
                onPress={() => {
                  if (!marked) setSheet(true);
                }}
              />
              {marked ? (
                <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.muted }}>
                  Dispatch and the driver have been told {selected.student_first_name} is not riding today. The stop stays
                  on the route for other riders.
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={{ marginTop: 18, color: colors.muted }}>No rider to track yet. Link a rider from Settings.</Text>
          )}
        </View>
      </ScrollView>
      {selected ? (
        <AbsenceSheet
          visible={sheet}
          rider={selected.student_first_name}
          stop={selected.stop_name}
          busy={absent.isPending}
          onClose={() => setSheet(false)}
          onConfirm={({ note, scope }) =>
            absent.mutate(
              { student_id: selected.student_id, note, scope },
              { onSuccess: () => setSheet(false) },
            )
          }
        />
      ) : null}
    </View>
  );
}
