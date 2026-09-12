import { ActivityIndicator, Pressable, Text, type PressableProps, type ViewStyle } from "react-native";
import { colors, uiFont } from "../../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  variant = "primary",
  loading,
  style,
  ...props
}: PressableProps & { label: string; variant?: Variant; loading?: boolean; style?: ViewStyle }) {
  const palette = {
    primary: { bg: colors.primary, border: colors.primary, fg: colors.white },
    secondary: { bg: colors.surface, border: colors.border, fg: colors.ink },
    ghost: { bg: "transparent", border: "transparent", fg: colors.primary },
    danger: { bg: colors.surface, border: colors.border, fg: colors.danger },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading || props.disabled}
      style={({ pressed }) => [
        {
          minHeight: 52,
          borderRadius: 10,
          paddingVertical: 15,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed && variant === "primary" ? colors.primaryHover : palette.bg,
          borderWidth: variant === "ghost" ? 0 : 1,
          borderColor: palette.border,
          opacity: props.disabled ? 0.5 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={{ ...uiFont, color: palette.fg, fontSize: variant === "primary" ? 16 : 15, fontWeight: "600" }}>{label}</Text>
      )}
    </Pressable>
  );
}
