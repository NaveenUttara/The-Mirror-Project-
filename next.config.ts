import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.100.64",
    "test.themirror-project.info",
  ],
  // Keep the native Oracle driver outside Turbopack's virtual filesystem so
  // its Windows .node binary and Instant Client libraries resolve normally.
  serverExternalPackages: ["oracledb"],
};

export default nextConfig;
