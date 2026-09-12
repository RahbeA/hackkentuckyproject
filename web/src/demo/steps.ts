import type { Role } from "../types";

export type GuideAccount = "district_admin" | "guardian" | "driver";

export interface GuideStep {
  id: string;
  n: number;
  title: string;
  /** One line: what this screen is. */
  look: string;
  /** One line: the only action that matters. */
  doThis: string;
  path: string;
  account: GuideAccount;
  navMatch: string;
}

/** Six screens. Jefferson Demo Schools is already seeded — no CSV import. */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "dashboard",
    n: 1,
    title: "District board",
    look: "Jefferson Demo Schools is already loaded. These six numbers are the morning ops view.",
    doThis: "Glance at Active buses and At-risk routes, then press Next.",
    path: "/app/dashboard",
    account: "district_admin",
    navMatch: "/app/dashboard",
  },
  {
    id: "planner",
    n: 2,
    title: "Route planner",
    look: "A reliability plan is already published. Colored lines are buses; the % is on-time probability.",
    doThis: "Optional: pick Fastest and press Generate. Otherwise press Next.",
    path: "/app/planner",
    account: "district_admin",
    navMatch: "/app/planner",
  },
  {
    id: "compare",
    n: 3,
    title: "Compare plans",
    look: "Fastest vs reliability: mileage, vehicles, and on-time chance side by side.",
    doThis: "Plans are pre-selected. Press Compare if the table is empty, then Next.",
    path: "/app/compare",
    account: "district_admin",
    navMatch: "/app/compare",
  },
  {
    id: "twin",
    n: 4,
    title: "Rainy-morning test",
    look: "A Monte Carlo of fictional mornings. Rain and traffic are already on.",
    doThis: "Press Run stress test, read the interpretation card, then Next.",
    path: "/app/twin",
    account: "district_admin",
    navMatch: "/app/twin",
  },
  {
    id: "live",
    n: 5,
    title: "Start the buses",
    look: "Every route on one map. Buses stay locked to their colored path.",
    doThis: "Press Start live demo. Watch a bus move, click a route to follow it, then Next.",
    path: "/app/live",
    account: "district_admin",
    navMatch: "/app/live",
  },
  {
    id: "family",
    n: 6,
    title: "What a parent sees",
    look: "Only Ava Bennett — no other children, no full bus list. That is the privacy demo.",
    doThis: "Next switches you to the Family account. Confirm you only see Ava, then you are done.",
    path: "/app/live",
    account: "guardian",
    navMatch: "/app/live",
  },
];

export const GUIDE_STORAGE_KEY = "dart_judge_guide";

export function stepIndex(id: string): number {
  const i = GUIDE_STEPS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function stepById(id: string): GuideStep {
  return GUIDE_STEPS[stepIndex(id)];
}

export function stepFromLocation(pathname: string, role: Role | undefined): GuideStep | undefined {
  if (pathname.startsWith("/app/planner")) return stepById("planner");
  if (pathname.startsWith("/app/compare")) return stepById("compare");
  if (pathname.startsWith("/app/twin")) return stepById("twin");
  if (pathname.startsWith("/app/dashboard")) return stepById("dashboard");
  if (pathname.startsWith("/app/live")) {
    return role === "guardian" ? stepById("family") : stepById("live");
  }
  return undefined;
}

export function accountForRole(role: Role | undefined): GuideAccount | null {
  if (role === "guardian") return "guardian";
  if (role === "driver") return "driver";
  if (role === "district_admin" || role === "platform_admin" || role === "planner" || role === "dispatcher") {
    return "district_admin";
  }
  return null;
}
