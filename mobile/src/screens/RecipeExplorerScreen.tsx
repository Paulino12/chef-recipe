import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
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
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useRecipeDetail } from "../hooks/useRecipeDetail";
import { useRecipes } from "../hooks/useRecipes";
import { tokens } from "../theme/tokens";
import { AccessSession } from "../types/access";
import { Audience } from "../types/recipe";

type RecipeExplorerScreenProps = {
  session: AccessSession;
  accessToken: string;
  isRefreshingAccess: boolean;
  authError: string | null;
  onRefreshAccess: () => Promise<void>;
  onOpenProfile: () => void;
  onSignOut: () => void;
};

/**
 * Authenticated recipes experience driven by backend access entitlements.
 */
export function RecipeExplorerScreen({
  session,
  accessToken,
  isRefreshingAccess,
  authError,
  onRefreshAccess,
  onOpenProfile,
  onSignOut,
}: RecipeExplorerScreenProps) {
  const [audience, setAudience] = useState<Audience>("public");
  const [search, setSearch] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const availableAudiences = useMemo<Audience[]>(() => {
    const entries: Audience[] = [];
    if (session.entitlements.can_view_public) entries.push("public");
    if (session.entitlements.can_view_enterprise) entries.push("enterprise");
    return entries;
  }, [session]);

  const hasRecipeAccess = availableAudiences.length > 0;
  const firstAvailableAudience: Audience = availableAudiences[0] ?? "public";

  useEffect(() => {
    if (!hasRecipeAccess) {
      setSelectedRecipeId(null);
      return;
    }

    if (!availableAudiences.includes(audience)) {
      setAudience(firstAvailableAudience);
    }
  }, [audience, availableAudiences, hasRecipeAccess, firstAvailableAudience]);

  const effectiveAudience: Audience = hasRecipeAccess
    ? availableAudiences.includes(audience)
      ? audience
      : firstAvailableAudience
    : "public";

  const recipesState = useRecipes(effectiveAudience, debouncedSearch, accessToken, hasRecipeAccess);
  const detailState = useRecipeDetail(selectedRecipeId, effectiveAudience, accessToken, hasRecipeAccess);

  const subscriptionMessage = useMemo(() => {
    const status = session.entitlements.subscription_status ?? "none";

    if (status === "trialing") {
      return "Your trial is active. Public recipes are enabled.";
    }

    if (status === "active") {
      return "Your subscription is active. Public recipes are enabled.";
    }

    if (session.entitlements.can_view_enterprise) {
      return "Public subscription is inactive, but enterprise access is granted by the owner.";
    }

    return "Public subscription is inactive. Subscribe to unlock public recipes.";
  }, [session]);

  return (
    <LinearGradient colors={[tokens.color.pageTop, tokens.color.pageBottom]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipes</Text>
          <Text style={styles.subtitle}>Subscription-aware feed using your account entitlements.</Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>
              {session.user.display_name?.trim() || session.user.email}
            </Text>
            <Text style={styles.accountMeta}>
              Role: {session.user.role} | Subscription: {session.entitlements.subscription_status ?? "none"}
            </Text>
            <Text style={styles.accountMeta}>Email: {session.user.email}</Text>
            <Text style={styles.accountMeta}>{subscriptionMessage}</Text>
            <View style={styles.accountActions}>
              <Pressable
                style={[styles.smallButton, isRefreshingAccess && styles.buttonDisabled]}
                disabled={isRefreshingAccess}
                onPress={onRefreshAccess}
              >
                <Text style={styles.smallButtonText}>
                  {isRefreshingAccess ? "Refreshing..." : "Refresh access"}
                </Text>
              </Pressable>
              <Pressable style={[styles.smallButton, styles.smallButtonOutline]} onPress={onOpenProfile}>
                <Text style={[styles.smallButtonText, styles.smallButtonOutlineText]}>Profile</Text>
              </Pressable>
              <Pressable style={[styles.smallButton, styles.smallButtonOutline]} onPress={onSignOut}>
                <Text style={[styles.smallButtonText, styles.smallButtonOutlineText]}>Sign out</Text>
              </Pressable>
            </View>
          </View>

          {hasRecipeAccess ? (
            <>
              {availableAudiences.length > 1 ? (
                <AudienceSelector value={audience} onChange={setAudience} />
              ) : (
                <View style={styles.singleAudiencePill}>
                  <Text style={styles.singleAudienceLabel}>
                    Audience: {availableAudiences[0] === "public" ? "Public" : "Enterprise"}
                  </Text>
                </View>
              )}

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search recipes..."
                placeholderTextColor={tokens.color.mutedInk}
                autoCapitalize="none"
                style={styles.searchInput}
              />
            </>
          ) : null}
        </View>

        {authError ? (
          <View style={styles.mainContent}>
            <StatePanel title="Access refresh failed" message={authError} tone="warning" />
          </View>
        ) : null}

        {!hasRecipeAccess ? (
          <View style={styles.mainContent}>
            <StatePanel
              title="Subscription required"
              message="No recipe audience is available for this account yet. Once subscription/entitlements are updated, tap Refresh access."
              actionLabel="Refresh access"
              onAction={onRefreshAccess}
              tone="warning"
            />
          </View>
        ) : null}

        {hasRecipeAccess && recipesState.error ? (
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

        {hasRecipeAccess && !recipesState.error && !recipesState.isLoading && recipesState.data.length === 0 ? (
          <View style={styles.mainContent}>
            <StatePanel
              title="No recipes available"
              message="No recipes match this audience/search combination yet."
            />
          </View>
        ) : null}

        {hasRecipeAccess && !recipesState.error && (recipesState.isLoading || recipesState.data.length > 0) ? (
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
  mainContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  accountCard: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  accountTitle: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  accountMeta: {
    color: tokens.color.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  accountActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.xs,
    paddingTop: 4,
  },
  smallButton: {
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  smallButtonOutline: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
  },
  smallButtonOutlineText: {
    color: tokens.color.ink,
  },
  singleAudiencePill: {
    alignSelf: "flex-start",
    backgroundColor: tokens.color.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  singleAudienceLabel: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: "700",
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
  listContent: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    paddingBottom: 34,
  },
});
