import oracledb from "oracledb";

const requiredColumns = {
  MIRROR_USERS: ["ID", "NAME", "PHONE", "EMAIL", "ROLE", "PHONE_VERIFIED"],
  MIRROR_OTP_REQUESTS: ["PHONE", "OTP_HASH", "EXPIRES_AT", "ATTEMPTS"],
};

const clientDirectory = process.env.ORACLE_CLIENT_LIB_DIR;

if (clientDirectory) {
  oracledb.initOracleClient({ libDir: clientDirectory });
}

let connection;

try {
  connection = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectionString: process.env.ORACLE_CONNECT_STRING,
  });
  console.log("Oracle authentication: SUCCESS");

  const tableResult = await connection.execute(
    `SELECT table_name
       FROM user_tables
      WHERE table_name IN ('MIRROR_USERS', 'MIRROR_OTP_REQUESTS')`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const tableNames = (tableResult.rows ?? []).map((row) => row.TABLE_NAME);

  for (const tableName of Object.keys(requiredColumns)) {
    const state = tableNames.includes(tableName) ? "PRESENT" : "MISSING";
    console.log(`${tableName} table: ${state}`);
  }

  if (tableNames.length > 0) {
    const columnResult = await connection.execute(
      `SELECT table_name, column_name
         FROM user_tab_columns
        WHERE table_name IN ('MIRROR_USERS', 'MIRROR_OTP_REQUESTS')
        ORDER BY table_name, column_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    for (const [tableName, columns] of Object.entries(requiredColumns)) {
      const existingColumns = (columnResult.rows ?? [])
        .filter((row) => row.TABLE_NAME === tableName)
        .map((row) => row.COLUMN_NAME);
      const missingColumns = columns.filter(
        (columnName) => !existingColumns.includes(columnName),
      );
      const state = missingColumns.length
        ? `MISSING ${missingColumns.join(", ")}`
        : "PRESENT";
      console.log(`${tableName} required columns: ${state}`);
    }
  }
} catch (error) {
  console.log("Oracle authentication: FAILED");
  console.log(`Oracle error code: ${error.code ?? "UNKNOWN"}`);
  process.exitCode = 1;
} finally {
  if (connection) {
    await connection.close();
  }
}
