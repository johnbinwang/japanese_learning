const { Pool } = require('pg');
require('dotenv').config();

// Create a single Pool instance for the whole app
// DATABASE_URL example: postgres://user:password@host:port/dbname
const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/japanese_learning';

const sslEnabled = process.env.DATABASE_SSL === 'true' || /amazonaws|render|railway|neon|supabase|azure|heroku/i.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
});

pool.on('error', (err) => {
  // console.error('Unexpected PG pool error', err);
});

module.exports = pool;