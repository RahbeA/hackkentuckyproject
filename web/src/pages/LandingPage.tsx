import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Logo, LogoMark, LogoWordmark } from "../components/brand/Logo";
import { ROLE_HOME } from "../types";

/* ------------------------------------------------------------------ Data */

type StatusTone = "good" | "warn" | "muted";

interface FleetRow {
  title: string;
  sub: string;
  badge: string;
  tone: StatusTone;
  hl?: boolean;
}

const AUDIENCES = {
  districts: {
    label: "Districts & schools",
    title: "Districts and schools",
    body: "Coordinate routes, monitor buses, and manage disruptions from one board that every school office can see.",
    points: [
      "Route plans reviewed against bell windows",
      "Live status for every active bus",
      "Targeted updates when something changes",
    ],
    caption: "District board · Morning",
    rows: [
      { title: "Route 14 · North", sub: "8 stops · 41 riders", badge: "On time", tone: "good" },
      { title: "Route 22 · Riverside", sub: "11 stops · 53 riders", badge: "+6 min", tone: "warn", hl: true },
      { title: "Route 31 · Eastgate", sub: "7 stops · 34 riders", badge: "On time", tone: "good" },
      { title: "Route 45 · Hillcrest", sub: "9 stops · 47 riders", badge: "Queued", tone: "muted" },
    ] as FleetRow[],
  },
  drivers: {
    label: "Drivers",
    title: "Drivers",
    body: "View assigned routes, stop details, and dispatch updates without leaving the run sheet.",
    points: ["Today's assignment and stop sequence", "Rider count per stop", "Dispatch messages in the same view"],
    caption: "Route 14 · Run sheet",
    rows: [
      { title: "Stop 5 · Cedar Ln", sub: "Completed 7:36 AM · 6 riders", badge: "Done", tone: "good" },
      { title: "Stop 6 · Maple & 3rd", sub: "Next · 5 riders", badge: "Now", tone: "warn", hl: true },
      { title: "Stop 7 · Birch Ct", sub: "Est. 7:47 AM · 4 riders", badge: "Ahead", tone: "muted" },
      { title: "Riverside Elementary", sub: "Est. arrival 7:52 AM", badge: "School", tone: "muted" },
    ] as FleetRow[],
  },
  families: {
    label: "Families",
    title: "Families",
    body: "See bus arrival estimates and receive notifications only for the routes your own riders are on.",
    points: ["Arrival estimate for your stop", "Delay notices with a revised time", "Nothing about other families' routes"],
    caption: "My riders",
    rows: [
      { title: "Ava · Bus 14", sub: "Maple & 3rd · 7:42 AM", badge: "On time", tone: "good" },
      { title: "Noah · Bus 22", sub: "Oak Ridge Dr · 7:48 AM", badge: "+6 min", tone: "warn", hl: true },
      { title: "Afternoon · Bus 14", sub: "Drop-off est. 3:24 PM", badge: "Planned", tone: "muted" },
    ] as FleetRow[],
  },
} as const;

type AudienceKey = keyof typeof AUDIENCES;

const toneClass: Record<StatusTone, string> = {
  good: "bg-good/10 text-good border-good/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  muted: "bg-canvas text-slate border-line",
};

/* ------------------------------------------------------------------ Bits */

function DemoTag({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${
        dark ? "text-white/40" : "text-muted"
      }`}
    >
      Demo data
    </span>
  );
}

function MiniFleetPanel({ caption, rows }: { caption: string; rows: FleetRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="text-xs font-semibold">{caption}</span>
        <DemoTag />
      </div>
      <div>
        {rows.map((r, i) => (
          <div
            key={r.title}
            className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-line" : ""} ${
              r.hl ? "bg-[#FFFBF5]" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">{r.title}</div>
              <div className="mt-0.5 text-[11.5px] text-slate">{r.sub}</div>
            </div>
            <span
              className={`shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-bold ${toneClass[r.tone]}`}
            >
              {r.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Full-bleed street map — fills the hero plane edge to edge. */
function HeroMap({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1280 800"
      preserveAspectRatio="xMidYMid slice"
      className={`block h-full w-full ${className}`}
      role="img"
      aria-label="Live district map with active bus routes"
    >
      <defs>
        <linearGradient id="heroMapWash" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#F8FAFC" stopOpacity="0.97" />
          <stop offset="42%" stopColor="#F8FAFC" stopOpacity="0.72" />
          <stop offset="72%" stopColor="#F8FAFC" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1280" height="800" fill="#E8EEF5" />
      <rect x="90" y="70" width="220" height="160" rx="4" fill="#DCE8DE" />
      <rect x="820" y="520" width="240" height="170" rx="4" fill="#DCE8DE" />
      <rect x="460" y="110" width="140" height="90" rx="4" fill="#DDE4EF" />
      <rect x="980" y="160" width="160" height="120" rx="4" fill="#DDE4EF" />
      <g stroke="#D5DEE9" strokeWidth="18" strokeLinecap="square">
        <path d="M0 160H1280M0 320H1280M0 480H1280M0 640H1280" />
        <path d="M180 0V800M380 0V800M620 0V800M860 0V800M1080 0V800" />
      </g>
      <g stroke="#C5D0DE" strokeWidth="4">
        <path d="M0 240H1280M0 400H1280M0 560H1280" />
        <path d="M280 0V800M500 0V800M740 0V800M970 0V800" />
      </g>
      <path
        className="dart-hero-route-ghost"
        d="M80 640 L380 640 L380 320 L620 320 L620 160 L1080 160"
        fill="none"
        stroke="#93B4F7"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".5"
      />
      <path
        className="dart-hero-route"
        d="M80 640 L380 640 L380 320 L620 320 L620 480 L970 480 L970 240 L1180 240"
        fill="none"
        stroke="#2563EB"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="#fff" stroke="#2563EB" strokeWidth="3.5">
        <circle cx="380" cy="640" r="8" />
        <circle cx="380" cy="480" r="8" />
        <circle cx="620" cy="480" r="8" />
        <circle cx="970" cy="480" r="8" />
        <circle cx="970" cy="240" r="8" />
      </g>
      <circle cx="80" cy="640" r="10" fill="#0B1120" />
      <g transform="translate(620 320)">
        <g className="dart-hero-bus">
          <circle r="28" fill="#2563EB" opacity=".14" />
          <circle r="18" fill="#2563EB" />
          <path d="M0 -8 L7 7 L0 3 L-7 7 Z" fill="#fff" />
        </g>
      </g>
      <g transform="translate(1180 240)">
        <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#0B1120" />
        <path d="M-5 2 L-5 -4 L0 -7.5 L5 -4 L5 2 Z" fill="#fff" />
      </g>
      <rect width="1280" height="800" fill="url(#heroMapWash)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Page */

export function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [audience, setAudience] = useState<AudienceKey>("districts");
  const primaryTo = user ? ROLE_HOME[user.role] : "/login?guide=1";
  const primaryLabel = user ? "Open the console" : "Start guided demo";
  const aud = AUDIENCES[audience];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* ── Header ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-paper/75 backdrop-blur-[14px]">
        <div className="relative mx-auto flex h-[68px] max-w-[1200px] items-center justify-between px-6">
          <Link to="/" aria-label="DART home" className="relative z-10 flex shrink-0 items-center">
            <Logo size={26} />
          </Link>
          <nav
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-7 md:flex"
            aria-label="Primary"
          >
            <Link to="/pitch" className="text-sm font-semibold text-route transition-colors hover:text-ink">
              Pitch
            </Link>
            <a href="#guide" className="text-sm font-medium text-slate transition-colors hover:text-ink">
              For judges
            </a>
            <a href="#platform" className="text-sm font-medium text-slate transition-colors hover:text-ink">
              Platform
            </a>
            <a href="#audiences" className="text-sm font-medium text-slate transition-colors hover:text-ink">
              Who It's For
            </a>
            <a href="#how" className="text-sm font-medium text-slate transition-colors hover:text-ink">
              How It Works
            </a>
          </nav>
          <div className="relative z-10 hidden items-center gap-4 md:flex">
            {!user && (
              <Link to="/login" className="text-sm font-semibold text-ink">
                Sign In
              </Link>
            )}
            <Link
              to={user ? primaryTo : "/login"}
              className="inline-flex items-center rounded-xl bg-route px-[18px] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
            >
              {primaryLabel}
            </Link>
          </div>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-paper md:hidden"
          >
            <span className="relative block h-[1.5px] w-4 bg-ink shadow-[0_-5px_0_#111827,0_5px_0_#111827]" />
          </button>
        </div>
        {menuOpen && (
          <div className="flex flex-col gap-1 border-t border-line bg-paper px-6 pb-6 pt-4 md:hidden">
            <Link to="/pitch" onClick={() => setMenuOpen(false)} className="border-b border-slate-soft py-3 text-base font-semibold text-route">
              Pitch deck
            </Link>
            <a href="#guide" onClick={() => setMenuOpen(false)} className="border-b border-slate-soft py-3 text-base font-medium">
              For judges
            </a>
            <a href="#platform" onClick={() => setMenuOpen(false)} className="border-b border-slate-soft py-3 text-base font-medium">
              Platform
            </a>
            <a href="#audiences" onClick={() => setMenuOpen(false)} className="border-b border-slate-soft py-3 text-base font-medium">
              Who It's For
            </a>
            <a href="#how" onClick={() => setMenuOpen(false)} className="border-b border-slate-soft py-3 text-base font-medium">
              How It Works
            </a>
            {!user && (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="py-3 text-base font-medium">
                Sign In
              </Link>
            )}
            <Link
              to={user ? primaryTo : "/login"}
              className="mt-3 flex items-center justify-center rounded-xl bg-route px-4 py-3.5 text-[15px] font-semibold text-white"
            >
              {primaryLabel}
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero — full viewport, map as the plane ── */}
      <section id="top" className="relative isolate min-h-[100dvh] overflow-hidden border-b border-line">
        <div className="absolute inset-0" aria-hidden="true">
          <HeroMap />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_42%,transparent_0%,rgba(248,250,252,0.35)_55%,rgba(248,250,252,0.92)_100%)]" />
          <div className="absolute inset-y-0 left-0 w-full max-w-[720px] bg-gradient-to-r from-[#F8FAFC] via-[#F8FAFC]/88 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#F8FAFC]/90 to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-center px-6 pb-24 pt-[88px]">
          <div className="max-w-[34rem] animate-slide-up">
            <LogoWordmark size={44} className="dart-hero-brand" />
            <h1 className="mt-8 font-display text-[clamp(42px,7vw,76px)] font-bold leading-[0.98] tracking-tight text-balance">
              Every route.
              <br />
              Every rider.
              <br />
              <span className="text-route">In sync.</span>
            </h1>
            <p className="mt-6 max-w-[28em] text-[clamp(16px,1.5vw,19px)] leading-relaxed text-slate">
              Bring routes, bus tracking, and transportation updates together so districts stay coordinated and families
              stay informed.
            </p>
            <p className="mt-4 max-w-[32em] text-[13.5px] font-semibold text-ink">
              Judges: Jefferson Demo Schools is already seeded. No CSV upload. About six minutes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={primaryTo} className="btn-primary !py-3.5 !px-6 text-[15px] shadow-float">
                {primaryLabel} <ArrowRight size={16} />
              </Link>
              <a href="#guide" className="btn-secondary !py-3.5 !px-6 text-[15px]">
                Read the 6 steps
              </a>
            </div>
          </div>
        </div>

        <a
          href="#audiences"
          className="dart-hero-scroll absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate/80 transition-colors hover:text-ink"
        >
          <span>Explore</span>
          <span className="dart-hero-scroll-line block h-8 w-px bg-gradient-to-b from-route to-transparent" />
        </a>
      </section>

      {/* ── Judge walkthrough ── */}
      <section id="guide" className="border-b border-line bg-paper">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-[44em]">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-route">For hackathon judges</div>
            <h2 className="mt-3.5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight">
              A 6-step walkthrough. We will not be in the room.
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-slate">
              Press Start guided demo, then follow the blue coach at the top of every screen. All names, GPS, and models
              are fictional.
            </p>
          </div>
          <ol className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { n: "1", title: "District board", body: "Six KPIs and a live fleet map. Data is already loaded." },
              { n: "2", title: "Route planner", body: "A reliability plan is published. Optional: generate Fastest." },
              { n: "3", title: "Compare plans", body: "Mileage, vehicles, and on-time chance side by side." },
              { n: "4", title: "Rainy-morning test", body: "Run the digital twin. Read the interpretation card." },
              { n: "5", title: "Start the buses", body: "Press Start live demo. Click a route to follow it." },
              { n: "6", title: "Family view", body: "Next switches you to a parent account. You only see Ava." },
            ].map((s) => (
              <li key={s.n} className="rounded-2xl border border-line bg-canvas p-6">
                <div className="font-display text-[28px] font-bold tabular-nums text-route">{s.n}</div>
                <h3 className="mt-2 font-display text-[18px] font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to={primaryTo} className="btn-primary !py-3.5 !px-6 text-[15px]">
              {primaryLabel} <ArrowRight size={16} />
            </Link>
            <Link to="/pitch" className="btn-secondary !py-3.5 !px-6 text-[15px]">
              Open the pitch deck
            </Link>
            <p className="text-[13.5px] text-slate">
              Password for every demo account is <span className="font-semibold text-ink">DemoPass123!</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Audiences ── */}
      <section id="audiences" className="border-b border-line bg-paper">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-[44em]">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-route">Who it's for</div>
            <h2 className="mt-3.5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight">
              A connected transportation experience
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-slate">
              One platform, three vantage points. Everyone sees the part of the morning they are responsible for.
            </p>
          </div>

          <div className="mt-10">
            <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-slate-soft p-1">
              {(Object.keys(AUDIENCES) as AudienceKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setAudience(key)}
                  className={`min-h-11 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${
                    audience === key ? "bg-paper text-ink shadow-card" : "text-slate hover:text-ink"
                  }`}
                >
                  {AUDIENCES[key].label}
                </button>
              ))}
            </div>
            <div className="mt-6 grid items-center gap-8 rounded-2xl border border-line bg-canvas p-8 md:grid-cols-2">
              <div className="min-w-0">
                <h3 className="font-display text-2xl font-bold tracking-tight">{aud.title}</h3>
                <p className="mt-3 max-w-[30em] text-[15.5px] leading-relaxed text-slate">{aud.body}</p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {aud.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-route" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <MiniFleetPanel caption={aud.caption} rows={aud.rows} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section id="platform" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-[44em]">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-route">Platform</div>
            <h2 className="mt-3.5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight">
              Core capabilities
            </h2>
          </div>

          <div className="mt-14 flex flex-col gap-[72px]">
            {/* 1 — Route planning */}
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="min-w-0">
                <div className="font-display text-[13px] font-bold tabular-nums text-route">01</div>
                <h3 className="mt-2 font-display text-[clamp(22px,2.2vw,28px)] font-bold leading-tight tracking-tight">
                  Route planning and coordination
                </h3>
                <p className="mt-3.5 max-w-[32em] text-base leading-relaxed text-slate">
                  Build stop sequences around capacity and bell windows, then review each route's mileage and ride time
                  before the plan goes live.
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <span className="text-xs font-semibold">Route plan · Fall term</span>
                  <DemoTag />
                </div>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate">
                      <th className="px-4 py-2.5 text-left">Route</th>
                      <th className="px-2 py-2.5 text-left">Stops</th>
                      <th className="px-2 py-2.5 text-left">Riders</th>
                      <th className="px-4 py-2.5 text-left">Arrive</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[
                      ["14 · North", "8", "41", "7:52 AM", false],
                      ["22 · Riverside", "11", "53", "7:58 AM", true],
                      ["31 · Eastgate", "7", "34", "8:04 AM", false],
                      ["45 · Hillcrest", "9", "47", "8:06 AM", false],
                    ].map(([route, stops, riders, arrive, hl]) => (
                      <tr key={route as string} className={hl ? "bg-accent-soft" : ""}>
                        <td className="border-t border-line px-4 py-2.5 font-semibold">{route}</td>
                        <td className="border-t border-line px-2 py-2.5 text-slate">{stops}</td>
                        <td className="border-t border-line px-2 py-2.5 text-slate">{riders}</td>
                        <td className="border-t border-line px-4 py-2.5">{arrive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2 — Live fleet */}
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="min-w-0 lg:order-2">
                <div className="font-display text-[13px] font-bold tabular-nums text-route">02</div>
                <h3 className="mt-2 font-display text-[clamp(22px,2.2vw,28px)] font-bold leading-tight tracking-tight">
                  Live fleet visibility
                </h3>
                <p className="mt-3.5 max-w-[32em] text-base leading-relaxed text-slate">
                  Watch every active bus against its planned route, with arrival estimates that update as the morning
                  progresses.
                </p>
              </div>
              <div className="lg:order-1">
                <MiniFleetPanel
                  caption="Fleet · 4 active"
                  rows={[
                    { title: "Bus 14", sub: "Stop 6 of 8 · Maple & 3rd", badge: "On time", tone: "good" },
                    { title: "Bus 22", sub: "Stop 4 of 11 · Oak Ridge Dr", badge: "+6 min", tone: "warn", hl: true },
                    { title: "Bus 31", sub: "Stop 2 of 7 · Eastgate Blvd", badge: "On time", tone: "good" },
                    { title: "Bus 45", sub: "Not yet departed", badge: "Queued", tone: "muted" },
                  ]}
                />
              </div>
            </div>

            {/* 3 — Notifications */}
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="min-w-0">
                <div className="font-display text-[13px] font-bold tabular-nums text-route">03</div>
                <h3 className="mt-2 font-display text-[clamp(22px,2.2vw,28px)] font-bold leading-tight tracking-tight">
                  Parent and school notifications
                </h3>
                <p className="mt-3.5 max-w-[32em] text-base leading-relaxed text-slate">
                  Send transportation updates to the schools and families a change actually affects, with the revised
                  arrival estimate attached.
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <span className="text-xs font-semibold">Compose update</span>
                  <DemoTag />
                </div>
                <div className="p-4">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate">Audience</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-lg border border-route/20 bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-route">
                      Route 22 families · 53
                    </span>
                    <span className="inline-flex items-center rounded-lg border border-route/20 bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-route">
                      Riverside Elementary
                    </span>
                  </div>
                  <div className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate">Message</div>
                  <div className="mt-2 rounded-xl border border-line bg-canvas px-3.5 py-3 text-[13.5px] leading-snug">
                    Route 22 is running about 6 minutes late this morning. Revised arrival at Riverside Elementary is 8:04
                    AM.
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-xl bg-route px-4 py-2.5 text-[13px] font-semibold text-white">
                      Send update
                    </span>
                    <span className="text-xs text-slate">Push · Email · SMS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 — Disruption dispatch */}
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="min-w-0 lg:order-2">
                <div className="font-display text-[13px] font-bold tabular-nums text-route">04</div>
                <h3 className="mt-2 font-display text-[clamp(22px,2.2vw,28px)] font-bold leading-tight tracking-tight">
                  Disruption response and dispatch communication
                </h3>
                <p className="mt-3.5 max-w-[32em] text-base leading-relaxed text-slate">
                  Flag a delay, adjust the route status, and keep drivers and staff on the same version of the morning.
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl bg-navy shadow-float lg:order-1">
                <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
                  <span className="text-xs font-semibold text-white">Dispatch thread · Route 22</span>
                  <DemoTag dark />
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white">
                      DR
                    </span>
                    <div className="max-w-[85%] rounded-xl bg-white/[0.07] px-3 py-2.5 text-[13px] leading-normal text-white/90">
                      Heavy backup on Oak Ridge. Holding at stop 4.
                    </div>
                  </div>
                  <div className="flex flex-row-reverse gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-route text-[10px] font-bold text-white">
                      DP
                    </span>
                    <div className="max-w-[85%] rounded-xl bg-route px-3 py-2.5 text-[13px] leading-normal text-white">
                      Copied. Marking Route 22 delayed and notifying Riverside.
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5">
                    <span className="h-5 w-1 shrink-0 rounded-full bg-warn" />
                    <span className="text-[12.5px] font-semibold text-[#FBD38D]">Status changed to Delayed · +6 min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Disruption walkthrough ── */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-[44em]">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-sky">Walkthrough</div>
            <h2 className="mt-3.5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight">
              One disruption, everyone informed
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-white/60">
              A fictional Route 22 delay, followed from the dispatch desk to the family's phone.
            </p>
          </div>

          <div className="mt-12 flex flex-col gap-7">
            {[
              {
                n: "1",
                when: "7:31 AM · Dispatcher",
                title: "The delay is identified",
                body: "Bus 22 stops progressing on Oak Ridge Drive. Dispatch sees the gap against the planned sequence.",
              },
              {
                n: "2",
                when: "7:33 AM · Dispatcher",
                title: "Route status is updated",
                body: "The route is marked delayed with a revised arrival, and the driver is acknowledged in the dispatch thread.",
              },
              {
                n: "3",
                when: "7:34 AM · School office",
                title: "The school sees the change",
                body: "Riverside Elementary gets the revised arrival for its own inbound routes, with rider counts attached.",
              },
              {
                n: "4",
                when: "7:34 AM · Families",
                title: "Affected families are notified",
                body: "Only Route 22 families receive the update, showing the new estimate for their own stop.",
              },
            ].map((step) => (
              <div key={step.n} className="grid items-center gap-8 border-t border-white/10 pt-7 md:grid-cols-2">
                <div className="flex min-w-0 gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-route font-display text-[13px] font-bold">
                    {step.n}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] tabular-nums text-sky">
                      {step.when}
                    </div>
                    <h3 className="mt-2 font-display text-xl font-bold tracking-tight">{step.title}</h3>
                    <p className="mt-2 max-w-[30em] text-[15px] leading-relaxed text-white/60">{step.body}</p>
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                  {step.n === "1" && (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="h-2 w-2 rounded-full bg-warn" />
                        <span className="text-[13px] font-semibold">Bus 22 · behind schedule</span>
                        <span className="ml-auto text-xs tabular-nums text-white/55">+6 min</span>
                      </div>
                      <div className="mt-3.5 h-[5px] overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-[34%] rounded-full bg-warn" />
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-white/45">
                        <span>Stop 4 of 11</span>
                        <span>Oak Ridge Dr</span>
                      </div>
                    </>
                  )}
                  {step.n === "2" && (
                    <>
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/45">Route status</div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <span className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white/50">
                          On time
                        </span>
                        <span className="rounded-lg border border-warn bg-warn/20 px-3 py-1.5 text-[12.5px] font-bold text-[#FBD38D]">
                          Delayed
                        </span>
                        <span className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white/50">
                          Reassigned
                        </span>
                      </div>
                      <div className="mt-3.5 text-[12.5px] text-white/60">
                        Revised arrival <strong className="tabular-nums text-white">8:04 AM</strong> at Riverside Elementary
                      </div>
                    </>
                  )}
                  {step.n === "3" && (
                    <div className="-m-4">
                      <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold">
                        Riverside Elementary · Inbound
                      </div>
                      {[
                        ["Route 14", "7:52 AM", "On time", "text-good"],
                        ["Route 22", "8:04 AM", "+6 min", "text-[#FBD38D]"],
                        ["Route 45", "8:06 AM", "On time", "text-good"],
                      ].map(([r, t, s, c], i) => (
                        <div
                          key={r}
                          className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-white/10" : ""} ${
                            i === 1 ? "bg-warn/10" : ""
                          }`}
                        >
                          <span className="flex-1 text-[13px] font-semibold">{r}</span>
                          <span className="text-[12.5px] tabular-nums text-white/55">{t}</span>
                          <span className={`text-[11px] font-bold ${c}`}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.n === "4" && (
                    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl bg-paper text-ink shadow-float">
                      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
                        <LogoMark size={14} />
                        <span className="text-[11px] font-bold">DART</span>
                        <span className="ml-auto text-[10.5px] tabular-nums text-muted">now</span>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[13px] font-semibold">Route 22 is running late</div>
                        <p className="mt-1.5 text-[12.5px] leading-snug text-slate">
                          About 6 minutes behind. Maple &amp; 3rd pickup is now estimated at 7:48 AM.
                        </p>
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
                          <span className="font-display text-[17px] font-bold tabular-nums">7:48</span>
                          <span className="text-[11px] font-semibold text-slate">AM · revised</span>
                          <span className="ml-auto text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted">Demo</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="border-b border-line bg-paper">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-[44em]">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-route">How it works</div>
            <h2 className="mt-3.5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight">
              Three steps to a coordinated morning
            </h2>
          </div>
          <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                n: "01",
                title: "Set up your district",
                body: "Add schools, bell times, vehicles, and drivers, then import your student roster.",
              },
              {
                n: "02",
                title: "Organize routes and assignments",
                body: "Group stops into routes, assign buses and drivers, and review arrival times against each bell window.",
              },
              {
                n: "03",
                title: "Keep everyone connected",
                body: "Track the fleet through the morning and send updates to the schools and families a change affects.",
              },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-line bg-canvas p-7">
                <div className="font-display text-[34px] font-bold tracking-tight tabular-nums text-route">{s.n}</div>
                <h3 className="mt-3 font-display text-[19px] font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile ── */}
      <section id="mobile" className="border-b border-line bg-gradient-to-b from-canvas to-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-[1fr_1.05fr]">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-route">Mobile</div>
            <h2 className="mt-3.5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight">
              The morning, on a family phone
            </h2>
            <p className="mt-4 max-w-[32em] text-[17px] leading-relaxed text-slate">
              Guardians see arrival estimates for their own riders, get delay notices with a revised time, and follow the
              bus without calling the school office.
            </p>
            <ul className="mt-8 flex flex-col gap-3.5">
              {[
                "Live ETA for each linked rider and stop",
                "Push alerts only when that route is affected",
                "Absence notes and office messages in one place",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-[15px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-route" />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to={primaryTo} className="btn-primary !py-3.5 !px-6 text-[15px]">
                Explore the demo <ArrowRight size={16} />
              </Link>
              <span className="text-[13px] font-medium text-muted">Guardian experience · Demo data</span>
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-[420px] items-end justify-center gap-4 sm:max-w-none sm:justify-end">
            {/* Back phone — updates */}
            <div
              className="hidden w-[200px] shrink-0 translate-y-6 rounded-[28px] bg-navy p-2 shadow-float sm:block"
              aria-hidden="true"
            >
              <div className="overflow-hidden rounded-[22px] bg-paper">
                <div className="flex h-7 items-center justify-center">
                  <span className="h-1 w-12 rounded-full bg-line" />
                </div>
                <div className="px-3.5 pb-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Updates</div>
                  <div className="mt-3 space-y-2.5">
                    <div className="rounded-xl border border-line bg-canvas px-3 py-2.5">
                      <div className="text-[11px] font-semibold">Route 22 delayed</div>
                      <p className="mt-1 text-[10.5px] leading-snug text-slate">
                        About 6 minutes behind. Oak Ridge pickup now 7:48 AM.
                      </p>
                      <div className="mt-2 text-[9.5px] tabular-nums text-muted">7:34 AM</div>
                    </div>
                    <div className="rounded-xl border border-line px-3 py-2.5">
                      <div className="text-[11px] font-semibold">Bus 14 on time</div>
                      <p className="mt-1 text-[10.5px] leading-snug text-slate">
                        Maple &amp; 3rd still estimated at 7:42 AM.
                      </p>
                      <div className="mt-2 text-[9.5px] tabular-nums text-muted">7:28 AM</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Front phone — today / arriving */}
            <div className="relative z-10 w-[min(260px,88%)] shrink-0 rounded-[32px] bg-navy p-2.5 shadow-float">
              <div className="overflow-hidden rounded-[24px] bg-paper">
                <div className="flex h-8 items-center justify-center">
                  <span className="h-1.5 w-14 rounded-full bg-line" />
                </div>
                <div className="px-4 pb-5">
                  <div className="flex items-center gap-2">
                    <LogoMark size={14} />
                    <span className="text-[11px] font-bold tracking-wide">Today</span>
                    <span className="ml-auto text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted">Demo</span>
                  </div>
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Arriving</div>
                    <div className="mt-1.5 flex items-end gap-1.5">
                      <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
                        7:42
                      </span>
                      <span className="pb-1 text-sm font-semibold text-slate">AM</span>
                    </div>
                    <div className="mt-1.5 text-[13px] text-slate">Ava · Maple &amp; 3rd · Bus 14</div>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-line">
                    <div className="flex gap-2.5 px-3 py-3">
                      <span className="w-1 shrink-0 rounded-full bg-warn" />
                      <span className="text-[12px] leading-snug">
                        Route 14 is running about 6 minutes late this morning.
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-line bg-canvas px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold">Noah · Bus 22</span>
                      <span className="text-[10px] font-bold text-warn">+6 min</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate">Oak Ridge Dr · 7:48 AM</div>
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-1 border-t border-line pt-3 text-center">
                    {["Today", "Live", "Updates", "More"].map((tab, i) => (
                      <span
                        key={tab}
                        className={`text-[9.5px] font-semibold ${i === 0 ? "text-route" : "text-muted"}`}
                      >
                        {tab}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-paper p-[clamp(32px,5vw,64px)] shadow-card">
            <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-50" aria-hidden="true">
              <g stroke="#E2E8F0" strokeWidth="1.2">
                <path d="M0 40H400M0 100H400M0 160H400M80 0V200M180 0V200M300 0V200" />
              </g>
              <path
                d="M-10 160 L80 160 L80 100 L180 100 L180 40 L300 40 L300 100 L410 100"
                fill="none"
                stroke="#BFDBFE"
                strokeWidth="2.5"
              />
            </svg>
            <div className="relative max-w-[38em]">
              <LogoMark size={34} />
              <h2 className="mt-6 font-display text-[clamp(26px,3.4vw,44px)] font-bold leading-tight tracking-tight text-balance">
                A clearer school day starts with a connected route.
              </h2>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <Link to={primaryTo} className="btn-primary !py-3.5 !px-6 text-[15px] shadow-float">
                  {primaryLabel} <ArrowRight size={16} />
                </Link>
                {!user && (
                  <Link to="/login" className="text-[15px] font-semibold text-ink">
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-10 pt-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <Logo size={24} />
            <div className="mt-3.5 text-[13.5px] font-semibold">District Automated Routing &amp; Tracking</div>
            <p className="mt-2 max-w-[26em] text-[13px] leading-relaxed text-slate">
              A product demo. All routes, buses, riders, and notifications shown are fictional.
            </p>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Product</div>
            <div className="mt-3.5 flex flex-col gap-2.5 text-sm text-slate">
              <a href="#platform" className="hover:text-ink">Platform</a>
              <a href="#audiences" className="hover:text-ink">Who It's For</a>
              <a href="#how" className="hover:text-ink">How It Works</a>
              <a href="#mobile" className="hover:text-ink">Mobile</a>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Access</div>
            <div className="mt-3.5 flex flex-col gap-2.5 text-sm text-slate">
              <Link to="/login" className="hover:text-ink">Sign In</Link>
              <Link to="/register" className="hover:text-ink">Create Account</Link>
              <Link to="/login?guide=1" className="hover:text-ink">Start guided demo</Link>
              <Link to="/pitch" className="hover:text-ink">Pitch deck</Link>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">About</div>
            <div className="mt-3.5 flex flex-col gap-2.5 text-sm text-slate">
              <span>Proof of concept</span>
              <span>Synthetic ML &amp; data</span>
            </div>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-6 py-5 text-[12.5px] text-muted">
            <span>© {new Date().getFullYear()} DART</span>
            <span>Product demo · Not a production transportation system</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
