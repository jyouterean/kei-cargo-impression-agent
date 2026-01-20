import { NextRequest } from "next/server";
import { publishDuePosts, getQueueStatus } from "@/lib/modules/publisher";
import {
  verifyCronAuth,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/utils/cron-auth";
import { config } from "@/lib/config";
import { isCronEnabled } from "@/lib/utils/cron-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron: Publish due scheduled posts
 * Recommended schedule: every 5 minutes
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  if (!(await isCronEnabled("publish"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    // Publish due posts
    const publishResult = await publishDuePosts();

    // Get queue status
    const queueStatus = await getQueueStatus();

    return successResponse({
      published: publishResult.published,
      failed: publishResult.failed,
      queue: queueStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

