import oracledb from "oracledb";

type OracleGlobal = typeof globalThis & {
  mirrorOracleClientInitialized?: boolean;
  mirrorOraclePoolPromise?: Promise<oracledb.Pool>;
};

const oracleGlobal = globalThis as OracleGlobal;
const oracleClientDirectory = process.env.ORACLE_CLIENT_LIB_DIR;

if (oracleClientDirectory && !oracleGlobal.mirrorOracleClientInitialized) {
  oracledb.initOracleClient({ libDir: oracleClientDirectory });
  oracleGlobal.mirrorOracleClientInitialized = true;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getPool(): Promise<oracledb.Pool> {
  if (!oracleGlobal.mirrorOraclePoolPromise) {
    oracleGlobal.mirrorOraclePoolPromise = oracledb.createPool({
      user: requiredEnvironmentVariable("ORACLE_USER"),
      password: requiredEnvironmentVariable("ORACLE_PASSWORD"),
      connectionString: requiredEnvironmentVariable(
        "ORACLE_CONNECT_STRING",
      ),
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1,
    });
  }

  return oracleGlobal.mirrorOraclePoolPromise;
}

export async function getConnection(): Promise<oracledb.Connection> {
  const pool = await getPool();
  return pool.getConnection();
}
