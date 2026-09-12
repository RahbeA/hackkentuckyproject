import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiError } from "../src/api/client";
import { useAuth, homeFor } from "../src/auth/AuthProvider";
import { DartMark } from "../src/components/brand/DartLogo";
import { ApiBanner } from "../src/components/ui/ApiBanner";
import { BackButton } from "../src/components/ui/BackButton";
import { Button } from "../src/components/ui/Button";
import { DEMO_MODE as DEMO } from "../src/config";
import { colors, fonts } from "../src/theme";

export default function Login() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e = email, p = password) {
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(e, p);
      if (next === "link" && user.role === "guardian") router.replace("/(guardian)/link");
      else router.replace(homeFor(user.role));
    } catch (err) {
      setError(apiError(err, "Sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingHorizontal: 22,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton />
        <View style={{ marginTop: 20 }}>
          <DartMark size={44} />
        </View>
        <Text style={{ fontFamily: fonts.heading, fontSize: 30, letterSpacing: -0.8, lineHeight: 34, marginTop: 26, color: colors.ink }}>
          Follow your rider's morning
        </Text>
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 24, color: colors.muted }}>
          Families and drivers use this app. The 6-step walkthrough lives on the web console — tap a demo account
          below if you are judging the mobile side.
        </Text>

        {DEMO ? (
          <View style={{ marginTop: 24, gap: 8 }}>
            <Text style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", color: colors.faint }}>
              Judges — tap one
            </Text>
            <Button
              variant="secondary"
              label="Family · Ava Bennett only"
              onPress={() => submit("guardian@jefferson.demo", "DemoPass123!")}
            />
            <Button
              variant="secondary"
              label="Student · same privacy rules"
              onPress={() => submit("student@jefferson.demo", "DemoPass123!")}
            />
            <Button
              variant="secondary"
              label="Driver · assigned run"
              onPress={() => submit("driver@jefferson.demo", "DemoPass123!")}
            />
          </View>
        ) : null}

        <View style={{ marginTop: 30, gap: 16 }}>
          <Field label="Email">
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@email.com"
              placeholderTextColor={colors.faint}
              value={email}
              onChangeText={setEmail}
              style={input}
            />
          </Field>
          <Field label="Password">
            <TextInput
              accessibilityLabel="Password"
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.faint}
              value={password}
              onChangeText={setPassword}
              style={input}
            />
          </Field>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
              {error}
            </Text>
          ) : null}
          <Button label={busy ? "Signing in…" : "Sign in"} loading={busy} onPress={() => submit()} />
          <Pressable
            onPress={() =>
              Alert.alert("Forgot your password?", "Ask your transportation office to reset the account on file for this email.")
            }
          >
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "600", color: colors.primary }}>
              Forgot your password?
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            marginTop: "auto",
            paddingTop: 28,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.field,
            borderRadius: 10,
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 12.5, lineHeight: 20, color: colors.muted }}>
            You will only ever see the riders linked to your account. Bus locations in this demo are simulated.
          </Text>
          <ApiBanner />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View>
      <Text style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted, marginBottom: 7 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const input = {
  width: "100%" as const,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.field,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 14,
  fontSize: 15,
  color: colors.ink,
  minHeight: 48,
};
