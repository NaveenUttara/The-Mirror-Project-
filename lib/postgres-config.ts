import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | undefined;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getSql() {
  if (!sqlClient) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured");
    }
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}
