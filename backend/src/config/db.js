const { Pool } = require("pg");
const env = require("./env");

function getConnectionConfig() {
  const connectionUrl = new URL(env.databaseUrl);
  const usesLocalDatabase =
    connectionUrl.hostname === "localhost" || connectionUrl.hostname === "127.0.0.1";

  // pg-connection-string can treat sslmode=require as strict verification.
  // Strip SSL query params and control SSL explicitly here.
  connectionUrl.searchParams.delete("sslmode");
  connectionUrl.searchParams.delete("sslcert");
  connectionUrl.searchParams.delete("sslkey");
  connectionUrl.searchParams.delete("sslrootcert");

  return {
    connectionString: connectionUrl.toString(),
    ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
  };
}

const pool = new Pool(getConnectionConfig());

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
