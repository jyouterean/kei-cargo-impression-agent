import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Neon database connection with SSL support
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

