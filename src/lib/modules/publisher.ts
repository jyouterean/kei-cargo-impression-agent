import { db } from "@/lib/db";
import { scheduledPosts, publishedPosts, systemEvents } from "@/lib/db/schema";
import { xClient } from "@/lib/clients/x-client";
import { threadsClient } from "@/lib/clients/threads-client";
import {
  checkPostingAllowed,
  recordFailure,
  resetFailures,
  prepareContentForStorage,
} from "./policy-engine";
import { eq, and, lte, asc } from "drizzle-orm";

interface PublishResult {
  success: boolean;
  postId?: number;
  externalId?: string;
  error?: string;
}

/**
 * Publish a single scheduled post
 */
async function publishPost(
  scheduled: typeof scheduledPosts.$inferSelect
): Promise<PublishResult> {
  // Check if posting is allowed
  const allowedCheck = await checkPostingAllowed(scheduled.platform as "x" | "threads");
  if (!allowedCheck.passed) {
    return { success: false, error: allowedCheck.reason };
  }

  try {
    let externalId: string;

    if (scheduled.platform === "x") {
      const result = await xClient.postTweet(scheduled.content);
      if (!result.data?.id) {
        throw new Error("No tweet ID returned");
      }
      externalId = result.data.id;
    } else if (scheduled.platform === "threads") {
      const result = await threadsClient.postThread(scheduled.content);
      externalId = result.id;
    } else {
      throw new Error(`Unknown platform: ${scheduled.platform}`);
    }

    // Prepare content for storage
    const { contentHash, minhashSignature } = prepareContentForStorage(scheduled.content);

    // Record as published
    const [published] = await db
      .insert(publishedPosts)
      .values({
        scheduledPostId: scheduled.id,
        platform: scheduled.platform,
        externalId,
        content: scheduled.content,
        armId: scheduled.armId,
        format: scheduled.format,
        hookType: scheduled.hookType,
        topic: scheduled.topic,
        contentHash,
        minhashSignature,
      })
      .returning();

    // Update scheduled post status
    await db
      .update(scheduledPosts)
      .set({ status: "published" })
      .where(eq(scheduledPosts.id, scheduled.id));

    // Reset failure counter on success
    await resetFailures();

    // Log success
    await db.insert(systemEvents).values({
      eventType: "post_published",
      severity: "info",
      message: `Published to ${scheduled.platform}: ${scheduled.content.slice(0, 50)}...`,
      metadata: { scheduledId: scheduled.id, publishedId: published.id, externalId },
    });

    return { success: true, postId: published.id, externalId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failure
    await recordFailure();

    // Update retry count or mark as failed
    const newRetryCount = (scheduled.retryCount || 0) + 1;
    const maxRetries = 3;

    if (newRetryCount >= maxRetries) {
      await db
        .update(scheduledPosts)
        .set({ status: "failed", retryCount: newRetryCount })
        .where(eq(scheduledPosts.id, scheduled.id));
    } else {
      await db
        .update(scheduledPosts)
        .set({ retryCount: newRetryCount })
        .where(eq(scheduledPosts.id, scheduled.id));
    }

    // Log error
    await db.insert(systemEvents).values({
      eventType: "post_failed",
      severity: "error",
      message: `Failed to publish to ${scheduled.platform}: ${errorMessage}`,
      metadata: { scheduledId: scheduled.id, retryCount: newRetryCount, error: errorMessage },
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Publish all due scheduled posts
 */
export async function publishDuePosts(): Promise<{
  published: number;
  failed: number;
  skipped: number;
  results: PublishResult[];
}> {
  const now = new Date();
  const results: PublishResult[] = [];
  let published = 0;
  let failed = 0;
  let skipped = 0;

  // Get posts due for publishing
  const duePosts = await db.query.scheduledPosts.findMany({
    where: and(
      eq(scheduledPosts.status, "pending"),
      lte(scheduledPosts.scheduledFor, now)
    ),
    orderBy: asc(scheduledPosts.scheduledFor),
    limit: 5, // Process a limited batch
  });

  if (duePosts.length === 0) {
    return { published: 0, failed: 0, skipped: 0, results: [] };
  }

  for (const post of duePosts) {
    const result = await publishPost(post);
    results.push(result);

    if (result.success) {
      published++;
    } else {
      failed++;
    }

    // Delay between posts to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Log batch result
  await db.insert(systemEvents).values({
    eventType: "publish_batch_complete",
    severity: "info",
    message: `Publish batch: ${published} published, ${failed} failed`,
    metadata: { published, failed, skipped, count: duePosts.length },
  });

  return { published, failed, skipped, results };
}

/**
 * Cancel a scheduled post
 */
export async function cancelScheduledPost(id: number): Promise<boolean> {
  const result = await db
    .update(scheduledPosts)
    .set({ status: "cancelled" })
    .where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.status, "pending")));

  return true;
}

/**
 * Get publishing queue status
 */
export async function getQueueStatus(): Promise<{
  pending: number;
  publishedToday: number;
  failedToday: number;
  nextScheduled?: Date;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pending, publishedToday, failedToday, nextScheduled] = await Promise.all([
    db.query.scheduledPosts.findMany({
      where: eq(scheduledPosts.status, "pending"),
    }),
    db.query.publishedPosts.findMany({
      where: and(
        eq(publishedPosts.publishedAt as any, today)
      ),
    }),
    db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.status, "failed"),
        lte(scheduledPosts.createdAt as any, today)
      ),
    }),
    db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.status, "pending"),
      orderBy: asc(scheduledPosts.scheduledFor),
    }),
  ]);

  return {
    pending: pending.length,
    publishedToday: publishedToday.length,
    failedToday: failedToday.length,
    nextScheduled: nextScheduled?.scheduledFor,
  };
}

