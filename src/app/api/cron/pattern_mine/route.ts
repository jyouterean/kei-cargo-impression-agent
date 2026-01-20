import { NextRequest } from "next/server";
import { minePatterns, getPatternDistribution } from "@/lib/modules/pattern-miner";
import { injectExternalPriors } from "@/lib/modules/bandit";
import {
  verifyCronAuth,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/utils/cron-auth";
import { config } from "@/lib/config";
import { isCronEnabled } from "@/lib/utils/cron-check";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Cron: Mine patterns from top buzz posts
 * Recommended schedule: twice daily
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  if (!(await isCronEnabled("pattern_mine"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    // Step 1: Mine patterns from new buzz posts
    const mineResult = await minePatterns();

    // Step 2: Get pattern distribution
    const distribution = await getPatternDistribution(7);

    // Step 3: Inject priors into bandit for both platforms
    await injectExternalPriors("x", distribution);
    await injectExternalPriors("threads", distribution);

    return successResponse({
      mining: mineResult,
      distribution: {
        formats: Object.keys(distribution.formats).length,
        hookTypes: Object.keys(distribution.hookTypes).length,
        payloadTypes: Object.keys(distribution.payloadTypes).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

