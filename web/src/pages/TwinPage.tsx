import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FlaskConical, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";

export function TwinPage() {
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: async () => (await api.get("/route-plans/")).data });
  const list = plans?.results || [];
  const [form, setForm] = useState({
    route_plan: "",
    compare_plan: "",
    n_simulations: 750,
    traffic_severity: 0.7,
    weather_severity: 0.5,
    rain: true,
    snow_day: false,
    starting_delay_min: 0,
    starting_delay_max: 10,
    boarding_variability: 0.4,
    driver_absence_rate: 0.04,
    road_disruption_rate: 0.08,
  });
  useEffect(() => {
    const first = list.find((p: { status: string }) => p.status === "published") || list[0];
    const second = list.find((p: { id: string }) => p.id !== first?.id);
    if (first && !form.route_plan) setForm((f) => ({ ...f, route_plan: first.id, compare_plan: second?.id || "" }));
  }, [list, form.route_plan]);
  const [runId, setRunId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => (await api.post("/stress-tests/", form)).data,
    onSuccess: (d) => {
      setRunId(d.id);
      setErr(null);
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const { data: run } = useQuery({
    queryKey: ["stress", runId],
    enabled: Boolean(runId),
    queryFn: async () => (await api.get(`/stress-tests/${runId}/`)).data,
    refetchInterval: (q) => (q.state.data?.status === "succeeded" ? false : 1000),
  });
  const routes = run?.results?.routes || [];
  const running = run && run.status !== "succeeded" && run.status !== "failed";

  return (
    <div className="page-shell">
      <PageHeader
        title="Digital twin"
        subtitle="Monte Carlo of fictional school mornings. Not a certified reliability study."
      />

      {list.length === 0 && (
        <p className="text-slate text-sm">
          You need a generated route plan first. Generate one from{" "}
          <Link className="link" to="/app/planner">
            Route planner
          </Link>
          .
        </p>
      )}
      {err && (
        <p role="alert" className="text-bad bg-red-50 rounded-xl p-3 border border-red-100 text-sm">
          {err}
        </p>
      )}
      {run?.status === "failed" && (
        <p role="alert" className="text-bad bg-red-50 rounded-xl p-3 border border-red-100 text-sm">
          Stress test failed to complete. Try again or pick a different plan.
        </p>
      )}

      <div className="card card-body grid md:grid-cols-3 gap-4">
        <label>
          <span className="label">Primary plan</span>
          <select className="select" value={form.route_plan} onChange={(e) => setForm({ ...form, route_plan: e.target.value })}>
            <option value="">Select</option>
            {list.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Compare plan</span>
          <select className="select" value={form.compare_plan} onChange={(e) => setForm({ ...form, compare_plan: e.target.value })}>
            <option value="">Optional</option>
            {list.map((p: { id: string; name: string }) => (
              <option key={`c-${p.id}`} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Simulations</span>
          <input className="input" type="number" value={form.n_simulations} onChange={(e) => setForm({ ...form, n_simulations: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">Traffic (0–1)</span>
          <input className="input" type="number" step="0.05" value={form.traffic_severity} onChange={(e) => setForm({ ...form, traffic_severity: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">Weather (0–1)</span>
          <input className="input" type="number" step="0.05" value={form.weather_severity} onChange={(e) => setForm({ ...form, weather_severity: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 mt-6 text-sm font-medium">
          <input type="checkbox" className="rounded" checked={form.rain} onChange={(e) => setForm({ ...form, rain: e.target.checked })} />
          Rain scenario
        </label>
        <label className="flex items-center gap-2 mt-6 text-sm font-medium">
          <input
            type="checkbox"
            className="rounded"
            checked={form.snow_day}
            onChange={(e) => setForm({ ...form, snow_day: e.target.checked })}
          />
          Snow day (real Public Works plow-route coverage)
        </label>
        <button className="btn-primary md:col-span-3" onClick={() => create.mutate()} disabled={!form.route_plan || create.isPending}>
          {create.isPending || running ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Running…
            </>
          ) : (
            <>
              <FlaskConical size={16} /> Run stress test
            </>
          )}
        </button>
      </div>

      {run?.status === "succeeded" && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="All routes on time" value={`${Math.round(run.results.probability_all_on_time * 100)}%`} accent="good" />
            <StatCard label="At least one late" value={`${Math.round(run.results.probability_at_least_one_late * 100)}%`} accent="warn" />
            <StatCard label="Most vulnerable" value={run.results.most_vulnerable_route?.route_code || "—"} accent="bad" />
            {run.results.snow_day_mode && (
              <StatCard
                label="Snow-stuck events"
                value={String(run.results.snow_stuck_events)}
                accent="warn"
              />
            )}
          </div>
          <div className="card card-body h-80">
            <h2 className="font-bold text-ink mb-4">On-time by route</h2>
            <ResponsiveContainer>
              <BarChart data={routes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="route_code" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="on_time_probability" fill="#2563EB" name="On-time" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="card card-body text-sm leading-relaxed text-slate">{run.interpretation}</p>
        </>
      )}
    </div>
  );
}
