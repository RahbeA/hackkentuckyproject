import { useQuery } from "@tanstack/react-query";
import { Bus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { PageHeader } from "../components/ui/PageHeader";

function EmptyRoster({ label }: { label: string }) {
  return (
    <div className="card card-body text-center text-slate">
      <p className="font-semibold text-ink">No {label} yet</p>
      <p className="text-sm mt-1">
        Import your roster from{" "}
        <Link className="link" to="/app/onboarding">
          District onboarding
        </Link>
        .
      </p>
    </div>
  );
}

export function FleetPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => (await api.get("/vehicles/", { params: { page_size: 50 } })).data,
  });
  const rows = data?.results || [];
  return (
    <div className="page-shell">
      <PageHeader title="Fleet" subtitle="Buses, capacity, and depot assignments for the demo district." />
      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : rows.length === 0 ? (
        <EmptyRoster label="vehicles" />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((v: { id: string; internal_number: string; capacity: number; wheelchair_capacity: number; status: string; vehicle_type: string; depot_name?: string }) => (
            <article key={v.id} className="card card-body flex justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-sky/10 flex items-center justify-center text-sky">
                    <Bus size={18} />
                  </div>
                  <div className="font-bold text-lg">{v.internal_number}</div>
                </div>
                <div className="text-sm text-slate capitalize mt-2">
                  {v.vehicle_type} · {v.depot_name || "Unassigned depot"}
                </div>
                <div className="text-sm mt-1 text-ink">
                  {v.capacity} seats
                  {v.wheelchair_capacity > 0 && ` · ${v.wheelchair_capacity} wheelchair`}
                </div>
              </div>
              <span className={v.status === "active" ? "badge-good h-fit" : "badge-neutral h-fit"}>{v.status}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function DriversPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => (await api.get("/drivers/", { params: { page_size: 50 } })).data,
  });
  const rows = data?.results || [];
  return (
    <div className="page-shell">
      <PageHeader title="Drivers" subtitle="Licensed operators with endorsements and assignment status." />
      {isLoading ? (
        <LoadingBlock rows={5} />
      ) : rows.length === 0 ? (
        <EmptyRoster label="drivers" />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Name</th>
                <th>License exp.</th>
                <th>Endorsements</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d: { id: string; employee_id: string; first_name: string; last_name: string; license_expiration: string; endorsements: string[]; is_active: boolean }) => (
                <tr key={d.id}>
                  <td className="font-mono text-xs text-slate">{d.employee_id}</td>
                  <td className="font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <Users size={14} className="text-muted" />
                      {d.first_name} {d.last_name}
                    </span>
                  </td>
                  <td className="text-slate tabular-nums">{d.license_expiration}</td>
                  <td className="text-slate text-xs">{(d.endorsements || []).join(", ") || "—"}</td>
                  <td>{d.is_active ? <span className="badge-good">Active</span> : <span className="badge-neutral">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
