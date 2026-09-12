import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "../../src/api/client";
import { useDemoStatus } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/AuthProvider";
import { GuidanceSheet } from "../../src/components/drive/GuidanceSheet";
import { LiveMap } from "../../src/components/track/LiveMap";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { Chip } from "../../src/components/ui/Chip";
import { useDistrictLive } from "../../src/live/DistrictLiveProvider";
import { colors, uiFont } from "../../src/theme";

type Stop = { id: string; name: string; kind?: string; sequence: number; latitude: string; longitude: string };
type ManifestStop = { stop_id: string; stop_name: string; students: { id: string; first_name: string; last_name: string }[] };

export default function DriverTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = String(id || "");
  const qc = useQueryClient();
  const { user } = useAuth();
  const { positions } = useDistrictLive();
  const { data: demo } = useDemoStatus(user?.district);
  const socket = positions[tripId];
  const demoListsThisTrip = Boolean(demo?.running && (demo.trip_ids || []).includes(tripId));
  const live = Boolean(socket || demoListsThisTrip);

  const { data: trip } = useQuery({
    queryKey: ["trip", tripId],
    enabled: Boolean(tripId),
    queryFn: async () => (await api.get(`/trips/${tripId}/`)).data,
    refetchInterval: 4000,
  });
  const { data: manifest } = useQuery({
    queryKey: ["manifest", tripId],
    enabled: Boolean(tripId),
    queryFn: async () => (await api.get(`/trips/${tripId}/manifest/`)).data as ManifestStop[],
  });

  const act = (path: string, body: object = {}) =>
    api.post(`/trips/${tripId}/${path}`, body).then(() => qc.invalidateQueries({ queryKey: ["trip", tripId] }));

  const [practice, setPractice] = useState(false);
  const tRef = useRef(0);
  useEffect(() => {
    if (!practice || live) return;
    const handle = setInterval(async () => {
      const next = Math.min(0.98, tRef.current + 0.04);
      tRef.current = next;
      if (next >= 0.98) {
        setPractice(false);
        return;
      }
      await api.post(`/trips/${tripId}/simulate-step/`, { t: next });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    }, 2200);
    return () => clearInterval(handle);
  }, [practice, live, tripId, qc]);

  useEffect(() => {
    if (live && practice) setPractice(false);
  }, [live, practice]);

  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incident, setIncident] = useState("");
  const report = useMutation({
    mutationFn: () =>
      api.post("/incidents/", { trip: tripId, type: "other", severity: "medium", description: incident || "Driver report" }),
    onSuccess: () => {
      setIncident("");
      setIncidentOpen(false);
    },
  });

  const stops: Stop[] = trip?.stops || [];
  const path = (trip?.path || []).map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }));
  const mappedStops = stops.map((s) => ({
    ...s,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
  }));
  const bus =
    socket
      ? { latitude: socket.lat, longitude: socket.lng }
      : trip?.last_position
        ? { latitude: Number(trip.last_position.latitude), longitude: Number(trip.last_position.longitude) }
        : null;
  const heading = socket?.heading ?? Number(trip?.last_position?.heading || 0);
  const g = trip?.guidance;
  const nextName = socket?.nextStopName || g?.next_stop_name;
  const nextStop = useMemo(() => {
    if (g?.next_stop_id) return stops.find((s) => s.id === g.next_stop_id);
    if (nextName) return stops.find((s) => s.name === nextName);
    const seq = socket?.currentStopSequence ?? trip?.current_stop_sequence ?? 0;
    return stops.find((s) => s.sequence > seq && s.kind !== "depot") || stops.find((s) => s.kind === "school");
  }, [g?.next_stop_id, nextName, stops, socket?.currentStopSequence, trip?.current_stop_sequence]);
  const ridersHere = (manifest || []).find((m) => m.stop_id === nextStop?.id)?.students.map((s) => s.first_name) || [];
  const delay = socket?.delaySeconds ?? trip?.current_delay_seconds ?? 0;
  const lateMinutes = delay >= 180 ? Math.round(delay / 60) : 0;

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader back title="Live directions" />
        <Text style={{ ...uiFont, padding: 22, color: colors.muted }}>Loading your route…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        back
        title={live ? "Live directions" : "Route preview"}
        subtitle={`${trip.route_code}  ·  ${trip.school_name || "School"}`}
        right={<Chip label={lateMinutes ? `+${lateMinutes} min` : live ? "On the road" : "Parked"} tone={lateMinutes ? "warn" : live ? "success" : "neutral"} />}
      />
      <View style={{ flex: 1 }}>
        <LiveMap
          bus={bus}
          heading={heading}
          progress={socket?.progress}
          path={path}
          stops={mappedStops}
          myStopId={nextStop?.id}
          title={nextName ? `Next: ${nextName}` : trip.route_code}
          follow={Boolean(bus && live)}
          fill
        />
      </View>
      <GuidanceSheet
        live={live}
        lateMinutes={lateMinutes}
        guidance={g}
        nextStopName={nextName}
        riders={ridersHere}
        hidePractice={live}
        practicing={practice}
        onArrive={() => nextStop && void act("arrive-stop/", { route_stop_id: nextStop.id })}
        onBoarded={() =>
          nextStop &&
          void act("depart-stop/", {
            route_stop_id: nextStop.id,
            boarded_count: ridersHere.length,
            absent_count: 0,
          })
        }
        onPractice={async () => {
          tRef.current = 0.01;
          try {
            await act("start/");
          } catch {
            /* already active */
          }
          await api.post(`/trips/${tripId}/simulate-step/`, { t: 0.01 });
          setPractice(true);
        }}
        onStopPractice={() => setPractice(false)}
      />
      {live ? (
        <Pressable onPress={() => setIncidentOpen((v) => !v)} style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
          <Text style={{ ...uiFont, textAlign: "center", fontSize: 13, fontWeight: "600", color: colors.primary }}>
            {incidentOpen ? "Hide incident" : "Report an incident"}
          </Text>
        </Pressable>
      ) : null}
      {incidentOpen ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
          <TextInput
            placeholder="What happened?"
            placeholderTextColor={colors.faint}
            value={incident}
            onChangeText={setIncident}
            style={{
              ...uiFont,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.ink,
              minHeight: 48,
            }}
          />
          <Pressable
            onPress={() => report.mutate()}
            style={{ minHeight: 46, borderRadius: 10, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ ...uiFont, color: colors.white, fontWeight: "600" }}>{report.isPending ? "Sending…" : "Send to dispatch"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
