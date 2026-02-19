function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
const rawEnterpriseKey = process.env.EXPO_PUBLIC_ENTERPRISE_API_KEY?.trim() ?? "";
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const rawRevenueCatIosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? "";
const rawRevenueCatPublicEntitlementId =
  process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_ENTITLEMENT_ID?.trim() ?? "";

export const env = {
  apiBaseUrl: rawBaseUrl ? stripTrailingSlash(rawBaseUrl) : "",
  enterpriseApiKey: rawEnterpriseKey,
  supabaseUrl: rawSupabaseUrl ? stripTrailingSlash(rawSupabaseUrl) : "",
  supabaseAnonKey: rawSupabaseAnonKey,
  revenueCatIosApiKey: rawRevenueCatIosApiKey,
  revenueCatPublicEntitlementId: rawRevenueCatPublicEntitlementId,
};
