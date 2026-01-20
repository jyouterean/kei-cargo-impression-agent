import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Fix SSL mode warning: replace 'require' with 'verify-full' for future compatibility
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  
  // Replace sslmode=require with sslmode=verify-full to avoid deprecation warning
  // This maintains the same security level while being explicit about the intent
  return url.replace(/sslmode=require/g, "sslmode=verify-full");
}

// Neon database connection with SSL support
const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  // Neon requires SSL - configure SSL for neon.tech connections
  ssl: process.env.DATABASE_URL?.includes("neon.tech") 
    ? { 
        rejectUnauthorized: false 
      } 
    : undefined,
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

export * from "./schema";

