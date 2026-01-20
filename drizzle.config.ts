import { defineConfig } from "drizzle-kit";

// Fix SSL mode warning: replace 'require' with 'verify-full' for future compatibility
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  
  // Replace sslmode=require with sslmode=verify-full to avoid deprecation warning
  return url.replace(/sslmode=require/g, "sslmode=verify-full");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL) || process.env.DATABASE_URL!,
  },
});

