import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { armPriors, templateWeights, patterns } from "@/lib/db/schema";
import { getCurrentWeights } from "@/lib/modules/template-synthesizer";
import { getPatternDistribution } from "@/lib/modules/pattern-miner";
import { desc, eq, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get learning state (bandit arms, template weights, patterns)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const platform = (url.searchParams.get("platform") as "x" | "threads") || "x";

    // Get current template weights
    const weights = await getCurrentWeights(platform);

    // Get top arms
    const topArms = await db.query.armPriors.findMany({
      where: eq(armPriors.platform, platform),
      orderBy: desc(armPriors.pullCount),
      limit: 20,
    });

    // Get pattern distribution
    const distribution = await getPatternDistribution(7);

    // Get recent patterns
    const recentPatterns = await db.query.patterns.findMany({
      orderBy: desc(patterns.extractedAt),
      limit: 10,
    });

    // Calculate exploration vs exploitation stats
    const totalPulls = topArms.reduce((sum, arm) => sum + (arm.pullCount || 0), 0);
    const explorationArms = topArms.filter((arm) => (arm.pullCount || 0) < 5);

    return Response.json({
      platform,
      weights: {
        formats: weights.formats,
        hookTypes: weights.hookTypes,
        payloadTypes: weights.payloadTypes,
      },
      topArms: topArms.map((arm) => ({
        id: arm.armId,
        format: arm.format,
        hookType: arm.hookType,
        topic: arm.topic,
        alpha: arm.alpha,
        beta: arm.beta,
        pulls: arm.pullCount,
        avgReward: arm.pullCount ? (arm.totalReward || 0) / arm.pullCount : 0,
        source: arm.source,
      })),
      banditStats: {
        totalArms: topArms.length,
        totalPulls,
        explorationArms: explorationArms.length,
        exploitationRatio: totalPulls > 0 ? 1 - explorationArms.length / topArms.length : 0,
      },
      patternDistribution: {
        formats: Object.entries(distribution.formats)
          .sort(([, a], [, b]) => b.avgBuzz - a.avgBuzz)
          .slice(0, 7)
          .map(([name, data]) => ({ name, ...data })),
        hookTypes: Object.entries(distribution.hookTypes)
          .sort(([, a], [, b]) => b.avgBuzz - a.avgBuzz)
          .slice(0, 7)
          .map(([name, data]) => ({ name, ...data })),
      },
      recentPatterns: recentPatterns.map((p) => ({
        id: p.id,
        format: p.format,
        hookType: p.hookType,
        payloadType: p.payloadType,
        qualityScore: p.qualityScore,
        extractedAt: p.extractedAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

