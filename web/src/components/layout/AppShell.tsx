import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bus,
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
import { ROLE_LABEL, type Role } from "../../types";
import { Logo } from "../brand/Logo";
import { LiveOpsProvider } from "../../live/LiveOpsProvider";
import { NotificationBell } from "./NotificationBell";

const links: { to: string; label: string; icon: typeof Map; roles?: Role[]; group: number }[] = [
  { to: "/app/live", label: "Live demo", icon: Activity, group: 0 },
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, group: 0, roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/drive", label: "Route guide", icon: Navigation, group: 0 },
  { to: "/app/onboarding", label: "Onboarding", icon: Upload, group: 0, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/schools", label: "Schools", icon: School, group: 1, roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/students", label: "Students", icon: Users, group: 1, roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/fleet", label: "Fleet", icon: Bus, group: 1, roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/drivers", label: "Drivers", icon: Users, group: 1, roles: ["platform_admin", "district_admin", "planner", "dispatcher"] },
  { to: "/app/planner", label: "Route planner", icon: Waypoints, group: 2, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/compare", label: "Compare plans", icon: GitCompare, group: 2, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/twin", label: "Digital twin", icon: Sparkles, group: 2, roles: ["platform_admin", "district_admin", "planner"] },
  { to: "/app/dispatch", label: "Dispatcher", icon: Radio, group: 2, roles: ["platform_admin", "district_admin", "dispatcher"] },
  { to: "/app/admin", label: "Administration", icon: Settings, group: 2, roles: ["platform_admin", "district_admin"] },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const immersive = loc.pathname.startsWith("/app/drive/");
  const visible = links.filter(
    (l) => !l.roles || (user && (l.roles.includes(user.role) || user.role === "platform_admin")),
  );
  const isFamilyOrDriver = user?.role === "guardian" || user?.role === "driver";

  return (
    <div className="min-h-screen flex bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 bg-white z-50">
        Skip to content
      </a>

      <aside className="w-[264px] shrink-0 flex flex-col bg-paper border-r border-line">
        <div className="h-[72px] px-5 flex items-center border-b border-line">
          <Logo size={26} showTagline />
        </div>

        <nav className="flex-1 px-3 py-3.5 space-y-0.5 overflow-y-auto" aria-label="Primary">
          {visible.map((l, i) => {
            const Icon = l.icon;
            const prev = visible[i - 1];
            return (
              <div key={l.to}>
                {prev && prev.group !== l.group && <div className="mx-3 my-2.5 h-px bg-slate-soft" />}
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
                      {l.label}
                    </>
                  )}
                </NavLink>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-line">
          <div className="rounded-[10px] border border-line bg-canvas px-3.5 py-3">
            <div className="text-[13.5px] font-semibold text-ink truncate">
              {user?.first_name} {user?.last_name}
            </div>
            <div className="text-slate text-[11.5px] mt-0.5">{user ? ROLE_LABEL[user.role] : ""}</div>
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

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[72px] bg-paper border-b border-line flex items-center justify-between gap-4 px-7 shrink-0 sticky top-0 z-40">
          <div className="flex items-center gap-3 min-w-0">
            <Map size={16} className="text-route shrink-0" aria-hidden />
            <span className="font-semibold text-[14.5px] text-ink truncate">{user?.district_name ?? "District console"}</span>
            <span className="badge-info">Demo</span>
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

        <main id="main" className={immersive ? "flex-1 p-0 overflow-hidden" : "flex-1 p-7 overflow-auto"}>
          <LiveOpsProvider>
            <Outlet />
          </LiveOpsProvider>
        </main>
      </div>
    </div>
  );
}
