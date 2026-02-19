import Purchases, { LOG_LEVEL } from "react-native-purchases";

import { env } from "../config/env";

let configuredUserId: string | null = null;
let initialized = false;

function requireRevenueCatConfig() {
  if (!env.revenueCatIosApiKey) {
    throw new Error(
      "RevenueCat is not configured. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in mobile/.env.",
    );
  }
}

function inferAppStoreStatusFromCustomerInfo(customerInfo: {
  entitlements?: {
    active?: Record<string, unknown>;
    all?: Record<string, { periodType?: string | null } | undefined>;
  };
}) {
  const entitlementId = env.revenueCatPublicEntitlementId?.trim();
  if (!entitlementId) return "unknown";

  const activeEntitlements = customerInfo.entitlements?.active ?? {};
  const allEntitlements = customerInfo.entitlements?.all ?? {};
  const isActive = Boolean(activeEntitlements[entitlementId]);
  if (!isActive) return "inactive";

  const periodType = allEntitlements[entitlementId]?.periodType;
  if (periodType === "TRIAL" || periodType === "INTRO") return "trialing";
  return "active";
}

export function isRevenueCatReady() {
  return Boolean(env.revenueCatIosApiKey);
}

export async function configureRevenueCatUser(userId: string) {
  requireRevenueCatConfig();
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error("Missing user id for RevenueCat.");

  if (!initialized) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({
      apiKey: env.revenueCatIosApiKey,
      appUserID: normalizedUserId,
    });
    initialized = true;
    configuredUserId = normalizedUserId;
    return;
  }

  if (configuredUserId !== normalizedUserId) {
    await Purchases.logIn(normalizedUserId);
    configuredUserId = normalizedUserId;
  }
}

export async function purchasePublicSubscription(userId: string) {
  await configureRevenueCatUser(userId);
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current || current.availablePackages.length === 0) {
    throw new Error("No subscription package is currently available in RevenueCat offerings.");
  }

  const defaultPackage = current.availablePackages[0];
  if (!defaultPackage) {
    throw new Error("No subscription package is currently available in RevenueCat offerings.");
  }

  const purchase = await Purchases.purchasePackage(defaultPackage);
  const status = inferAppStoreStatusFromCustomerInfo(purchase.customerInfo);

  return {
    appStoreStatus: status,
    message:
      status === "inactive"
        ? "Purchase completed, but entitlement is not active yet."
        : "Purchase completed successfully.",
  };
}

export async function restorePublicSubscription(userId: string) {
  await configureRevenueCatUser(userId);
  const customerInfo = await Purchases.restorePurchases();
  const status = inferAppStoreStatusFromCustomerInfo(customerInfo);

  return {
    appStoreStatus: status,
    message:
      status === "inactive"
        ? "No active subscription was found to restore."
        : "Purchases restored successfully.",
  };
}
