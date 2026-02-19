import { LinearGradient } from "expo-linear-gradient";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { tokens } from "../theme/tokens";

type HeroScreenProps = {
  isSignedIn: boolean;
  onSignInPress: () => void;
  onSignUpPress: () => void;
  onContinuePress: () => void;
};

/**
 * Public app landing screen for new and returning subscribers.
 */
export function HeroScreen({
  isSignedIn,
  onSignInPress,
  onSignUpPress,
  onContinuePress,
}: HeroScreenProps) {
  return (
    <LinearGradient colors={[tokens.color.pageTop, tokens.color.pageBottom]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.heroCard}>
            <Text style={styles.badge}>Recipe Platform</Text>
            <Text style={styles.title}>Subscriber recipes with owner-managed access.</Text>
            <Text style={styles.subtitle}>
              Sign up to start with public recipes. Owner-granted enterprise access appears automatically in your
              account.
            </Text>

            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Public Access</Text>
                <Text style={styles.featureText}>Trial and active subscribers can browse public recipes.</Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Enterprise Access</Text>
                <Text style={styles.featureText}>Owner can grant enterprise access per subscriber.</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.primaryButton} onPress={onSignUpPress}>
                <Text style={styles.primaryButtonText}>Create account</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={onSignInPress}>
                <Text style={styles.secondaryButtonText}>Sign in</Text>
              </Pressable>
              {isSignedIn ? (
                <Pressable style={styles.inlineButton} onPress={onContinuePress}>
                  <Text style={styles.inlineButtonText}>Continue to recipes</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
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
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  badge: {
    alignSelf: "flex-start",
    color: tokens.color.accent,
    backgroundColor: tokens.color.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  title: {
    color: tokens.color.ink,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: tokens.color.mutedInk,
    fontSize: 15,
    lineHeight: 22,
  },
  featureGrid: {
    gap: tokens.spacing.sm,
  },
  featureCard: {
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  featureTitle: {
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  featureText: {
    color: tokens.color.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: tokens.spacing.xs,
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
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 999,
    borderColor: tokens.color.border,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  inlineButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  inlineButtonText: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: "700",
  },
});
