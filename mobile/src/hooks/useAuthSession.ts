import { useCallback, useState } from "react";

import { fetchAccessSession } from "../services/accessApi";
import { signInWithPassword, signUpWithPassword } from "../services/authApi";
import { configureRevenueCatUser, isRevenueCatReady } from "../services/revenueCat";
import { AccessSession } from "../types/access";

type UseAuthSessionState = {
  accessToken: string | null;
  session: AccessSession | null;
  isSubmitting: boolean;
  isRefreshingAccess: boolean;
  error: string | null;
  info: string | null;
  clearFeedback: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshAccess: () => Promise<void>;
};

export function useAuthSession(): UseAuthSessionState {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [session, setSession] = useState<AccessSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingAccess, setIsRefreshingAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadAccess = useCallback(async (token: string) => {
    setIsRefreshingAccess(true);
    try {
      const access = await fetchAccessSession(token);
      setSession(access);
      return access;
    } finally {
      setIsRefreshingAccess(false);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setInfo(null);
      setIsSubmitting(true);
      try {
        const token = await signInWithPassword(email, password);
        setAccessToken(token);
        const access = await loadAccess(token);
        if (isRevenueCatReady()) {
          try {
            await configureRevenueCatUser(access.user.id);
          } catch (billingErr) {
            const message =
              billingErr instanceof Error ? billingErr.message : "Billing configuration failed.";
            setInfo(`Signed in. Billing is currently unavailable: ${message}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign in failed.";
        setError(message);
        setAccessToken(null);
        setSession(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [loadAccess],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setInfo(null);
      setIsSubmitting(true);
      try {
        const result = await signUpWithPassword(email, password);
        if (!result.accessToken) {
          setInfo("Account created. Check your email to confirm the account, then sign in.");
          return;
        }

        setAccessToken(result.accessToken);
        const access = await loadAccess(result.accessToken);
        if (isRevenueCatReady()) {
          try {
            await configureRevenueCatUser(access.user.id);
          } catch (billingErr) {
            const message =
              billingErr instanceof Error ? billingErr.message : "Billing configuration failed.";
            setInfo(`Account created. Billing is currently unavailable: ${message}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign up failed.";
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [loadAccess],
  );

  const signOut = useCallback(() => {
    setAccessToken(null);
    setSession(null);
    setError(null);
    setInfo(null);
  }, []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setInfo(null);
  }, []);

  const refreshAccess = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    setInfo(null);
    try {
      await loadAccess(accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to refresh access.";
      setError(message);
    }
  }, [accessToken, loadAccess]);

  return {
    accessToken,
    session,
    isSubmitting,
    isRefreshingAccess,
    error,
    info,
    clearFeedback,
    signIn,
    signUp,
    signOut,
    refreshAccess,
  };
}
