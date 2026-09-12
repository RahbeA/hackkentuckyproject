import { Text } from "react-native";
import { apiHostLabel, DEMO_MODE } from "../../config";
import { colors, uiFont } from "../../theme";

export function ApiBanner() {
  if (!DEMO_MODE) return null;
  return (
    <Text style={{ ...uiFont, textAlign: "center", fontSize: 11, fontWeight: "600", color: colors.faint }}>
      {apiHostLabel()}
    </Text>
  );
}
