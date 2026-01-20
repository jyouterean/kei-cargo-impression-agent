import { NextRequest } from "next/server";
import { generateAndSchedule } from "@/lib/modules/generator";
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
 * Cron: Generate and schedule posts
 * Recommended schedule: 2-4 times daily
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  if (!(await isCronEnabled("generate"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    // Parse optional parameters
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform") as "x" | "threads" | null;
    const count = parseInt(url.searchParams.get("count") || "3", 10);

    const results: Record<string, Awaited<ReturnType<typeof generateAndSchedule>>> = {};

    // Generate for specified platform or both
    if (!platform || platform === "x") {
      results.x = await generateAndSchedule("x", count);
    }
    if (!platform || platform === "threads") {
      results.threads = await generateAndSchedule("threads", Math.min(count, 2));
    }

    return successResponse(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

