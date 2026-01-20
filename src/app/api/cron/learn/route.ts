import { NextRequest } from "next/server";
import { synthesizeTemplates } from "@/lib/modules/template-synthesizer";
import { runLearningUpdate } from "@/lib/modules/bandit";
import { getPatternDistribution } from "@/lib/modules/pattern-miner";
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
 * Cron: Update learning (bandit + template weights)
 * Recommended schedule: 1-2 times daily
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return unauthorizedResponse();
  }

  if (config.killSwitch) {
    return errorResponse("Kill switch is active", 503);
  }

  if (!(await isCronEnabled("learn"))) {
    return successResponse({ skipped: true, reason: "Cron is disabled" });
  }

  try {
    // Step 1: Synthesize template weights from patterns
    const templateResult = await synthesizeTemplates();

    // Step 2: Update bandit arms from self metrics
    const banditResult = await runLearningUpdate();

    // Step 3: Get current pattern distribution for reporting
    const distribution = await getPatternDistribution(7);

    return successResponse({
      templates: templateResult,
      bandit: banditResult,
      patternStats: {
        formats: Object.entries(distribution.formats)
          .sort(([, a], [, b]) => b.avgBuzz - a.avgBuzz)
          .slice(0, 5),
        hookTypes: Object.entries(distribution.hookTypes)
          .sort(([, a], [, b]) => b.avgBuzz - a.avgBuzz)
          .slice(0, 5),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

