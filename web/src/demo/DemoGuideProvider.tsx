import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import type { Role } from "../types";
import {
  GUIDE_STEPS,
  GUIDE_STORAGE_KEY,
  accountForRole,
  stepById,
  stepFromLocation,
  stepIndex,
  type GuideAccount,
  type GuideStep,
} from "./steps";

interface DemoAccount {
  email: string;
  label: string;
  role: Role;
}

interface DemoCreds {
  demo_mode: boolean;
  password: string;
  accounts: DemoAccount[];
}

interface Stored {
  active: boolean;
  stepId: string;
  dismissed: boolean;
}

interface GuideState {
  available: boolean;
  active: boolean;
  dismissed: boolean;
  step: GuideStep;
  index: number;
  total: number;
  switching: boolean;
  error: string | null;
  start: (stepId?: string) => void;
  dismiss: () => void;
  resume: () => void;
  goTo: (stepId: string) => Promise<void>;
  next: () => Promise<void>;
  back: () => Promise<void>;
  switchAccount: (account: GuideAccount) => Promise<void>;
}

const Ctx = createContext<GuideState | null>(null);

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return { active: false, stepId: "dashboard", dismissed: false };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      active: Boolean(parsed.active),
      stepId: typeof parsed.stepId === "string" ? parsed.stepId : "dashboard",
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return { active: false, stepId: "dashboard", dismissed: false };
  }
}

function writeStored(next: Stored) {
  localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(next));
}

export function DemoGuideProvider({ children }: { children: ReactNode }) {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [stored, setStored] = useState<Stored>(readStored);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoOn = import.meta.env.VITE_DEMO_MODE === "true";
  const { data: creds } = useQuery({
    queryKey: ["demo-credentials"],
    enabled: demoOn,
    queryFn: async () => (await api.get("/auth/demo-credentials/")).data as DemoCreds,
    staleTime: 60_000,
  });

  const persist = useCallback((next: Stored) => {
    setStored(next);
    writeStored(next);
  }, []);

  const emailFor = useCallback(
    (account: GuideAccount) => {
      const list = creds?.accounts || [];
      if (account === "guardian") {
        return list.find((a) => a.role === "guardian" && a.email.startsWith("guardian@"))?.email || "guardian@jefferson.demo";
      }
      if (account === "driver") {
        return list.find((a) => a.role === "driver")?.email || "driver@jefferson.demo";
      }
      return list.find((a) => a.role === "district_admin")?.email || "admin@jefferson.demo";
    },
    [creds],
  );

  const ensureAccount = useCallback(
    async (account: GuideAccount) => {
      if (accountForRole(user?.role) === account) return;
      const password = creds?.password || "DemoPass123!";
      setSwitching(true);
      setError(null);
      try {
        await login(emailFor(account), password);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not switch demo account.");
        throw e;
      } finally {
        setSwitching(false);
      }
    },
    [creds?.password, emailFor, login, user?.role],
  );

  const goTo = useCallback(
    async (stepId: string) => {
      const step = stepById(stepId);
      persist({ active: true, dismissed: false, stepId: step.id });
      try {
        await ensureAccount(step.account);
      } catch {
        return;
      }
      if (loc.pathname !== step.path) nav(step.path);
    },
    [ensureAccount, loc.pathname, nav, persist],
  );

  useEffect(() => {
    if (!stored.active || stored.dismissed) return;
    const match = stepFromLocation(loc.pathname, user?.role);
    if (match && match.id !== stored.stepId && accountForRole(user?.role) === match.account) {
      persist({ ...stored, stepId: match.id });
    }
  }, [loc.pathname, persist, stored, user?.role]);

  const value = useMemo<GuideState>(() => {
    const step = stepById(stored.stepId);
    const index = stepIndex(stored.stepId);
    return {
      available: demoOn && Boolean(creds?.demo_mode !== false),
      active: stored.active && !stored.dismissed,
      dismissed: stored.dismissed,
      step,
      index,
      total: GUIDE_STEPS.length,
      switching,
      error,
      start: (stepId = "dashboard") => {
        persist({ active: true, dismissed: false, stepId });
      },
      dismiss: () => persist({ ...stored, active: false, dismissed: true }),
      resume: () => persist({ ...stored, active: true, dismissed: false }),
      goTo,
      next: async () => {
        if (index >= GUIDE_STEPS.length - 1) {
          persist({ active: false, dismissed: true, stepId: step.id });
          return;
        }
        await goTo(GUIDE_STEPS[index + 1].id);
      },
      back: async () => {
        if (index <= 0) return;
        await goTo(GUIDE_STEPS[index - 1].id);
      },
      switchAccount: async (account) => {
        await ensureAccount(account);
        const home = account === "guardian" ? "/app/live" : account === "driver" ? "/app/drive" : "/app/dashboard";
        nav(home);
      },
    };
  }, [creds?.demo_mode, demoOn, ensureAccount, error, goTo, persist, stored, switching]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoGuide() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDemoGuide requires DemoGuideProvider");
  return ctx;
}

export function useDemoGuideOptional() {
  return useContext(Ctx);
}
