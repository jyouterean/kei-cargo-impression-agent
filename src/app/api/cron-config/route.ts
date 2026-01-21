import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { learningState, systemEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get/Set cron trigger configuration
 */
export async function GET() {
  try {
    // Get cron configuration from learning_state
    const cronConfig = await db.query.learningState.findFirst({
      where: eq(learningState.key, "cron_config"),
    });

    const defaultConfig = {
      buzz_harvest_x: { enabled: false, lastRun: null as string | null }, // デフォルトで無効化（コスト削減）
      pattern_mine: { enabled: true, lastRun: null as string | null },
      generate: { enabled: true, lastRun: null as string | null },
      schedule: { enabled: true, lastRun: null as string | null },
      publish: { enabled: true, lastRun: null as string | null },
      metrics: { enabled: true, lastRun: null as string | null },
      learn: { enabled: true, lastRun: null as string | null },
    };

    const config = cronConfig
      ? { ...defaultConfig, ...(cronConfig.value as typeof defaultConfig) }
      : defaultConfig;

    // Get last run times from recent events
    const eventTypes = Object.keys(defaultConfig);
    for (const eventType of eventTypes) {
      const lastEvent = await db.query.systemEvents.findFirst({
        where: eq(systemEvents.eventType, `${eventType}_complete`),
        orderBy: (events, { desc }) => [desc(events.createdAt)],
      });

      if (lastEvent && config[eventType as keyof typeof config]) {
        config[eventType as keyof typeof config].lastRun = lastEvent.createdAt.toISOString();
      }
    }

    return Response.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cronName, enabled } = body;

    if (!cronName || typeof enabled !== "boolean") {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    // Get existing config
    const existing = await db.query.learningState.findFirst({
      where: eq(learningState.key, "cron_config"),
    });

    const defaultConfig = {
      buzz_harvest_x: { enabled: false, lastRun: null as string | null }, // デフォルトで無効化（コスト削減）
      pattern_mine: { enabled: true, lastRun: null as string | null },
      generate: { enabled: true, lastRun: null as string | null },
      schedule: { enabled: true, lastRun: null as string | null },
      publish: { enabled: true, lastRun: null as string | null },
      metrics: { enabled: true, lastRun: null as string | null },
      learn: { enabled: true, lastRun: null as string | null },
    };

    const currentConfig = existing
      ? { ...defaultConfig, ...(existing.value as typeof defaultConfig) }
      : defaultConfig;

    // Update specific cron
    currentConfig[cronName as keyof typeof currentConfig] = {
      ...currentConfig[cronName as keyof typeof currentConfig],
      enabled,
    };

    // Save back
    if (existing) {
      await db
        .update(learningState)
        .set({ value: currentConfig, updatedAt: new Date() })
        .where(eq(learningState.id, existing.id));
    } else {
      await db.insert(learningState).values({
        key: "cron_config",
        value: currentConfig,
      });
    }

    // Log the change
    await db.insert(systemEvents).values({
      eventType: "cron_config_changed",
      severity: "info",
      message: `Cron ${cronName} ${enabled ? "enabled" : "disabled"}`,
      metadata: { cronName, enabled },
    });

    return Response.json({ success: true, config: currentConfig });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

