/**
 * Applies supabase-schema.sql to your Supabase Postgres database.
 *
 * Required in .env (pick one):
 *   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
 *   — or —
 *   SUPABASE_DB_PASSWORD=your_database_password
 *   NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
 *
 * Run: npm run setup:db
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env file in project root.");
    process.exit(1);
  }

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const hash = value.indexOf(" #");
    if (hash !== -1) value = value.slice(0, hash).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl || !password) {
    console.error(`
Could not build database connection.

Add one of these to your .env file:

  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres

  — or —

  SUPABASE_DB_PASSWORD=your_database_password
  NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co

Get the database password from:
  Supabase Dashboard → Project Settings → Database → Database password
`);
    process.exit(1);
  }

  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

function parseStatements(sql) {
  return sql
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

async function verifyWithApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  for (const table of ["conversations", "messages"]) {
    const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
    if (res.ok) {
      console.log(`  ✓ Table "${table}" is reachable via API`);
    } else {
      const body = await res.text();
      console.log(`  ✗ Table "${table}" API check failed (${res.status}): ${body}`);
    }
  }

  const res = await fetch(
    `${url}/rest/v1/messages?select=assistant_source&limit=1`,
    { headers }
  );
  if (res.ok) {
    console.log(`  ✓ Column "assistant_source" exists`);
  } else {
    console.log(`  ✗ Column "assistant_source" missing — re-run setup or add manually`);
  }
}

async function main() {
  loadEnv();

  const sqlPath = path.join(root, "supabase-schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = parseStatements(sql);
  const connectionString = getDatabaseUrl();

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting to Supabase Postgres...\n");

  try {
    await client.connect();
    console.log("Connected. Running migrations:\n");

    for (const statement of statements) {
      const preview = statement.split("\n")[0].slice(0, 60);
      try {
        await client.query(statement);
        console.log(`  ✓ ${preview}...`);
      } catch (err) {
        const msg = err.message || String(err);
        if (
          msg.includes("already member of publication") ||
          msg.includes("already exists")
        ) {
          console.log(`  ~ ${preview}... (already applied, skipped)`);
        } else {
          throw err;
        }
      }
    }

    console.log("\nMigration complete.\nVerifying via Supabase API...\n");
    await verifyWithApi();
    console.log("\nDone. Restart npm run dev if it is already running.");
  } catch (err) {
    console.error("\nSetup failed:", err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
