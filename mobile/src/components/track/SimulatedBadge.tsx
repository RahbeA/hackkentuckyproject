import { Text, View } from "react-native";
import { uiFont } from "../../theme";

export function SimulatedBadge() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 14,
        right: 18,
        backgroundColor: "rgba(11,17,32,.82)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.14)",
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text
        style={{
          ...uiFont,
          fontSize: 10,
          fontWeight: "700",
          color: "rgba(255,255,255,.62)",
        }}
      >
        Simulated GPS
      </Text>
    </View>
  );
}
