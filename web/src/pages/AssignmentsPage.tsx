import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, Plus, Trash2, UserRound } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { PageHeader } from "../components/ui/PageHeader";

type Driver = { id: string; first_name: string; last_name: string; is_active: boolean };
type Rider = {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | number | null;
  stop_id: string;
  stop_name: string;
};
type TripRow = {
  id: string;
  route_code: string;
  district_name?: string | null;
  school_name: string | null;
  status: string;
  driver: string | null;
  driver_name: string | null;
  student_count: number;
  stops: { id: string; name: string; kind: string }[];
  students: Rider[];
};
type LooseStudent = { id: string; first_name: string; last_name: string; grade: string | number | null; school_name?: string | null };

export function AssignmentsPage() {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  const { data: board, isLoading } = useQuery({
    queryKey: ["assignment-board"],
    queryFn: async () =>
      (await api.get("/trips/assignment-board/")).data as {
        service_date?: string;
        trips: TripRow[];
        unassigned: LooseStudent[];
      },
  });
  const { data: driversPage } = useQuery({
    queryKey: ["drivers", "assign"],
    queryFn: async () => (await api.get("/drivers/", { params: { page_size: 100, is_active: true } })).data,
  });
  const drivers: Driver[] = driversPage?.results || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assignment-board"] });
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["trip"] });
  };

  const setDriver = useMutation({
    mutationFn: ({ tripId, driver }: { tripId: string; driver: string | null }) =>
      api.post(`/trips/${tripId}/assign-driver/`, { driver }),
    onSuccess: () => {
      setErr(null);
      invalidate();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const addRider = useMutation({
    mutationFn: ({ tripId, student }: { tripId: string; student: string }) =>
      api.post(`/trips/${tripId}/roster-add/`, { student }),
    onSuccess: (_, vars) => {
      setErr(null);
      setAdding((prev) => ({ ...prev, [vars.tripId]: "" }));
      invalidate();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const removeRider = useMutation({
    mutationFn: ({ tripId, student }: { tripId: string; student: string }) =>
      api.post(`/trips/${tripId}/roster-remove/`, { student }),
    onSuccess: () => {
      setErr(null);
      invalidate();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const trips = board?.trips || [];
  const seated = useMemo(() => new Set(trips.flatMap((t) => t.students.map((s) => s.id))), [trips]);
  const unassigned = useMemo(() => {
    const extras = (board?.unassigned || []).filter((s) => !seated.has(s.id));
    const needle = q.trim().toLowerCase();
    if (!needle) return extras;
    return extras.filter((s) => `${s.first_name} ${s.last_name} ${s.school_name || ""}`.toLowerCase().includes(needle));
  }, [board?.unassigned, seated, q]);
  const pool = unassigned;

  return (
    <div className="page-shell">
      <PageHeader
        title="Assignments"
        subtitle={
          board?.service_date
            ? `Runs for ${board.service_date}. Pick who drives each bus and which students ride it — changes apply immediately.`
            : "Pick who drives each run and which students ride it. Changes apply immediately to live maps and family tracking."
        }
      />

      {err ? (
        <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-bad">
          {err}
        </p>
      ) : null}

      {isLoading ? <LoadingBlock rows={3} /> : null}

      {!isLoading && trips.length === 0 ? (
        <p className="text-sm text-slate">
          No trips yet. Publish a route plan or start the live demo, then come back to assign drivers and riders.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {trips.map((trip) => {
          const pickups = trip.stops.filter((s) => s.kind === "stop");
          const selected = adding[trip.id] || "";
          return (
            <article key={trip.id} className="card card-body flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link className="link text-lg" to={`/app/trips/${trip.id}`}>
                    {trip.route_code}
                  </Link>
                  <p className="mt-1 text-sm text-slate">
                    {trip.district_name ? `${trip.district_name} · ` : ""}
                    {trip.school_name || "School"} · {trip.student_count} rider{trip.student_count === 1 ? "" : "s"} ·{" "}
                    <span className="capitalize">{trip.status.replace("_", " ")}</span>
                  </p>
                </div>
                <Bus size={18} className="text-route" aria-hidden />
              </div>

              <label className="grid gap-1.5">
                <span className="label">Driver</span>
                <select
                  className="select"
                  aria-label={`Driver for ${trip.route_code}`}
                  value={trip.driver || ""}
                  disabled={setDriver.isPending}
                  onChange={(e) => setDriver.mutate({ tripId: trip.id, driver: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <h3 className="mb-2 text-[13px] font-bold text-ink">Students on this run</h3>
                {trip.students.length === 0 ? (
                  <p className="text-sm text-slate">No students on this bus yet.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {trip.students.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                        <UserRound size={15} className="shrink-0 text-muted" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">
                            {s.first_name} {s.last_name}
                          </div>
                          <div className="text-[12px] text-slate">
                            {s.grade ? `Grade ${s.grade}` : "Grade —"} · {s.stop_name}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-bad hover:bg-red-50"
                          disabled={removeRider.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${s.first_name} ${s.last_name} from ${trip.route_code}?`)) {
                              removeRider.mutate({ tripId: trip.id, student: s.id });
                            }
                          }}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1 grid gap-1.5">
                  <span className="label">Add a student</span>
                  <select
                    className="select"
                    aria-label={`Add student to ${trip.route_code}`}
                    value={selected}
                    onChange={(e) => setAdding((prev) => ({ ...prev, [trip.id]: e.target.value }))}
                  >
                    <option value="">Choose a student…</option>
                    {unassigned.length ? (
                      <optgroup label="Unassigned">
                        {unassigned.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.first_name} {s.last_name}
                            {s.school_name ? ` · ${s.school_name}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {trips
                      .filter((t) => t.id !== trip.id)
                      .flatMap((t) => t.students.map((s) => ({ ...s, from: t.route_code })))
                      .length ? (
                      <optgroup label="On another run">
                        {trips
                          .filter((t) => t.id !== trip.id)
                          .flatMap((t) => t.students.map((s) => ({ ...s, from: t.route_code })))
                          .map((s) => (
                            <option key={`${s.id}-${s.from}`} value={s.id}>
                              {s.first_name} {s.last_name} · from {s.from}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!selected || addRider.isPending || pickups.length === 0}
                  onClick={() => addRider.mutate({ tripId: trip.id, student: selected })}
                >
                  <Plus size={15} /> Add
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {(board?.unassigned?.length || 0) > 0 ? (
        <div className="card card-body">
          <h2 className="section-title">Unassigned students</h2>
          <input
            className="input mb-3 max-w-sm"
            placeholder="Filter unassigned…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Filter unassigned students"
          />
          <p className="text-sm text-slate">
            {pool.length} student{pool.length === 1 ? "" : "s"} without a seat. Add them to a run above.
          </p>
        </div>
      ) : null}
    </div>
  );
}
