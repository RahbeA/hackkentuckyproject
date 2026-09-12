import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAccess } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { WS_URL } from "../config";

const WS_BASE = WS_URL;

export type LivePosition = {
  tripId: string;
  lat: number;
  lng: number;
  heading: number;
  progress: number;
  currentStopSequence: number;
  stopCount: number;
  delaySeconds: number;
  lateProbability: number;
  p50Eta: string | null;
  routeCode: string;
  nextStopName?: string | null;
  status?: string;
  updatedAt: number;
};

type Envelope = { event: string; trip_id: string; payload: Record<string, unknown> };

type LiveValue = {
  connected: boolean;
  positions: Record<string, LivePosition>;
};

const LiveContext = createContext<LiveValue>({ connected: false, positions: {} });

export function useDistrictLive() {
  return useContext(LiveContext);
}

export function DistrictLiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const districtId = user?.district;
  const [connected, setConnected] = useState(false);
  const [positions, setPositions] = useState<Record<string, LivePosition>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedByUs = useRef(false);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidate = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      qc.invalidateQueries({ queryKey: ["etas"] });
      qc.invalidateQueries({ queryKey: ["guardian-trip"] });
      qc.invalidateQueries({ queryKey: ["driver-trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    }, 600);
  }, [qc]);

  const pending = useRef<Record<string, LivePosition>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPositions = useCallback(() => {
    flushTimer.current = null;
    const batch = pending.current;
    pending.current = {};
    if (!Object.keys(batch).length) return;
    setPositions((prev) => {
      const next = { ...prev };
      for (const [id, pos] of Object.entries(batch)) {
        next[id] = {
          ...pos,
          routeCode: pos.routeCode || prev[id]?.routeCode || "",
          status: pos.status || prev[id]?.status,
        };
      }
      return next;
    });
  }, []);

  const handleEnvelope = useCallback(
    (msg: Envelope) => {
      const p = msg.payload || {};
      if (msg.event === "trip.position.updated") {
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          return;
        }
        pending.current[msg.trip_id] = {
          tripId: msg.trip_id,
          lat,
          lng,
          heading: Number(p.heading || 0) || 0,
          progress: Number(p.progress ?? 0) || 0,
          currentStopSequence: Number(p.current_stop_sequence ?? 0),
          stopCount: Number(p.stop_count || 0) || 0,
          delaySeconds: Number(p.delay_seconds || 0) || 0,
          lateProbability: Number(p.late_probability || 0) || 0,
          p50Eta: (p.p50_eta as string) || null,
          routeCode: (p.route_code as string) || pending.current[msg.trip_id]?.routeCode || "",
          nextStopName: (p.next_stop_name as string) || pending.current[msg.trip_id]?.nextStopName || null,
          status: pending.current[msg.trip_id]?.status,
          updatedAt: Date.now(),
        };
        if (!flushTimer.current) {
          flushTimer.current = setTimeout(flushPositions, 16);
        }
        return;
      }
      if (msg.event === "trip.status.updated") {
        setPositions((prev) =>
          prev[msg.trip_id]
            ? { ...prev, [msg.trip_id]: { ...prev[msg.trip_id], status: String(p.status || "") } }
            : prev,
        );
        scheduleInvalidate();
      }
    },
    [flushPositions, scheduleInvalidate],
  );

  useEffect(() => {
    if (!districtId) {
      setConnected(false);
      setPositions({});
      return;
    }
    closedByUs.current = false;
    let stop = false;

    const connect = async () => {
      if (stop) return;
      const token = await getAccess();
      if (!token) {
        setTimeout(connect, 800);
        return;
      }
      const url = `${WS_BASE}/districts/${districtId}/?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          handleEnvelope(JSON.parse(String(ev.data)) as Envelope);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (stop || closedByUs.current) return;
        retryRef.current = Math.min(retryRef.current + 1, 6);
        const delay = Math.min(1000 * 2 ** (retryRef.current - 1), 15000);
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    void connect();
    return () => {
      stop = true;
      closedByUs.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, [districtId, handleEnvelope]);

  const value = useMemo(() => ({ connected, positions }), [connected, positions]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
