import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AudienceSelector } from "../components/AudienceSelector";
import { RecipeCard } from "../components/RecipeCard";
import { RecipeDetailModal } from "../components/RecipeDetailModal";
import { StatePanel } from "../components/StatePanel";
import { env } from "../config/env";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useRecipeDetail } from "../hooks/useRecipeDetail";
import { useRecipes } from "../hooks/useRecipes";
import { tokens } from "../theme/tokens";
import { Audience } from "../types/recipe";

export function RecipeExplorerScreen() {
  const [audience, setAudience] = useState<Audience>("public");
  const [search, setSearch] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const recipesState = useRecipes(audience, debouncedSearch);
  const detailState = useRecipeDetail(selectedRecipeId, audience);

  const enterpriseWarning = useMemo(() => {
    if (audience !== "enterprise") return null;
    if (env.enterpriseApiKey) return null;
    return "Enterprise requests in the current web API require x-api-key. Set EXPO_PUBLIC_ENTERPRISE_API_KEY in mobile/.env.";
  }, [audience]);

  return (
    <LinearGradient colors={[tokens.color.pageTop, tokens.color.pageBottom]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipes</Text>
          <Text style={styles.subtitle}>
            Audience-aware feed from your owner dashboard visibility flags.
          </Text>
        </View>

        <View style={styles.controls}>
          <AudienceSelector value={audience} onChange={setAudience} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes..."
            placeholderTextColor={tokens.color.mutedInk}
            autoCapitalize="none"
            style={styles.searchInput}
          />
        </View>

        {enterpriseWarning ? (
          <View style={styles.warningWrap}>
            <StatePanel title="Enterprise key missing" message={enterpriseWarning} tone="warning" />
          </View>
        ) : null}

        {recipesState.error ? (
          <View style={styles.mainContent}>
            <StatePanel
              title="Unable to load recipes"
              message={recipesState.error}
              actionLabel="Try Again"
              onAction={recipesState.reload}
              tone="warning"
            />
          </View>
        ) : null}

        {!recipesState.error && !recipesState.isLoading && recipesState.data.length === 0 ? (
          <View style={styles.mainContent}>
            <StatePanel
              title="No recipes available"
              message="No recipes match this audience/search combination yet."
            />
          </View>
        ) : null}

        {!recipesState.error && (recipesState.isLoading || recipesState.data.length > 0) ? (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={recipesState.data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RecipeCard recipe={item} onPress={setSelectedRecipeId} />}
            refreshControl={
              <RefreshControl refreshing={recipesState.isLoading} onRefresh={recipesState.reload} />
            }
          />
        ) : null}

        <RecipeDetailModal
          visible={Boolean(selectedRecipeId)}
          loading={detailState.isLoading}
          error={detailState.error}
          recipe={detailState.data}
          onClose={() => setSelectedRecipeId(null)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  title: {
    color: tokens.color.ink,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: tokens.color.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
  controls: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    color: tokens.color.ink,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  warningWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
  },
  mainContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  listContent: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    paddingBottom: 34,
  },
});
