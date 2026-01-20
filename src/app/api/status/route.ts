import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishedPosts, scheduledPosts, systemEvents, externalPosts, metrics } from "@/lib/db/schema";
import { getQueueStatus } from "@/lib/modules/publisher";
import { getPerformanceSummary } from "@/lib/modules/metrics-collector";
import { config } from "@/lib/config";
import { eq, gte, desc, and, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get system status and metrics
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get queue status
    const queue = await getQueueStatus();

    // Get today's posts by platform
    const todayPostsX = await db.query.publishedPosts.findMany({
      where: and(
        eq(publishedPosts.platform, "x"),
        gte(publishedPosts.publishedAt, today)
      ),
    });
    const todayPostsThreads = await db.query.publishedPosts.findMany({
      where: and(
        eq(publishedPosts.platform, "threads"),
        gte(publishedPosts.publishedAt, today)
      ),
    });

    // Get external posts collected
    const externalPostsCount = await db.query.externalPosts.findMany({
      where: gte(externalPosts.collectedAt, weekAgo),
    });

    // Get recent events
    const recentEvents = await db.query.systemEvents.findMany({
      orderBy: desc(systemEvents.createdAt),
      limit: 20,
    });

    // Get error count today
    const errorsToday = await db.query.systemEvents.findMany({
      where: and(
        eq(systemEvents.severity, "error"),
        gte(systemEvents.createdAt, today)
      ),
    });

    // Get performance summary
    const performance = await getPerformanceSummary(undefined, 7);

    return Response.json({
      system: {
        killSwitch: config.killSwitch,
        timestamp: now.toISOString(),
      },
      queue: {
        pending: queue.pending,
        nextScheduled: queue.nextScheduled?.toISOString(),
      },
      todayStats: {
        x: {
          posted: todayPostsX.length,
          limit: config.maxPostsPerDayX,
        },
        threads: {
          posted: todayPostsThreads.length,
          limit: config.maxPostsPerDayThreads,
        },
        errors: errorsToday.length,
      },
      weekStats: {
        externalPostsCollected: externalPostsCount.length,
        totalPosts: performance.totalPosts,
        avgImpressions: Math.round(performance.avgImpressions),
        avgEngagement: Math.round(performance.avgEngagement * 10) / 10,
      },
      topPerformers: performance.topPerformers.slice(0, 3),
      recentEvents: recentEvents.slice(0, 10).map((e) => ({
        type: e.eventType,
        severity: e.severity,
        message: e.message.slice(0, 100),
        time: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

