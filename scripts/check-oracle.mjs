import oracledb from "oracledb";

const requiredColumns = {
  MIRROR_USERS: ["ID", "NAME", "PHONE", "EMAIL", "ROLE", "PHONE_VERIFIED"],
  MIRROR_OTP_REQUESTS: ["PHONE", "OTP_HASH", "EXPIRES_AT", "ATTEMPTS"],
  MIRROR_SESSIONS: ["ID", "USER_ID", "TOKEN_HASH", "EXPIRES_AT"],
  MIRROR_POTHOLES: ["ID", "PUBLIC_ID", "LATITUDE", "LONGITUDE", "SEVERITY", "CURRENT_STATUS"],
  MIRROR_REPORTS: ["ID", "REPORT_ID", "POTHOLE_ID", "CITIZEN_ID", "DESCRIPTION", "SUBMITTED_AT"],
  MIRROR_REPORT_PHOTOS: ["ID", "REPORT_ID", "OBJECT_KEY", "MIME_TYPE", "FILE_SIZE", "EVIDENCE_TYPE"],
  MIRROR_STATUS_HISTORY: ["ID", "REPORT_ID", "OLD_STATUS", "NEW_STATUS", "CHANGED_BY", "COMMENTS"],
  MIRROR_AUDIT_LOGS: ["ID", "ACTOR_USER_ID", "ACTION", "ENTITY_TYPE", "ENTITY_ID", "DETAILS"],
};

const requiredSequences = [
  "MIRROR_USERS_SEQ",
  "MIRROR_OTP_REQ_SEQ",
  "MIRROR_SESSIONS_SEQ",
  "MIRROR_POTHOLES_SEQ",
  "MIRROR_REPORTS_SEQ",
  "MIRROR_PHOTOS_SEQ",
  "MIRROR_STATUS_SEQ",
  "MIRROR_AUDIT_SEQ",
];

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
      WHERE table_name IN (
        'MIRROR_USERS', 'MIRROR_OTP_REQUESTS', 'MIRROR_SESSIONS',
        'MIRROR_POTHOLES', 'MIRROR_REPORTS', 'MIRROR_REPORT_PHOTOS',
        'MIRROR_STATUS_HISTORY', 'MIRROR_AUDIT_LOGS'
      )`,
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
        WHERE table_name IN (
          'MIRROR_USERS', 'MIRROR_OTP_REQUESTS', 'MIRROR_SESSIONS',
          'MIRROR_POTHOLES', 'MIRROR_REPORTS', 'MIRROR_REPORT_PHOTOS',
          'MIRROR_STATUS_HISTORY', 'MIRROR_AUDIT_LOGS'
        )
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

  const sequenceResult = await connection.execute(
    `SELECT sequence_name
       FROM user_sequences
      WHERE sequence_name IN (
        'MIRROR_USERS_SEQ', 'MIRROR_OTP_REQ_SEQ', 'MIRROR_SESSIONS_SEQ',
        'MIRROR_POTHOLES_SEQ', 'MIRROR_REPORTS_SEQ', 'MIRROR_PHOTOS_SEQ',
        'MIRROR_STATUS_SEQ', 'MIRROR_AUDIT_SEQ'
      )`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const sequenceNames = (sequenceResult.rows ?? []).map((row) => row.SEQUENCE_NAME);

  for (const sequenceName of requiredSequences) {
    const state = sequenceNames.includes(sequenceName) ? "PRESENT" : "MISSING";
    console.log(`${sequenceName} sequence: ${state}`);
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
