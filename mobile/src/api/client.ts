import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "../config";

const API = API_URL;

export const api = axios.create({ baseURL: API });

const ACCESS = "rw_access";
const REFRESH = "rw_refresh";

export async function getAccess() {
  return SecureStore.getItemAsync(ACCESS);
}
export async function setTokens(access: string | null, refresh?: string | null) {
  if (access) await SecureStore.setItemAsync(ACCESS, access);
  else await SecureStore.deleteItemAsync(ACCESS);
  if (refresh !== undefined) {
    if (refresh) await SecureStore.setItemAsync(REFRESH, refresh);
    else await SecureStore.deleteItemAsync(REFRESH);
  }
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH);
}

export async function clearTokens() {
  await setTokens(null, null);
}

export function apiError(err: unknown, fallback = "Something went wrong") {
  const ax = err as {
    message?: string;
    code?: string;
    response?: { data?: Record<string, unknown> };
  };
  const data = ax.response?.data;
  if (data) {
    const wrapped = data.error as { message?: string } | undefined;
    if (wrapped?.message) return wrapped.message;
    if (typeof data.detail === "string") return data.detail;
    const fields = Object.entries(data).find(([, v]) => Array.isArray(v) && typeof v[0] === "string");
    if (fields) return String((fields[1] as string[])[0]);
  }
  if (ax.code === "ERR_NETWORK" || ax.message === "Network Error") {
    return "Cannot reach the same server as the web app. Stay on this Wi‑Fi and check the API host below.";
  }
  return fallback;
}

api.interceptors.request.use(async (config) => {
  const token = await getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const refresh = await SecureStore.getItemAsync(REFRESH);
      if (refresh) {
        try {
          const res = await axios.post(`${API}/auth/refresh/`, { refresh });
          await setTokens(res.data.access, res.data.refresh || refresh);
          error.config.headers.Authorization = `Bearer ${res.data.access}`;
          return api(error.config);
        } catch {
          await clearTokens();
        }
      } else {
        await clearTokens();
      }
    }
    return Promise.reject(error);
  },
);
