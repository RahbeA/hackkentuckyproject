import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import type { AppNotification, GuardianEta } from "../types";
import { delayLabel, formatClock, stopsAway } from "../format";
import { sendDartNotice } from "./push";

type Prefs = { eta: boolean; delay: boolean; school: boolean };

const EMERGENCY_ALERT_TYPES = new Set(["accident", "breakdown", "running_late", "other"]);

function isGuardianEmergency(note: AppNotification) {
  const payloadType = typeof note.payload?.alert_type === "string" ? note.payload.alert_type : "";
  return note.event_type === "alert.guardian" || EMERGENCY_ALERT_TYPES.has(payloadType);
}

export function useGuardianAlerts(
  etas: GuardianEta[] | undefined,
  notes: AppNotification[] | undefined,
  prefs: Prefs,
  enabled: boolean,
) {
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !etas?.length) return;
    for (const eta of etas) {
      const late = !eta.on_time && (eta.delay_seconds || 0) >= 180;
      const lateKey = `delay:${eta.student_id}:${eta.trip_id || "none"}`;
      if (prefs.delay && late && !seen.current.has(lateKey)) {
        seen.current.add(lateKey);
        void sendDartNotice({
          title: `${eta.route_code || "Route"} is running late`,
          body: `${delayLabel(eta)}. ${eta.student_first_name}'s pickup at ${eta.stop_name || "the stop"} is now ${formatClock(eta.p50_eta || eta.scheduled_pickup)}.`,
          kind: "delay",
          screen: "track",
          studentId: eta.student_id,
        });
      }
      const away = stopsAway(eta);
      const etaKey = `eta:${eta.student_id}:${eta.trip_id || "none"}`;
      if (prefs.eta && away === 1 && !seen.current.has(etaKey)) {
        seen.current.add(etaKey);
        void sendDartNotice({
          title: `${eta.student_first_name} is one stop away`,
          body: `Arriving at ${eta.stop_name || "your stop"} around ${formatClock(eta.p50_eta || eta.scheduled_pickup)}.`,
          kind: "eta",
          screen: "track",
          studentId: eta.student_id,
        });
      }
    }
  }, [enabled, etas, prefs.delay, prefs.eta]);

  useEffect(() => {
    if (!enabled || !notes?.length) return;
    for (const note of notes) {
      if (!isGuardianEmergency(note)) continue;
      const key = `emergency:${note.id}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      const studentId = typeof note.payload?.student_id === "string" ? note.payload.student_id : undefined;
      void sendDartNotice({
        title: note.title,
        body: note.body,
        kind: "emergency",
        screen: "updates",
        studentId,
      });
    }
  }, [enabled, notes]);

  useEffect(() => {
    if (!enabled || !prefs.school || !notes?.length) return;
    for (const note of notes) {
      if (isGuardianEmergency(note)) continue;
      const schoolish = /school|announce|office|bell|district/i.test(`${note.event_type || ""} ${note.title}`);
      if (!schoolish) continue;
      const key = `school:${note.id}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      void sendDartNotice({
        title: note.title,
        body: note.body,
        kind: "school",
        screen: "updates",
      });
    }
  }, [enabled, notes, prefs.school]);
}

export function useNotificationRouting() {
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { screen?: string; studentId?: string };
      if (data.screen === "track") {
        router.push({ pathname: "/(guardian)/track", params: data.studentId ? { rider: data.studentId } : {} });
      } else if (data.screen === "today") {
        router.push("/(guardian)/today");
      } else {
        router.push("/(guardian)/updates");
      }
    });
    return () => sub.remove();
  }, [router]);
}
