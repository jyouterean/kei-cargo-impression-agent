import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishedPosts, metrics } from "@/lib/db/schema";
import { desc, gte, and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get impressions analytics and trends
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const platform = url.searchParams.get("platform") as "x" | "threads" | null;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get published posts
    const posts = await db.query.publishedPosts.findMany({
      where: platform
        ? and(eq(publishedPosts.platform, platform), gte(publishedPosts.publishedAt, cutoff))
        : gte(publishedPosts.publishedAt, cutoff),
      orderBy: desc(publishedPosts.publishedAt),
    });

    // Get metrics for each post (24h)
    const postsWithMetrics = [];
    for (const post of posts) {
      const metric = await db.query.metrics.findFirst({
        where: and(eq(metrics.publishedPostId, post.id), eq(metrics.hoursAfterPublish, 24)),
      });

      if (metric) {
        postsWithMetrics.push({
          post: {
            id: post.id,
            platform: post.platform,
            content: post.content.slice(0, 100),
            publishedAt: post.publishedAt.toISOString(),
            format: post.format,
            hookType: post.hookType,
            topic: post.topic,
          },
          impressions: metric.impressionCount || 0,
          likes: metric.likeCount || metric.threadsLikes || 0,
          reposts: metric.repostCount || metric.threadsReposts || 0,
          replies: metric.replyCount || metric.threadsReplies || 0,
          engagement:
            (metric.likeCount || 0) +
            (metric.repostCount || 0) * 2 +
            (metric.replyCount || 0) * 1.5,
        });
      }
    }

    // Daily aggregates
    const dailyData: Record<string, {
      date: string;
      impressions: number;
      engagement: number;
      posts: number;
    }> = {};

    for (const item of postsWithMetrics) {
      const date = item.post.publishedAt.split("T")[0];
      if (!dailyData[date]) {
        dailyData[date] = { date, impressions: 0, engagement: 0, posts: 0 };
      }
      dailyData[date].impressions += item.impressions;
      dailyData[date].engagement += item.engagement;
      dailyData[date].posts += 1;
    }

    const dailyTrend = Object.values(dailyData).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Performance by format/hook/topic
    const performanceByFormat: Record<string, { count: number; totalImp: number; totalEng: number }> = {};
    const performanceByHook: Record<string, { count: number; totalImp: number; totalEng: number }> = {};
    const performanceByTopic: Record<string, { count: number; totalImp: number; totalEng: number }> = {};

    for (const item of postsWithMetrics) {
      const format = item.post.format || "unknown";
      const hook = item.post.hookType || "unknown";
      const topic = item.post.topic || "unknown";

      if (!performanceByFormat[format]) {
        performanceByFormat[format] = { count: 0, totalImp: 0, totalEng: 0 };
      }
      performanceByFormat[format].count++;
      performanceByFormat[format].totalImp += item.impressions;
      performanceByFormat[format].totalEng += item.engagement;

      if (!performanceByHook[hook]) {
        performanceByHook[hook] = { count: 0, totalImp: 0, totalEng: 0 };
      }
      performanceByHook[hook].count++;
      performanceByHook[hook].totalImp += item.impressions;
      performanceByHook[hook].totalEng += item.engagement;

      if (!performanceByTopic[topic]) {
        performanceByTopic[topic] = { count: 0, totalImp: 0, totalEng: 0 };
      }
      performanceByTopic[topic].count++;
      performanceByTopic[topic].totalImp += item.impressions;
      performanceByTopic[topic].totalEng += item.engagement;
    }

    // Calculate averages
    const formatPerf = Object.entries(performanceByFormat).map(([name, data]) => ({
      name,
      count: data.count,
      avgImpressions: data.totalImp / data.count,
      avgEngagement: data.totalEng / data.count,
    }));

    const hookPerf = Object.entries(performanceByHook).map(([name, data]) => ({
      name,
      count: data.count,
      avgImpressions: data.totalImp / data.count,
      avgEngagement: data.totalEng / data.count,
    }));

    const topicPerf = Object.entries(performanceByTopic).map(([name, data]) => ({
      name,
      count: data.count,
      avgImpressions: data.totalImp / data.count,
      avgEngagement: data.totalEng / data.count,
    }));

    // Summary stats
    const totalImpressions = postsWithMetrics.reduce((sum, p) => sum + p.impressions, 0);
    const totalEngagement = postsWithMetrics.reduce((sum, p) => sum + p.engagement, 0);

    return Response.json({
      summary: {
        totalPosts: postsWithMetrics.length,
        totalImpressions,
        totalEngagement,
        avgImpressions: postsWithMetrics.length > 0 ? totalImpressions / postsWithMetrics.length : 0,
        avgEngagement: postsWithMetrics.length > 0 ? totalEngagement / postsWithMetrics.length : 0,
      },
      dailyTrend,
      performanceByFormat: formatPerf.sort((a, b) => b.avgImpressions - a.avgImpressions),
      performanceByHook: hookPerf.sort((a, b) => b.avgImpressions - a.avgImpressions),
      performanceByTopic: topicPerf.sort((a, b) => b.avgImpressions - a.avgImpressions),
      topPosts: postsWithMetrics
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

