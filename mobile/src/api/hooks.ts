import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AppNotification,
  GuardianChild,
  GuardianEta,
  GuardianTrip,
  Me,
  TripHistoryRow,
} from "../types";

export function useMe() {
  return useQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me/")).data,
  });
}

export function useChildren() {
  return useQuery<GuardianChild[]>({
    queryKey: ["children"],
    queryFn: async () => (await api.get("/guardian/children/")).data,
  });
}

export function useEtas(pollMs = 5000) {
  return useQuery<GuardianEta[]>({
    queryKey: ["etas"],
    queryFn: async () => (await api.get("/guardian/etas/")).data,
    refetchInterval: pollMs,
  });
}

export function useGuardianTrip(studentId: string | null | undefined, pollMs = 5000) {
  return useQuery<GuardianTrip>({
    queryKey: ["guardian-trip", studentId],
    enabled: !!studentId,
    refetchInterval: pollMs,
    retry: false,
    queryFn: async () => (await api.get(`/guardian/trip/${studentId}/`)).data,
  });
}

export function useNotifications(pollMs = 15000) {
  return useQuery<AppNotification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const data = (await api.get("/notifications/")).data;
      return Array.isArray(data) ? data : data.results || [];
    },
    refetchInterval: pollMs,
  });
}

export type NotificationPrefs = { eta: boolean; delay: boolean; school: boolean };

export function useNotificationPrefs() {
  return useQuery<NotificationPrefs>({
    queryKey: ["notification-prefs"],
    queryFn: async () => {
      const data = (await api.get("/guardian-links/me/")).data;
      const first = Array.isArray(data) ? data[0] : null;
      const prefs = (first?.notification_preferences || {}) as Record<string, boolean>;
      return {
        eta: prefs.eta !== false,
        delay: prefs.delay !== false,
        school: prefs.school === true,
      };
    },
  });
}

export function useHistory() {
  return useQuery<TripHistoryRow[]>({
    queryKey: ["guardian-history"],
    queryFn: async () => (await api.get("/guardian/history/")).data,
  });
}

export function useAbsentToday() {
  return useQuery<string[]>({
    queryKey: ["absent-today"],
    queryFn: async () => [],
    initialData: [],
    staleTime: Infinity,
  });
}

export function useMarkAbsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { student_id: string; note?: string; scope?: "am" | "all" }) =>
      api.post("/guardian/absent/", vars),
    onSuccess: (_data, vars) => {
      qc.setQueryData<string[]>(["absent-today"], (prev = []) => [...new Set([...prev, vars.student_id])]);
      qc.invalidateQueries({ queryKey: ["etas"] });
    },
  });
}

export function useDemoStatus(districtId?: string | null) {
  return useQuery<{ running: boolean; progress: number; trip_ids: string[]; hero_id: string | null }>({
    queryKey: ["demo-status", districtId],
    enabled: Boolean(districtId),
    queryFn: async () => (await api.get(`/districts/${districtId}/demo/status/`)).data,
    refetchInterval: 3000,
  });
}

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notification_preferences: Record<string, boolean>) =>
      api.patch("/guardian-links/me/", { notification_preferences }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/notifications/read-all/"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useClaimRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post("/guardian/claim/", { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["etas"] });
    },
  });
}
