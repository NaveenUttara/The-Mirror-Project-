const DEMO_JWT_SECRET = "mirror-demo-jwt-secret-not-for-production";

export function getJwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  return DEMO_JWT_SECRET;
}
