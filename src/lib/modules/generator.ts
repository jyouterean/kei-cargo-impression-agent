import { db } from "@/lib/db";
import { scheduledPosts, publishedPosts, systemEvents } from "@/lib/db/schema";
import { generatePost } from "@/lib/clients/openai-client";
import { selectArm } from "./bandit";
import { runAllChecks, prepareContentForStorage } from "./policy-engine";
import { config } from "@/lib/config";
import { eq, desc, gte, and } from "drizzle-orm";
import { addMinutes, addHours } from "date-fns";

/**
 * Get recent post contents for avoiding repetition
 */
async function getRecentPostContents(
  platform: "x" | "threads",
  limit: number = 10
): Promise<string[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [published, scheduled] = await Promise.all([
    db.query.publishedPosts.findMany({
      where: and(eq(publishedPosts.platform, platform), gte(publishedPosts.publishedAt, cutoff)),
      orderBy: desc(publishedPosts.publishedAt),
      limit,
    }),
    db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.platform, platform),
        eq(scheduledPosts.status, "pending")
      ),
      orderBy: desc(scheduledPosts.createdAt),
      limit,
    }),
  ]);

  return [...published.map((p) => p.content), ...scheduled.map((s) => s.content)];
}

/**
 * Generate a draft post
 */
export async function generateDraft(
  platform: "x" | "threads"
): Promise<{
  success: boolean;
  post?: {
    content: string;
    format: string;
    hookType: string;
    topic: string;
    armId: string;
  };
  error?: string;
}> {
  try {
    // Select arm using bandit
    const arm = await selectArm(platform);

    // Get recent posts for context
    const recentPosts = await getRecentPostContents(platform);

    // Generate content with timeout
    const generatePromise = generatePost({
      platform,
      format: arm.format,
      hookType: arm.hookType,
      topic: arm.topic,
      recentPosts,
    });

    // Add timeout (60 seconds for OpenAI API)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Content generation timeout (60s)")), 60000);
    });

    const generated = await Promise.race([generatePromise, timeoutPromise]);

    // Run policy checks
    const checks = await runAllChecks(generated.content, platform);

    if (!checks.passed) {
      const reasons = checks.failures.map((f) => f.reason).join(", ");
      await db.insert(systemEvents).values({
        eventType: "generate_rejected",
        severity: "warn",
        message: `Generated content rejected: ${reasons}`,
        metadata: { arm, content: generated.content, failures: checks.failures },
      });
      return { success: false, error: reasons };
    }

    return {
      success: true,
      post: {
        content: generated.content,
        format: arm.format,
        hookType: arm.hookType,
        topic: arm.topic,
        armId: arm.armId,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Generate and schedule multiple posts
 */
export async function generateAndSchedule(
  platform: "x" | "threads",
  count: number = 3
): Promise<{
  scheduled: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    scheduled: 0,
    failed: 0,
    errors: [] as string[],
  };

  // Get next available scheduling slot
  let nextSlot = await getNextScheduleSlot(platform);

  for (let i = 0; i < count; i++) {
    try {
      // Log progress
      await db.insert(systemEvents).values({
        eventType: "generate_progress",
        severity: "info",
        message: `Generating post ${i + 1}/${count} for ${platform}`,
        metadata: { platform, index: i + 1, total: count },
      });

      const result = await generateDraft(platform);

      if (!result.success || !result.post) {
        results.failed++;
        if (result.error) results.errors.push(result.error);
        // Log failure
        await db.insert(systemEvents).values({
          eventType: "generate_draft_failed",
          severity: "warn",
          message: `Failed to generate draft ${i + 1}/${count}: ${result.error}`,
          metadata: { platform, index: i + 1, error: result.error },
        });
        continue;
      }

      const { contentHash, minhashSignature } = prepareContentForStorage(result.post.content);

      // Schedule the post
      await db.insert(scheduledPosts).values({
        platform,
        content: result.post.content,
        scheduledFor: nextSlot,
        armId: result.post.armId,
        format: result.post.format,
        hookType: result.post.hookType,
        topic: result.post.topic,
        status: "pending",
        contentHash,
      });

      results.scheduled++;

      // Move to next slot
      nextSlot = addMinutes(nextSlot, config.minGapMinutes + Math.floor(Math.random() * 30));

      // Delay between generations (reduced from 1000ms to 500ms)
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.failed++;
      results.errors.push(`Post ${i + 1}: ${errorMessage}`);
      
      // Log error
      await db.insert(systemEvents).values({
        eventType: "generate_error",
        severity: "error",
        message: `Error generating post ${i + 1}/${count}: ${errorMessage}`,
        metadata: { platform, index: i + 1, error: errorMessage },
      });
    }
  }

  // Log
  await db.insert(systemEvents).values({
    eventType: "generate_batch_complete",
    severity: "info",
    message: `Generated ${results.scheduled} posts for ${platform}`,
    metadata: results,
  });

  return results;
}

/**
 * Get next available scheduling slot
 */
async function getNextScheduleSlot(platform: "x" | "threads"): Promise<Date> {
  // Get latest scheduled or published post
  const [latestScheduled, latestPublished] = await Promise.all([
    db.query.scheduledPosts.findFirst({
      where: and(eq(scheduledPosts.platform, platform), eq(scheduledPosts.status, "pending")),
      orderBy: desc(scheduledPosts.scheduledFor),
    }),
    db.query.publishedPosts.findFirst({
      where: eq(publishedPosts.platform, platform),
      orderBy: desc(publishedPosts.publishedAt),
    }),
  ]);

  const latestTime = Math.max(
    latestScheduled?.scheduledFor?.getTime() || 0,
    latestPublished?.publishedAt?.getTime() || 0
  );

  const minNextTime = latestTime + config.minGapMinutes * 60 * 1000;
  const now = Date.now();

  // Ensure it's in the future with minimum gap
  return new Date(Math.max(now + 5 * 60 * 1000, minNextTime));
}

/**
 * Get optimal posting times based on timing priors
 */
export function getOptimalPostingTimes(
  platform: "x" | "threads",
  date: Date,
  count: number = 3
): Date[] {
  const times: Date[] = [];
  const priors = platform === "x" ? config.xTimingPriors : config.threadsTimingPriors;

  // For X, use day-of-week priors
  if (platform === "x") {
    const dayWeight = priors[date.getDay() as keyof typeof priors] || 1.0;
    
    // Best hours for X based on general social media research
    const bestHours = [8, 9, 12, 17, 19];
    
    for (let i = 0; i < count && i < bestHours.length; i++) {
      const postTime = new Date(date);
      postTime.setHours(bestHours[i], Math.floor(Math.random() * 30), 0, 0);
      times.push(postTime);
    }
  } else {
    // For Threads, use time bucket priors
    const bucketHours: Record<string, number[]> = {
      early_morning: [6],
      morning: [7, 8],
      late_morning: [9, 10, 11],
      afternoon: [13, 14],
      evening: [17],
      night: [19, 20],
    };

    // Sort buckets by weight
    const sortedBuckets = Object.entries(priors as Record<string, number>)
      .sort(([, a], [, b]) => b - a)
      .slice(0, count);

    for (const [bucket] of sortedBuckets) {
      const hours = bucketHours[bucket] || [9];
      const hour = hours[Math.floor(Math.random() * hours.length)];
      const postTime = new Date(date);
      postTime.setHours(hour, Math.floor(Math.random() * 30), 0, 0);
      times.push(postTime);
    }
  }

  return times.sort((a, b) => a.getTime() - b.getTime());
}

