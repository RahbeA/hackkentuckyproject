import type { GuardianEta } from "./types";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function greeting() {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `${weekday} ${part}`;
}

/** "07:42:00" or ISO → { clock: "7:42", period: "AM" } */
export function splitClock(value?: string | null) {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : parseTimeOnly(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return { clock: `${hours}:${String(minutes).padStart(2, "0")}`, period, date };
}

function parseTimeOnly(value: string) {
  const [h, m, s] = value.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return null;
  const d = new Date();
  d.setHours(h, m || 0, s || 0, 0);
  return d;
}

export function formatClock(value?: string | null) {
  const parts = splitClock(value);
  return parts ? `${parts.clock} ${parts.period}` : "—";
}

export function delayLabel(eta: Pick<GuardianEta, "on_time" | "delay_seconds">) {
  const mins = Math.max(0, Math.round((eta.delay_seconds || 0) / 60));
  if (eta.on_time || mins === 0) return "On time";
  return `+${mins} min`;
}

export function stopsAway(eta: GuardianEta) {
  if (eta.my_stop_sequence == null) return null;
  return Math.max(0, eta.my_stop_sequence - (eta.current_stop_sequence || 0));
}

export function stopsAwayLabel(eta: GuardianEta) {
  const n = stopsAway(eta);
  if (n == null) return eta.status === "unassigned" ? "Not assigned" : "Scheduled";
  if (n === 0) return "At your stop";
  if (n === 1) return "1 stop away";
  return `${n} stops away`;
}

export function progress(eta: GuardianEta) {
  if (!eta.stop_count) return 0.08;
  return Math.min(0.95, Math.max(0.08, (eta.current_stop_sequence || 0) / eta.stop_count));
}

export function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function isToday(iso?: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function childName(child: { first_name: string; last_name?: string | null }) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

export function stubEta(child: { id: string; first_name: string; school_name?: string | null }): GuardianEta {
  return {
    student_id: child.id,
    student_first_name: child.first_name,
    stop_name: null,
    scheduled_pickup: null,
    status: "scheduled",
    delay_seconds: 0,
    p50_eta: null,
    is_simulated: false,
    on_time: true,
    trip_id: null,
    route_code: null,
    school_name: child.school_name || null,
    current_stop_sequence: 0,
    stop_count: 0,
    my_stop_sequence: null,
    late_probability: 0,
    latitude: null,
    longitude: null,
    heading: null,
  };
}
