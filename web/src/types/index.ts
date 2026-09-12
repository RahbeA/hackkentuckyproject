export type Role =
  | "platform_admin"
  | "district_admin"
  | "planner"
  | "dispatcher"
  | "driver"
  | "guardian";

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  district: string | null;
  district_name?: string;
}

export const ROLE_HOME: Record<Role, string> = {
  platform_admin: "/app/dashboard",
  district_admin: "/app/dashboard",
  planner: "/app/planner",
  dispatcher: "/app/dispatch",
  driver: "/app/drive",
  guardian: "/app/live",
};

export const ROLE_LABEL: Record<Role, string> = {
  platform_admin: "Platform admin",
  district_admin: "District admin",
  planner: "Planner",
  dispatcher: "Dispatcher",
  driver: "Driver",
  guardian: "Family",
};

export type WorkspaceId = "district_admin" | "planner" | "dispatcher" | "driver" | "guardian";

export const WORKSPACE_HOME: Record<WorkspaceId, string> = {
  district_admin: "/app/dashboard",
  planner: "/app/planner",
  dispatcher: "/app/dispatch",
  driver: "/app/drive",
  guardian: "/app/live",
};

export function afterSignInPath(role: Role, opts?: { pickWorkspace?: boolean; newDistrict?: boolean }): string {
  if (opts?.newDistrict && role === "district_admin") return "/app/onboarding";
  if (opts?.pickWorkspace && (role === "district_admin" || role === "platform_admin")) {
    return "/choose-workspace";
  }
  return ROLE_HOME[role];
}

// Louisville Metro / LOJIC open-data layers (apps.geodata) — see backend/apps/geodata.

export interface RiskFactor {
  code: string;
  text: string;
}

export interface ActiveConstruction {
  permit_no: string;
  work_type: string;
  street_address: string;
  to_date: string | null;
}

export interface SafetyContext {
  high_injury_km: number;
  high_injury_corridors: string[];
  high_injury_worst_priority: number | null;
  signal_crossings: number;
  active_construction: ActiveConstruction[];
  snow_route_coverage: number;
}

export interface HighInjurySegment {
  id: string;
  road_name: string;
  corridor_name: string;
  priority_rank: number | null;
  geometry: [number, number][];
}

export interface PublicSchoolSite {
  id: string;
  name: string;
  level: string;
  loc_type: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number;
  longitude: number;
}

export interface ConstructionPermit {
  id: string;
  permit_no: string;
  work_type: string;
  street_address: string;
  to_date: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export interface SuggestedStopStudent {
  student_id: string;
  name: string;
  walk_distance_m: number;
  requires_wheelchair: boolean;
}

export interface SafetyFlags {
  on_high_injury_corridor: boolean;
  high_injury_corridor_name: string | null;
  has_marked_crossing_or_signal: boolean;
}

export interface SuggestedStop {
  temp_id: string;
  name: string;
  latitude: number;
  longitude: number;
  students: SuggestedStopStudent[];
  student_count: number;
  wheelchair_count: number;
  max_walk_distance_m: number;
  avg_walk_distance_m: number;
  safety_flags: SafetyFlags;
}

export interface SuggestStopsResponse {
  school_id: string;
  direction: string;
  max_walk_distance_m: number;
  students_considered: number;
  skipped_students: { student_id: string; name: string; reason: string }[];
  suggested_stops: SuggestedStop[];
}
