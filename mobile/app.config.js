const appJson = require("./app.json");

const PRODUCTION_API = "https://backend-production-59fa.up.railway.app/api/v1";
const PRODUCTION_WS = "wss://backend-production-59fa.up.railway.app/ws";

const profile = process.env.EAS_BUILD_PROFILE;
const fromEnvApi = process.env.EXPO_PUBLIC_API_URL;
const fromEnvWs = process.env.EXPO_PUBLIC_WS_URL;

function pick(fromEnv, production, local) {
  if (profile === "production") return production;
  if (fromEnv && !fromEnv.includes("localhost")) return fromEnv;
  return fromEnv || local;
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      apiUrl: pick(fromEnvApi, PRODUCTION_API, "http://localhost:8000/api/v1"),
      wsUrl: pick(fromEnvWs, PRODUCTION_WS, "ws://localhost:8000/ws"),
      demoMode: (process.env.EXPO_PUBLIC_DEMO_MODE ?? "true") === "true",
    },
  },
};
