import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import { StatePanel } from "../components/StatePanel";
import { fetchProfile, sendPasswordResetEmail, updateProfileDisplayName } from "../services/profileApi";
import {
  isRevenueCatReady,
  purchasePublicSubscription,
  restorePublicSubscription,
} from "../services/revenueCat";
import { tokens } from "../theme/tokens";
import { AccessSession } from "../types/access";

type ProfileScreenProps = {
  session: AccessSession;
  accessToken: string;
  onBack: () => void;
  onSignOut: () => void;
  onRefreshAccess: () => Promise<void>;
};

/**
 * Subscriber-facing profile settings.
 * Keeps identity data simple: display name + email + password reset.
 */
export function ProfileScreen({
  session,
  accessToken,
  onBack,
  onSignOut,
  onRefreshAccess,
}: ProfileScreenProps) {
  const [displayName, setDisplayName] = useState(session.user.display_name ?? "");
  const [savedDisplayName, setSavedDisplayName] = useState(session.user.display_name ?? "");
  const [email, setEmail] = useState(session.user.email);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [billingActionBusy, setBillingActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingProfile(true);
    setError(null);

    fetchProfile(accessToken)
      .then((profile) => {
        if (!active) return;
        const nextDisplayName = profile.user.display_name ?? "";
        setDisplayName(nextDisplayName);
        setSavedDisplayName(nextDisplayName);
        setEmail(profile.user.email);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load profile.";
        setError(message);
      })
      .finally(() => {
        if (!active) return;
        setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  const normalizedDisplayName = useMemo(() => {
    const trimmed = displayName.trim();
    return trimmed ? trimmed : null;
  }, [displayName]);

  const normalizedSavedDisplayName = useMemo(() => {
    const trimmed = savedDisplayName.trim();
    return trimmed ? trimmed : null;
  }, [savedDisplayName]);

  const canSave = !saving && normalizedDisplayName !== normalizedSavedDisplayName;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setError(null);
    setInfo(null);
    setSaving(true);

    try {
      const result = await updateProfileDisplayName(accessToken, normalizedDisplayName);
      const nextDisplayName = result.user.display_name ?? "";
      setDisplayName(nextDisplayName);
      setSavedDisplayName(nextDisplayName);
      await onRefreshAccess();
      setInfo("Profile updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [accessToken, canSave, normalizedDisplayName, onRefreshAccess]);

  const handleResetPassword = useCallback(async () => {
    setError(null);
    setInfo(null);
    setSendingReset(true);

    try {
      const result = await sendPasswordResetEmail(accessToken);
      setInfo(result.message || "Password reset email sent.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send password reset email.";
      setError(message);
    } finally {
      setSendingReset(false);
    }
  }, [accessToken]);

  const handleSubscribe = useCallback(async () => {
    setError(null);
    setInfo(null);
    setBillingActionBusy(true);
    try {
      const result = await purchasePublicSubscription(session.user.id);
      setInfo(`${result.message} Refreshing access...`);
      await onRefreshAccess();
    } catch (err) {
      const maybeCanceled = err as { userCancelled?: boolean; message?: string };
      if (maybeCanceled?.userCancelled) {
        setInfo("Purchase canceled.");
      } else {
        const message = err instanceof Error ? err.message : "Purchase failed.";
        setError(message);
      }
    } finally {
      setBillingActionBusy(false);
    }
  }, [onRefreshAccess, session.user.id]);

  const handleRestore = useCallback(async () => {
    setError(null);
    setInfo(null);
    setBillingActionBusy(true);
    try {
      const result = await restorePublicSubscription(session.user.id);
      setInfo(`${result.message} Refreshing access...`);
      await onRefreshAccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restore failed.";
      setError(message);
    } finally {
      setBillingActionBusy(false);
    }
  }, [onRefreshAccess, session.user.id]);

  return (
    <LinearGradient colors={[tokens.color.pageTop, tokens.color.pageBottom]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>
              Update how your name appears in the app. Email remains your sign-in identity.
            </Text>
            <Text style={styles.subscriptionMeta}>
              Subscription status: {session.entitlements.subscription_status ?? "none"}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How your name should appear"
                placeholderTextColor={tokens.color.mutedInk}
                autoCapitalize="words"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.readOnlyInput}>
                <Text style={styles.readOnlyText}>{email}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryButton, (!canSave || loadingProfile) && styles.buttonDisabled]}
                disabled={!canSave || loadingProfile}
                onPress={handleSave}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? "Saving..." : "Save display name"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, sendingReset && styles.buttonDisabled]}
                disabled={sendingReset}
                onPress={handleResetPassword}
              >
                <Text style={styles.secondaryButtonText}>
                  {sendingReset ? "Sending..." : "Send password reset email"}
                </Text>
              </Pressable>

              {isRevenueCatReady() ? (
                <>
                  <Pressable
                    style={[styles.secondaryButton, billingActionBusy && styles.buttonDisabled]}
                    disabled={billingActionBusy}
                    onPress={handleSubscribe}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {billingActionBusy ? "Processing..." : "Start subscription"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.secondaryButton, billingActionBusy && styles.buttonDisabled]}
                    disabled={billingActionBusy}
                    onPress={handleRestore}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {billingActionBusy ? "Processing..." : "Restore purchases"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <StatePanel
                  title="Billing not configured"
                  message="Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY and EXPO_PUBLIC_REVENUECAT_PUBLIC_ENTITLEMENT_ID in mobile/.env."
                  tone="warning"
                />
              )}

              <View style={styles.footerActions}>
                <Pressable onPress={onBack}>
                  <Text style={styles.inlineActionText}>Back to recipes</Text>
                </Pressable>
                <Pressable onPress={onSignOut}>
                  <Text style={styles.inlineActionText}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {error ? <StatePanel title="Profile action failed" message={error} tone="warning" /> : null}
          {info ? <StatePanel title="Done" message={info} /> : null}
        </View>
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
  container: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
    justifyContent: "center",
    gap: tokens.spacing.md,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  title: {
    color: tokens.color.ink,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: tokens.color.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
  subscriptionMeta: {
    color: tokens.color.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  field: {
    gap: 6,
  },
  label: {
    color: tokens.color.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    color: tokens.color.ink,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  readOnlyInput: {
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
  },
  readOnlyText: {
    color: tokens.color.mutedInk,
    fontSize: 15,
  },
  actions: {
    gap: tokens.spacing.xs,
    paddingTop: 6,
  },
  primaryButton: {
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  inlineActionText: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: "700",
  },
});
