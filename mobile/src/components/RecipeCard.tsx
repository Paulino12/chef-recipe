import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatPortions, formatWeight } from "../lib/formatters";
import { tokens } from "../theme/tokens";
import { RecipeListItem } from "../types/recipe";

type RecipeCardProps = {
  recipe: RecipeListItem;
  onPress: (recipeId: string) => void;
};

export function RecipeCard({ recipe, onPress }: RecipeCardProps) {
  return (
    <Pressable style={styles.card} onPress={() => onPress(recipe.id)}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PLU {recipe.pluNumber}</Text>
        </View>
      </View>

      <Text style={styles.category} numberOfLines={1}>
        {recipe.categoryPath.join(" / ") || "Uncategorized"}
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{formatPortions(recipe.portions)}</Text>
        <Text style={styles.metaLabel}>Weight: {formatWeight(recipe.portionNetWeightG)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.card,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    shadowColor: tokens.color.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    alignItems: "flex-start",
  },
  title: {
    flex: 1,
    color: tokens.color.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  badge: {
    backgroundColor: tokens.color.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  category: {
    color: tokens.color.mutedInk,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: tokens.spacing.md,
  },
  metaLabel: {
    color: tokens.color.ink,
    fontSize: 13,
    fontWeight: "600",
  },
});
