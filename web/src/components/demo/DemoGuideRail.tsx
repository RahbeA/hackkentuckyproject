import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { GUIDE_STEPS } from "../../demo/steps";
import { useDemoGuide } from "../../demo/DemoGuideProvider";

export function DemoGuideRail() {
  const guide = useDemoGuide();
  if (!guide.available || !guide.active) return null;

  const { step, index, total, next, back, dismiss, goTo, switching, error } = guide;
  const last = index >= total - 1;

  return (
    <aside
      className="mb-5 overflow-hidden rounded-2xl border border-route/25 bg-paper shadow-card"
      aria-label="Judge walkthrough"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <Compass size={15} className="text-route" aria-hidden />
        <p className="text-[12.5px] font-bold text-ink">
          Judge walkthrough
          <span className="ml-2 font-semibold text-slate">
            Step {step.n} of {total}
          </span>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-ink"
        >
          Hide <X size={13} />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-5" role="list" aria-label="Walkthrough steps">
        {GUIDE_STEPS.map((s, i) => {
          const current = i === index;
          const done = i < index;
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              onClick={() => void goTo(s.id)}
              disabled={switching}
              className={`flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                current
                  ? "bg-accent-soft text-route"
                  : done
                    ? "text-good hover:bg-canvas"
                    : "text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  current ? "bg-route text-white" : done ? "bg-good text-white" : "bg-slate-soft text-slate"
                }`}
              >
                {done ? <Check size={10} strokeWidth={3} /> : s.n}
              </span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-line px-4 py-4 sm:px-5">
        <h2 className="font-display text-[17px] font-bold tracking-tight">{step.title}</h2>
        <p className="mt-1.5 max-w-[52em] text-[13.5px] leading-relaxed text-slate">{step.look}</p>
        <p className="mt-2 max-w-[52em] text-[13.5px] font-semibold leading-relaxed text-ink">{step.doThis}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary !min-h-10" onClick={() => void back()} disabled={index === 0 || switching}>
            <ArrowLeft size={14} /> Back
          </button>
          <button type="button" className="btn-primary !min-h-10" onClick={() => void next()} disabled={switching}>
            {switching ? "Switching account…" : last ? "Finish walkthrough" : `Next: ${GUIDE_STEPS[index + 1].title}`}
            {!switching && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function DemoGuideChip() {
  const guide = useDemoGuide();
  if (!guide.available || guide.active) return null;

  return (
    <button
      type="button"
      onClick={() => {
        guide.resume();
        void guide.goTo(guide.step.id);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-route/20 bg-accent-soft px-2.5 py-1.5 text-[12px] font-bold text-route hover:bg-[#DBEAFE]"
    >
      <Compass size={13} />
      {guide.dismissed ? "Resume walkthrough" : "Start walkthrough"}
    </button>
  );
}
