import { useEffect, useMemo, useState } from "react";
import { useEtas, useNotificationPrefs, useNotifications } from "../api/hooks";
import { useDistrictLive } from "../live/DistrictLiveProvider";
import { mergeEta } from "../live/mergeEta";
import { useRideLiveActivity } from "../live/useRideLiveActivity";
import { ridersFromEtas, syncWidgetSnapshot } from "../widgets/snapshot";
import { ensureNotificationSetup, requestPermission } from "./push";
import { useGuardianAlerts, useNotificationRouting } from "./useGuardianAlerts";

/** Permissions, lock-screen alerts, tap routing, and home-screen widget sync. */
export function GuardianLive() {
  const { data: etas } = useEtas();
  const { data: notes } = useNotifications();
  const { data: prefs } = useNotificationPrefs();
  const { positions } = useDistrictLive();
  const [allowed, setAllowed] = useState(false);
  const toggles = prefs || { eta: true, delay: true, school: false };
  const wantsAlerts = toggles.eta || toggles.delay || toggles.school;
  const liveEta = useMemo(() => {
    const merged = (etas || []).map((e) => mergeEta(e, e.trip_id ? positions[e.trip_id] : undefined));
    return (
      merged.find((e) => e.status === "active" || (e.trip_id && positions[e.trip_id || ""])) ||
      merged.find((e) => e.status === "completed" && e.trip_id)
    );
  }, [etas, positions]);

  useNotificationRouting();
  useGuardianAlerts(etas, notes, toggles, allowed && wantsAlerts);
  useRideLiveActivity(liveEta);

  useEffect(() => {
    void ensureNotificationSetup();
  }, []);

  useEffect(() => {
    if (!wantsAlerts) return;
    void requestPermission().then(setAllowed);
  }, [wantsAlerts]);

  useEffect(() => {
    const riders = ridersFromEtas(etas);
    if (riders.length) void syncWidgetSnapshot(riders);
  }, [etas]);

  return null;
}
