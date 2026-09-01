import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the native Oracle driver outside Turbopack's virtual filesystem so
  // its Windows .node binary and Instant Client libraries resolve normally.
  serverExternalPackages: ["oracledb"],
};

export default nextConfig;
