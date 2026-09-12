import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { apiError } from "../../src/api/client";
import { useChildren, useClaimRider } from "../../src/api/hooks";
import { Avatar } from "../../src/components/ui/Avatar";
import { Button } from "../../src/components/ui/Button";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { childName, initials } from "../../src/format";
import { DEMO_MODE } from "../../src/config";
import { colors, fonts } from "../../src/theme";

export default function LinkRider() {
  const { data: children } = useChildren();
  const claim = useClaimRider();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const chars = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).split("");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader back title="Link a rider" />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 36 }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 24, letterSpacing: -0.5, color: colors.ink }}>
          Enter the code from your district
        </Text>
        <Text style={{ marginTop: 9, fontSize: 14, lineHeight: 22, color: colors.muted }}>
          Your transportation office issues one rider code per child (AVA001), not the district join code. Linking a
          rider does not change their route.
        </Text>

        <View style={{ marginTop: 24, position: "relative" }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 58,
                  borderWidth: i === chars.length ? 1.5 : 1,
                  borderColor: i === chars.length ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: fonts.heading, fontSize: 22, color: chars[i] ? colors.ink : "#CBD5E1" }}>
                  {chars[i] || "–"}
                </Text>
              </View>
            ))}
          </View>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={(t) => {
              setCode(t);
              setError(null);
              setOk(null);
            }}
            accessibilityLabel="Rider code"
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: 0.02, color: colors.ink }}
          />
        </View>

        {error ? <Text style={{ marginTop: 12, color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
        {ok ? <Text style={{ marginTop: 12, color: colors.success, fontSize: 13 }}>{ok}</Text> : null}

        <Button
          label="Link rider"
          style={{ marginTop: 18 }}
          loading={claim.isPending}
          onPress={() =>
            claim.mutate(chars.join(""), {
              onSuccess: (res) => {
                const name = res.data?.student?.first_name || "Rider";
                setOk(res.data?.already_linked ? `${name} is already linked.` : `${name} is now linked.`);
                setCode("");
              },
              onError: (err) => setError(apiError(err, "That code is not valid.")),
            })
          }
        />

        <Text style={{ marginTop: 26, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.faint }}>
          Already linked
        </Text>
        <View
          style={{
            marginTop: 12,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {(children || []).map((c, i) => (
            <View
              key={c.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 13,
                paddingHorizontal: 18,
                paddingVertical: 15,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: colors.hairline,
              }}
            >
              <Avatar label={initials(c.first_name)} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: "600" }}>{childName(c)}</Text>
                <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.muted }}>{c.school_name}</Text>
              </View>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.success }}>Linked</Text>
            </View>
          ))}
          {!children?.length ? (
            <Text style={{ padding: 18, color: colors.muted, fontSize: 13 }}>No riders linked yet.</Text>
          ) : null}
        </View>

        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            gap: 11,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 20, color: colors.muted }}>
            Codes stay valid so another guardian can link the same rider. Demo codes look like AVA001 — the first three
            letters of the rider's name plus their student number. If a code does not work, contact the transportation
            office.
          </Text>
        </View>
        {DEMO_MODE ? (
          <Pressable onPress={() => setCode("MIA003")} style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Fill demo code MIA003</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
