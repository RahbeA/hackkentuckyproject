import type { GuardianEta } from "../types";
import type { LivePosition } from "./DistrictLiveProvider";

export function mergeEta(eta: GuardianEta, live?: LivePosition): GuardianEta {
  if (!live) return eta;
  return {
    ...eta,
    latitude: live.lat,
    longitude: live.lng,
    heading: live.heading,
    progress: live.progress,
    delay_seconds: live.delaySeconds,
    late_probability: live.lateProbability,
    p50_eta: live.p50Eta || eta.p50_eta,
    current_stop_sequence: live.currentStopSequence ?? eta.current_stop_sequence,
    stop_count: live.stopCount ?? eta.stop_count,
    status: eta.status === "unassigned" ? eta.status : live.status || eta.status || "active",
    on_time: live.delaySeconds < 180,
  };
}
