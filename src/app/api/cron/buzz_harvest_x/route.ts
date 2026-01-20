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
export const maxDuration = 300; // Increase to 5 minutes to handle large batches

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
    console.log("[buzz_harvest_x] Starting buzz harvest...");
    const startTime = Date.now();
    
    const result = await harvestBuzzTweets();
    const duration = Date.now() - startTime;
    
    // Log detailed results
    console.log("[buzz_harvest_x] Result:", {
      collected: result.collected,
      skipped: result.skipped,
      errors: result.errors,
      errorCount: result.errors.length,
      duration: `${duration}ms`,
    });
    
    // Log errors if any
    if (result.errors.length > 0) {
      console.error("[buzz_harvest_x] Errors:", result.errors);
    }
    
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[buzz_harvest_x] Fatal Error:", {
      message,
      stack: stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
    });
    return errorResponse(message);
  }
}

