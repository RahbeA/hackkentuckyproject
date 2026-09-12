import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Construction, Loader2, Navigation, Play, Radar, ShieldAlert, Square, Zap } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { MapPoint, RouteMap } from "../components/maps/RouteMap";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { PageHeader } from "../components/ui/PageHeader";
import { useHazardLayers } from "../hooks/useHazardLayers";
import type { SafetyContext } from "../types";

export function DispatchPage() {
  const { user } = useAuth();
  const districtId = user?.district;
  const qc = useQueryClient();
  const [showCorridors, setShowCorridors] = useState(true);
  const [showConstruction, setShowConstruction] = useState(true);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips"],
    queryFn: async () => (await api.get("/trips/", { params: { at_risk: true, page_size: 50 } })).data,
    refetchInterval: 4000,
  });
  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => (await api.get("/alerts/", { params: { is_acknowledged: false } })).data,
    refetchInterval: 4000,
  });
  const ack = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/${id}/acknowledge/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setActionErr(null);
    },
    onError: (e) => setActionErr(errorMessage(e)),
  });
  const disrupt = useMutation({
    mutationFn: (id: string) => api.post(`/trips/${id}/disrupt/`, { minutes: 10 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      setActionErr(null);
    },
    onError: (e) => setActionErr(errorMessage(e)),
  });
  const scanHazards = useMutation({
    mutationFn: async () => (await api.post("/route-plans/scan-construction-hazards/")).data,
    onSuccess: (d) => {
      setScanMsg(
        d.alerts_created > 0
          ? `Found ${d.alerts_created} new construction hazard(s) on published routes.`
          : "No new construction hazards on published routes.",
      );
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e) => setScanMsg(errorMessage(e)),
  });
  const { data: demoStatus } = useQuery({
    queryKey: ["demo-status", districtId],
    enabled: Boolean(districtId),
    queryFn: async () => (await api.get(`/districts/${districtId}/demo/status/`)).data,
    refetchInterval: 3000,
    retry: 1,
  });
  const startDemo = useMutation({
    mutationFn: () => api.post(`/districts/${districtId}/demo/start/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-status", districtId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
  const stopDemo = useMutation({
    mutationFn: () => api.post(`/districts/${districtId}/demo/stop/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demo-status", districtId] }),
  });
  const running = Boolean(demoStatus?.running);
  const rows = [...(trips?.results || [])].sort(
    (a: { late_probability: number }, b: { late_probability: number }) => b.late_probability - a.late_probability,
  );
  const lines = rows
    .filter((t: { path?: [number, number][] }) => (t.path || []).length > 1)
    .map((t: { id: string; path: [number, number][]; late_probability: number }) => ({
      id: t.id,
      color: t.late_probability > 0.45 ? "#DC2626" : "#2563EB",
      coords: t.path,
      width: 5,
    }));
  const points: MapPoint[] = rows
    .filter((t: { last_position?: { latitude: string } }) => t.last_position)
    .map((t: { id: string; last_position: { latitude: string; longitude: string }; late_probability: number; route_code: string }) => ({
      id: t.id,
      lat: Number(t.last_position.latitude),
      lng: Number(t.last_position.longitude),
      color: t.late_probability > 0.45 ? "#DC2626" : "#2563EB",
      label: t.route_code,
      kind: "bus" as const,
    }));

  const { hazardLines, hazardPoints } = useHazardLayers(points, { showCorridors, showConstruction });

  const alertCount = (alerts?.results || []).length;
  const atRiskCount = rows.filter((t: { late_probability: number }) => t.late_probability > 0.45).length;

  return (
    <div className="page-shell">
      <PageHeader
        title="Dispatcher console"
        subtitle="At-risk trips sorted first. Start the live demo so parents and drivers see the same buses."
        actions={
          <Link className="btn-secondary" to="/app/assignments">
            Edit drivers &amp; rosters
          </Link>
        }
      />

      {actionErr && (
        <p role="alert" className="text-bad bg-red-50 rounded-xl p-3 border border-red-100 text-sm">
          {actionErr}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <button className="btn-danger" onClick={() => stopDemo.mutate()} disabled={stopDemo.isPending}>
            <Square size={15} /> Stop live demo
          </button>
        ) : (
          <button className="btn-primary" onClick={() => startDemo.mutate()} disabled={startDemo.isPending || !districtId}>
            <Play size={15} /> {startDemo.isPending ? "Starting…" : "Start live demo"}
          </button>
        )}
        {(startDemo.error || stopDemo.error) && (
          <p className="text-sm text-bad">{errorMessage(startDemo.error || stopDemo.error)}</p>
        )}
        {running && <span className="text-sm font-semibold text-bad">LIVE — families and drivers are watching</span>}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="kpi-card pl-5">
          <div className="text-sm text-slate">Active trips</div>
          <div className="kpi-value">{rows.length}</div>
        </div>
        <div className="kpi-card pl-5">
          <div className="text-sm text-slate">At-risk</div>
          <div className="kpi-value text-bad">{atRiskCount}</div>
        </div>
        <div className="kpi-card pl-5">
          <div className="text-sm text-slate">Open alerts</div>
          <div className="kpi-value text-warn">{alertCount}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink">Live map</h2>
          <div className="flex items-center gap-4 text-xs font-medium text-slate">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={showCorridors}
                onChange={(e) => setShowCorridors(e.target.checked)}
              />
              <ShieldAlert size={14} className="text-bad" /> Vision Zero corridors
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={showConstruction}
                onChange={(e) => setShowConstruction(e.target.checked)}
              />
              <Construction size={14} className="text-warn" /> Active construction
            </label>
            <button
              className="btn-secondary text-xs"
              onClick={() => scanHazards.mutate()}
              disabled={scanHazards.isPending}
            >
              {scanHazards.isPending ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
              Scan for new hazards
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="p-5"><LoadingBlock rows={1} /></div>
        ) : (
          <RouteMap
            points={[...points, ...hazardPoints]}
            lines={[...lines, ...hazardLines]}
            className="h-80 rounded-none border-0 border-t border-navy/[0.06]"
          />
        )}
        {scanMsg && <p className="text-xs text-slate px-5 py-2 border-t border-navy/[0.06]">{scanMsg}</p>}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="section-title">Trip queue</h2>
          {rows.length === 0 && <p className="text-slate text-sm">No active trips.</p>}
          {rows.map((t: {
            id: string;
            route_code: string;
            status: string;
            current_delay_seconds: number;
            late_probability: number;
            is_simulated: boolean;
            school_name?: string;
            driver_name?: string | null;
            route_safety_context?: SafetyContext;
          }) => (
            <article key={t.id} className="card card-body flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link className="link text-lg" to={`/app/trips/${t.id}`}>
                    {t.route_code}
                  </Link>
                  <span className={t.late_probability > 0.45 ? "badge-bad" : "badge-good"}>
                    {Math.round(t.late_probability * 100)}% late risk
                  </span>
                  {(t.route_safety_context?.high_injury_km || 0) > 0 && (
                    <span className="badge-bad" title={t.route_safety_context?.high_injury_corridors.join(", ")}>
                      <ShieldAlert size={12} /> high-injury corridor
                    </span>
                  )}
                  {(t.route_safety_context?.active_construction?.length || 0) > 0 && (
                    <span className="badge-warn">
                      <Construction size={12} /> {t.route_safety_context?.active_construction.length} closure(s)
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate mt-1 capitalize">
                  {t.school_name && `${t.school_name} · `}
                  {t.driver_name || "No driver"} · {t.status.replace("_", " ")} · {Math.round(t.current_delay_seconds / 60)} min delay
                  {t.is_simulated ? " · sim GPS" : ""}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link className="btn-route text-xs" to={`/app/drive/${t.id}`}>
                  <Navigation size={14} /> Follow
                </Link>
                <button
                  className="btn-secondary text-xs"
                  disabled={disrupt.isPending}
                  onClick={() => {
                    if (window.confirm(`Add a synthetic 10-minute delay to ${t.route_code}? This is for demo/testing only.`)) {
                      disrupt.mutate(t.id);
                    }
                  }}
                >
                  <Zap size={14} /> Disrupt
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="card card-body">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-warn" />
            <h2 className="font-bold text-ink">Alert feed</h2>
          </div>
          {(alerts?.results || []).length === 0 && <p className="text-slate text-sm">All clear.</p>}
          <div className="space-y-3">
            {(alerts?.results || []).map((a: { id: string; title: string; message: string; severity: string }) => (
              <div key={a.id} className="rounded-xl bg-canvas p-3 border border-navy/[0.04]">
                <div className="flex justify-between gap-2 items-start">
                  <span className={a.severity === "critical" ? "badge-bad" : "badge-warn"}>{a.severity}</span>
                  <button
                    className="text-xs font-semibold text-route hover:underline disabled:opacity-50"
                    disabled={ack.isPending}
                    onClick={() => ack.mutate(a.id)}
                  >
                    Ack
                  </button>
                </div>
                <div className="font-semibold text-sm mt-2">{a.title}</div>
                <p className="text-xs text-slate mt-1 leading-relaxed">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
