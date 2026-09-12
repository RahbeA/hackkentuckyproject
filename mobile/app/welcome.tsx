import { useRouter } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RouteSketch } from "../src/components/brand/RouteSketch";
import { ApiBanner } from "../src/components/ui/ApiBanner";
import { colors, shadow, uiFont } from "../src/theme";

const wordmark = require("../assets/brand/dart-logo.png");

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flex: 1, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }}>
        <View style={{ paddingHorizontal: 26, paddingBottom: 6, zIndex: 2 }}>
          <Image source={wordmark} style={{ width: 118, height: 36 }} resizeMode="contain" accessibilityLabel="DART" />
        </View>

        <View style={{ flex: 1.05, marginTop: 8 }}>
          <RouteSketch />
          <View style={{ position: "absolute", left: 26, bottom: 8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.white,
                borderRadius: 18,
                paddingVertical: 10,
                paddingHorizontal: 14,
                gap: 12,
                ...shadow.card,
                shadowOpacity: 0.1,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}
            >
              <Text style={{ ...uiFont, fontSize: 22, fontWeight: "700", color: colors.ink }}>7:42</Text>
              <View style={{ width: 1, height: 28, backgroundColor: colors.border }} />
              <View>
                <Text style={{ ...uiFont, fontSize: 13, fontWeight: "600", color: colors.ink }}>Maple & 3rd</Text>
                <Text style={{ ...uiFont, marginTop: 2, fontSize: 12, color: colors.muted }}>Ava · Bus 14</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 26, paddingTop: 22 }}>
          <Text
            style={{
              ...uiFont,
              fontSize: 34,
              fontWeight: "700",
              letterSpacing: -0.4,
              lineHeight: 40,
              color: colors.ink,
            }}
          >
            Know where the bus is.
          </Text>
          <Text style={{ ...uiFont, marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.muted }}>
            Arrival estimates for your own riders, and a notice the moment a route changes.
          </Text>
        </View>

        <View style={{ marginTop: "auto", paddingHorizontal: 26, paddingTop: 36, gap: 12 }}>
          <Pressable
            onPress={() => router.push("/login")}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 999,
              minHeight: 56,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...uiFont, color: colors.white, fontSize: 16, fontWeight: "600" }}>Sign in</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/register")}
            style={{
              backgroundColor: colors.white,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
              minHeight: 56,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...uiFont, color: colors.ink, fontSize: 16, fontWeight: "600" }}>Create family account</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/login?next=link")} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ ...uiFont, color: colors.primary, fontSize: 15, fontWeight: "600" }}>I have a rider code</Text>
          </Pressable>
          <Text style={{ ...uiFont, marginTop: 4, textAlign: "center", fontSize: 12, lineHeight: 18, color: colors.faint }}>
            Families and drivers sign in here. Planners use the web console.
          </Text>
          <ApiBanner />
        </View>
      </View>
    </View>
  );
}
