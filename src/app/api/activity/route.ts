import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  publishedPosts,
  scheduledPosts,
  systemEvents,
  externalPosts,
  metrics,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get activity timeline with all actions
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const activities: Array<{
      id: string;
      type: string;
      action: string;
      timestamp: string;
      platform?: string;
      content?: string;
      status?: string;
      metrics?: {
        impressions?: number;
        likes?: number;
        reposts?: number;
        replies?: number;
      };
      metadata?: Record<string, any>;
    }> = [];

    // Get published posts with latest metrics
    const posts = await db.query.publishedPosts.findMany({
      orderBy: desc(publishedPosts.publishedAt),
      limit: 30,
    });

    for (const post of posts) {
      // Get latest metrics
      const latestMetrics = await db.query.metrics.findFirst({
        where: eq(metrics.publishedPostId, post.id),
        orderBy: desc(metrics.collectedAt),
      });

      activities.push({
        id: `post-${post.id}`,
        type: "post",
        action: "投稿",
        timestamp: post.publishedAt.toISOString(),
        platform: post.platform,
        content: post.content.slice(0, 100) + (post.content.length > 100 ? "..." : ""),
        status: "published",
        metrics: latestMetrics
          ? {
              impressions: latestMetrics.impressionCount || undefined,
              likes: latestMetrics.likeCount || undefined,
              reposts: latestMetrics.repostCount || undefined,
              replies: latestMetrics.replyCount || undefined,
            }
          : undefined,
        metadata: {
          format: post.format,
          hookType: post.hookType,
          topic: post.topic,
          externalId: post.externalId,
        },
      });
    }

    // Get scheduled posts
    const scheduled = await db.query.scheduledPosts.findMany({
      orderBy: desc(scheduledPosts.createdAt),
      limit: 20,
      where: eq(scheduledPosts.status, "pending"),
    });

    for (const scheduledPost of scheduled) {
      activities.push({
        id: `scheduled-${scheduledPost.id}`,
        type: "scheduled",
        action: "スケジュール予約",
        timestamp: scheduledPost.createdAt.toISOString(),
        platform: scheduledPost.platform,
        content: scheduledPost.content.slice(0, 100) + (scheduledPost.content.length > 100 ? "..." : ""),
        status: scheduledPost.status,
        metadata: {
          scheduledFor: scheduledPost.scheduledFor.toISOString(),
          format: scheduledPost.format,
          hookType: scheduledPost.hookType,
          topic: scheduledPost.topic,
        },
      });
    }

    // Get system events
    const events = await db.query.systemEvents.findMany({
      orderBy: desc(systemEvents.createdAt),
      limit: 30,
    });

    for (const event of events) {
      activities.push({
        id: `event-${event.id}`,
        type: "system",
        action: event.eventType,
        timestamp: event.createdAt.toISOString(),
        status: event.severity,
        content: event.message,
        metadata: {
          severity: event.severity,
          ...(event.metadata || {}), // Include full metadata for debugging
        },
      });
    }

    // Get external posts collected
    const external = await db.query.externalPosts.findMany({
      orderBy: desc(externalPosts.collectedAt),
      limit: 20,
    });

    for (const extPost of external) {
      activities.push({
        id: `external-${extPost.id}`,
        type: "harvest",
        action: "バズ収集",
        timestamp: extPost.collectedAt.toISOString(),
        platform: extPost.platform,
        content: extPost.text.slice(0, 100) + (extPost.text.length > 100 ? "..." : ""),
        metadata: {
          buzzScore: extPost.buzzScore,
          likeCount: extPost.likeCount,
          authorFollowersCount: extPost.authorFollowersCount,
        },
      });
    }

    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return Response.json({
      activities: activities.slice(0, limit),
      total: activities.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

