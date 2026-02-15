function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
const rawEnterpriseKey = process.env.EXPO_PUBLIC_ENTERPRISE_API_KEY?.trim() ?? "";

export const env = {
  apiBaseUrl: rawBaseUrl ? stripTrailingSlash(rawBaseUrl) : "",
  enterpriseApiKey: rawEnterpriseKey,
};
