import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { colors } from "../../src/theme";

export default function DriverLayout() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/welcome" />;
  if (user.role === "guardian") return <Redirect href="/(guardian)/today" />;
  if (user.role !== "driver") return <Redirect href="/staff" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
