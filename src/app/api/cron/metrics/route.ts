import { NextRequest } from "next/server";
import { collectMetrics } from "@/lib/modules/metrics-collector";
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
 * Cron: Collect metrics from published posts
 * Recommended schedule: every hour
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  if (!(await isCronEnabled("metrics"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    const result = await collectMetrics();
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

