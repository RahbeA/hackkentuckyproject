import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Upload } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { LogoMark } from "../components/brand/Logo";

const TYPE_ORDER = ["schools", "stops", "students", "vehicles", "drivers"] as const;
const REQUIRED_TYPES = ["schools", "students"] as const;
const SIZES = ["1–5 schools", "6–20", "20+"] as const;

const STATES = [
  { code: "KY", label: "Kentucky" },
  { code: "OH", label: "Ohio" },
  { code: "IN", label: "Indiana" },
] as const;

const TIMEZONES = [
  { value: "America/Kentucky/Louisville", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
] as const;

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "District details" },
    { n: 2, label: "Roster CSVs" },
    { n: 3, label: "First route plan" },
  ] as const;
  return (
    <div className="flex flex-wrap items-center">
      {items.map((item, i) => {
        const active = step === item.n;
        const done = step > item.n;
        return (
          <div key={item.n} className="flex min-w-0 flex-1 items-center">
            {i > 0 && <span className="mx-4 h-px min-w-6 flex-1 bg-line" />}
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12.5px] font-bold ${
                  active || done
                    ? "bg-route text-white"
                    : "border border-line bg-slate-soft text-muted"
                }`}
              >
                {item.n}
              </span>
              <span className={`text-[13.5px] ${active || done ? "font-semibold text-ink" : "font-medium text-muted"}`}>
                {item.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OnboardingPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [imported, setImported] = useState<Partial<Record<(typeof TYPE_ORDER)[number], { rows: number; file: string }>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [name, setName] = useState(user?.district_name || "");
  const [stateCode, setStateCode] = useState("KY");
  const [timezone, setTimezone] = useState("America/Kentucky/Louisville");
  const [bellStart, setBellStart] = useState("07:30");
  const [bellEnd, setBellEnd] = useState("08:15");
  const [size, setSize] = useState<(typeof SIZES)[number]>("1–5 schools");

  const { data: districts } = useQuery({
    queryKey: ["districts"],
    queryFn: async () => (await api.get("/districts/")).data,
  });
  const district = districts?.results?.[0] || districts?.[0];
  const { data: policies } = useQuery({
    queryKey: ["policies"],
    queryFn: async () => (await api.get("/policies/")).data,
  });
  const policy = policies?.results?.[0];

  useEffect(() => {
    if (!district) return;
    setName((n) => n || district.name || "");
    if (district.state) setStateCode(district.state);
    if (district.timezone) setTimezone(district.timezone);
  }, [district]);

  useEffect(() => {
    const extra = policy?.extra_constraints || {};
    if (extra.morning_bell_start) setBellStart(extra.morning_bell_start);
    if (extra.morning_bell_end) setBellEnd(extra.morning_bell_end);
    if (extra.school_size) setSize(extra.school_size);
  }, [policy]);

  const saveDistrict = useMutation({
    mutationFn: async () => {
      if (!district?.id) throw new Error("District workspace is not ready yet.");
      await api.patch(`/districts/${district.id}/`, {
        name,
        state: stateCode,
        timezone,
      });
      if (policy?.id) {
        await api.patch(`/policies/${policy.id}/`, {
          extra_constraints: {
            ...(policy.extra_constraints || {}),
            morning_bell_start: bellStart,
            morning_bell_end: bellEnd,
            school_size: size,
          },
        });
      }
    },
    onSuccess: () => {
      setSaveErr(null);
      setStep(2);
    },
    onError: (e) => setSaveErr(errorMessage(e)),
  });

  async function ingestFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (!files.length) {
      setErr("Drop CSV files only.");
      return;
    }
    setBusy(true);
    setErr(null);
    const rank = (name: string) => {
      const n = name.toLowerCase();
      return TYPE_ORDER.findIndex((t) => n.includes(t) || n.includes(t.slice(0, -1)));
    };
    files.sort((a, b) => {
      const ar = rank(a.name);
      const br = rank(b.name);
      return (ar < 0 ? 99 : ar) - (br < 0 ? 99 : br);
    });
    const failures: string[] = [];
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const { data } = await api.post("/imports/ingest/", fd, { headers: { "Content-Type": "multipart/form-data" } });
          const kind = data.import_type as (typeof TYPE_ORDER)[number];
          if (data.status === "committed") {
            setImported((prev) => ({ ...prev, [kind]: { rows: data.valid_rows || data.total_rows || 0, file: file.name } }));
          } else {
            const missing = data.validation_results?.missing_required as string[] | undefined;
            const first = (data.row_errors || [])[0];
            if (missing?.length) {
              failures.push(`${file.name}: missing ${missing.join(", ")}`);
            } else if (first) {
              failures.push(`${file.name}: row ${first.row_number} ${first.message}`);
            } else {
              failures.push(`${file.name}: could not import — check columns`);
            }
          }
        } catch (e) {
          failures.push(`${file.name}: ${errorMessage(e)}`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (failures.length) setErr(failures.join("\n"));
  }
  const { data: dataset } = useQuery({
    queryKey: ["validate-dataset", district?.id],
    enabled: Boolean(district?.id) && (step === 2 || step === 3),
    queryFn: async () => (await api.get(`/districts/${district.id}/validate-dataset/`)).data,
  });

  useEffect(() => {
    const counts = dataset?.counts;
    if (!counts) return;
    setImported((prev) => {
      const next = { ...prev };
      for (const t of TYPE_ORDER) {
        const rows = counts[t];
        if (rows && !next[t]) next[t] = { rows, file: "already in district" };
      }
      return next;
    });
  }, [dataset]);

  return (
    <div className="mx-auto max-w-[1000px] animate-slide-up">
      <Stepper step={step} />

      {step === 1 && (
        <div className="mt-11 grid items-start gap-12 lg:grid-cols-[1fr_minmax(260px,340px)]">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(26px,3vw,34px)] font-bold leading-tight tracking-tight">
              Set up your district
            </h1>
            <p className="mt-3 max-w-[30em] text-base leading-relaxed text-slate">
              These details set the calendar and bell windows every route plan is built against.
            </p>

            <form
              className="mt-7 flex max-w-[460px] flex-col gap-[18px]"
              onSubmit={(e) => {
                e.preventDefault();
                saveDistrict.mutate();
              }}
            >
              {saveErr && (
                <p role="alert" className="rounded-lg border border-bad/20 bg-bad/5 p-3 text-sm text-bad">
                  {saveErr}
                </p>
              )}
              <div>
                <label className="label" htmlFor="ob-name">
                  District name
                </label>
                <input
                  id="ob-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Riverside Unified School District"
                  required
                />
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ob-state">
                    State
                  </label>
                  <select id="ob-state" className="select" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                    {STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ob-tz">
                    Time zone
                  </label>
                  <select id="ob-tz" className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {TIMEZONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="label">Morning bell window</span>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <input
                    className="input tabular-nums"
                    type="time"
                    aria-label="Bell window start"
                    value={bellStart}
                    onChange={(e) => setBellStart(e.target.value)}
                  />
                  <input
                    className="input tabular-nums"
                    type="time"
                    aria-label="Bell window end"
                    value={bellEnd}
                    onChange={(e) => setBellEnd(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <span className="label">Approximate size</span>
                <div className="inline-flex flex-wrap gap-1 rounded-[10px] border border-line bg-slate-soft p-1">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold ${
                        size === s ? "bg-paper text-ink shadow-card" : "text-slate"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <button className="btn-primary !min-h-12 !px-[26px] !text-[15px]" disabled={saveDistrict.isPending}>
                  {saveDistrict.isPending ? "Saving…" : "Continue to roster import"}
                </button>
                <button type="button" className="text-sm font-semibold text-slate hover:text-ink" onClick={() => nav("/app/dashboard")}>
                  Save and finish later
                </button>
              </div>
            </form>
          </div>

          <aside className="min-w-0 rounded-2xl border border-line bg-canvas p-6">
            <div className="flex items-center gap-2.5">
              <LogoMark size={20} />
              <span className="text-xs font-bold uppercase tracking-[0.04em] text-slate">What happens next</span>
            </div>
            <div className="mt-[18px] flex flex-col gap-4">
              {[
                { title: "Drop your CSVs", body: "Schools and students are required. Stops, buses, and drivers unlock routing and live demo.", on: true },
                { title: "Generate a route plan", body: "Review arrival times against each bell window before publishing." },
                { title: "Share rider codes", body: "Parents join the district and claim a student. Drivers sign in with the email in their CSV." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <span className={`mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${item.on ? "bg-route" : "bg-line"}`} />
                  <div>
                    <div className="text-[13.5px] font-semibold">{item.title}</div>
                    <p className="mt-1 text-[13px] leading-snug text-slate">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-[22px] border-t border-line pt-4 text-xs text-muted">
              We detect the file type from the name or columns. No mapping step.
            </div>
          </aside>
        </div>
      )}

      {step === 2 && (
        <div className="mt-11 max-w-[560px] space-y-6">
          <div>
            <h1 className="font-display text-[clamp(26px,3vw,34px)] font-bold leading-tight tracking-tight">
              Drop in your CSVs
            </h1>
            <p className="mt-3 max-w-[34em] text-base leading-relaxed text-slate">
              Schools and students are required. Add stops, vehicles, and drivers if you have them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {TYPE_ORDER.map((t) => (
                <a
                  key={t}
                  className="btn-secondary capitalize !py-2 text-xs"
                  href={`${API_BASE}/imports/test-flow/happy_path/${t}/`}
                >
                  <Download size={14} /> {t}.csv
                </a>
              ))}
            </div>
          </div>

          <label
            className={`block cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragOver ? "border-route bg-accent-soft/40" : "border-slate/20 bg-paper hover:border-route/40 hover:bg-accent-soft/20"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void ingestFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mx-auto text-route" size={28} />
            <p className="mt-3 text-[15px] font-semibold text-ink">
              {busy ? "Importing…" : "Drop CSV files here"}
            </p>
            <p className="mt-1 text-sm text-slate">or click to choose. We figure out the type.</p>
            <input
              type="file"
              accept=".csv"
              multiple
              className="sr-only"
              aria-label="Upload roster CSV files"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) void ingestFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {err && (
            <p role="alert" className="whitespace-pre-line rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-bad">
              {err}
            </p>
          )}

          <ul className="space-y-2">
            {TYPE_ORDER.map((t) => {
              const done = imported[t];
              const required = (REQUIRED_TYPES as readonly string[]).includes(t);
              return (
                <li
                  key={t}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold capitalize text-ink">{t}</p>
                    <p className="text-xs text-muted">
                      {done ? `${done.rows} rows · ${done.file}` : required ? "Required" : "Optional"}
                    </p>
                  </div>
                  <span className={`badge-${done ? "good" : "neutral"}`}>{done ? "Imported" : "Waiting"}</span>
                </li>
              );
            })}
          </ul>

          <p className="text-xs leading-relaxed text-muted">
            Need columns: schools — school_id, name, latitude, longitude. Students — student_id, first_name, last_name,
            school_id, latitude, longitude. Stops — stop_id, name, latitude, longitude. Vehicles — vehicle_number, capacity.
            Drivers — employee_id, email, first_name, last_name.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn-primary !min-h-12 !px-[26px]"
              disabled={busy || !imported.schools || !imported.students}
              onClick={() => setStep(3)}
            >
              Continue to first route plan
            </button>
            <button type="button" className="text-sm font-semibold text-slate hover:text-ink" onClick={() => setStep(1)}>
              Back to district details
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-11 max-w-xl">
          <h1 className="font-display text-[clamp(26px,3vw,34px)] font-bold leading-tight tracking-tight">
            Generate a route plan
          </h1>
          <p className="mt-3 max-w-[32em] text-base leading-relaxed text-slate">
            Generate, approve, then publish. Publishing creates today's trips so Start live demo and parent phones have a
            bus to follow.
          </p>
          {dataset && (
            <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${dataset.ok ? "border-good/30 bg-good/5" : "border-line bg-canvas"}`}>
              <p className="font-semibold">{dataset.ok ? "Roster looks ready" : "A few gaps before generate"}</p>
              <p className="mt-1 text-slate">
                {dataset.counts?.schools ?? 0} schools · {dataset.counts?.students ?? 0} students · {dataset.counts?.vehicles ?? 0}{" "}
                vehicles · {dataset.counts?.drivers ?? 0} drivers
              </p>
              {(dataset.issues || []).map((issue: string) => (
                <p key={issue} className="mt-1 text-bad">
                  {issue}
                </p>
              ))}
            </div>
          )}
          <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-slate">
            <li>Open the planner and generate a plan for each school.</li>
            <li>Approve, then publish — that materializes today's trips.</li>
            <li>Share rider codes from Students with parent accounts.</li>
            <li>Start live demo from Live or Dispatcher. Parents and drivers see the buses.</li>
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/app/planner" className="btn-primary !min-h-12 !px-[26px] !text-[15px]">
              Open route planner
            </Link>
            <button type="button" className="text-sm font-semibold text-slate hover:text-ink" onClick={() => setStep(2)}>
              Back to imports
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
