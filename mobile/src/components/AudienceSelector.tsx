import { Pressable, StyleSheet, Text, View } from "react-native";
import { Audience } from "../types/recipe";
import { tokens } from "../theme/tokens";

type AudienceSelectorProps = {
  value: Audience;
  onChange: (next: Audience) => void;
};

const options: Array<{ label: string; value: Audience }> = [
  { label: "Public", value: "public" },
  { label: "Enterprise", value: "enterprise" },
];

export function AudienceSelector({ value, onChange }: AudienceSelectorProps) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.item, isSelected && styles.itemSelected]}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: tokens.color.cardSoft,
    borderRadius: tokens.radius.md,
    padding: 4,
    gap: 6,
  },
  item: {
    flex: 1,
    borderRadius: tokens.radius.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  itemSelected: {
    backgroundColor: tokens.color.accent,
  },
  label: {
    color: tokens.color.mutedInk,
    fontSize: 14,
    fontWeight: "600",
  },
  labelSelected: {
    color: "#FFFFFF",
  },
});
