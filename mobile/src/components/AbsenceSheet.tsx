import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { colors, fonts } from "../theme";
import { Button } from "./ui/Button";

type Scope = "am" | "all";

export function AbsenceSheet({
  visible,
  rider,
  stop,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  rider: string;
  stop?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (vars: { note: string; scope: Scope }) => void;
}) {
  const [scope, setScope] = useState<Scope>("am");
  const [note, setNote] = useState("");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(17,24,39,.34)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: 34,
          }}
        >
          <View style={{ width: 44, height: 4, borderRadius: 99, backgroundColor: colors.border, alignSelf: "center" }} />
          <Text style={{ fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.4, marginTop: 18, color: colors.ink }}>
            {rider} is not riding today
          </Text>
          <Text style={{ marginTop: 9, fontSize: 14, lineHeight: 22, color: colors.muted }}>
            The driver and dispatch will see this{stop ? ` before the bus reaches ${stop}` : ""}.
          </Text>

          <Option
            selected={scope === "am"}
            title="Morning pickup only"
            subtitle="Still riding home this afternoon"
            onPress={() => setScope("am")}
          />
          <Option
            selected={scope === "all"}
            title="All day (note to dispatch)"
            subtitle="This product is morning-only. We'll tell dispatch they are out for the day."
            onPress={() => setScope("all")}
          />

          <TextInput
            placeholder="Note for the office (optional)"
            placeholderTextColor={colors.faint}
            value={note}
            onChangeText={setNote}
            style={{
              marginTop: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.field,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 13,
              fontSize: 14.5,
              color: colors.ink,
              minHeight: 46,
            }}
          />
          <View style={{ marginTop: 18, gap: 10 }}>
            <Button label="Confirm absence" loading={busy} onPress={() => onConfirm({ note, scope })} />
            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({
  selected,
  title,
  subtitle,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 15,
        shadowColor: selected ? colors.primary : "transparent",
        shadowOpacity: selected ? 0.12 : 0,
        shadowRadius: 6,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 99,
          borderWidth: 2,
          borderColor: selected ? colors.primary : colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.ink }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.muted }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}
