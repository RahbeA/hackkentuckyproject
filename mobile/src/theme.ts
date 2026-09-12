import { Platform } from "react-native";

// DART brand tokens — derived from the design (Auth screens setup).
export const colors = {
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primarySoft: "#EFF6FF",
  ink: "#111827",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  hairline: "#F1F5F9",
  surface: "#FFFFFF",
  field: "#F8FAFC",
  bg: "#F8FAFC",
  night: "#0B1120",
  mapNight: "#070C16",
  success: "#059669",
  successSoft: "rgba(5,150,105,.08)",
  warn: "#D97706",
  warnSoft: "rgba(217,119,6,.08)",
  danger: "#DC2626",
  white: "#FFFFFF",
} as const;

// Loaded via @expo-google-fonts/space-grotesk in the root layout. Falls back to
// the system font until loaded, so screens never block on fonts.
export const fonts = {
  heading: "SpaceGrotesk_700Bold",
  headingMed: "SpaceGrotesk_500Medium",
} as const;

/**
 * Body/UI type. Loading only Bold/Medium Space Grotesk makes iOS steal those
 * faces for fontWeight 600 and render spaces at zero width ("Sign in" → "Signin").
 */
export const uiFont = Platform.select({
  ios: { fontFamily: "Avenir Next" },
  android: { fontFamily: "sans-serif" },
  default: {},
});

export const radius = { sm: 8, md: 10, lg: 12, xl: 14, pill: 999 } as const;

export const space = (n: number) => n * 4;

export const shadow = {
  card: {
    shadowColor: "#101828",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const;
