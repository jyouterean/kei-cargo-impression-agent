import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { scheduledPosts } from "@/lib/db/schema";
import { generateAndSchedule, getOptimalPostingTimes } from "@/lib/modules/generator";
import {
  verifyCronAuth,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/utils/cron-auth";
import { config } from "@/lib/config";
import { isCronEnabled } from "@/lib/utils/cron-check";
import { eq, and, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron: Fill schedule gaps for upcoming time slots
 * Recommended schedule: every few hours
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  if (!(await isCronEnabled("schedule"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Check scheduled posts for next 24 hours
    const pendingPosts = await db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.status, "pending"),
        gte(scheduledPosts.scheduledFor, now)
      ),
    });

    const xPending = pendingPosts.filter((p) => p.platform === "x").length;
    const threadsPending = pendingPosts.filter((p) => p.platform === "threads").length;

    const targetXPosts = Math.min(6, config.maxPostsPerDayX / 4); // Target for next 6 hours
    const targetThreadsPosts = Math.min(2, config.maxPostsPerDayThreads / 4);

    const results = {
      xGenerated: 0,
      threadsGenerated: 0,
      xPending,
      threadsPending,
    };

    // Generate more X posts if needed
    if (xPending < targetXPosts) {
      const needed = targetXPosts - xPending;
      const genResult = await generateAndSchedule("x", needed);
      results.xGenerated = genResult.scheduled;
    }

    // Generate more Threads posts if needed
    if (threadsPending < targetThreadsPosts) {
      const needed = targetThreadsPosts - threadsPending;
      const genResult = await generateAndSchedule("threads", needed);
      results.threadsGenerated = genResult.scheduled;
    }

    return successResponse(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

