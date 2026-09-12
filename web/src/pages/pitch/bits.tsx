/** Shared pitch-deck chrome: glyphs, clock, chips, route progress. */

export function DepotGlyph({ size = 14, tone = "ink" }: { size?: number; tone?: "ink" | "blue" | "white" }) {
  const fill = tone === "blue" ? "#2563EB" : tone === "white" ? "#FFFFFF" : "#111827";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="5.5" fill={fill} />
    </svg>
  );
}

export function SchoolGlyph({ size = 14, tone = "ink" }: { size?: number; tone?: "ink" | "blue" | "white" }) {
  const stroke = tone === "blue" ? "#2563EB" : tone === "white" ? "#FFFFFF" : "#111827";
  const fill = tone === "white" ? "transparent" : "#FFFFFF";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="3" y="5" width="10" height="8" rx="1.4" fill={fill} stroke={stroke} strokeWidth="1.6" />
      <path d="M8 2.4 L13.2 6.2 H2.8 Z" fill={stroke} />
    </svg>
  );
}

export function SyntheticChip({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] ${
        dark ? "border-white/15 bg-navy/70 text-white/55" : "border-line bg-paper text-slate"
      } ${className}`}
    >
      Synthetic demo data
    </span>
  );
}

export function SlideRule({ label, n, dark = false }: { label: string; n: string; dark?: boolean }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className={`font-mono text-[11px] font-medium uppercase tracking-[0.22em] ${dark ? "text-[#60A5FA]" : "text-route"}`}>
        {label}
      </span>
      <span className={`h-px flex-1 ${dark ? "bg-white/14" : "bg-line"}`} />
      <span className={`font-display text-[13px] font-bold tabular-nums ${dark ? "text-white/38" : "text-muted"}`}>{n}</span>
    </div>
  );
}

export function StreetGrid({ dark = false }: { dark?: boolean }) {
  const major = dark ? "rgba(255,255,255,.055)" : "#EEF2F7";
  const minor = dark ? "rgba(255,255,255,.03)" : "#F4F7FA";
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g stroke={major} strokeWidth="1">
        <path d="M0 180H1280M0 360H1280M0 540H1280" />
        <path d="M280 0V720M560 0V720M840 0V720M1120 0V720" />
      </g>
      <g stroke={minor} strokeWidth="1">
        <path d="M0 90H1280M0 270H1280M0 450H1280M0 630H1280" />
        <path d="M140 0V720M420 0V720M700 0V720M980 0V720" />
      </g>
    </svg>
  );
}

export function HardGeometry() {
  return (
    <svg className="pointer-events-none absolute inset-y-0 right-0 h-full w-[38%]" viewBox="0 0 480 720" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g stroke="#E8EDF4" strokeWidth="1">
        <path d="M0 160H480M0 360H480M0 560H480M140 0V720M300 0V720" />
      </g>
      <path d="M40 560 L140 560 L140 360 L300 360 L300 160 L440 160" fill="none" stroke="rgba(37,99,235,.22)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 640 L220 640 L220 460 L380 460 L380 260 L440 260" fill="none" stroke="rgba(37,99,235,.12)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="#fff" stroke="rgba(37,99,235,.4)" strokeWidth="2">
        <circle cx="140" cy="360" r="6" />
        <circle cx="300" cy="160" r="6" />
        <circle cx="220" cy="460" r="6" />
        <circle cx="380" cy="260" r="6" />
      </g>
    </svg>
  );
}

export function WordmarkWipe({
  className = "",
  delayed = false,
  height = 72,
  maxWidth = 340,
}: {
  className?: string;
  delayed?: boolean;
  height?: number;
  maxWidth?: number;
}) {
  return (
    <div className={`relative inline-block overflow-hidden ${className}`}>
      <img
        src="/brand/dart-logo.png"
        alt="DART"
        className={`pitch-wipe block w-auto shrink-0 select-none ${delayed ? "pitch-wipe-delayed" : ""}`}
        style={{ height, maxWidth }}
        draggable={false}
      />
      <span className={`pitch-wipe-edge ${delayed ? "pitch-wipe-edge-delayed" : ""}`} aria-hidden />
    </div>
  );
}

/** Centered “Introducing” + DART wordmark with staggered word opens. */
export function IntroWordStack() {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className="pitch-word-open font-display text-[56px] font-bold leading-[1.12] tracking-tight text-ink"
        style={{ ["--word-delay" as string]: "0.08s" }}
      >
        Introducing
      </span>
      <span
        className="pitch-word-line mt-6 block h-px w-[min(420px,72vw)] bg-route"
        style={{ ["--word-delay" as string]: "0.38s" }}
        aria-hidden
      />
      <div className="pitch-word-dart mt-8" style={{ ["--word-delay" as string]: "0.52s" }}>
        <WordmarkWipe delayed height={88} maxWidth={420} />
      </div>
      <p
        className="pitch-word-sub mt-7 font-mono text-[12px] font-medium uppercase text-slate"
        style={{ ["--word-delay" as string]: "1.22s" }}
      >
        District Automated Routing &amp; Tracking
      </p>
    </div>
  );
}

export function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute -inset-[5px] rounded-full bg-route" style={{ animation: "pitchPing 2s ease-out infinite" }} />
      <span className="relative h-2 w-2 rounded-full bg-route" />
    </span>
  );
}

export function RadarBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.34]"
      viewBox="0 0 1280 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {[0, 0.7, 1.4].map((d) => (
        <circle
          key={d}
          cx="640"
          cy="300"
          r="420"
          fill="none"
          stroke="#2563EB"
          strokeWidth="5"
          style={{ transformOrigin: "640px 300px", animation: `pitchPing 2.4s ease-out ${d}s infinite` }}
        />
      ))}
      <circle cx="640" cy="300" r="96" fill="rgba(37,99,235,.07)" />
      <g stroke="rgba(37,99,235,.14)" strokeWidth="1.5">
        <path d="M120 300H1160M640 20V640" />
        <circle cx="640" cy="300" r="210" fill="none" />
        <circle cx="640" cy="300" r="320" fill="none" />
      </g>
    </svg>
  );
}

export function PipelineTrack() {
  const d = "M24 16 H1200";
  return (
    <svg className="mb-3 block h-8 w-full" viewBox="0 0 1224 32" aria-hidden>
      <path d={d} fill="none" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="#2563EB"
        strokeWidth="3"
        strokeLinecap="round"
        className="pitch-draw"
        style={{ ["--len" as string]: "1176" }}
      />
      {[24, 258, 492, 726, 960, 1200].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy="16"
          r="5.5"
          fill="#fff"
          stroke="#2563EB"
          strokeWidth="2"
          style={{ animation: `pitchNode 2.6s ease-in-out ${i * 0.28}s infinite` }}
        />
      ))}
      <path
        d="M0 -8 L7 6 L0 2 L-7 6 Z"
        fill="#2563EB"
        className="pitch-pointer"
        style={{ offsetPath: `path("${d}")` }}
      />
    </svg>
  );
}

export function SpinMark({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex" style={{ perspective: 240 }}>
      <img
        src="/brand/dart-mark.png"
        alt=""
        width={size}
        height={size}
        className="pitch-spin-mark select-none"
        draggable={false}
      />
    </span>
  );
}

/** Analog clock. Minute hand is amber only at 22:00 (slide 2); blue at 5:41 (slide 14). */
export function AnalogClock({
  hour,
  minute,
  dark = false,
  minuteTone = "blue",
  size = 280,
}: {
  hour: number;
  minute: number;
  dark?: boolean;
  minuteTone?: "amber" | "blue";
  size?: number;
}) {
  const r = 100;
  const hourAngle = ((hour % 12) + minute / 60) * 30 - 90;
  const minuteAngle = minute * 6 - 90;
  const stroke = dark ? "#E5E7EB" : "#111827";
  const tick = dark ? "#94A3B8" : "#94A3B8";
  const minuteColor = minuteTone === "amber" ? (dark ? "#F59E0B" : "#D97706") : "#2563EB";
  const to = (deg: number, len: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: 110 + Math.cos(a) * len, y: 110 + Math.sin(a) * len };
  };
  const h = to(hourAngle, 48);
  const m = to(minuteAngle, 72);
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" role="img" aria-label={`${hour}:${String(minute).padStart(2, "0")}`}>
      <circle cx="110" cy="110" r={r} fill="none" stroke={stroke} strokeWidth="2.2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180;
        const major = i % 3 === 0;
        const inner = major ? 82 : 88;
        const outer = 96;
        return (
          <line
            key={i}
            x1={110 + Math.cos(a) * inner}
            y1={110 + Math.sin(a) * inner}
            x2={110 + Math.cos(a) * outer}
            y2={110 + Math.sin(a) * outer}
            stroke={major ? stroke : tick}
            strokeWidth={major ? 2 : 1.2}
            strokeLinecap="round"
          />
        );
      })}
      <line x1="110" y1="110" x2={h.x} y2={h.y} stroke={stroke} strokeWidth="4.2" strokeLinecap="round" />
      <line x1="110" y1="110" x2={m.x} y2={m.y} stroke={minuteColor} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="110" cy="110" r="4.2" fill={stroke} />
    </svg>
  );
}

const TITLE_PATH = "M48 288 L760 288 L760 188 L1040 128 L1280 128";

export function TitleRouteLine() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]" viewBox="0 0 1280 300" preserveAspectRatio="none" aria-hidden>
      <path d={TITLE_PATH} fill="none" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={TITLE_PATH}
        fill="none"
        stroke="#2563EB"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pitch-draw"
        style={{ ["--len" as string]: "1480" }}
      />
      <g transform="translate(48 288)">
        <circle r="7" fill="#111827" />
      </g>
      <path
        d="M0 -9 L8 7 L0 3 L-8 7 Z"
        fill="#2563EB"
        className="pitch-pointer"
        style={{ offsetPath: `path("${TITLE_PATH}")` }}
      />
    </svg>
  );
}

const LOOP_PATH = "M36 48 C 80 12, 160 12, 210 36 C 260 60, 340 60, 384 28";

export function PracticeLoop() {
  return (
    <svg className="mx-auto mt-10 block" width="420" height="72" viewBox="0 0 420 72" aria-hidden>
      <path d={LOOP_PATH} fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
      <path
        d={LOOP_PATH}
        fill="none"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
        className="pitch-draw"
        style={{ ["--len" as string]: "420" }}
      />
      <circle cx="36" cy="48" r="4.5" fill="#111827" />
      <rect x="378" y="22" width="12" height="12" rx="2" fill="#fff" stroke="#111827" strokeWidth="1.6" />
      <path
        d="M0 -7 L6 5 L0 2 L-6 5 Z"
        fill="#2563EB"
        className="pitch-pointer"
        style={{ offsetPath: `path("${LOOP_PATH}")` }}
      />
    </svg>
  );
}

/**
 * Bottom-edge progress for slides 7–14.
 * Slide 13 stops just short of the school glyph on purpose.
 */
export function RouteProgress({ step }: { step: number }) {
  const t = Math.min(1, Math.max(0, (step - 1) / 7));
  const endX = 40 + t * 1120;
  const short = step >= 8;
  const lineEnd = short ? Math.min(endX, 1128) : endX;
  const drawn = `M40 16 H${lineEnd}`;
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-3 h-8" viewBox="0 0 1280 32" preserveAspectRatio="none" aria-hidden>
      <path d="M40 16 H1240" fill="none" stroke="#E2E8F0" strokeWidth="2" />
      <path d={drawn} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="16" r="5" fill="#111827" />
      <path d="M0 -6 L5 4 L0 1.5 L-5 4 Z" fill="#2563EB" transform={`translate(${lineEnd} 16)`} />
      <rect
        x="1234"
        y="10"
        width="12"
        height="12"
        rx="2"
        fill="#fff"
        stroke={short ? "#94A3B8" : "#111827"}
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function FailureIcon({ kind }: { kind: "data" | "calendar" | "paper" | "app" | "closed" | "uneven" }) {
  const common = { fill: "none" as const, stroke: "#111827", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg width="44" height="44" viewBox="0 0 36 36" aria-hidden>
      {kind === "data" && (
        <>
          <rect x="6" y="7" width="24" height="22" rx="2" {...common} />
          <path d="M10 13 H26 M10 18 H26 M10 23 H20" {...common} />
          <rect x="21" y="21" width="7" height="5" fill="#DC2626" stroke="none" />
        </>
      )}
      {kind === "calendar" && (
        <>
          <rect x="7" y="9" width="22" height="20" rx="2" {...common} />
          <path d="M7 15 H29 M12 6 V11 M24 6 V11" {...common} />
          <circle cx="14" cy="21" r="1.4" fill="#111827" />
          <circle cx="18" cy="21" r="1.4" fill="#94A3B8" />
          <circle cx="22" cy="21" r="1.4" fill="#94A3B8" />
        </>
      )}
      {kind === "paper" && (
        <>
          <rect x="10" y="6" width="16" height="22" rx="1.4" {...common} />
          <rect x="8" y="8" width="16" height="22" rx="1.4" fill="#fff" {...common} />
          <path d="M12 15 H20 M12 19 H20 M12 23 H17" {...common} />
        </>
      )}
      {kind === "app" && (
        <>
          <rect x="11" y="4" width="14" height="28" rx="3" {...common} />
          <path d="M14 22 L22 16 L17 16 L19 10 L13 18 H17 Z" fill="#2563EB" stroke="none" />
          <circle cx="24" cy="26" r="3.2" fill="#DC2626" stroke="#fff" strokeWidth="1.2" />
        </>
      )}
      {kind === "closed" && (
        <>
          <rect x="11" y="4" width="14" height="28" rx="3" {...common} />
          <rect x="13.5" y="14" width="9" height="8" rx="1" fill="#F8FAFC" stroke="#111827" strokeWidth="1.2" />
          <path d="M15 16 H21 M15 19 H19" stroke="#64748B" strokeWidth="1.1" />
        </>
      )}
      {kind === "uneven" && (
        <>
          <path d="M8 28 V18 H13 V28 Z M16 28 V12 H21 V28 Z M24 28 V8 H29 V28 Z" fill="#E2E8F0" stroke="#111827" strokeWidth="1.3" />
          <path d="M24 28 V8 H29 V28 Z" fill="#111827" opacity="0.18" />
        </>
      )}
    </svg>
  );
}

export function MiniMapSketch({ late = false }: { late?: boolean }) {
  const line = late ? "#D97706" : "#2563EB";
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden>
      <rect width="320" height="160" fill="#F1F5F9" />
      <g stroke="#E2E8F0" strokeWidth="10">
        <path d="M0 40 H320 M0 90 H320 M0 130 H320" />
        <path d="M50 0 V160 M140 0 V160 M230 0 V160" />
      </g>
      <path d="M24 128 L90 128 L90 72 L170 72 L170 44 L280 44" fill="none" stroke={line} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="24" cy="128" r="5" fill="#111827" />
      <circle cx="90" cy="128" r="4" fill="#fff" stroke={line} strokeWidth="2" />
      <circle cx="170" cy="72" r="4" fill="#fff" stroke={line} strokeWidth="2" />
      <g transform="translate(210 58)">
        <circle r="11" fill={line} />
        <path d="M0 -5 L4.5 4.5 L0 2 L-4.5 4.5 Z" fill="#fff" />
      </g>
      <rect x="274" y="38" width="12" height="12" rx="2" fill="#111827" />
    </svg>
  );
}
