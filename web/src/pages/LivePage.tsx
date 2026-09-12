import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, CircleDot, Flag, Maximize2, Minimize2, Play, Radio, Square, TriangleAlert, X } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { RouteMap, type MapLine, type MapPoint } from "../components/maps/RouteMap";
import { useLiveOps, type LiveEvent, type LivePosition } from "../live/LiveOpsProvider";
import { interpolateAlong, snapToPath, type RouteCoord } from "../utils/routePath";

const STAFF_CONTROL: string[] = ["platform_admin", "district_admin", "planner", "dispatcher"];

/** Distinct per-route palette — status is a badge, not the line color. */
const ROUTE_PALETTE = [
  "#2563EB",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
  "#EA580C",
  "#4F46E5",
  "#0D9488",
  "#C026D3",
];

/** Stable color from route code only (list + map always match). */
function routeColor(routeCode: string): string {
  let hash = 0;
  for (let i = 0; i < routeCode.length; i++) hash = (hash * 31 + routeCode.charCodeAt(i)) >>> 0;
  return ROUTE_PALETTE[hash % ROUTE_PALETTE.length];
}

function asPath(raw?: [number, number][] | null): RouteCoord[] {
  if (!raw || raw.length < 2) return [];
  return raw
    .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [Number(c[0]), Number(c[1])] as RouteCoord);
}

function delayLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min <= 0) return "On time";
  return `+${min} min`;
}

function statusLabel(delay: number, lateProb: number): { text: string; cls: string } {
  if (delay >= 180) return { text: delayLabel(delay), cls: "text-bad" };
  if (lateProb >= 0.45) return { text: "At risk", cls: "text-warn" };
  if (lateProb >= 0.25) return { text: "Watch", cls: "text-warn" };
  return { text: "On time", cls: "text-good" };
}

function etaClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

function tone(lateProb: number, delay: number): { color: string; late: boolean } {
  const late = lateProb >= 0.45 || delay >= 180;
  return { color: late ? "#DC2626" : lateProb >= 0.25 ? "#D97706" : "#2563EB", late };
}

function relTime(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

/* ------------------------------------------------------------------ */
/* Live status pill + connection indicator                            */
/* ------------------------------------------------------------------ */
function LivePill({ running, connected }: { running: boolean; connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-bold ${
        running ? "border-bad/25 bg-bad/[0.06] text-bad" : "border-line bg-paper text-slate"
      }`}
    >
      <span className={`relative h-[7px] w-[7px] rounded-full ${running ? "bg-bad" : connected ? "bg-good" : "bg-muted"}`}>
        {running && <span className="absolute -inset-[3px] rounded-full bg-bad animate-dartPing" />}
      </span>
      {running ? "LIVE" : connected ? "Connected" : "Connecting…"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Staff / operations view                                            */
/* ------------------------------------------------------------------ */
interface DashTrip {
  id: string;
  route_code: string;
  school_name: string;
  status: string;
  current_delay_seconds: number;
  current_stop_sequence: number;
  stop_count: number;
  late_probability: number;
  current_p50_eta: string | null;
  last_position?: { latitude: string; longitude: string; heading?: number };
  path?: [number, number][];
}

type MergedTrip = DashTrip & {
  lat: number | null;
  lng: number | null;
  heading: number;
  delay: number;
  lateProb: number;
  seq: number;
  stopCount: number;
  live: boolean;
  color: string;
  routePath: RouteCoord[];
  progress: number;
};

function StaffLive({ districtId, canControl }: { districtId: string; canControl: boolean }) {
  const qc = useQueryClient();
  const { positions, events, connected, clearFeed } = useLiveOps();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  useEffect(() => {
    if (!mapFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mapFullscreen]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", districtId],
    queryFn: async () => (await api.get(`/districts/${districtId}/dashboard/`)).data,
    refetchInterval: 7000,
  });

  const { data: status } = useQuery({
    queryKey: ["demo-status", districtId],
    queryFn: async () => (await api.get(`/districts/${districtId}/demo/status/`)).data,
    refetchInterval: 3000,
    retry: 1,
  });
  const running = Boolean(status?.running);

  const start = useMutation({
    mutationFn: () => api.post(`/districts/${districtId}/demo/start/`),
    onSuccess: () => {
      clearFeed();
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["demo-status", districtId] });
      qc.invalidateQueries({ queryKey: ["dashboard", districtId] });
      qc.invalidateQueries({ queryKey: ["guardian", "etas"] });
    },
  });
  const stop = useMutation({
    mutationFn: () => api.post(`/districts/${districtId}/demo/stop/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-status", districtId] });
      qc.invalidateQueries({ queryKey: ["dashboard", districtId] });
    },
  });

  const trips: DashTrip[] = data?.live_trips || [];

  const merged: MergedTrip[] = useMemo(
    () =>
      trips.map((t) => {
        const live = positions[t.id];
        const routePath = asPath(t.path);
        const rawLat = live ? live.lat : t.last_position ? Number(t.last_position.latitude) : null;
        const rawLng = live ? live.lng : t.last_position ? Number(t.last_position.longitude) : null;
        const delay = live ? live.delaySeconds : t.current_delay_seconds;
        const lateProb = live ? live.lateProbability : t.late_probability;
        const seq = live ? live.currentStopSequence : t.current_stop_sequence;
        const stopCount = live?.stopCount || t.stop_count;

        let progress =
          live?.progress != null
            ? live.progress
            : stopCount > 0
              ? Math.min(0.98, Math.max(0, (seq || 0) / stopCount))
              : 0;

        let lat: number | null = rawLat;
        let lng: number | null = rawLng;
        let heading = live ? live.heading : Number(t.last_position?.heading || 0);

        if (routePath.length >= 2) {
          if (live?.progress == null && rawLat != null && rawLng != null) {
            const snapped = snapToPath(routePath, rawLat, rawLng);
            progress = snapped.progress;
            lat = snapped.lat;
            lng = snapped.lng;
            heading = snapped.heading;
          } else {
            const placed = interpolateAlong(routePath, progress);
            lat = placed.lat;
            lng = placed.lng;
            heading = placed.heading;
          }
        }

        return {
          ...t,
          lat,
          lng,
          heading,
          delay,
          lateProb,
          seq,
          stopCount,
          live: Boolean(live),
          color: routeColor(t.route_code),
          routePath,
          progress,
        };
      }),
    [trips, positions],
  );

  const selected = merged.find((t) => t.id === selectedId) || null;
  const focus = Boolean(selectedId);

  const points: MapPoint[] = merged
    .filter((t) => t.lat != null && t.lng != null)
    .map((t) => ({
      id: t.id,
      lat: t.lat as number,
      lng: t.lng as number,
      label: t.route_code,
      color: t.color,
      kind: "bus" as const,
      heading: t.heading,
      selected: t.id === selectedId,
      path: t.routePath.length >= 2 ? t.routePath : undefined,
      progress: t.progress,
    }));

  const lines: MapLine[] = merged
    .filter((t) => t.routePath.length >= 2)
    .map((t) => {
      const isSel = t.id === selectedId;
      return {
        id: t.id,
        coords: t.routePath,
        color: t.color,
        width: focus ? (isSel ? 8 : 3.5) : 6,
        opacity: focus ? (isSel ? 1 : 0.28) : 0.9,
      };
    });

  const follow =
    selected && selected.lat != null && selected.lng != null
      ? { lat: selected.lat, lng: selected.lng, heading: selected.heading }
      : null;

  const rolling = merged.filter((t) => t.status === "active" || t.live).length;
  const atRisk = merged.filter((t) => t.lateProb >= 0.35 || t.delay >= 180).length;
  const onTime = merged.filter((t) => t.lateProb < 0.25 && t.delay < 180).length;
  const selectedEvents = selectedId ? events.filter((e) => e.tripId === selectedId) : events;
  const pathCount = lines.length;

  const mapChrome = (
    <>
      <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-line bg-paper/95 px-3 py-1.5 text-xs font-semibold shadow-card backdrop-blur-sm">
          Live fleet map
        </span>
        <span className="rounded-lg border border-line bg-paper/90 px-2.5 py-1.5 text-[11px] font-medium text-muted backdrop-blur-sm">
          {points.length} buses · {pathCount} paths
        </span>
      </div>
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {selected && (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper/95 px-3 py-1.5 text-xs font-semibold shadow-card backdrop-blur-sm hover:bg-canvas"
          >
            <X size={12} /> Show all
          </button>
        )}
        <button
          type="button"
          onClick={() => setMapFullscreen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper/95 px-3 py-1.5 text-xs font-semibold shadow-card backdrop-blur-sm hover:bg-canvas"
          aria-label={mapFullscreen ? "Exit fullscreen map" : "Enter fullscreen map"}
        >
          {mapFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {mapFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>
    </>
  );

  const mapBoard = (
    <div
      className={
        mapFullscreen
          ? "fixed inset-0 z-[80] bg-[#0B1120]"
          : "relative min-w-0 overflow-hidden rounded-2xl border border-line bg-paper shadow-card"
      }
    >
      {mapChrome}
      {mapFullscreen && selected && (
        <div className="absolute bottom-5 left-5 z-10 w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-paper/95 shadow-float backdrop-blur-md">
          <SelectedRouteCard trip={selected} events={selectedEvents} onClose={() => setSelectedId(null)} compact />
        </div>
      )}
      {mapFullscreen && (
        <div className="absolute bottom-5 right-5 z-10 max-h-[42vh] w-[min(300px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-paper/95 shadow-float backdrop-blur-md">
          <div className="border-b border-line px-4 py-3 text-[12px] font-bold">Routes</div>
          <div className="max-h-[36vh] overflow-auto">
            {merged.map((t) => {
              const st = statusLabel(t.delay, t.lateProb);
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(active ? null : t.id)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left ${active ? "bg-accent-soft" : "hover:bg-canvas"}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{t.route_code}</span>
                  <span className={`text-[11.5px] font-semibold ${st.cls}`}>{st.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <RouteMap
        points={points}
        lines={lines}
        selectedId={selectedId}
        onSelect={setSelectedId}
        follow={follow}
        followSmooth={Boolean(selected && running)}
        smoothMarkers
        fit={!selected}
        resizeKey={mapFullscreen ? "fs" : "normal"}
        className={mapFullscreen ? "h-full w-full rounded-none border-0" : "h-[min(62vh,560px)] rounded-none border-0"}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4 animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">Live operations</h1>
          <p className="mt-1.5 max-w-[46em] text-sm leading-relaxed text-slate">
            Press Start live demo. Buses lock to their colored path — click one to follow it.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <LivePill running={running} connected={connected} />
          {canControl &&
            (running ? (
              <button className="btn-danger" onClick={() => stop.mutate()} disabled={stop.isPending}>
                <Square size={15} /> Stop demo
              </button>
            ) : (
              <button className="btn-primary" onClick={() => start.mutate()} disabled={start.isPending}>
                <Play size={15} /> {start.isPending ? "Starting…" : "Start live demo"}
              </button>
            ))}
        </div>
      </div>

      {!canControl && (
        <p className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-slate">
          View-only. A district admin, planner, or dispatcher starts the live demo — your map and feed update
          automatically when they do.
        </p>
      )}

      {(start.error || stop.error) && (
        <p className="text-sm text-bad">{errorMessage(start.error || stop.error)}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {[
            { label: "Buses rolling", value: rolling },
            { label: "On time", value: onTime, tone: "good" as const },
            { label: "At risk", value: atRisk, tone: "warn" as const },
            { label: "Progress", value: `${Math.round((status?.progress || 0) * 100)}%` },
          ].map((k, i) => (
            <div key={k.label} className={`px-[22px] py-4 ${i < 3 ? "sm:border-r border-b sm:border-b-0 border-slate-soft" : ""}`}>
              <div className="text-[12.5px] font-medium text-slate">{k.label}</div>
              <div
                className={`mt-0.5 font-display text-[28px] font-bold tabular-nums ${
                  k.tone === "good" ? "text-good" : k.tone === "warn" ? "text-warn" : "text-ink"
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!mapFullscreen && (
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
          {mapBoard}
          <div className="flex min-w-0 flex-col gap-4">
            {selected ? (
              <SelectedRouteCard trip={selected} events={selectedEvents} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
                <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
                  <Radio size={16} className="text-route" />
                  <h2 className="font-display text-base font-bold tracking-tight">Live event feed</h2>
                </div>
                <EventFeed
                  events={events}
                  empty={
                    canControl
                      ? "Press “Start live demo” to begin the run."
                      : "Waiting for staff to start the live demo…"
                  }
                />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="font-display text-base font-bold tracking-tight">Routes</h2>
                <span className="text-[11px] font-medium text-muted">{merged.length} active</span>
              </div>
              <div className="max-h-[min(42vh,360px)] overflow-auto">
                {isLoading && <p className="px-5 py-4 text-sm text-slate">Loading…</p>}
                {merged.map((t) => {
                  const st = statusLabel(t.delay, t.lateProb);
                  const active = t.id === selectedId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(active ? null : t.id)}
                      className={`flex w-full items-center gap-3 border-t border-slate-soft px-4 py-3 text-left transition-colors first:border-0 ${
                        active ? "bg-accent-soft" : "hover:bg-canvas"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                        style={{ background: t.color, boxShadow: `0 0 0 1px ${t.color}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">Route {t.route_code}</div>
                        <div className="text-[11.5px] text-slate">
                          Stop {t.seq || 0}
                          {t.stopCount ? ` of ${t.stopCount}` : ""} · {t.school_name}
                        </div>
                      </div>
                      <span className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${st.cls}`}>{st.text}</span>
                    </button>
                  );
                })}
                {!isLoading && merged.length === 0 && (
                  <p className="px-5 py-4 text-sm text-slate">No trips scheduled today.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {mapFullscreen && mapBoard}

      <p className="text-xs text-muted">Simulated GPS and synthetic predictions. Do not use to navigate a real bus.</p>
    </div>
  );
}

function SelectedRouteCard({
  trip,
  events,
  onClose,
  compact = false,
}: {
  trip: MergedTrip;
  events: LiveEvent[];
  onClose: () => void;
  compact?: boolean;
}) {
  const st = statusLabel(trip.delay, trip.lateProb);
  const progress = trip.stopCount ? Math.min(1, (trip.seq || 0) / trip.stopCount) : 0;

  return (
    <div className={compact ? "" : "overflow-hidden rounded-2xl border border-line bg-paper shadow-card"}>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: trip.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-bold tracking-tight">Route {trip.route_code}</h2>
            <span className={`text-[12px] font-bold ${st.cls}`}>{st.text}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-slate">{trip.school_name}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Clear selection">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 border-b border-line">
        <div className="border-r border-line px-4 py-3.5">
          <div className="text-[11px] font-medium text-slate">Stop progress</div>
          <div className="mt-0.5 font-display text-lg font-bold tabular-nums">
            {trip.seq || 0}
            <span className="text-sm font-semibold text-muted"> / {trip.stopCount || "—"}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-soft">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: trip.color }} />
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-[11px] font-medium text-slate">Est. arrival</div>
          <div className="mt-0.5 font-display text-lg font-bold tabular-nums">{etaClock(trip.current_p50_eta)}</div>
          <div className="mt-1 text-[11px] text-muted">{trip.live ? "On path · live" : "On path · waiting"}</div>
        </div>
      </div>

      {!compact && (
        <>
          <div className="border-b border-line px-4 py-3">
            <div className="text-[11px] font-medium text-slate">Delay</div>
            <div className={`mt-0.5 text-[15px] font-semibold tabular-nums ${st.cls}`}>{delayLabel(trip.delay)}</div>
          </div>
          <div className="px-2 pb-2 pt-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Route events</div>
            <EventFeed events={events} empty="No events for this route yet." />
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared event feed                                                  */
/* ------------------------------------------------------------------ */
function EventFeed({ events, empty }: { events: LiveEvent[]; empty: string }) {
  const toneClass: Record<LiveEvent["tone"], string> = {
    info: "text-route",
    good: "text-good",
    warn: "text-warn",
    bad: "text-bad",
  };
  const Icon: Record<LiveEvent["tone"], typeof CircleDot> = {
    info: CircleDot,
    good: Flag,
    warn: TriangleAlert,
    bad: TriangleAlert,
  };
  if (events.length === 0) return <p className="px-5 py-4 text-sm text-slate">{empty}</p>;
  return (
    <ul className="max-h-[300px] overflow-auto p-3.5">
      {events.map((e) => {
        const I = Icon[e.tone];
        return (
          <li key={e.id} className="flex items-start gap-3 rounded-[10px] px-2 py-2.5 hover:bg-canvas">
            <I size={15} className={`mt-0.5 shrink-0 ${toneClass[e.tone]}`} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">{e.title}</div>
              {e.detail && <div className="text-[11.5px] text-slate">{e.detail}</div>}
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{relTime(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Guardian / family view                                             */
/* ------------------------------------------------------------------ */
interface ChildEta {
  student_id: string;
  student_first_name: string;
  stop_name: string | null;
  scheduled_pickup: string | null;
  status: string;
  delay_seconds: number;
  p50_eta: string | null;
  on_time: boolean;
  trip_id: string | null;
  route_code: string | null;
  school_name: string | null;
  current_stop_sequence: number;
  stop_count: number;
  my_stop_sequence: number | null;
  late_probability: number;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
}

function GuardianLive() {
  const { user } = useAuth();
  const { positions, events, connected } = useLiveOps();
  const districtId = user?.district;
  const { data, isLoading } = useQuery({
    queryKey: ["guardian", "etas"],
    queryFn: async () => (await api.get("/guardian/etas/")).data as ChildEta[],
    refetchInterval: 5000,
  });
  const { data: status } = useQuery({
    queryKey: ["demo-status", districtId],
    enabled: Boolean(districtId),
    queryFn: async () => (await api.get(`/districts/${districtId}/demo/status/`)).data,
    refetchInterval: 3000,
    retry: 1,
  });

  const children = data || [];
  const anyLive = children.some((c) => c.trip_id && positions[c.trip_id]);
  const running = Boolean(status?.running) || anyLive;

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">Where's my bus?</h1>
          <p className="mt-1.5 max-w-[42em] text-sm leading-relaxed text-slate">
            This Family account only sees Ava Bennett. If the map is empty, switch back to admin and press Start live
            demo.
          </p>
        </div>
        <LivePill running={running} connected={connected} />
      </div>

      {!running && connected && (
        <p className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-slate">
          Waiting for the morning run. When a district admin starts the live demo, your riders' buses appear here
          automatically.
        </p>
      )}

      {isLoading && <p className="text-sm text-slate">Loading…</p>}
      <LinkRiderCard empty={!isLoading && children.length === 0} />

      {children.map((c) => (
        <ChildCard key={c.student_id} child={c} live={c.trip_id ? positions[c.trip_id] : undefined} events={events} />
      ))}
    </div>
  );
}

function LinkRiderCard({ empty }: { empty: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: async (riderCode: string) => (await api.post("/guardian/claim/", { code: riderCode })).data,
    onSuccess: (res) => {
      const name = res?.student?.first_name || "Rider";
      setMessage(res?.already_linked ? `${name} is already linked.` : `${name} is now linked. Their bus will appear when the live demo starts.`);
      setCode("");
      qc.invalidateQueries({ queryKey: ["guardian", "etas"] });
    },
    onError: (err) => setMessage(errorMessage(err)),
  });

  return (
    <div className="card card-body">
      {empty && <p className="mb-3 text-sm text-slate">No students are linked to your account yet. Enter the rider code from your district.</p>}
      {!empty && (
        <p className="mb-3 text-sm text-slate">Link another rider with the six-character code from Students in the district app.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (next.length < 4) return;
          setMessage(null);
          claim.mutate(next);
        }}
      >
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wider text-muted">Rider code</span>
          <input
            className="input font-mono tracking-[0.2em] uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="AVA001"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button className="btn-primary" type="submit" disabled={claim.isPending}>
          {claim.isPending ? "Linking…" : "Link rider"}
        </button>
      </form>
      {message && <p className="mt-3 text-sm text-slate">{message}</p>}
    </div>
  );
}

function ChildCard({ child, live, events }: { child: ChildEta; live?: LivePosition; events: LiveEvent[] }) {
  // Path + stops for the child's trip (fetched once; refreshed slowly).
  const { data: trip } = useQuery({
    queryKey: ["guardian-trip", child.student_id],
    queryFn: async () => (await api.get(`/guardian/trip/${child.student_id}/`)).data,
    refetchInterval: 15000,
  });

  const delay = live ? live.delaySeconds : child.delay_seconds;
  const lateProb = live ? live.lateProbability : child.late_probability;
  const seq = live ? live.currentStopSequence : child.current_stop_sequence;
  const stopCount = live?.stopCount || child.stop_count || trip?.stop_count || 0;
  const p50 = live?.p50Eta || child.p50_eta;
  const { late } = tone(lateProb, delay);

  const routePath = asPath(trip?.path);
  const progress =
    live?.progress != null
      ? live.progress
      : stopCount > 0
        ? Math.min(0.98, Math.max(0, (seq || 0) / stopCount))
        : 0;

  let busLat = live ? live.lat : child.latitude;
  let busLng = live ? live.lng : child.longitude;
  let busHeading = live ? live.heading : child.heading || 0;
  if (routePath.length >= 2) {
    if (live?.progress == null && busLat != null && busLng != null) {
      const snapped = snapToPath(routePath, busLat, busLng);
      busLat = snapped.lat;
      busLng = snapped.lng;
      busHeading = snapped.heading;
    } else {
      const placed = interpolateAlong(routePath, progress);
      busLat = placed.lat;
      busLng = placed.lng;
      busHeading = placed.heading;
    }
  }

  const busColor = late ? "#DC2626" : "#2563EB";
  const lines: MapLine[] =
    routePath.length > 1 ? [{ id: "route", coords: routePath, color: busColor, width: 5.5, opacity: 0.95 }] : [];

  const stopPoints: MapPoint[] = (trip?.stops || [])
    .filter((s: { latitude: string; longitude: string; kind: string }) => s.latitude && s.longitude)
    .map((s: { id: string; latitude: string; longitude: string; kind: string; sequence: number }) => ({
      id: `stop-${s.id}`,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      kind: (s.kind === "school" ? "place" : "stop") as MapPoint["kind"],
      color: s.sequence === child.my_stop_sequence ? "#059669" : s.kind === "school" ? "#0B1120" : "#94A3B8",
    }));
  const points: MapPoint[] =
    busLat != null && busLng != null
      ? [
          ...stopPoints,
          {
            id: "bus",
            lat: busLat,
            lng: busLng,
            heading: busHeading,
            kind: "bus",
            label: child.route_code || "",
            color: busColor,
            path: routePath.length >= 2 ? routePath : undefined,
            progress,
          },
        ]
      : stopPoints;

  const follow = busLat != null && busLng != null ? { lat: busLat, lng: busLng, heading: busHeading } : null;

  const childEvents = events.filter((e) => e.tripId === child.trip_id);
  const stopsAway = child.my_stop_sequence != null ? child.my_stop_sequence - (seq || 0) : null;

  let statusText = "Scheduled";
  let statusTone = "text-slate";
  if (child.status === "active" || live) {
    if (late) {
      statusText = `${delayLabel(delay)} · running behind`;
      statusTone = "text-bad";
    } else {
      statusText = "On time";
      statusTone = "text-good";
    }
  } else if (child.status === "completed") {
    statusText = "Arrived";
    statusTone = "text-good";
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-route">
          <Bus size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold tracking-tight">{child.student_first_name}</h2>
          <p className="text-[12px] text-slate">
            {child.route_code ? `Route ${child.route_code}` : "No route assigned"}
            {child.school_name ? ` · ${child.school_name}` : ""}
          </p>
        </div>
        <span className={`ml-auto text-[13px] font-bold ${statusTone}`}>{statusText}</span>
      </div>

      <div className="grid gap-0 md:grid-cols-[1.6fr_1fr]">
        <div className="relative min-w-0 border-b border-line md:border-b-0 md:border-r">
          {points.length > 0 ? (
            <RouteMap
              points={points}
              lines={lines}
              follow={follow}
              followSmooth={Boolean(live)}
              smoothMarkers
              className="h-[300px] rounded-none border-0"
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center bg-canvas text-sm text-slate">
              Waiting for the bus to start its route…
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="grid grid-cols-2 border-b border-line">
            <div className="border-r border-line px-4 py-3.5">
              <div className="text-[11.5px] font-medium text-slate">Your stop</div>
              <div className="mt-0.5 truncate text-[14px] font-semibold text-ink">{child.stop_name || "—"}</div>
              {child.scheduled_pickup && (
                <div className="text-[11.5px] text-muted">Scheduled {child.scheduled_pickup.slice(0, 5)}</div>
              )}
            </div>
            <div className="px-4 py-3.5">
              <div className="text-[11.5px] font-medium text-slate">Est. arrival</div>
              <div className={`mt-0.5 text-[14px] font-semibold tabular-nums ${late ? "text-bad" : "text-good"}`}>
                {etaClock(p50)}
              </div>
              {stopsAway != null && stopsAway > 0 && (
                <div className="text-[11.5px] text-muted">{stopsAway} stop{stopsAway === 1 ? "" : "s"} away</div>
              )}
              {stopsAway != null && stopsAway <= 0 && (child.status === "active" || live) && (
                <div className="text-[11.5px] text-good">Approaching / passed your stop</div>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <EventFeed events={childEvents} empty="No updates yet. You'll see stop arrivals and delays here." />
          </div>
        </div>
      </div>
      <p className="px-5 py-2.5 text-[11px] text-muted">Simulated GPS for demonstration. Not for real navigation.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function DriverLive() {
  const { user } = useAuth();
  const { positions, connected } = useLiveOps();
  const districtId = user?.district;
  const { data: trips } = useQuery({
    queryKey: ["trips", "drive"],
    queryFn: async () => (await api.get("/trips/", { params: { page_size: 50 } })).data,
  });
  const { data: status } = useQuery({
    queryKey: ["demo-status", districtId],
    enabled: Boolean(districtId),
    queryFn: async () => (await api.get(`/districts/${districtId}/demo/status/`)).data,
    refetchInterval: 3000,
    retry: 1,
  });
  const rows: Array<{
    id: string;
    route_code: string;
    school_name: string;
    status: string;
    current_delay_seconds: number;
    is_simulated?: boolean;
  }> = trips?.results || [];
  const running = Boolean(status?.running);

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">Your routes today</h1>
          <p className="mt-1.5 max-w-[42em] text-sm leading-relaxed text-slate">
            Assigned runs only. When a district admin starts the live demo, your bus moves here and on the phone at the
            same time.
          </p>
        </div>
        <LivePill running={running} connected={connected} />
      </div>
      {!running && (
        <p className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-slate">
          Waiting for dispatch or an admin to start the live demo. Open a route to follow along once it is live.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((t) => {
          const live = positions[t.id];
          return (
            <Link key={t.id} to={`/app/drive/${t.id}`} className="card-hover group block">
              <div className="text-xs font-bold uppercase tracking-wider text-route">{t.school_name}</div>
              <div className="mt-1 text-xl font-bold group-hover:text-route">{t.route_code}</div>
              <p className="mt-1 text-sm capitalize text-slate">
                {live || running ? "Live" : t.status.replace("_", " ")}
                {t.is_simulated || live ? " · simulated GPS" : ""}
              </p>
              <div className="mt-4 text-sm font-semibold text-route">Open route guide →</div>
            </Link>
          );
        })}
      </div>
      {rows.length === 0 && (
        <div className="card card-body">
          <p className="text-sm text-slate">
            No trips are assigned to you yet. A planner needs to generate and publish a plan that includes your driver
            profile.
          </p>
        </div>
      )}
    </div>
  );
}

export function LivePage() {
  const { user } = useAuth();
  const isGuardian = user?.role === "guardian";
  const isDriver = user?.role === "driver";
  const canControl = useMemo(() => (user ? STAFF_CONTROL.includes(user.role) : false), [user]);

  if (isGuardian) return <GuardianLive />;
  if (isDriver) return <DriverLive />;
  if (!user?.district) {
    return <p className="text-sm text-slate">No district context available.</p>;
  }
  return <StaffLive districtId={user.district} canControl={canControl} />;
}
