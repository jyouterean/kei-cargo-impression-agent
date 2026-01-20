import { NextRequest } from "next/server";
import { harvestBuzzTweets } from "@/lib/modules/buzz-harvester";
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
 * Cron: Harvest buzz tweets from X
 * Recommended schedule: every 30-60 minutes
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  // Check if this cron is enabled
  if (!(await isCronEnabled("buzz_harvest_x"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    const result = await harvestBuzzTweets();
    
    // Log detailed results
    console.log("[buzz_harvest_x] Result:", {
      collected: result.collected,
      skipped: result.skipped,
      errors: result.errors,
      errorCount: result.errors.length,
    });
    
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[buzz_harvest_x] Error:", error);
    return errorResponse(message);
  }
}

