import { isDemoMode } from "@/lib/demo-store";
import { isOracleConfigured } from "@/lib/oracle-config";
import { getMedusaBackendUrl } from "@/lib/medusa-proxy";

const DEMO_JWT_SECRET = "mirror-demo-jwt-secret-not-for-production";

export function getJwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (isDemoMode() || (!isOracleConfigured() && !getMedusaBackendUrl())) {
    return DEMO_JWT_SECRET;
  }

  throw new Error("Missing required environment variable: JWT_SECRET");
}
