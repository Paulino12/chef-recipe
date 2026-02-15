import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

type SectionCardProps = PropsWithChildren<{
  title: string;
}>;

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.card,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  title: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  content: {
    gap: tokens.spacing.xs,
  },
});
