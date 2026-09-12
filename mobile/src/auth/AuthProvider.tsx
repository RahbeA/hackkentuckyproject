import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearTokens, getRefreshToken, setTokens } from "../api/client";
import type { Me, Role } from "../types";

export type RegisterInput = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  join_code?: string;
  district?: string;
};

type AuthContextValue = {
  user: Me | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  registerFamily: (input: RegisterInput) => Promise<Me>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    try {
      const { data } = await api.get("/auth/me/");
      setUser(data);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      async signIn(email, password) {
        const { data } = await api.post("/auth/login/", { email: email.trim().toLowerCase(), password });
        await setTokens(data.tokens.access, data.tokens.refresh);
        setUser(data.user);
        return data.user as Me;
      },
      async registerFamily(input) {
        const { data } = await api.post("/auth/register/", {
          mode: "join",
          role: "guardian",
          first_name: input.first_name,
          last_name: input.last_name,
          email: input.email.trim().toLowerCase(),
          password: input.password,
          join_code: input.join_code,
          district: input.district,
        });
        await setTokens(data.tokens.access, data.tokens.refresh);
        setUser(data.user);
        return data.user as Me;
      },
      async signOut() {
        const refresh = await getRefreshToken();
        try {
          await api.post("/auth/logout/", { refresh });
        } catch {
          /* token may already be invalid */
        }
        await clearTokens();
        setUser(null);
      },
      refresh,
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homeFor(role?: Role | string): "/(guardian)/today" | "/driver" | "/staff" | "/welcome" {
  if (role === "guardian") return "/(guardian)/today";
  if (role === "driver") return "/driver";
  if (role === "planner" || role === "dispatcher" || role === "district_admin" || role === "platform_admin") {
    return "/staff";
  }
  return "/welcome";
}
