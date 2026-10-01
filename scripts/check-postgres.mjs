const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("FAIL: DATABASE_URL is not set.");
  process.exit(1);
}

try {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT COUNT(*)::int AS users
      FROM mirror_user
     WHERE deleted_at IS NULL
  `;
  console.log(`SUCCESS: Connected to PostgreSQL (${rows[0]?.users ?? 0} mirror users).`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
