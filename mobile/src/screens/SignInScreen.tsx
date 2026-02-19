import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import { StatePanel } from "../components/StatePanel";
import { tokens } from "../theme/tokens";

type SignInScreenProps = {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
  onBack: () => void;
  onOpenSignUp: () => void;
};

export function SignInScreen({
  isSubmitting,
  error,
  onSubmit,
  onBack,
  onOpenSignUp,
}: SignInScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) return;
    await onSubmit(email, password);
  }

  return (
    <LinearGradient colors={[tokens.color.pageTop, tokens.color.pageBottom]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Use your subscriber account to access recipes.</Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={tokens.color.mutedInk}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={tokens.color.mutedInk}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />

            <Pressable
              style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
              disabled={isSubmitting}
              onPress={handleSubmit}
            >
              <Text style={styles.primaryButtonText}>{isSubmitting ? "Signing in..." : "Sign in"}</Text>
            </Pressable>

            <View style={styles.inlineActions}>
              <Pressable onPress={onOpenSignUp} disabled={isSubmitting}>
                <Text style={styles.inlineActionText}>Need an account? Sign up</Text>
              </Pressable>
              <Pressable onPress={onBack} disabled={isSubmitting}>
                <Text style={styles.inlineActionText}>Back</Text>
              </Pressable>
            </View>
          </View>

          {error ? <StatePanel title="Sign in failed" message={error} tone="warning" /> : null}
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
  buttonDisabled: {
    opacity: 0.6,
  },
  inlineActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  inlineActionText: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: "700",
  },
});
