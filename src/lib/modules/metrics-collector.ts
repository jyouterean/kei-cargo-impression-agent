import { db } from "@/lib/db";
import { publishedPosts, metrics, systemEvents } from "@/lib/db/schema";
import { xClient } from "@/lib/clients/x-client";
import { threadsClient } from "@/lib/clients/threads-client";
import { eq, and, gte, lt, isNull, or } from "drizzle-orm";

interface CollectionResult {
  collected: number;
  skipped: number;
  errors: string[];
}

/**
 * Get posts that need metrics collection at a specific time window
 */
async function getPostsNeedingCollection(
  hoursWindow: number
): Promise<typeof publishedPosts.$inferSelect[]> {
  const now = Date.now();
  
  // Calculate time ranges for posts published hoursWindow ago (with 1 hour tolerance)
  const targetTime = now - hoursWindow * 60 * 60 * 1000;
  const startTime = new Date(targetTime - 60 * 60 * 1000); // 1 hour before
  const endTime = new Date(targetTime + 60 * 60 * 1000);   // 1 hour after

  // Get posts published in this window
  const posts = await db.query.publishedPosts.findMany({
    where: and(
      gte(publishedPosts.publishedAt, startTime),
      lt(publishedPosts.publishedAt, endTime)
    ),
  });

  // Filter out posts that already have metrics for this window
  const postsWithoutMetrics: typeof posts = [];
  
  for (const post of posts) {
    const existingMetric = await db.query.metrics.findFirst({
      where: and(
        eq(metrics.publishedPostId, post.id),
        eq(metrics.hoursAfterPublish, hoursWindow)
      ),
    });
    
    if (!existingMetric) {
      postsWithoutMetrics.push(post);
    }
  }

  return postsWithoutMetrics;
}

/**
 * Collect metrics for X posts
 */
async function collectXMetrics(
  post: typeof publishedPosts.$inferSelect,
  hoursAfterPublish: number
): Promise<boolean> {
  try {
    const tweet = await xClient.getTweetMetrics(post.externalId);
    
    if (!tweet) {
      return false;
    }

    // Calculate reward for learning
    const impressions = tweet.non_public_metrics?.impression_count || 
                       tweet.organic_metrics?.impression_count || 0;
    const reward = Math.log(1 + impressions);

    await db.insert(metrics).values({
      publishedPostId: post.id,
      hoursAfterPublish,
      impressionCount: impressions,
      likeCount: tweet.public_metrics.like_count,
      repostCount: tweet.public_metrics.retweet_count,
      replyCount: tweet.public_metrics.reply_count,
      quoteCount: tweet.public_metrics.quote_count,
      profileVisits: tweet.non_public_metrics?.user_profile_clicks,
      reward,
    });

    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Collect metrics for Threads posts
 */
async function collectThreadsMetrics(
  post: typeof publishedPosts.$inferSelect,
  hoursAfterPublish: number
): Promise<boolean> {
  try {
    const insights = await threadsClient.getThreadInsights(post.externalId);
    
    if (!insights) {
      return false;
    }

    // For Threads, we use views as the main engagement metric
    const reward = Math.log(1 + insights.views);

    await db.insert(metrics).values({
      publishedPostId: post.id,
      hoursAfterPublish,
      threadsLikes: insights.likes,
      threadsReplies: insights.replies,
      threadsReposts: insights.reposts,
      threadsQuotes: insights.quotes,
      impressionCount: insights.views, // Store views as impressions for consistency
      reward,
    });

    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Collect metrics for all posts at specified time windows
 */
export async function collectMetrics(): Promise<{
  windows: Record<number, CollectionResult>;
  total: CollectionResult;
}> {
  const windows = [6, 24, 48]; // Hours after publish to collect
  const results: Record<number, CollectionResult> = {};
  const total: CollectionResult = { collected: 0, skipped: 0, errors: [] };

  for (const hoursWindow of windows) {
    const windowResult: CollectionResult = { collected: 0, skipped: 0, errors: [] };
    
    const posts = await getPostsNeedingCollection(hoursWindow);

    for (const post of posts) {
      try {
        let success = false;

        if (post.platform === "x") {
          success = await collectXMetrics(post, hoursWindow);
        } else if (post.platform === "threads") {
          success = await collectThreadsMetrics(post, hoursWindow);
        }

        if (success) {
          windowResult.collected++;
          total.collected++;
        } else {
          windowResult.skipped++;
          total.skipped++;
        }

        // Rate limiting delay
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        windowResult.errors.push(`Post ${post.id}: ${errorMessage}`);
        total.errors.push(`Post ${post.id}: ${errorMessage}`);
      }
    }

    results[hoursWindow] = windowResult;
  }

  // Log results
  await db.insert(systemEvents).values({
    eventType: "metrics_collection_complete",
    severity: "info",
    message: `Metrics collected: ${total.collected} successful, ${total.skipped} skipped`,
    metadata: { windows: results, total },
  });

  return { windows: results, total };
}

/**
 * Get performance summary for recent posts
 */
export async function getPerformanceSummary(
  platform?: "x" | "threads",
  days: number = 7
): Promise<{
  totalPosts: number;
  avgImpressions: number;
  avgEngagement: number;
  topPerformers: Array<{
    postId: number;
    content: string;
    impressions: number;
    engagement: number;
  }>;
  byFormat: Record<string, { count: number; avgImp: number }>;
  byHookType: Record<string, { count: number; avgImp: number }>;
}> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get published posts with metrics
  const posts = await db.query.publishedPosts.findMany({
    where: platform
      ? and(eq(publishedPosts.platform, platform), gte(publishedPosts.publishedAt, cutoff))
      : gte(publishedPosts.publishedAt, cutoff),
  });

  const postMetrics: Array<{
    post: typeof publishedPosts.$inferSelect;
    impressions: number;
    engagement: number;
  }> = [];

  for (const post of posts) {
    // Get 24h metrics
    const metric = await db.query.metrics.findFirst({
      where: and(
        eq(metrics.publishedPostId, post.id),
        eq(metrics.hoursAfterPublish, 24)
      ),
    });

    if (metric) {
      const impressions = metric.impressionCount || 0;
      const engagement = (metric.likeCount || 0) + 
                        (metric.repostCount || 0) * 2 + 
                        (metric.replyCount || 0) * 1.5;
      postMetrics.push({ post, impressions, engagement });
    }
  }

  if (postMetrics.length === 0) {
    return {
      totalPosts: 0,
      avgImpressions: 0,
      avgEngagement: 0,
      topPerformers: [],
      byFormat: {},
      byHookType: {},
    };
  }

  // Calculate averages
  const totalImpressions = postMetrics.reduce((sum, p) => sum + p.impressions, 0);
  const totalEngagement = postMetrics.reduce((sum, p) => sum + p.engagement, 0);

  // Get top performers
  const sorted = [...postMetrics].sort((a, b) => b.impressions - a.impressions);
  const topPerformers = sorted.slice(0, 5).map((p) => ({
    postId: p.post.id,
    content: p.post.content.slice(0, 100) + (p.post.content.length > 100 ? "..." : ""),
    impressions: p.impressions,
    engagement: p.engagement,
  }));

  // Aggregate by format
  const byFormat: Record<string, { total: number; count: number }> = {};
  const byHookType: Record<string, { total: number; count: number }> = {};

  for (const { post, impressions } of postMetrics) {
    if (post.format) {
      if (!byFormat[post.format]) byFormat[post.format] = { total: 0, count: 0 };
      byFormat[post.format].total += impressions;
      byFormat[post.format].count++;
    }
    if (post.hookType) {
      if (!byHookType[post.hookType]) byHookType[post.hookType] = { total: 0, count: 0 };
      byHookType[post.hookType].total += impressions;
      byHookType[post.hookType].count++;
    }
  }

  return {
    totalPosts: postMetrics.length,
    avgImpressions: totalImpressions / postMetrics.length,
    avgEngagement: totalEngagement / postMetrics.length,
    topPerformers,
    byFormat: Object.fromEntries(
      Object.entries(byFormat).map(([k, v]) => [k, { count: v.count, avgImp: v.total / v.count }])
    ),
    byHookType: Object.fromEntries(
      Object.entries(byHookType).map(([k, v]) => [k, { count: v.count, avgImp: v.total / v.count }])
    ),
  };
}

