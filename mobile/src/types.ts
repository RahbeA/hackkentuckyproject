export type Role =
  | "guardian"
  | "driver"
  | "planner"
  | "dispatcher"
  | "district_admin"
  | "platform_admin";

export const ROLE_LABEL: Record<Role, string> = {
  guardian: "Family",
  driver: "Driver",
  planner: "Planner",
  dispatcher: "Dispatcher",
  district_admin: "District admin",
  platform_admin: "Platform admin",
};

export interface Me {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  district?: string | null;
  district_name?: string | null;
}

export interface GuardianChild {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | number | null;
  school: string | null;
  school_name: string | null;
  requires_wheelchair: boolean;
}

export interface GuardianEta {
  student_id: string;
  student_first_name: string;
  stop_name: string | null;
  scheduled_pickup: string | null;
  status: string;
  delay_seconds: number;
  p50_eta: string | null;
  is_simulated: boolean;
  on_time: boolean;
  trip_id: string | null;
  route_code: string | null;
  school_name: string | null;
  current_stop_sequence: number;
  stop_count: number;
  my_stop_sequence: number | null;
  late_probability: number;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  progress?: number | null;
}

export interface RouteStop {
  id: string;
  name: string;
  sequence: number;
  kind?: string;
  latitude: number | string;
  longitude: number | string;
  scheduled_arrival: string | null;
}

export interface GuardianTrip {
  student_id: string;
  student_first_name?: string;
  trip_id: string | null;
  route_code: string | null;
  school_name: string | null;
  status: string;
  current_stop_sequence: number;
  current_p50_eta: string | null;
  is_simulated: boolean;
  my_stop_sequence: number | null;
  my_stop_name?: string | null;
  path: [number, number][];
  stops: RouteStop[];
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  event_type?: string;
  payload?: Record<string, unknown>;
  is_read?: boolean;
  created_at?: string;
}

export interface TripHistoryRow {
  trip_id: string;
  service_date: string;
  status: string;
  delay_seconds: number;
  school_name: string;
}
