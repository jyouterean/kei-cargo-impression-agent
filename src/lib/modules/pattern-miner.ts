import { db } from "@/lib/db";
import { patterns, externalPosts, systemEvents } from "@/lib/db/schema";
import { extractPattern } from "@/lib/clients/openai-client";
import { eq, isNull, and, gte } from "drizzle-orm";

/**
 * Check for text similarity to prevent copying
 * Returns similarity ratio (0-1)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Mine patterns from top buzz posts
 */
export async function minePatterns(): Promise<{
  processed: number;
  extracted: number;
  skipped: number;
  errors: string[];
}> {
  const results = {
    processed: 0,
    extracted: 0,
    skipped: 0,
    errors: [] as string[],
  };

  // Log start
  await db.insert(systemEvents).values({
    eventType: "pattern_mine_start",
    severity: "info",
    message: "Starting pattern mining",
  });

  // Get external posts that haven't been pattern-mined yet
  // Join to find posts without patterns
  const postsToMine = await db.query.externalPosts.findMany({
    where: and(
      eq(externalPosts.isSpamSuspect, false),
      eq(externalPosts.isJapanese, true),
      gte(externalPosts.buzzScore, 0.1) // Only mine posts with some buzz
    ),
    orderBy: (posts, { desc }) => [desc(posts.buzzScore)],
    limit: 50,
  });

  // Filter out posts that already have patterns
  const existingPatternPostIds = await db.query.patterns.findMany({
    columns: { externalPostId: true },
  });
  const minedIds = new Set(existingPatternPostIds.map((p) => p.externalPostId));

  const unmined = postsToMine.filter((p) => !minedIds.has(p.id));

  if (unmined.length === 0) {
    console.log("[PatternMiner] No posts to mine (either no external posts or all already mined)");
    await db.insert(systemEvents).values({
      eventType: "pattern_mine_complete",
      severity: "info",
      message: `Pattern mining skipped: no new posts to mine`,
      metadata: { ...results, reason: "No unmined posts available" },
    });
    return results;
  }

  for (const post of unmined) {
    results.processed++;

    try {
      // Extract pattern using LLM
      const pattern = await extractPattern(post.text);

      // Skip if quality is too low or has taboo flags
      if (pattern.qualityScore < 0.5 || pattern.tabooFlags.length >= 2) {
        results.skipped++;
        continue;
      }

      // Insert pattern
      await db.insert(patterns).values({
        externalPostId: post.id,
        format: pattern.format,
        hookType: pattern.hookType,
        payloadType: pattern.payloadType,
        rhetorical: pattern.rhetorical,
        lengthBucket: pattern.lengthBucket,
        emojiDensity: pattern.emojiDensity,
        punctuationStyle: pattern.punctuationStyle,
        tabooFlags: pattern.tabooFlags,
        qualityScore: pattern.qualityScore,
      });

      results.extracted++;

      // Rate limit - small delay between LLM calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`Post ${post.id}: ${errorMessage}`);
    }
  }

  // Log completion
  await db.insert(systemEvents).values({
    eventType: "pattern_mine_complete",
    severity: "info",
    message: `Pattern mining completed: ${results.extracted} extracted from ${results.processed} processed`,
    metadata: results,
  });

  return results;
}

/**
 * Get pattern distribution for the last N days
 */
export async function getPatternDistribution(days: number = 7): Promise<{
  formats: Record<string, { count: number; avgBuzz: number }>;
  hookTypes: Record<string, { count: number; avgBuzz: number }>;
  payloadTypes: Record<string, { count: number; avgBuzz: number }>;
}> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const recentPatterns = await db.query.patterns.findMany({
    where: gte(patterns.extractedAt, cutoff),
    orderBy: (patterns, { desc }) => [desc(patterns.extractedAt)],
    limit: 100,
  });

  // Get associated external posts for buzz scores
  const postIds = recentPatterns.map((p) => p.externalPostId);
  let posts: typeof externalPosts.$inferSelect[] = [];
  
  if (postIds.length > 0) {
    // Fetch posts one by one or in batches (drizzle doesn't support inArray in query builder easily)
    // For now, fetch individually for small sets
    if (postIds.length <= 50) {
      for (const postId of postIds) {
        const post = await db.query.externalPosts.findFirst({
          where: eq(externalPosts.id, postId),
        });
        if (post) posts.push(post);
      }
    } else {
      // For larger sets, fetch all and filter
      const allPosts = await db.query.externalPosts.findMany({ limit: 1000 });
      posts = allPosts.filter((p) => postIds.includes(p.id));
    }
  }
  
  const postMap = new Map(posts.map((p) => [p.id, p]));

  const formats: Record<string, { count: number; totalBuzz: number }> = {};
  const hookTypes: Record<string, { count: number; totalBuzz: number }> = {};
  const payloadTypes: Record<string, { count: number; totalBuzz: number }> = {};

  for (const pattern of recentPatterns) {
    const post = postMap.get(pattern.externalPostId);
    const buzz = post?.buzzScore || 0;

    if (pattern.format) {
      if (!formats[pattern.format]) formats[pattern.format] = { count: 0, totalBuzz: 0 };
      formats[pattern.format].count++;
      formats[pattern.format].totalBuzz += buzz;
    }

    if (pattern.hookType) {
      if (!hookTypes[pattern.hookType]) hookTypes[pattern.hookType] = { count: 0, totalBuzz: 0 };
      hookTypes[pattern.hookType].count++;
      hookTypes[pattern.hookType].totalBuzz += buzz;
    }

    if (pattern.payloadType) {
      if (!payloadTypes[pattern.payloadType])
        payloadTypes[pattern.payloadType] = { count: 0, totalBuzz: 0 };
      payloadTypes[pattern.payloadType].count++;
      payloadTypes[pattern.payloadType].totalBuzz += buzz;
    }
  }

  // Calculate averages
  const toAvg = (data: Record<string, { count: number; totalBuzz: number }>) => {
    const result: Record<string, { count: number; avgBuzz: number }> = {};
    for (const [key, val] of Object.entries(data)) {
      result[key] = {
        count: val.count,
        avgBuzz: val.count > 0 ? val.totalBuzz / val.count : 0,
      };
    }
    return result;
  };

  return {
    formats: toAvg(formats),
    hookTypes: toAvg(hookTypes),
    payloadTypes: toAvg(payloadTypes),
  };
}

