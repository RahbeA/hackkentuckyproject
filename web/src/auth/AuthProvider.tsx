import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAccessToken, setRefresh } from "../api/client";
import type { Role, User } from "../types";

export interface RegisterInput {
  /** "create" spins up a new district; "join" attaches to an existing one. */
  mode: "create" | "join";
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  password: string;
  // create mode
  district_name?: string;
  // join mode
  role?: Role;
  join_code?: string;
  district?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me/")
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const { data } = await api.post("/auth/login/", { email: email.trim().toLowerCase(), password });
        setAccessToken(data.tokens.access);
        setRefresh(data.tokens.refresh);
        setUser(data.user);
        return data.user as User;
      },
      async register(input) {
        const { data } = await api.post("/auth/register/", {
          ...input,
          email: input.email.trim().toLowerCase(),
        });
        setAccessToken(data.tokens.access);
        setRefresh(data.tokens.refresh);
        setUser(data.user);
        return data.user as User;
      },
      async logout() {
        try {
          await api.post("/auth/logout/", { refresh: localStorage.getItem("rw_refresh") });
        } catch {
          /* ignore */
        }
        setAccessToken(null);
        setRefresh(null);
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
