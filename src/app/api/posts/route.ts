import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishedPosts, scheduledPosts, metrics } from "@/lib/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get posts (published and scheduled)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform") as "x" | "threads" | null;
    const type = url.searchParams.get("type") as "published" | "scheduled" | null;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const days = parseInt(url.searchParams.get("days") || "7", 10);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result: {
      published?: Array<{
        id: number;
        platform: string;
        content: string;
        publishedAt: string;
        format?: string | null;
        hookType?: string | null;
        topic?: string | null;
        metrics?: {
          impressions?: number | null;
          likes?: number | null;
          reposts?: number | null;
          replies?: number | null;
        };
      }>;
      scheduled?: Array<{
        id: number;
        platform: string;
        content: string;
        scheduledFor: string;
        status: string;
        format?: string | null;
        hookType?: string | null;
        topic?: string | null;
      }>;
    } = {};

    // Get published posts
    if (!type || type === "published") {
      const published = await db.query.publishedPosts.findMany({
        where: platform
          ? and(eq(publishedPosts.platform, platform), gte(publishedPosts.publishedAt, cutoff))
          : gte(publishedPosts.publishedAt, cutoff),
        orderBy: desc(publishedPosts.publishedAt),
        limit,
      });

      // Get metrics for each post
      const publishedWithMetrics = await Promise.all(
        published.map(async (post) => {
          const postMetrics = await db.query.metrics.findFirst({
            where: and(eq(metrics.publishedPostId, post.id), eq(metrics.hoursAfterPublish, 24)),
          });

          return {
            id: post.id,
            platform: post.platform,
            content: post.content,
            publishedAt: post.publishedAt.toISOString(),
            format: post.format,
            hookType: post.hookType,
            topic: post.topic,
            metrics: postMetrics
              ? {
                  impressions: postMetrics.impressionCount,
                  likes: postMetrics.likeCount || postMetrics.threadsLikes,
                  reposts: postMetrics.repostCount || postMetrics.threadsReposts,
                  replies: postMetrics.replyCount || postMetrics.threadsReplies,
                }
              : undefined,
          };
        })
      );

      result.published = publishedWithMetrics;
    }

    // Get scheduled posts
    if (!type || type === "scheduled") {
      const scheduled = await db.query.scheduledPosts.findMany({
        where: platform
          ? and(eq(scheduledPosts.platform, platform), eq(scheduledPosts.status, "pending"))
          : eq(scheduledPosts.status, "pending"),
        orderBy: desc(scheduledPosts.scheduledFor),
        limit,
      });

      result.scheduled = scheduled.map((post) => ({
        id: post.id,
        platform: post.platform,
        content: post.content,
        scheduledFor: post.scheduledFor.toISOString(),
        status: post.status,
        format: post.format,
        hookType: post.hookType,
        topic: post.topic,
      }));
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

