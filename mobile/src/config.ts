import Constants from "expo-constants";

const PRODUCTION_API = "https://backend-production-59fa.up.railway.app/api/v1";
const PRODUCTION_WS = "wss://backend-production-59fa.up.railway.app/ws";
const LOCAL_API = "http://localhost:8000/api/v1";
const LOCAL_WS = "ws://localhost:8000/ws";

const extra = Constants.expoConfig?.extra ?? {};

function isLoopback(host: string) {
  return host === "localhost" || host === "127.0.0.1";
}

function isLoopbackUrl(url: string) {
  return /localhost|127\.0\.0\.1/.test(url);
}

/** Expo packager host on a physical phone is the same LAN machine as the web app. */
function packagerLanHost(): string | null {
  const c = Constants as { expoGoConfig?: { debuggerHost?: string }; linkingUri?: string };
  const raw = String(
    Constants.expoConfig?.hostUri || c.expoGoConfig?.debuggerHost || c.linkingUri || "",
  )
    .replace(/^exp:\/\//, "")
    .replace(/^https?:\/\//, "");
  const host = raw.split(":")[0]?.split("/")[0] || "";
  if (!host || isLoopback(host)) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(".")) return host;
  return null;
}

function resolveEndpoints() {
  const extraApi = extra.apiUrl ? String(extra.apiUrl) : "";
  const extraWs = extra.wsUrl ? String(extra.wsUrl) : "";

  if (extraApi && !isLoopbackUrl(extraApi)) {
    return { api: extraApi, ws: extraWs || PRODUCTION_WS };
  }

  const lan = packagerLanHost();
  if (lan) {
    return { api: `http://${lan}:8000/api/v1`, ws: `ws://${lan}:8000/ws` };
  }

  if (extraApi) return { api: extraApi, ws: extraWs || LOCAL_WS };
  if (typeof __DEV__ !== "undefined" && __DEV__) return { api: LOCAL_API, ws: LOCAL_WS };
  return { api: PRODUCTION_API, ws: PRODUCTION_WS };
}

const resolved = resolveEndpoints();
export const API_URL = resolved.api;
export const WS_URL = resolved.ws;
export const DEMO_MODE = extra.demoMode !== false;

/** Short label so a physical phone pointed at the wrong host is obvious. */
export function apiHostLabel() {
  try {
    const host = new URL(API_URL).host;
    if (host.includes("localhost") || host.includes("127.0.0.1")) return `API: ${host} (this device)`;
    if (host.includes("railway.app")) return "API: Railway";
    return `API: ${host}`;
  } catch {
    return `API: ${API_URL}`;
  }
}
