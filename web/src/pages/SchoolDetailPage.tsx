import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MapPinCheck, ShieldAlert, Wand2, X } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { MapLine, MapPoint, RouteMap } from "../components/maps/RouteMap";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import type { SuggestStopsResponse } from "../types";

const CLUSTER_COLORS = ["#7C3AED", "#0D9488", "#D97706", "#DB2777", "#4338CA", "#059669", "#B45309", "#0891B2"];

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  latitude: string;
  longitude: string;
  requires_wheelchair: boolean;
};

export function SchoolDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: school } = useQuery({
    queryKey: ["school", id],
    queryFn: async () => (await api.get(`/schools/${id}/`)).data,
  });
  const { data: students } = useQuery({
    queryKey: ["students", "school", id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get("/students/", { params: { school: id, page_size: 200 } })).data,
  });

  const [suggestion, setSuggestion] = useState<SuggestStopsResponse | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const suggest = useMutation({
    mutationFn: async () => (await api.post("/stops/suggest/", { school: id, direction: "am" })).data,
    onSuccess: (data: SuggestStopsResponse) => {
      setSuggestion(data);
      setRemovedIds(new Set());
      setErr(null);
      setOkMsg(null);
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const kept = (suggestion?.suggested_stops || []).filter((s) => !removedIds.has(s.temp_id));

  const commit = useMutation({
    mutationFn: async () =>
      (await api.post("/stops/commit-suggestions/", { school: id, direction: "am", suggestions: kept })).data,
    onSuccess: (created: unknown[]) => {
      setSuggestion(null);
      setRemovedIds(new Set());
      setErr(null);
      setOkMsg(`Created ${created.length} bus stop${created.length === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey: ["students", "school", id] });
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const rows: StudentRow[] = students?.results || [];

  const studentById = useMemo(() => new Map(rows.map((s) => [s.id, s])), [rows]);
  const colorByStudentId = useMemo(() => {
    const m = new Map<string, string>();
    kept.forEach((stop, i) => {
      stop.students.forEach((st) => m.set(st.student_id, CLUSTER_COLORS[i % CLUSTER_COLORS.length]));
    });
    return m;
  }, [kept]);

  const suggestedPoints: MapPoint[] = kept.map((stop, i) => ({
    id: `sugg-${stop.temp_id}`,
    lat: stop.latitude,
    lng: stop.longitude,
    label: `${stop.name} · ${stop.student_count} student${stop.student_count === 1 ? "" : "s"}`,
    color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
    kind: "place" as const,
  }));

  const suggestedLines: MapLine[] = kept.flatMap((stop, i) =>
    stop.students
      .map((st) => studentById.get(st.student_id))
      .filter((s): s is StudentRow => Boolean(s))
      .map((s) => ({
        id: `line-${stop.temp_id}-${s.id}`,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
        width: 2,
        dashed: true,
        coords: [
          [stop.longitude, stop.latitude],
          [Number(s.longitude), Number(s.latitude)],
        ] as [number, number][],
      })),
  );

  if (!school) return <LoadingBlock rows={3} />;

  return (
    <div className="page-shell">
      <Link to="/app/schools" className="back-link">
        <ArrowLeft size={14} /> Schools
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{school.name}</h1>
          <p className="page-sub capitalize">
            {school.school_type} · bell {school.morning_bell_time} · dismissal {school.dismissal_time}
          </p>
          <p className="text-sm text-slate mt-1">{school.address}</p>
        </div>
        <button className="btn-primary" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
          {suggest.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          Suggest bus stops
        </button>
      </div>

      {err && (
        <p role="alert" className="text-bad bg-red-50 rounded-xl p-3 border border-red-100 text-sm">
          {err}
        </p>
      )}
      {okMsg && (
        <p className="text-good bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-sm">{okMsg}</p>
      )}

      <div className="card overflow-hidden">
        <RouteMap
          className="h-80 rounded-none border-0"
          points={[
            { id: school.id, lat: Number(school.latitude), lng: Number(school.longitude), label: school.name, color: "#059669", kind: "place" },
            ...rows.map((s) => ({
              id: s.id,
              lat: Number(s.latitude),
              lng: Number(s.longitude),
              label: `${s.first_name} ${s.last_name}`,
              color: colorByStudentId.get(s.id) || "#2563EB",
            })),
            ...suggestedPoints,
          ]}
          lines={suggestedLines}
        />
      </div>

      {suggestion && (
        <div className="card card-body">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-ink">Suggested stops</h2>
              <p className="text-sm text-slate mt-0.5">
                {suggestion.students_considered} student{suggestion.students_considered === 1 ? "" : "s"} without an
                active AM stop, grouped within a {Math.round(suggestion.max_walk_distance_m)}m walk. Remove any
                you don't want, then create the rest.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => commit.mutate()}
              disabled={commit.isPending || kept.length === 0}
            >
              {commit.isPending ? <Loader2 size={16} className="animate-spin" /> : <MapPinCheck size={16} />}
              Create {kept.length} stop{kept.length === 1 ? "" : "s"}
            </button>
          </div>

          {suggestion.students_considered === 0 && (
            <p className="text-sm text-slate">Every active student already has an AM stop assignment.</p>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestion.suggested_stops.map((stop, i) => {
              const removed = removedIds.has(stop.temp_id);
              return (
                <div
                  key={stop.temp_id}
                  className={`rounded-xl border p-3.5 transition ${removed ? "opacity-40 border-slate/15" : "border-navy/[0.08]"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                      />
                      <span className="font-semibold text-sm truncate">{stop.name}</span>
                    </div>
                    <button
                      className="text-muted hover:text-bad shrink-0"
                      onClick={() =>
                        setRemovedIds((prev) => {
                          const next = new Set(prev);
                          if (removed) next.delete(stop.temp_id);
                          else next.add(stop.temp_id);
                          return next;
                        })
                      }
                      title={removed ? "Restore this stop" : "Remove this stop"}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <p className="text-xs text-slate mt-2">
                    {stop.student_count} student{stop.student_count === 1 ? "" : "s"}
                    {stop.wheelchair_count > 0 ? ` · ${stop.wheelchair_count} wheelchair` : ""} · avg walk{" "}
                    {stop.avg_walk_distance_m}m (max {stop.max_walk_distance_m}m)
                  </p>
                  {stop.safety_flags.on_high_injury_corridor && (
                    <p className="text-xs text-bad flex items-center gap-1 mt-1.5">
                      <ShieldAlert size={12} /> Near a high-injury corridor
                      {stop.safety_flags.high_injury_corridor_name ? ` (${stop.safety_flags.high_injury_corridor_name})` : ""}
                    </p>
                  )}
                  <ul className="text-xs text-slate mt-2 space-y-0.5">
                    {stop.students.map((st) => (
                      <li key={st.student_id} className="truncate">
                        {st.name} · {st.walk_distance_m}m
                        {st.requires_wheelchair ? " · wheelchair" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-sm text-slate">{students?.count ?? rows.length} fictional students assigned to this school.</p>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Grade</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">
                  <Link className="link" to={`/app/students/${s.id}`}>
                    {s.first_name} {s.last_name}
                  </Link>
                </td>
                <td>{s.grade}</td>
                <td>{s.requires_wheelchair ? <span className="badge-neutral">Wheelchair</span> : "Standard"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
