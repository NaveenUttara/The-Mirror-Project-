export function isOracleConfigured(): boolean {
  return Boolean(
    process.env.ORACLE_USER?.trim()
      && process.env.ORACLE_PASSWORD?.trim()
      && process.env.ORACLE_CONNECT_STRING?.trim(),
  );
}
