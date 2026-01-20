import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { externalPosts, patterns } from "@/lib/db/schema";
import { desc, gte, eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get research results (external posts, patterns)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "7", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get top buzz posts
    const topBuzzPosts = await db.query.externalPosts.findMany({
      where: and(
        gte(externalPosts.collectedAt, cutoff),
        eq(externalPosts.isSpamSuspect, false)
      ),
      orderBy: desc(externalPosts.buzzScore),
      limit,
    });

    // Get patterns with associated posts
    const recentPatterns = await db.query.patterns.findMany({
      where: gte(patterns.extractedAt, cutoff),
      orderBy: desc(patterns.extractedAt),
      limit: 100,
    });

    // Aggregate patterns by type
    const patternStats = {
      formats: {} as Record<string, { count: number; avgBuzz: number }>,
      hookTypes: {} as Record<string, { count: number; avgBuzz: number }>,
      payloadTypes: {} as Record<string, { count: number; avgBuzz: number }>,
    };

    for (const pattern of recentPatterns) {
      const post = await db.query.externalPosts.findFirst({
        where: eq(externalPosts.id, pattern.externalPostId),
      });

      if (post && post.buzzScore !== null && post.buzzScore !== undefined) {
        const buzzScore = post.buzzScore;
        
        if (pattern.format) {
          if (!patternStats.formats[pattern.format]) {
            patternStats.formats[pattern.format] = { count: 0, avgBuzz: 0 };
          }
          patternStats.formats[pattern.format].count++;
          patternStats.formats[pattern.format].avgBuzz += buzzScore;
        }

        if (pattern.hookType) {
          if (!patternStats.hookTypes[pattern.hookType]) {
            patternStats.hookTypes[pattern.hookType] = { count: 0, avgBuzz: 0 };
          }
          patternStats.hookTypes[pattern.hookType].count++;
          patternStats.hookTypes[pattern.hookType].avgBuzz += buzzScore;
        }

        if (pattern.payloadType) {
          if (!patternStats.payloadTypes[pattern.payloadType]) {
            patternStats.payloadTypes[pattern.payloadType] = { count: 0, avgBuzz: 0 };
          }
          patternStats.payloadTypes[pattern.payloadType].count++;
          patternStats.payloadTypes[pattern.payloadType].avgBuzz += buzzScore;
        }
      }
    }

    // Calculate averages
    for (const key of Object.keys(patternStats.formats)) {
      patternStats.formats[key].avgBuzz /= patternStats.formats[key].count;
    }
    for (const key of Object.keys(patternStats.hookTypes)) {
      patternStats.hookTypes[key].avgBuzz /= patternStats.hookTypes[key].count;
    }
    for (const key of Object.keys(patternStats.payloadTypes)) {
      patternStats.payloadTypes[key].avgBuzz /= patternStats.payloadTypes[key].count;
    }

    return Response.json({
      topBuzzPosts: topBuzzPosts.map((p) => ({
        id: p.id,
        text: p.text,
        authorFollowersCount: p.authorFollowersCount,
        createdAt: p.createdAt.toISOString(),
        collectedAt: p.collectedAt.toISOString(),
        buzzScore: p.buzzScore,
        velocity: p.velocity,
        metrics: {
          likes: p.likeCount,
          reposts: p.repostCount,
          replies: p.replyCount,
          quotes: p.quoteCount,
        },
      })),
      patternStats,
      summary: {
        totalCollected: topBuzzPosts.length,
        avgBuzzScore: topBuzzPosts.length > 0
          ? topBuzzPosts.reduce((sum, p) => sum + (p.buzzScore || 0), 0) / topBuzzPosts.length
          : 0,
        totalPatterns: recentPatterns.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

