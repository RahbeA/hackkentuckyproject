import { useCallback, useEffect, useState } from "react";
import { APPENDIX_SOURCES, SLIDE_COUNT, SPEAKER_NOTES, SlideView } from "./slides";

const W = 1280;
const H = 720;

function useSlideScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const padX = 32;
      const padY = 48;
      setScale(Math.min((window.innerWidth - padX) / W, (window.innerHeight - padY) / H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

function parseHash() {
  const n = Number(window.location.hash.replace("#", ""));
  if (Number.isFinite(n) && n >= 1 && n <= SLIDE_COUNT) return n - 1;
  return 0;
}

export function PitchDeckPage() {
  const scale = useSlideScale();
  const [index, setIndex] = useState(parseHash);
  const [notes, setNotes] = useState(false);
  const [appendix, setAppendix] = useState(false);
  const [hint, setHint] = useState(true);

  const go = useCallback((next: number) => {
    const clamped = Math.min(SLIDE_COUNT - 1, Math.max(0, next));
    setIndex(clamped);
    window.history.replaceState(null, "", `#${clamped + 1}`);
  }, []);

  useEffect(() => {
    document.title = "DART — Pitch · HackKentucky 2026";
    return () => {
      document.title = "DART — District Automated Routing & Tracking";
    };
  }, []);

  useEffect(() => {
    const onHash = () => setIndex(parseHash());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.history.replaceState(null, "", "#1");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "Backspace") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(SLIDE_COUNT - 1);
      } else if (e.key === "n" || e.key === "N") {
        setNotes((v) => !v);
      } else if (e.key === "a" || e.key === "A") {
        setAppendix((v) => !v);
      } else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => undefined);
        else document.exitFullscreen().catch(() => undefined);
      } else if (e.key === "Escape") {
        setNotes(false);
        setAppendix(false);
        setHint(false);
      } else if (e.key >= "1" && e.key <= "9" && !e.metaKey && !e.ctrlKey) {
        go(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const darkStage = index === 1;

  return (
    <div className={`relative h-screen w-screen overflow-hidden ${darkStage ? "bg-navy" : "bg-canvas"}`}>
      <div className="flex h-full w-full items-center justify-center pb-8">
        <div style={{ width: W * scale, height: H * scale, position: "relative" }}>
          <div
            className="pitch-deck absolute left-0 top-0 overflow-hidden bg-paper"
            style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              if (x < 0.16) go(index - 1);
              else if (x > 0.84) go(index + 1);
            }}
          >
            <SlideView key={index} index={index} />
          </div>
        </div>
      </div>

      <div className={`fixed inset-x-0 bottom-0 z-20 flex items-center justify-between px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${darkStage ? "text-white/45" : "text-slate"}`}>
        <div className="flex items-center gap-3">
          <span className={`tabular-nums ${darkStage ? "text-white/70" : "text-ink"}`}>
            {String(index + 1).padStart(2, "0")} / {String(SLIDE_COUNT).padStart(2, "0")}
          </span>
          <button type="button" className={darkStage ? "hover:text-white" : "hover:text-ink"} onClick={() => setNotes((v) => !v)}>
            Notes · N
          </button>
          <button type="button" className={darkStage ? "hover:text-white" : "hover:text-ink"} onClick={() => setAppendix((v) => !v)}>
            Sources · A
          </button>
          <button
            type="button"
            className={darkStage ? "hover:text-white" : "hover:text-ink"}
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => undefined);
              else document.exitFullscreen().catch(() => undefined);
            }}
          >
            Fullscreen · F
          </button>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full ${i === index ? "w-5 bg-route" : "w-1.5 bg-line hover:bg-muted"}`}
            />
          ))}
        </div>
      </div>

      {hint && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate">
          ← → to move · N notes · F fullscreen
        </div>
      )}

      {notes && (
        <aside className="fixed inset-x-0 bottom-10 z-30 mx-auto max-w-3xl rounded-2xl border border-line bg-paper p-4 shadow-card">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate">Speaker notes · slide {index + 1}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink">{SPEAKER_NOTES[index]}</p>
        </aside>
      )}

      {appendix && (
        <aside className="fixed inset-x-0 bottom-10 z-30 mx-auto max-w-3xl rounded-2xl border border-line bg-paper p-4 shadow-card">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate">Appendix · sources (not presented)</div>
          <ul className="mt-2 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink">
            {APPENDIX_SOURCES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
