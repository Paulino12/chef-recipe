import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

type StatePanelProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "warning";
};

export function StatePanel({
  title,
  message,
  actionLabel,
  onAction,
  tone = "neutral",
}: StatePanelProps) {
  const warning = tone === "warning";
  return (
    <View style={[styles.container, warning && styles.containerWarning]}>
      <Text style={[styles.title, warning && styles.titleWarning]}>{title}</Text>
      <Text style={[styles.message, warning && styles.messageWarning]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.actionButton} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  containerWarning: {
    backgroundColor: tokens.color.warningSoft,
    borderColor: "#FDBA74",
  },
  title: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  titleWarning: {
    color: tokens.color.warning,
  },
  message: {
    color: tokens.color.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
  messageWarning: {
    color: "#7C2D12",
  },
  actionButton: {
    alignSelf: "flex-start",
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
