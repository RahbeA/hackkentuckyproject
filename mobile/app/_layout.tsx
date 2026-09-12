import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { SplashWipe } from "../src/components/brand/SplashWipe";
import { installUiFonts } from "../src/installUiFonts";
import { DistrictLiveProvider } from "../src/live/DistrictLiveProvider";
import "../src/notifications/push";

installUiFonts();

const qc = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_700Bold });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <DistrictLiveProvider>
            <StatusBar style="dark" />
            <BootGate fontsLoaded={fontsLoaded} />
          </DistrictLiveProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function BootGate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const finish = useCallback(() => setSplashDone(true), []);

  if (!splashDone) {
    return <SplashWipe ready={fontsLoaded && ready} onDone={finish} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="(guardian)" />
      <Stack.Screen name="driver" />
    </Stack>
  );
}
