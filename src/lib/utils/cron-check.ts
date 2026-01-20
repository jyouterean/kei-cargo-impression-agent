import { db } from "@/lib/db";
import { learningState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Check if a cron trigger is enabled
 */
export async function isCronEnabled(cronName: string): Promise<boolean> {
  const cronConfig = await db.query.learningState.findFirst({
    where: eq(learningState.key, "cron_config"),
  });

  if (!cronConfig) return true; // Default enabled

  const config = cronConfig.value as Record<string, { enabled: boolean }>;
  return config[cronName]?.enabled !== false;
}

