import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertOctagon, CarFront, ClockAlert, Construction, Loader2, Navigation, Send, ShieldCheck, Wrench } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { RouteMap } from "../components/maps/RouteMap";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { RiskFactorList, SAFETY_FACTOR_CODES } from "../components/ui/RiskFactorList";
import { useHazardLayers } from "../hooks/useHazardLayers";

const ALERT_TYPES = [
  { value: "accident", label: "Accident", icon: CarFront, defaultSeverity: "critical" },
  { value: "breakdown", label: "Bus breakdown", icon: Wrench, defaultSeverity: "critical" },
  { value: "running_late", label: "Running very late", icon: ClockAlert, defaultSeverity: "warning" },
  { value: "other", label: "Other emergency", icon: AlertOctagon, defaultSeverity: "warning" },
] as const;

export function TripDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isGuardian = user?.role === "guardian";
  const qc = useQueryClient();
  const [showCorridors, setShowCorridors] = useState(true);
  const [showConstruction, setShowConstruction] = useState(true);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState<(typeof ALERT_TYPES)[number]["value"]>("accident");
  const [severity, setSeverity] = useState<"warning" | "critical">("critical");
  const [message, setMessage] = useState("");
  const [alertErr, setAlertErr] = useState<string | null>(null);
  const [alertOk, setAlertOk] = useState<string | null>(null);
  const { data: trip } = useQuery({
    queryKey: ["trip", id],
    queryFn: async () => (await api.get(`/trips/${id}/`)).data,
    refetchInterval: 3000,
  });
  const sendAlert = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/trips/${id}/alert-guardians/`, {
          alert_type: alertType,
          severity,
          message: message.trim(),
        })
      ).data,
    onSuccess: (data) => {
      setAlertOpen(false);
      setMessage("");
      setAlertErr(null);
      setAlertOk(
        `Sent to ${data.guardians_notified} guardian${data.guardians_notified === 1 ? "" : "s"}` +
          (data.incident_id ? " and logged as an incident." : "."),
      );
      qc.invalidateQueries({ queryKey: ["trip", id] });
    },
    onError: (e) => setAlertErr(errorMessage(e)),
  });
  const stopPoints = (trip?.stops || []).map((s: { latitude: string; longitude: string }) => ({
    lat: Number(s.latitude),
    lng: Number(s.longitude),
  }));
  const { hazardLines, hazardPoints } = useHazardLayers(stopPoints, { showCorridors, showConstruction });
  if (!trip) return <LoadingBlock rows={3} />;
  const stops = trip.stops || [];
  const pos = trip.last_position;
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">{trip.route_code}</h1>
          <p className="page-sub capitalize">
            {trip.status.replace("_", " ")} · {Math.round(trip.current_delay_seconds / 60)} min delay ·{" "}
            {(trip.late_probability * 100).toFixed(0)}% late risk
            {trip.is_simulated ? " · Simulated GPS" : ""}
          </p>
        </div>
        <Link className="btn-route" to={`/app/drive/${trip.id}`}>
          <Navigation size={16} /> Open route guide
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink">Route map</h2>
          <div className="flex items-center gap-4 text-xs font-medium text-slate">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={showCorridors}
                onChange={(e) => setShowCorridors(e.target.checked)}
              />
              <ShieldCheck size={14} className="text-bad" /> Vision Zero corridors
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
          </div>
        </div>
        <RouteMap
          className="h-96 rounded-none border-0 border-t border-navy/[0.06]"
          points={[
            ...stops.map((s: { id: string; latitude: string; longitude: string; name: string }) => ({
              id: s.id,
              lat: Number(s.latitude),
              lng: Number(s.longitude),
              label: s.name,
              color: "#2563EB",
            })),
            ...(pos
              ? [{ id: "bus", lat: Number(pos.latitude), lng: Number(pos.longitude), kind: "bus" as const, label: "Bus" }]
              : []),
            ...hazardPoints,
          ]}
          lines={[
            {
              id: "path",
              color: "#2563EB",
              width: 6,
              coords: (trip.path && trip.path.length > 1
                ? trip.path
                : stops.map((s: { longitude: string; latitude: string }) => [Number(s.longitude), Number(s.latitude)] as [number, number])),
            },
            ...hazardLines,
          ]}
        />
      </div>

      {isGuardian ? (
        <div className="card card-body">
          <h2 className="section-title flex items-center gap-2">
            <ShieldCheck size={16} className="text-good" /> Safety notes
          </h2>
          <p className="text-xs text-muted mb-2">From Louisville Metro / LOJIC open data — not a live traffic feed.</p>
          <RiskFactorList factors={trip.route_risk_factors} onlyCodes={SAFETY_FACTOR_CODES} />
        </div>
      ) : (
        <div className="card card-body">
          <h2 className="section-title">Risk factors</h2>
          <RiskFactorList factors={trip.route_risk_factors} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card card-body">
          <h2 className="section-title">Stop sequence</h2>
          <ol className="space-y-2 text-sm">
            {stops.map((s: { id: string; name: string; scheduled_arrival: string }, i: number) => (
              <li key={s.id} className="flex gap-3">
                <span className="text-muted font-mono text-xs w-5">{i + 1}.</span>
                <span>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-slate ml-2 tabular-nums">{s.scheduled_arrival || "—"}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card card-body h-56">
          <h2 className="section-title">Delay trend</h2>
          <ResponsiveContainer>
            <LineChart data={[{ t: 0, d: 0 }, { t: 1, d: trip.current_delay_seconds / 60 }]}>
              <XAxis dataKey="t" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line dataKey="d" stroke="#D97706" strokeWidth={2} dot={{ r: 4 }} name="Delay min" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="card card-body text-sm text-slate leading-relaxed">{trip.ml_explanation}</p>

      {alertOk && (
        <p className="text-good bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-sm">{alertOk}</p>
      )}

      {!isGuardian && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title !mb-0">Emergency alerts</h2>
            <button className="btn-danger" onClick={() => setAlertOpen(true)}>
              <Send size={15} /> Report emergency
            </button>
          </div>
          {(trip.alerts || []).length === 0 ? (
            <p className="text-slate text-sm">No alerts sent for this trip.</p>
          ) : (
            <div className="space-y-2">
              {trip.alerts.map((a: { id: string; title: string; message: string; severity: string; created_at: string }) => (
                <div key={a.id} className="card card-body flex items-start gap-3">
                  <span className={a.severity === "critical" ? "badge-bad" : a.severity === "warning" ? "badge-warn" : "badge-neutral"}>
                    {a.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">{a.title}</div>
                    <p className="text-xs text-slate mt-0.5">{a.message}</p>
                    <p className="text-[11px] text-muted mt-1">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {alertOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal>
          <form
            className="modal-panel"
            onSubmit={(e) => {
              e.preventDefault();
              sendAlert.mutate();
            }}
          >
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Send size={18} className="text-bad" /> Report emergency
            </h2>
            <p className="text-sm text-slate">
              Notifies every verified guardian of a student on {trip.route_code} right now.
            </p>
            {alertErr && <p className="text-bad text-sm bg-red-50 rounded-xl p-3">{alertErr}</p>}

            <div className="grid gap-1.5">
              <span className="label">What happened?</span>
              <div className="grid grid-cols-2 gap-2">
                {ALERT_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = alertType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                        active ? "border-route bg-accent-soft text-route" : "border-slate/15 text-slate hover:border-route/30"
                      }`}
                      onClick={() => {
                        setAlertType(t.value);
                        setSeverity(t.defaultSeverity);
                      }}
                    >
                      <Icon size={15} /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="alert-severity">
                Severity
              </label>
              <select
                id="alert-severity"
                className="select"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "warning" | "critical")}
              >
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="alert-message">
                Message to guardians (optional)
              </label>
              <textarea
                id="alert-message"
                className="input min-h-24"
                placeholder="e.g. Minor collision at 3rd &amp; Main, everyone is safe, a replacement bus is 15 minutes out."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">
                {alertType === "accident" || alertType === "breakdown"
                  ? "Accident and breakdown alerts always reach guardians, even if they've muted delay notifications."
                  : "Guardians who've muted this alert type won't be notified."}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setAlertOpen(false)}>
                Cancel
              </button>
              <button className="btn-danger" disabled={sendAlert.isPending}>
                {sendAlert.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Send alert
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
