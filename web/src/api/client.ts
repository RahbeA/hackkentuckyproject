import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

let accessToken: string | null = sessionStorage.getItem("rw_access");

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) sessionStorage.setItem("rw_access", token);
  else sessionStorage.removeItem("rw_access");
}

export function getAccessToken() {
  return accessToken;
}

export function getRefresh() {
  return localStorage.getItem("rw_refresh");
}
export function setRefresh(token: string | null) {
  if (token) localStorage.setItem("rw_refresh", token);
  else localStorage.removeItem("rw_refresh");
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = getRefresh();
      if (refresh) {
        try {
          const res = await axios.post(`${API}/auth/refresh/`, { refresh });
          setAccessToken(res.data.access);
          if (res.data.refresh) setRefresh(res.data.refresh);
          original.headers.Authorization = `Bearer ${res.data.access}`;
          return api(original);
        } catch {
          setAccessToken(null);
          setRefresh(null);
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

export type ApiError = { error?: { code: string; message: string; details?: Record<string, unknown> } };

export function errorMessage(err: unknown): string {
  const ax = err as { response?: { data?: ApiError & Record<string, unknown> } };
  const data = ax.response?.data;
  if (data?.error?.message) return data.error.message;
  if (data) {
    const fields = Object.entries(data).find(([, v]) => Array.isArray(v) && typeof v[0] === "string");
    if (fields) return String((fields[1] as string[])[0]);
  }
  return (err as Error).message || "Something went wrong.";
}
