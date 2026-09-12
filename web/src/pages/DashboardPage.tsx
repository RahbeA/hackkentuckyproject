import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { RouteMap } from "../components/maps/RouteMap";
import { LoadingGrid } from "../components/ui/LoadingBlock";

interface FleetHighlight {
  id: string;
  route_code: string;
  late: boolean;
  departed: boolean;
  detail: string;
}

interface SchoolArrival {
  id: string;
  name: string;
  inbound_routes: number;
  bell_time: string | null;
  eta: string | null;
  late: boolean;
}

interface AlertRow {
  id: string;
  title: string;
  severity: string;
  message: string;
  trip?: string;
}

function clockLabel(d = new Date()) {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

function utilizationLabel(value: number | undefined) {
  if (value == null) return "—";
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${pct}%`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const districtId = user?.district;
  const [now, setNow] = useState(() => clockLabel());

  useEffect(() => {
    const id = window.setInterval(() => setNow(clockLabel()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", districtId],
    enabled: Boolean(districtId) || user?.role === "platform_admin",
    queryFn: async () => {
      let id = districtId;
      if (!id) {
        const list = await api.get("/districts/");
        id = list.data.results?.[0]?.id || list.data[0]?.id;
      }
      const { data } = await api.get(`/districts/${id}/dashboard/`);
      return data;
    },
    refetchInterval: 8000,
  });

  if (isLoading) return <LoadingGrid count={6} />;
  if (error) return <p className="text-bad font-medium">Could not load dashboard.</p>;
  if (!data) return <p className="text-slate">No district is assigned to your account yet.</p>;

  const districtName = user?.district_name || "your district";
  const kpis = [
    { label: "Active buses", value: data.active_buses, hint: "Currently rolling" },
    { label: "Students transported", value: data.students_transported, hint: "Eligible roster" },
    { label: "On-time routes", value: data.on_time_routes, hint: "Late probability < 25%", tone: "good" as const },
    { label: "At-risk routes", value: data.at_risk_routes, hint: "Needs dispatcher attention", tone: "warn" as const },
    { label: "Fleet utilization", value: utilizationLabel(data.fleet_utilization), hint: "Active / available" },
    { label: "Avg delay", value: `${Math.round((data.average_delay_seconds || 0) / 60)} min`, hint: "Across active trips" },
  ];

  const highlights: FleetHighlight[] = data.fleet_highlights || [];
  const arrivals: SchoolArrival[] = data.arrival_by_school || [];
  const alerts: AlertRow[] = data.recent_alerts || [];

  const points = (data.live_trips || [])
    .map(
      (t: {
        id: string;
        last_position?: { latitude: string; longitude: string; heading?: number };
        route_code: string;
        late_probability: number;
      }) =>
        t.last_position
          ? {
              id: t.id,
              lat: Number(t.last_position.latitude),
              lng: Number(t.last_position.longitude),
              label: t.route_code,
              color: t.late_probability > 0.45 ? "#DC2626" : "#2563EB",
              kind: "bus" as const,
              heading: Number(t.last_position.heading || 0),
            }
          : null,
    )
    .filter(Boolean);
  const lines = (data.live_trips || [])
    .filter((t: { path?: [number, number][] }) => (t.path || []).length > 1)
    .map((t: { id: string; path: [number, number][]; late_probability: number }) => ({
      id: t.id,
      color: t.late_probability > 0.45 ? "#DC2626" : "#2563EB",
      coords: t.path,
      width: 5,
    }));

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">District operations</h1>
          <p className="mt-1.5 max-w-[44em] text-sm leading-relaxed text-slate">
            Live picture of {districtName}. Predictions use synthetic models.
          </p>
          {(user?.role === "guardian" || user?.role === "driver") && (
            <p className="mt-3 rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-slate">
              This is the district ops board.{" "}
              <Link className="link font-semibold" to={user.role === "guardian" ? "/app/live" : "/app/drive"}>
                Go to your {user.role === "guardian" ? "bus tracker" : "route guide"}
              </Link>
              .
            </p>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] font-semibold text-slate">
            <span className="relative h-[7px] w-[7px] shrink-0 rounded-full bg-good">
              <span className="absolute -inset-[3px] rounded-full bg-good animate-dartPing" />
            </span>
            Updating every 8s
          </span>
          <span className="text-[12.5px] tabular-nums text-muted">{now}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
        <div className="grid sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={`px-[22px] py-5 ${i < kpis.length - 1 ? "xl:border-r sm:border-b xl:border-b-0 border-slate-soft" : ""}`}
            >
              <div className="text-[12.5px] font-medium text-slate">{k.label}</div>
              <div
                className={`mt-1 font-display text-[30px] font-bold tracking-tight tabular-nums ${
                  k.tone === "good" ? "text-good" : k.tone === "warn" ? "text-warn" : "text-ink"
                }`}
              >
                {k.value}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">{k.hint}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-paper shadow-card lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-bold tracking-tight">Live fleet</h2>
            <span className="text-xs text-muted">Simulated GPS</span>
            <Link to="/app/dispatch" className="link ml-auto text-[13px]">
              Open dispatcher →
            </Link>
          </div>
          <div className="relative bg-slate-soft">
            <RouteMap points={points} lines={lines} className="h-[280px] rounded-none border-0" />
            <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11.5px] font-semibold">
                <span className="h-[3px] w-4 rounded-sm bg-route" />
                On time
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11.5px] font-semibold">
                <span className="h-[3px] w-4 rounded-sm bg-bad" />
                Late probability &gt; 45%
              </span>
            </div>
          </div>
          {highlights.length > 0 && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 border-t border-line">
              {highlights.map((h, i) => (
                <Link
                  key={h.id}
                  to={`/app/drive/${h.id}`}
                  className={`flex items-center gap-2.5 px-[18px] py-3.5 ${
                    i < highlights.length - 1 ? "xl:border-r sm:border-b xl:border-b-0 border-slate-soft" : ""
                  } ${h.late ? "bg-[#FFFBF5]" : ""} hover:bg-canvas`}
                >
                  <span
                    className="shrink-0"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderBottom: `13px solid ${!h.departed ? "#94A3B8" : h.late ? "#DC2626" : "#2563EB"}`,
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">Route {h.route_code}</div>
                    <div className={`text-[11.5px] ${h.late ? "text-warn" : h.departed ? "text-slate" : "text-muted"}`}>
                      {h.detail}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
            <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-bold tracking-tight">Recent alerts</h2>
              <span className="ml-auto text-[11.5px] font-bold tabular-nums text-slate">{alerts.length} open</span>
            </div>
            <div className="flex flex-col gap-2.5 p-3.5">
              {alerts.length === 0 && <p className="px-1 py-2 text-sm text-slate">No open alerts.</p>}
              {alerts.map((a) => {
                const critical = a.severity === "critical";
                return (
                  <div
                    key={a.id}
                    className={`rounded-[10px] border px-3.5 py-3 ${
                      critical
                        ? "border-bad/20 bg-bad/[0.04]"
                        : "border-warn/20 bg-warn/[0.05]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold ${
                          critical ? "border-bad/20 bg-bad/10 text-bad" : "border-warn/20 bg-warn/10 text-warn"
                        }`}
                      >
                        {a.severity}
                      </span>
                      {a.trip ? (
                        <Link className="text-[13px] font-semibold text-route hover:underline" to={`/app/drive/${a.trip}`}>
                          {a.title}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-semibold">{a.title}</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate">{a.message}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-bold tracking-tight">Arrival by school</h2>
            </div>
            <div className="py-1.5">
              {arrivals.length === 0 && <p className="px-5 py-3 text-sm text-slate">No schools on the roster yet.</p>}
              {arrivals.map((s, i) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-5 py-3 ${i ? "border-t border-slate-soft" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{s.name}</div>
                    <div className="text-[11.5px] text-slate">
                      {s.inbound_routes} inbound route{s.inbound_routes === 1 ? "" : "s"}
                      {s.bell_time ? ` · bell ${s.bell_time}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${s.late ? "text-warn" : "text-good"}`}
                  >
                    {s.eta || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">Simulated GPS and synthetic predictions. Do not use to navigate a real bus.</p>
    </div>
  );
}
