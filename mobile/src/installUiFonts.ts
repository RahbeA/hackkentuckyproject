import { Text, TextInput } from "react-native";
import { uiFont } from "./theme";

/** Pin default text to a system face so Space Grotesk cannot eat spaces. */
export function installUiFonts() {
  const style = { ...uiFont };
  const T = Text as typeof Text & { defaultProps?: { style?: object } };
  T.defaultProps = { ...T.defaultProps, style: { ...(T.defaultProps?.style as object), ...style } };
  const I = TextInput as typeof TextInput & { defaultProps?: { style?: object } };
  I.defaultProps = { ...I.defaultProps, style: { ...(I.defaultProps?.style as object), ...style } };
}
