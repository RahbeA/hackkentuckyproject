import type { ReactNode } from "react";
import { LiveDot, MiniMapSketch, SyntheticChip } from "./bits";

function CropChrome({
  caption,
  children,
  chip = true,
  className = "",
}: {
  caption?: string;
  children: ReactNode;
  chip?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-paper shadow-card ${className}`}>
      {(caption || chip) && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          {caption ? (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink">{caption}</span>
          ) : null}
          {chip ? <SyntheticChip className="ml-auto" /> : null}
        </div>
      )}
      {children}
    </div>
  );
}

export function PlannerMapCrop() {
  return (
    <CropChrome caption="Route plan · Reliability">
      <div className="relative h-[118px]">
        <MiniMapSketch />
        <span className="absolute left-2 top-2 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[9px] font-semibold text-slate">
          Bell window 7:35–7:55
        </span>
        <span className="absolute bottom-2 right-2 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[9px] font-semibold text-ink">
          Bus 3 · ♿ 1 seat
        </span>
      </div>
    </CropChrome>
  );
}

export function DriverRunSheetCrop() {
  const rows = [
    { stop: "Stop 5 · Cedar Ln", sub: "Completed 7:36 · 6 riders", badge: "Done", tone: "good" },
    { stop: "Stop 6 · Maple & 3rd", sub: "Window 7:42–7:48 · 5 riders", badge: "Now", tone: "now" },
    { stop: "Riverside Elementary", sub: "Bell 7:55 · school", badge: "School", tone: "muted" },
  ];
  return (
    <CropChrome caption="Route 14 · Run sheet">
      <div>
        {rows.map((r, i) => (
          <div
            key={r.stop}
            className={`flex items-center gap-2 px-3 py-2 ${i ? "border-t border-line" : ""} ${
              r.tone === "now" ? "bg-[#FFFBF5]" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-semibold">{r.stop}</div>
              <div className="text-[10px] text-slate">{r.sub}</div>
            </div>
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold ${
                r.tone === "good"
                  ? "border-good/20 bg-good/10 text-good"
                  : r.tone === "now"
                    ? "border-route/20 bg-accent-soft text-route"
                    : "border-line bg-canvas text-slate"
              }`}
            >
              {r.badge}
            </span>
          </div>
        ))}
      </div>
    </CropChrome>
  );
}

export function GuardianTrackCrop({ delayed = false, compact = false }: { delayed?: boolean; compact?: boolean }) {
  return (
    <CropChrome caption="Track · Ava · Bus 14" className={compact ? "" : ""}>
      <div className="relative h-[118px]">
        <MiniMapSketch late={delayed} />
        <span className="absolute bottom-2 right-2 rounded-md bg-navy/80 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/70">
          Simulated GPS
        </span>
        <div className="absolute left-2 top-2 rounded-md border border-line bg-paper px-2 py-1">
          <div className={`font-display text-[16px] font-bold leading-none tabular-nums ${delayed ? "text-warn" : "text-ink"}`}>
            {delayed ? "7:51" : "7:42"}
          </div>
          <div className="text-[9px] text-slate">Maple & 3rd</div>
        </div>
      </div>
    </CropChrome>
  );
}

export function ComparePanelCrop() {
  const rows = [
    { label: "Mileage (km)", a: "184", b: "211", note: "shorter" },
    { label: "Vehicles", a: "14", b: "17", note: "" },
    { label: "On-time probability", a: "41%", b: "86%", note: "delta" },
  ];
  return (
    <CropChrome caption="Plan comparison · Jefferson Demo Schools">
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-slate">
            <th className="px-3 py-2 text-left">Metric</th>
            <th className="px-3 py-2 text-left">Fastest</th>
            <th className="px-3 py-2 text-left">Reliability</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="px-3 py-2 font-medium">{r.label}</td>
              <td className="px-3 py-2">{r.a}</td>
              <td className={`px-3 py-2 font-semibold ${r.note === "delta" ? "text-good" : "text-ink"}`}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CropChrome>
  );
}

export function WhyInfeasibleBubble() {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-2.5 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate">Why infeasible</div>
      <p className="mt-1 text-[12px] font-semibold leading-snug text-ink">Stop 14: wheelchair seat capacity exceeded on Bus 3</p>
    </div>
  );
}

export function TwinChartCrop() {
  const bins = [4, 8, 14, 22, 36, 48, 62, 78, 70, 54, 38, 26, 18, 14, 11, 9, 7, 5, 4, 3];
  const target = 12;
  const max = Math.max(...bins);
  return (
    <CropChrome caption="Last drop-off · rain + traffic · N=500">
      <div className="px-4 pb-3 pt-3">
        <div className="relative flex h-[168px] items-end gap-[3px]">
          {bins.map((h, i) => (
            <div
              key={i}
              className="pitch-bar relative min-w-0 flex-1 rounded-t-[3px]"
              style={{
                height: `${(h / max) * 100}%`,
                background: i >= target ? "#D97706" : "#2563EB",
                animationDelay: `${i * 0.028}s`,
              }}
            />
          ))}
          <div className="absolute inset-y-0" style={{ left: `${(target / bins.length) * 100}%` }}>
            <div className="h-full w-px bg-ink" />
            <div className="absolute -top-0.5 left-1 whitespace-nowrap text-[9px] font-bold text-ink">7:00 target</div>
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate">
          <span>4:30 PM</span>
          <span>Last drop-off time</span>
          <span>9:00 PM</span>
        </div>
      </div>
    </CropChrome>
  );
}

export function TwinToggles() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
      <div className="flex items-center border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em]">Stress the morning</span>
        <SyntheticChip className="ml-auto" />
      </div>
      <div className="flex flex-col gap-3 px-4 py-4">
        {[
          { label: "Rain", on: true },
          { label: "Traffic", on: true },
        ].map((t) => (
          <div key={t.label} className="flex items-center justify-between">
            <span className="text-[13px] font-medium">{t.label}</span>
            <span className={`relative h-5 w-9 rounded-full ${t.on ? "bg-route" : "bg-line"}`}>
              <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white" style={{ left: t.on ? 16 : 2 }} />
            </span>
          </div>
        ))}
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate">
          Simulations
          <div className="mt-1 rounded-lg border border-line bg-canvas px-3 py-2 font-display text-[18px] font-bold tabular-nums text-ink">
            500
          </div>
        </label>
        <div>
          <div className="text-[11px] font-medium text-slate">On-time probability</div>
          <div className="mt-0.5 font-display text-[28px] font-bold leading-none tabular-nums text-ink">86%</div>
          <div className="mt-1 text-[11px] text-slate">Reliability · rain + traffic</div>
        </div>
      </div>
    </div>
  );
}

export function LiveAlertCard() {
  return (
    <div className="rounded-xl border border-warn/25 bg-[#FFFBF5] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="badge-warn">Delay</span>
        <button type="button" className="text-[11px] font-semibold text-route">
          Acknowledge
        </button>
      </div>
      <div className="mt-2 text-[13px] font-semibold">Bus 3 · +12 min predicted</div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate">Injected disruption. Same event is on the guardian Track screen.</p>
    </div>
  );
}

export function LiveBoardCrop({ alert = false }: { alert?: boolean }) {
  return (
    <CropChrome caption="Live ops · Jefferson Demo Schools">
      <div className="relative h-[132px]">
        <MiniMapSketch late={alert} />
        {alert ? (
          <div className="absolute bottom-2 left-2 right-16">
            <LiveAlertCard />
          </div>
        ) : (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
            <LiveDot />
            Live
          </span>
        )}
      </div>
    </CropChrome>
  );
}

function PhoneStatusIcons() {
  return (
    <svg width="36" height="10" viewBox="0 0 36 10" aria-hidden>
      <rect x="0" y="6.2" width="2.2" height="3.2" rx="0.4" fill="#111827" />
      <rect x="3.2" y="4.6" width="2.2" height="4.8" rx="0.4" fill="#111827" />
      <rect x="6.4" y="2.8" width="2.2" height="6.6" rx="0.4" fill="#111827" />
      <rect x="9.6" y="1" width="2.2" height="8.4" rx="0.4" fill="#111827" />
      <path d="M17.2 3.1c1.4 0 2.6.5 3.5 1.4l.7-.7A6.1 6.1 0 0 0 17.2 1.8 6.1 6.1 0 0 0 13 3.8l.7.7c.9-.9 2.1-1.4 3.5-1.4Z" fill="#111827" />
      <path d="M17.2 5.4c.8 0 1.6.3 2.1.8l.7-.7a4 4 0 0 0-5.6 0l.7.7c.5-.5 1.3-.8 2.1-.8Z" fill="#111827" />
      <circle cx="17.2" cy="8.1" r=".9" fill="#111827" />
      <rect x="24.2" y="1.4" width="9.2" height="7.2" rx="1.6" fill="none" stroke="#111827" strokeOpacity=".35" />
      <rect x="25.1" y="2.3" width="7.4" height="5.4" rx="1" fill="#111827" />
      <path d="M34.2 3.6v2.8c.5-.2.9-.8.9-1.4s-.4-1.2-.9-1.4Z" fill="#111827" fillOpacity=".4" />
    </svg>
  );
}

export function PhoneFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] bg-ink p-[4px] shadow-float">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-canvas">
        <div className="absolute left-1/2 top-[6px] z-20 h-[13px] w-[48px] -translate-x-1/2 rounded-full bg-ink" />
        <div className="flex items-center justify-between px-3 pb-0.5 pt-2">
          <span className="text-[8px] font-semibold tabular-nums text-ink">9:41</span>
          <PhoneStatusIcons />
        </div>
        <div className="px-2.5 pb-1 pt-0.5 font-display text-[11px] font-bold tracking-tight">{title}</div>
        <div className="min-h-0 flex-1 px-2 pb-4">{children}</div>
        <div className="pointer-events-none absolute bottom-[5px] left-1/2 h-[3px] w-[40px] -translate-x-1/2 rounded-full bg-ink/25" />
      </div>
    </div>
  );
}

export function PhoneToday() {
  return (
    <PhoneFrame title="Today">
      <div className="text-[10px] text-slate">Your riders</div>
      <div className="mt-2 rounded-xl border border-line bg-paper p-2.5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] font-semibold">Ava</div>
            <div className="text-[10px] text-slate">Maple & 3rd · Bus 14</div>
          </div>
          <div className="text-right">
            <div className="font-display text-[16px] font-bold leading-none">7:42</div>
            <div className="mt-0.5 text-[10px] font-bold text-good">On time</div>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-soft">
          <div className="h-full w-2/3 bg-route" />
        </div>
      </div>
    </PhoneFrame>
  );
}

export function PhoneTrack({ delayed = false }: { delayed?: boolean }) {
  return (
    <PhoneFrame title="Ava · Bus 14">
      <div className="relative h-[72px] overflow-hidden rounded-lg">
        <MiniMapSketch late={delayed} />
        <span className="absolute bottom-1 right-1 rounded bg-navy/80 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white/70">
          Simulated GPS
        </span>
      </div>
      <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums tracking-tight">
        {delayed ? "7:51" : "7:42"}
      </div>
      <div className={`text-[10px] font-semibold ${delayed ? "text-warn" : "text-good"}`}>
        {delayed ? "+9 min · Maple & 3rd" : "On time · Maple & 3rd"}
      </div>
      <div className="mt-2 space-y-1.5">
        {["Cedar Ln", "Maple & 3rd", "School"].map((s, i) => (
          <div key={s} className="flex items-center gap-2 text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full ${i === 1 ? (delayed ? "bg-warn" : "bg-route") : "bg-line"}`} />
            <span className={i === 1 ? "font-semibold" : "text-slate"}>{s}</span>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function PhoneUpdates() {
  return (
    <PhoneFrame title="Updates">
      <div className="rounded-xl border border-warn/25 bg-[#FFFBF5] p-2.5">
        <div className="text-[10px] font-bold text-warn">Delay</div>
        <div className="mt-0.5 text-[12px] font-semibold">Bus 14 running +9 min</div>
        <div className="mt-0.5 text-[10px] text-slate">Ava · Maple & 3rd</div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">Only your riders. Never the manifest.</p>
    </PhoneFrame>
  );
}

export function PhoneAbsence() {
  return (
    <PhoneFrame title="Absence">
      <p className="text-[11px] leading-relaxed text-slate">Ava is not riding this morning.</p>
      <div className="mt-3 rounded-lg bg-route px-3 py-2 text-center text-[11px] font-semibold text-white">One tap</div>
      <p className="mt-2 text-[10px] text-muted">Removes her from today’s load.</p>
    </PhoneFrame>
  );
}

export function DualScreenComposite() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
      <SyntheticChip className="absolute right-3 top-3 z-10" />
      <div className="grid grid-cols-[1.4fr_0.9fr] gap-0">
        <div className="border-r border-line">
          <div className="border-b border-line px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em]">
            Dispatcher board
          </div>
          <div className="relative h-[220px]">
            <MiniMapSketch late />
            <div className="absolute bottom-3 left-3 right-3">
              <LiveAlertCard />
            </div>
          </div>
        </div>
        <div className="bg-canvas p-3">
          <div className="mx-auto h-[236px] w-[148px]">
            <PhoneTrack delayed />
          </div>
        </div>
      </div>
    </div>
  );
}

export function KpiStrip() {
  const kpis = [
    { label: "Active buses", value: "17" },
    { label: "Routes", value: "17" },
    { label: "Riders", value: "412" },
    { label: "Projected last drop-off", value: "5:41 PM", hl: true },
  ];
  return (
    <CropChrome caption="District operations">
      <div className="grid grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className={`px-3 py-3 ${i < 3 ? "border-r border-line" : ""} ${k.hl ? "bg-accent-soft" : ""}`}>
            <div className="text-[10px] font-medium text-slate">{k.label}</div>
            <div className="mt-0.5 font-display text-[18px] font-bold tabular-nums tracking-tight">{k.value}</div>
          </div>
        ))}
      </div>
    </CropChrome>
  );
}
