import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatAllergenStatus, formatPortions, formatWeight, methodBlocksToSteps } from "../lib/formatters";
import { tokens } from "../theme/tokens";
import { RecipeDetail } from "../types/recipe";
import { SectionCard } from "./SectionCard";
import { StatePanel } from "./StatePanel";

type RecipeDetailModalProps = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  recipe: RecipeDetail | null;
  onClose: () => void;
};

function allergenTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "contains") return styles.allergenDanger;
  if (normalized === "may_contain") return styles.allergenWarning;
  return styles.allergenSafe;
}

export function RecipeDetailModal({
  visible,
  loading,
  error,
  recipe,
  onClose,
}: RecipeDetailModalProps) {
  const steps = methodBlocksToSteps(recipe?.method ?? []);
  const allergenEntries = Object.entries(recipe?.allergens ?? {});

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.page}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Recipe Detail</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <StatePanel title="Loading recipe..." message="Fetching full recipe information." />
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.stateWrap}>
            <StatePanel title="Unable to load recipe" message={error} tone="warning" />
          </View>
        ) : null}

        {!loading && !error && recipe ? (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>{recipe.title}</Text>
              <Text style={styles.heroSubtitle}>{recipe.categoryPath.join(" / ") || "Uncategorized"}</Text>
              <View style={styles.heroMetaRow}>
                <Text style={styles.heroMeta}>PLU {recipe.pluNumber}</Text>
                <Text style={styles.heroMeta}>{formatPortions(recipe.portions)}</Text>
                <Text style={styles.heroMeta}>Weight {formatWeight(recipe.nutrition.portionNetWeightG)}</Text>
              </View>
            </View>

            <SectionCard title="Ingredients">
              {recipe.ingredients.length === 0 ? (
                <Text style={styles.bodyText}>No ingredients listed.</Text>
              ) : (
                recipe.ingredients.map((ingredient, index) => (
                  <Text key={`${ingredient.text}-${index}`} style={styles.bodyText}>
                    {ingredient.text ||
                      `${ingredient.qty ?? ""} ${ingredient.unit ?? ""} ${ingredient.item ?? ""}`.trim()}
                  </Text>
                ))
              )}
            </SectionCard>

            <SectionCard title="Method">
              {steps.length === 0 ? (
                <Text style={styles.bodyText}>No method steps listed.</Text>
              ) : (
                steps.map((step, index) => (
                  <Text key={`${index}-${step}`} style={styles.bodyText}>
                    {step}
                  </Text>
                ))
              )}
            </SectionCard>

            <SectionCard title="Allergens">
              {allergenEntries.length === 0 ? (
                <Text style={styles.bodyText}>No allergen information listed.</Text>
              ) : (
                <View style={styles.allergenWrap}>
                  {allergenEntries.map(([name, value]) => (
                    <View key={name} style={[styles.allergenChip, allergenTone(value)]}>
                      <Text style={styles.allergenLabel}>{name}</Text>
                      <Text style={styles.allergenValue}>{formatAllergenStatus(value)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>

            <SectionCard title="Audience Visibility">
              <Text style={styles.bodyText}>Public: {recipe.visibility.public ? "Yes" : "No"}</Text>
              <Text style={styles.bodyText}>Enterprise: {recipe.visibility.enterprise ? "Yes" : "No"}</Text>
            </SectionCard>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 58,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: "#FFFFFF",
  },
  topBarTitle: {
    color: tokens.color.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  stateWrap: {
    padding: tokens.spacing.lg,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
  hero: {
    backgroundColor: tokens.color.cardSoft,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "#F5DDB4",
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  heroTitle: {
    color: tokens.color.ink,
    fontSize: 24,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: tokens.color.mutedInk,
    fontSize: 14,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.xs,
  },
  heroMeta: {
    color: "#155E75",
    backgroundColor: "#ECFEFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#A5F3FC",
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "700",
  },
  bodyText: {
    color: tokens.color.ink,
    fontSize: 14,
    lineHeight: 22,
  },
  allergenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.xs,
  },
  allergenChip: {
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 9,
    minWidth: 116,
  },
  allergenLabel: {
    color: tokens.color.ink,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  allergenValue: {
    color: tokens.color.mutedInk,
    fontSize: 12,
    marginTop: 2,
  },
  allergenDanger: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  allergenWarning: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  allergenSafe: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
});
