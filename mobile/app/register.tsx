import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, apiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { DartMark } from "../src/components/brand/DartLogo";
import { ApiBanner } from "../src/components/ui/ApiBanner";
import { BackButton } from "../src/components/ui/BackButton";
import { Button } from "../src/components/ui/Button";
import { colors, fonts } from "../src/theme";

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { registerFamily } = useAuth();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [districtName, setDistrictName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);

  async function lookup() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Enter the district join code from your transportation office.");
      return;
    }
    setLooking(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/lookup-district/", { join_code: code });
      setDistrictName(data.name);
      setJoinCode(code);
    } catch (err) {
      setDistrictName(null);
      setError(apiError(err, "No district matches that join code."));
    } finally {
      setLooking(false);
    }
  }

  async function submit() {
    if (!first.trim() || !last.trim() || !email.trim() || password.length < 8) {
      setError("Fill in your name, email, and a password of at least 8 characters.");
      return;
    }
    if (!joinCode.trim()) {
      setError("Enter the district join code first — that is not the same as a rider code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerFamily({
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim(),
        password,
        join_code: joinCode.trim().toUpperCase(),
      });
      router.replace("/(guardian)/link");
    } catch (err) {
      setError(apiError(err, "Could not create the account."));
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
        <Text style={{ fontFamily: fonts.heading, fontSize: 28, letterSpacing: -0.8, lineHeight: 32, marginTop: 24, color: colors.ink }}>
          Join your district
        </Text>
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 24, color: colors.muted }}>
          Use the district join code (six characters from the office, like PBLFSN). After you create the account you
          will enter each child's rider code (like AVA001).
        </Text>

        <View style={{ marginTop: 26, gap: 14 }}>
          <Field label="District join code">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                value={joinCode}
                onChangeText={(t) => {
                  setJoinCode(t);
                  setDistrictName(null);
                  setError(null);
                }}
                placeholder="PBLFSN"
                placeholderTextColor={colors.faint}
                style={[input, { flex: 1 }]}
                accessibilityLabel="District join code"
              />
              <Button label={looking ? "…" : "Check"} variant="secondary" onPress={() => void lookup()} style={{ minWidth: 88 }} />
            </View>
          </Field>
          {districtName ? (
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>Joining {districtName}</Text>
          ) : null}
          <Field label="First name">
            <TextInput value={first} onChangeText={setFirst} style={input} placeholder="Jordan" placeholderTextColor={colors.faint} />
          </Field>
          <Field label="Last name">
            <TextInput value={last} onChangeText={setLast} style={input} placeholder="Lee" placeholderTextColor={colors.faint} />
          </Field>
          <Field label="Email">
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={input}
              placeholder="you@email.com"
              placeholderTextColor={colors.faint}
            />
          </Field>
          <Field label="Password">
            <TextInput secureTextEntry value={password} onChangeText={setPassword} style={input} placeholder="At least 8 characters" placeholderTextColor={colors.faint} />
          </Field>
          {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
          <Button label={busy ? "Creating…" : "Create family account"} loading={busy} onPress={() => void submit()} />
          <Pressable onPress={() => router.replace("/login")} style={{ minHeight: 40, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>Already have an account? Sign in</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: "auto", paddingTop: 24 }}>
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
