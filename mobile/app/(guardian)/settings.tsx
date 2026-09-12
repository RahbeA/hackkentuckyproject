import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useChildren, useNotificationPrefs, useUpdatePrefs } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/AuthProvider";
import { Avatar } from "../../src/components/ui/Avatar";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { Toggle } from "../../src/components/ui/Toggle";
import { childName, initials } from "../../src/format";
import { getPermission, requestPermission } from "../../src/notifications/push";
import { colors } from "../../src/theme";

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: children } = useChildren();
  const { data: saved, isFetched } = useNotificationPrefs();
  const prefs = useUpdatePrefs();
  const [eta, setEta] = useState(true);
  const [delay, setDelay] = useState(true);
  const [school, setSchool] = useState(false);
  const [perm, setPerm] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [ready, setReady] = useState(false);
  const skipNextSave = useRef(true);
  const self = children?.length === 1 && user?.first_name === children[0].first_name;

  useEffect(() => {
    void getPermission().then(setPerm);
  }, []);

  useEffect(() => {
    if (!isFetched) return;
    if (saved) {
      setEta(saved.eta);
      setDelay(saved.delay);
      setSchool(saved.school);
    }
    skipNextSave.current = true;
    setReady(true);
  }, [saved, isFetched]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    prefs.mutate({ eta, delay, school });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eta, delay, school, ready]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 36 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            padding: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Avatar label={initials(user?.full_name || user?.email || "?")} size={46} dark />
          <View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{user?.full_name || user?.email}</Text>
            <Text style={{ marginTop: 3, fontSize: 13, color: colors.muted }}>
              {self ? "Student" : "Guardian"} · {user?.district_name || "Jefferson Demo Schools"}
            </Text>
          </View>
        </View>

        <Label>Your riders</Label>
        <Card>
          {(children || []).map((c, i) => (
            <Row
              key={c.id}
              first={i === 0}
              onPress={() => router.push(`/(guardian)/rider/${c.id}`)}
              left={<Avatar label={initials(c.first_name)} size={34} />}
              title={childName(c)}
              subtitle={`Grade ${c.grade ?? "—"} · ${c.school_name || "School"}`}
              chevron
            />
          ))}
          <Row
            first={!children?.length}
            onPress={() => router.push("/(guardian)/link")}
            title="Link a rider"
            subtitle="Enter a district rider code"
            chevron
          />
        </Card>

        <Label>Notifications</Label>
        <Card>
          {perm !== "granted" ? (
            <Row
              first
              title="Allow lock-screen alerts"
              subtitle="DART uses the app icon and a blue channel. Only your riders."
              onPress={async () => {
                const ok = await requestPermission();
                setPerm(ok ? "granted" : "denied");
              }}
              chevron
            />
          ) : null}
          <Pref first={perm === "granted"} title="Arrival estimates" subtitle="A reminder shortly before the bus reaches your stop." value={eta} onChange={setEta} />
          <Pref title="Delay notices" subtitle="Sent only when a route your rider is on changes." value={delay} onChange={setDelay} />
          <Pref title="School announcements" subtitle="Transportation notices from your rider's school." value={school} onChange={setSchool} />
        </Card>

        <Label>Home screen</Label>
        <Card>
          <Row
            first
            title="Widgets"
            subtitle="Home-screen widgets and the Uber-style lock-screen Live Activity."
            chevron
            onPress={() => router.push("/(guardian)/widgets")}
          />
        </Card>

        <View style={{ marginTop: 24 }}>
          <Card>
            <Row title="Privacy" chevron onPress={() => router.push("/(guardian)/privacy")} />
            <Row title="Contact the transportation office" chevron onPress={() => router.push("/(guardian)/message")} />
            <Row
              title="Sign out"
              danger
              onPress={async () => {
                await signOut();
                router.replace("/welcome");
              }}
            />
          </Card>
        </View>

        <Text style={{ marginTop: 20, fontSize: 11.5, lineHeight: 18, color: colors.faint }}>
          Product demo. Riders, schools, and arrival times shown here are fictional.
        </Text>
      </ScrollView>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text style={{ marginTop: 24, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.faint }}>
      {children}
    </Text>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </View>
  );
}

function Row({
  title,
  subtitle,
  left,
  chevron,
  danger,
  first = false,
  onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
  first?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingHorizontal: 18,
        paddingVertical: 15,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.hairline,
      }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: danger ? colors.danger : colors.ink }}>{title}</Text>
        {subtitle ? <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.muted }}>{subtitle}</Text> : null}
      </View>
      {chevron ? (
        <View style={{ width: 7, height: 7, borderTopWidth: 1.6, borderRightWidth: 1.6, borderColor: "#CBD5E1", transform: [{ rotate: "45deg" }] }} />
      ) : null}
    </Pressable>
  );
}

function Pref({
  title,
  subtitle,
  value,
  onChange,
  first,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.hairline }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.ink }}>{title}</Text>
        <Text style={{ marginTop: 3, fontSize: 12.5, lineHeight: 19, color: colors.muted }}>{subtitle}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}
