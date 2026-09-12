import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthProvider";
import { DartMark } from "../src/components/brand/DartLogo";
import { ApiBanner } from "../src/components/ui/ApiBanner";
import { Button } from "../src/components/ui/Button";
import { ROLE_LABEL } from "../src/types";
import { colors, fonts } from "../src/theme";

export default function StaffGate() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = user?.role ? ROLE_LABEL[user.role] : "Staff";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 36, paddingHorizontal: 26, paddingBottom: insets.bottom + 24 }}>
      <DartMark size={44} />
      <Text style={{ fontFamily: fonts.heading, fontSize: 28, letterSpacing: -0.8, lineHeight: 32, marginTop: 28, color: colors.ink }}>
        Use the web console
      </Text>
      <Text style={{ marginTop: 12, fontSize: 15, lineHeight: 24, color: colors.muted }}>
        This phone app is for families and drivers. {role} accounts plan routes, start the live demo, and watch the
        fleet on the web at localhost:5173.
      </Text>
      <Text style={{ marginTop: 16, fontSize: 14, lineHeight: 22, color: colors.ink }}>
        Signed in as {user?.email}
      </Text>
      <View style={{ marginTop: "auto", gap: 10 }}>
        <ApiBanner />
        <Button
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            await signOut();
            router.replace("/welcome");
          }}
        />
      </View>
    </View>
  );
}
