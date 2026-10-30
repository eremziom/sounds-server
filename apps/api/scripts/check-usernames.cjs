// Read-only preflight for the username/email login rule. No credentials or PII
// are printed; use the database configured for this API process.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await db.query(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE position('@' in username) > 0)::int AS usernames_with_at
      FROM "User"
    `);
    console.log(JSON.stringify(result.rows[0]));
    if (result.rows[0].usernames_with_at > 0) process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
