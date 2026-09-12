import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Bus, Check, Circle, Compass, Navigation, Radio, Square } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { LogoMark } from "../components/brand/Logo";
import { useDemoGuideOptional } from "../demo/DemoGuideProvider";
import { WORKSPACE_HOME, type WorkspaceId } from "../types";

const WORKSPACES: {
  id: WorkspaceId;
  label: string;
  body: string;
  icon: typeof Square;
}[] = [
  {
    id: "district_admin",
    label: "District admin",
    body: "Schools, fleet, drivers, and district-wide settings.",
    icon: Square,
  },
  {
    id: "planner",
    label: "Planner",
    body: "Build and review route plans before they go live.",
    icon: Navigation,
  },
  {
    id: "dispatcher",
    label: "Dispatcher",
    body: "Live fleet board, delay handling, and updates.",
    icon: Radio,
  },
  {
    id: "driver",
    label: "Driver (this account)",
    body: "Staff preview of the route guide. To see a real driver, use View as driver after you enter.",
    icon: Bus,
  },
  {
    id: "guardian",
    label: "Family (this account)",
    body: "Staff preview of Live. To see only Ava, use View as family after you enter.",
    icon: Circle,
  },
];

export function ChooseWorkspacePage() {
  const { user, logout } = useAuth();
  const guide = useDemoGuideOptional();
  const nav = useNavigate();
  const [selected, setSelected] = useState<WorkspaceId>(
    user?.role === "planner" || user?.role === "dispatcher" || user?.role === "driver" || user?.role === "guardian"
      ? user.role
      : "district_admin",
  );
  if (user?.role === "platform_admin") {
    return <Navigate to="/app/dashboard" replace />;
  }
  if (guide?.active) {
    return <Navigate to={guide.step.path} replace />;
  }

  const label = WORKSPACES.find((w) => w.id === selected)?.label ?? "District admin";

  function continueToWorkspace() {
    const newDistrict = sessionStorage.getItem("dart_new_district") === "1";
    sessionStorage.removeItem("dart_new_district");
    if (newDistrict && selected === "district_admin") {
      nav("/app/onboarding", { replace: true });
      return;
    }
    nav(WORKSPACE_HOME[selected], { replace: true });
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-[880px] px-6 py-[clamp(40px,6vw,80px)]">
        <LogoMark size={34} />
        <h1 className="mt-6 font-display text-[clamp(26px,3vw,36px)] font-bold leading-tight tracking-tight">
          Where would you like to start?
        </h1>
        <p className="mt-3 max-w-[34em] text-base leading-relaxed text-slate">
          You are signed in as district staff. District admin is the start of the walkthrough. Family and Driver below
          are previews — they do not switch accounts.
        </p>
        {guide?.available && (
          <button
            type="button"
            className="btn-primary mt-5 !min-h-12 !px-[26px] !text-[15px]"
            onClick={() => {
              guide.start("dashboard");
              nav("/app/dashboard", { replace: true });
            }}
          >
            <Compass size={16} /> Start the 6-step walkthrough
          </button>
        )}

        <div className="mt-8 grid gap-3.5 sm:grid-cols-2">
          {WORKSPACES.map((w) => {
            const Icon = w.icon;
            const active = selected === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelected(w.id)}
                className={`rounded-2xl p-[22px] text-left transition-colors ${
                  active
                    ? "border-[1.5px] border-route bg-paper shadow-[0_0_0_4px_rgba(37,99,235,.1)]"
                    : "border border-line bg-paper hover:border-route"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-route">
                    <Icon size={16} strokeWidth={2.4} />
                  </span>
                  <span className="font-display text-[16.5px] font-bold tracking-tight">{w.label}</span>
                  {active && (
                    <span className="ml-auto flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-route">
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[13.5px] leading-snug text-slate">{w.body}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="button" className="btn-primary !min-h-12 !px-[26px] !text-[15px]" onClick={continueToWorkspace}>
            Continue as {label}
          </button>
          <button
            type="button"
            className="text-sm font-semibold text-slate hover:text-ink"
            onClick={async () => {
              await logout();
              nav("/login");
            }}
          >
            Sign in as someone else
          </button>
        </div>
      </div>
    </div>
  );
}
