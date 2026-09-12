import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL = "dart-rider";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type DartNoticeKind = "delay" | "eta" | "school" | "emergency" | "demo";

export async function ensureNotificationSetup() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "DART rider updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#2563EB",
    });
  }
}

export async function getPermission(): Promise<"granted" | "denied" | "undetermined"> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted" || current.granted) return "granted";
  if (current.status === "undetermined") return "undetermined";
  return "denied";
}

export async function requestPermission(): Promise<boolean> {
  await ensureNotificationSetup();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return next.status === "granted";
}

export async function sendDartNotice(input: {
  title: string;
  body: string;
  kind?: DartNoticeKind;
  screen?: "track" | "updates" | "today";
  studentId?: string;
}) {
  await ensureNotificationSetup();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      subtitle: "DART",
      body: input.body,
      sound: "default",
      data: {
        kind: input.kind || "demo",
        screen: input.screen || "updates",
        studentId: input.studentId || "",
      },
      ...(Platform.OS === "android" ? { channelId: CHANNEL, color: "#2563EB" } : {}),
    },
    trigger: null,
  });
}

export const DEMO_NOTICES = {
  delay: {
    title: "Route 22 is running late",
    body: "About 6 minutes behind. Noah's pickup at Oak Ridge Dr is now estimated at 7:48 AM.",
    kind: "delay" as const,
    screen: "track" as const,
  },
  eta: {
    title: "Bus is one stop away",
    body: "Your rider's stop is next. Arrival estimates update as the bus moves.",
    kind: "eta" as const,
    screen: "track" as const,
  },
  depot: {
    title: "Bus 14 has departed the depot",
    body: "Ava's stop at Maple & 3rd is estimated at 7:42 AM.",
    kind: "eta" as const,
    screen: "today" as const,
  },
};
