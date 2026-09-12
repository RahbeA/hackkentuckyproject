import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bus,
  ClipboardList,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Map,
  Navigation,
  Radio,
  School,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
  Waypoints,
} from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { useDemoGuideOptional } from "../../demo/DemoGuideProvider";
import { ROLE_LABEL, type Role } from "../../types";
import { Logo } from "../brand/Logo";
import { DemoGuideChip, DemoGuideRail } from "../demo/DemoGuideRail";
import { LiveOpsProvider } from "../../live/LiveOpsProvider";
import { NotificationBell } from "./NotificationBell";

const links: {
  to: string;
  label: string;
  icon: typeof Map;
  roles?: Role[];
  group: "tour" | "ops" | "setup";
  step?: number;
}[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "tour", step: 1, roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/planner", label: "Route planner", icon: Waypoints, group: "tour", step: 2, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/compare", label: "Compare plans", icon: GitCompare, group: "tour", step: 3, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/twin", label: "Digital twin", icon: Sparkles, group: "tour", step: 4, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/live", label: "Live demo", icon: Activity, group: "tour", step: 5 },
  { to: "/app/dispatch", label: "Dispatcher", icon: Radio, group: "ops", roles: ["platform_admin", "district_admin", "dispatcher"] },
  { to: "/app/assignments", label: "Assignments", icon: ClipboardList, group: "ops", roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/drive", label: "Route guide", icon: Navigation, group: "ops" },
  { to: "/app/onboarding", label: "Onboarding", icon: Upload, group: "setup", roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/schools", label: "Schools", icon: School, group: "setup", roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/students", label: "Students", icon: Users, group: "setup", roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/fleet", label: "Fleet", icon: Bus, group: "setup", roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/drivers", label: "Drivers", icon: Users, group: "setup", roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/admin", label: "Administration", icon: Settings, group: "setup", roles: ["platform_admin", "district_admin"] },
];

const GROUP_LABEL: Record<(typeof links)[number]["group"], string> = {
  tour: "Walkthrough",
  ops: "Also try",
  setup: "Roster & settings",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const guide = useDemoGuideOptional();
  const nav = useNavigate();
  const loc = useLocation();
  const immersive = loc.pathname.startsWith("/app/drive/");
  const visible = links.filter(
    (l) => !l.roles || (user && (l.roles.includes(user.role) || user.role === "platform_admin")),
  );
  const isFamilyOrDriver = user?.role === "guardian" || user?.role === "driver";

  return (
    <div className="flex h-dvh max-w-[100vw] overflow-hidden bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 bg-white z-50">
        Skip to content
      </a>

      <aside className="sticky top-0 flex h-dvh w-[264px] shrink-0 flex-col overflow-hidden bg-paper border-r border-line">
        <div className="flex h-[72px] shrink-0 items-center border-b border-line px-5">
          <Logo size={26} showTagline />
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-3.5" aria-label="Primary">
          {visible.map((l, i) => {
            const Icon = l.icon;
            const prev = visible[i - 1];
            const showLabel = !prev || prev.group !== l.group;
            return (
              <div key={l.to}>
                {showLabel && (
                  <p className={`${i ? "mt-3.5" : ""} mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted`}>
                    {GROUP_LABEL[l.group]}
                  </p>
                )}
                <NavLink
                  to={l.to}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg pl-4 pr-3 py-2.5 text-[13px] min-h-10 transition-colors ${
                      isActive ? "bg-accent-soft font-semibold text-route" : "font-medium text-slate hover:bg-canvas hover:text-ink"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden
                        className={`absolute left-0 top-1/2 -translate-y-1/2 transition-opacity ${
                          isActive ? "opacity-100" : "opacity-0"
                        }`}
                        style={{
                          width: 0,
                          height: 0,
                          borderTop: "5px solid transparent",
                          borderBottom: "5px solid transparent",
                          borderLeft: "6px solid #2563EB",
                        }}
                      />
                      <Icon
                        size={17}
                        strokeWidth={2}
                        className={isActive ? "text-route" : "text-muted group-hover:text-ink"}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      {l.step != null && (
                        <span className={`tabular-nums text-[10.5px] font-bold ${isActive ? "text-route" : "text-muted"}`}>
                          {l.step}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <div className="rounded-[10px] border border-line bg-canvas px-3.5 py-3">
            <div className="text-[13.5px] font-semibold text-ink truncate">
              {user?.first_name} {user?.last_name}
            </div>
            <div className="text-slate text-[11.5px] mt-0.5">{user ? ROLE_LABEL[user.role] : ""}</div>
            {guide?.available && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {isFamilyOrDriver ? (
                  <button
                    type="button"
                    className="text-[11px] font-bold text-route hover:underline"
                    onClick={() => void guide.switchAccount("district_admin")}
                    disabled={guide.switching}
                  >
                    Back to admin
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="text-[11px] font-bold text-route hover:underline"
                      onClick={() => void guide.switchAccount("guardian")}
                      disabled={guide.switching}
                    >
                      View as family
                    </button>
                    <span className="text-muted">·</span>
                    <button
                      type="button"
                      className="text-[11px] font-bold text-route hover:underline"
                      onClick={() => void guide.switchAccount("driver")}
                      disabled={guide.switching}
                    >
                      View as driver
                    </button>
                  </>
                )}
              </div>
            )}
            <button
              className="mt-2.5 inline-flex items-center gap-1.5 text-slate hover:text-ink text-[11.5px] font-semibold transition-colors"
              onClick={async () => {
                await logout();
                nav("/");
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-40 flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-line bg-paper px-7">
          <div className="flex items-center gap-3 min-w-0">
            <Map size={16} className="text-route shrink-0" aria-hidden />
            <span className="font-semibold text-[14.5px] text-ink truncate">{user?.district_name ?? "District console"}</span>
            <span className="badge-info">Demo</span>
            {guide?.available && <DemoGuideChip />}
          </div>
          <div className="flex items-center gap-2.5">
            {!isFamilyOrDriver && (
              <div className="relative hidden md:block">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  placeholder="Search routes, students…"
                  aria-label="Search"
                  className="input !py-2 !pl-[34px] w-64"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const q = (e.target as HTMLInputElement).value.trim();
                    if (q) nav(`/app/students?q=${encodeURIComponent(q)}`);
                  }}
                />
              </div>
            )}
            <NotificationBell />
          </div>
        </header>

        <main
          id="main"
          className={immersive ? "min-h-0 flex-1 overflow-hidden p-0" : "min-h-0 flex-1 overflow-auto overscroll-contain p-7"}
        >
          <LiveOpsProvider>
            {!immersive && <DemoGuideRail />}
            <Outlet />
          </LiveOpsProvider>
        </main>
      </div>
    </div>
  );
}
