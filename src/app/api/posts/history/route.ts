import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishedPosts, metrics } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get post history with results
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const platform = url.searchParams.get("platform") || undefined;

    // Build where clause
    const whereClause = platform ? eq(publishedPosts.platform, platform) : undefined;

    // Get published posts with metrics
    const posts = await db.query.publishedPosts.findMany({
      where: whereClause,
      orderBy: desc(publishedPosts.publishedAt),
      limit,
    });

    const postsWithMetrics = await Promise.all(
      posts.map(async (post) => {
        // Get all metrics for this post
        const postMetrics = await db.query.metrics.findMany({
          where: eq(metrics.publishedPostId, post.id),
          orderBy: desc(metrics.collectedAt),
        });

        // Calculate best metrics (latest or highest)
        const latestMetric = postMetrics[0];
        const bestImpressions = Math.max(
          ...postMetrics.map((m) => m.impressionCount || 0),
          0
        );
        const totalLikes = Math.max(...postMetrics.map((m) => m.likeCount || 0), 0);
        const totalReposts = Math.max(...postMetrics.map((m) => m.repostCount || 0), 0);
        const totalReplies = Math.max(...postMetrics.map((m) => m.replyCount || 0), 0);

        // Calculate engagement rate
        const engagementRate =
          bestImpressions > 0
            ? ((totalLikes + totalReposts + totalReplies) / bestImpressions) * 100
            : 0;

        return {
          id: post.id,
          platform: post.platform,
          content: post.content,
          publishedAt: post.publishedAt.toISOString(),
          externalId: post.externalId,
          metadata: {
            format: post.format,
            hookType: post.hookType,
            topic: post.topic,
          },
          metrics: {
            impressions: bestImpressions,
            likes: totalLikes,
            reposts: totalReposts,
            replies: totalReplies,
            engagementRate: Math.round(engagementRate * 100) / 100,
          },
          latestMetric: latestMetric
            ? {
                collectedAt: latestMetric.collectedAt.toISOString(),
                hoursAfterPublish: latestMetric.hoursAfterPublish,
                impressions: latestMetric.impressionCount,
                likes: latestMetric.likeCount,
                reposts: latestMetric.repostCount,
                replies: latestMetric.replyCount,
              }
            : null,
          metricsHistory: postMetrics.map((m) => ({
            collectedAt: m.collectedAt.toISOString(),
            hoursAfterPublish: m.hoursAfterPublish,
            impressions: m.impressionCount,
            likes: m.likeCount,
            reposts: m.repostCount,
            replies: m.replyCount,
          })),
        };
      })
    );

    return Response.json({
      posts: postsWithMetrics,
      total: postsWithMetrics.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

