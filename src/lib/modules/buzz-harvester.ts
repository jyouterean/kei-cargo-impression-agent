import { db } from "@/lib/db";
import { externalPosts, systemEvents } from "@/lib/db/schema";
import { xClient } from "@/lib/clients/x-client";
import { config } from "@/lib/config";
import { eq, inArray } from "drizzle-orm";

interface HarvestedTweet {
  externalId: string;
  text: string;
  authorId: string;
  authorFollowersCount: number;
  createdAt: Date;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
  buzzScore: number;
  velocity: number;
  isJapanese: boolean;
  hasKeywordMatch: boolean;
  isSpamSuspect: boolean;
}

/**
 * Calculate BuzzScore for a tweet
 * BuzzScore = normalized engagement velocity
 */
function calculateBuzzScore(tweet: {
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
  createdAt: Date;
  followersCount: number;
}): { buzzScore: number; velocity: number } {
  const now = new Date();
  const ageHours = Math.max(0.5, (now.getTime() - tweet.createdAt.getTime()) / (1000 * 60 * 60));

  // Raw engagement
  const rawEngagement =
    tweet.likeCount + tweet.repostCount * 2 + tweet.replyCount * 1.5 + tweet.quoteCount * 2.5;

  // Velocity (engagement per hour)
  const velocity = rawEngagement / ageHours;

  // Normalize by follower count (avoid division by zero, use log to reduce impact of huge accounts)
  const normalizedVelocity = velocity / Math.log(10 + tweet.followersCount);

  return {
    buzzScore: normalizedVelocity,
    velocity,
  };
}

/**
 * Detect if text is likely Japanese
 */
function isJapaneseText(text: string): boolean {
  // Check for Japanese characters (hiragana, katakana, kanji)
  const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  return japanesePattern.test(text);
}

/**
 * Check if text contains target keywords
 */
function hasTargetKeywords(text: string): boolean {
  const keywords = [
    "軽貨物",
    "宅配",
    "配送",
    "配達",
    "委託",
    "ドライバー",
    "単価",
    "日当",
    "荷物",
    "再配達",
    "運送",
    "個建て",
    "コース",
    "軽バン",
    "配達員",
  ];
  const lowerText = text.toLowerCase();
  return keywords.some((kw) => lowerText.includes(kw));
}

/**
 * Detect spam-like patterns
 */
function detectSpamPatterns(text: string): boolean {
  const spamPatterns = [
    /(.)\1{5,}/, // Repeated characters
    /https?:\/\/\S+.*https?:\/\/\S+/, // Multiple URLs
    /【.*?】.*【.*?】.*【.*?】/, // Too many brackets
    /稼げ|儲か|月収\d+万|楽して/, // Get-rich-quick language
    /LINE|公式|登録|限定/, // Promotional spam
  ];
  return spamPatterns.some((pattern) => pattern.test(text));
}

/**
 * Harvest buzz tweets from X
 */
export async function harvestBuzzTweets(): Promise<{
  collected: number;
  skipped: number;
  errors: string[];
}> {
  const results = {
    collected: 0,
    skipped: 0,
    errors: [] as string[],
  };

  // Log start (console only for speed, DB insert is slow)
  console.log(`[BuzzHarvester] Starting harvest with ${config.buzzHarvestQueries.length} queries`);

  const harvested: HarvestedTweet[] = [];
  const allExternalIds: string[] = [];

  for (const query of config.buzzHarvestQueries) {
    try {
      // Search with 6 hour lookback (reduced from 24 hours to speed up)
      const startTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      
      // Reduced logging - only log to console, not DB (too slow)
      console.log(`[BuzzHarvester] Searching for: "${query}"`);

      const response = await xClient.searchRecentTweets(query, {
        maxResults: 50, // Reduced from 100 to 50 to speed up
        startTime,
      });

      // Log search results (console only for speed)
      const resultCount = response.data?.length || 0;
      console.log(`[BuzzHarvester] Query "${query}": Found ${resultCount} tweets`);

      if (!response.data || response.data.length === 0) {
        console.log(`[BuzzHarvester] No tweets found for query "${query}", skipping...`);
        continue;
      }

      // Build user lookup map
      const userMap = new Map<string, number>();
      for (const user of response.includes?.users || []) {
        userMap.set(user.id, user.public_metrics?.followers_count || 0);
      }

      for (const tweet of response.data) {
        allExternalIds.push(tweet.id);
        
        const followersCount = userMap.get(tweet.author_id) || 0;
        const createdAt = tweet.created_at ? new Date(tweet.created_at) : new Date();
        const isJapanese = isJapaneseText(tweet.text);
        const hasKeyword = hasTargetKeywords(tweet.text);
        const isSpam = detectSpamPatterns(tweet.text);

        // Some plans do not return public_metrics by default.
        // Guard against missing metrics and default to 0 so we don't crash.
        const metrics = tweet.public_metrics || {
          like_count: 0,
          retweet_count: 0,
          reply_count: 0,
          quote_count: 0,
        };

        // Calculate buzz score
        const { buzzScore, velocity } = calculateBuzzScore({
          likeCount: metrics.like_count ?? 0,
          repostCount: metrics.retweet_count ?? 0,
          replyCount: metrics.reply_count ?? 0,
          quoteCount: metrics.quote_count ?? 0,
          createdAt,
          followersCount,
        });

        harvested.push({
          externalId: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id,
          authorFollowersCount: followersCount,
          createdAt,
          likeCount: metrics.like_count ?? 0,
          repostCount: metrics.retweet_count ?? 0,
          replyCount: metrics.reply_count ?? 0,
          quoteCount: metrics.quote_count ?? 0,
          buzzScore,
          velocity,
          isJapanese,
          hasKeywordMatch: hasKeyword,
          isSpamSuspect: isSpam,
        });
      }

      // Rate limit consideration - reduced delay for speed
      await new Promise((resolve) => setTimeout(resolve, 300)); // Reduced from 1000ms to 300ms
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const shortMessage = errorMessage.length > 100 ? errorMessage.slice(0, 100) + "..." : errorMessage;
      results.errors.push(`Query "${query}": ${shortMessage}`);
      
      // Log error to console only (DB insert is too slow, we'll batch log errors at the end)
      console.error(`[BuzzHarvester] Error for query "${query}":`, error);
    }
  }

  // Batch check for existing posts (much faster than individual queries)
  console.log(`[BuzzHarvester] Checking ${allExternalIds.length} tweets for duplicates...`);
  let existingIdsSet = new Set<string>();
  if (allExternalIds.length > 0) {
    // Process in batches to avoid query size limits
    const batchSize = 500;
    for (let i = 0; i < allExternalIds.length; i += batchSize) {
      const batch = allExternalIds.slice(i, i + batchSize);
      const existing = await db.query.externalPosts.findMany({
        where: inArray(externalPosts.externalId, batch),
        columns: { externalId: true },
      });
      for (const post of existing) {
        existingIdsSet.add(post.externalId);
      }
    }
  }
  console.log(`[BuzzHarvester] Found ${existingIdsSet.size} duplicate tweets`);

  // Filter out duplicates before processing
  const uniqueHarvested = harvested.filter(t => !existingIdsSet.has(t.externalId));
  results.skipped = harvested.length - uniqueHarvested.length;

  // Log summary before filtering (console only for speed)
  console.log(`[BuzzHarvester] Harvested ${uniqueHarvested.length} unique tweets before filtering (top ${config.buzzTopKPerDay} will be saved)`);

  // Sort by buzz score and take top K
  uniqueHarvested.sort((a, b) => b.buzzScore - a.buzzScore);
  const topK = uniqueHarvested.slice(0, config.buzzTopKPerDay);
  console.log(`[BuzzHarvester] Top ${topK.length} tweets selected for saving`);

  // Batch insert into database (much faster)
  let insertSuccess = 0;
  let insertFailed = 0;
  
  if (topK.length > 0) {
    try {
      // Use batch insert with ON CONFLICT handling
      const insertValues = topK.map(tweet => ({
        externalId: tweet.externalId,
        platform: "x" as const,
        text: tweet.text,
        authorId: tweet.authorId,
        authorFollowersCount: tweet.authorFollowersCount,
        createdAt: tweet.createdAt,
        collectedAt: new Date(),
        likeCount: tweet.likeCount,
        repostCount: tweet.repostCount,
        replyCount: tweet.replyCount,
        quoteCount: tweet.quoteCount,
        buzzScore: tweet.buzzScore,
        velocity: tweet.velocity,
        isJapanese: tweet.isJapanese,
        hasKeywordMatch: tweet.hasKeywordMatch,
        isSpamSuspect: tweet.isSpamSuspect,
      }));

      // Insert in batches to avoid size limits
      const insertBatchSize = 100;
      for (let i = 0; i < insertValues.length; i += insertBatchSize) {
        const batch = insertValues.slice(i, i + insertBatchSize);
        try {
          await db.insert(externalPosts).values(batch);
          insertSuccess += batch.length;
          results.collected += batch.length;
        } catch (error) {
          // If batch insert fails, try individual inserts for that batch
          console.warn(`[BuzzHarvester] Batch insert failed, trying individual inserts for batch ${i}`);
          for (const tweet of batch) {
            try {
              await db.insert(externalPosts).values(tweet);
              insertSuccess++;
              results.collected++;
            } catch (err) {
              insertFailed++;
              results.skipped++;
              if (err instanceof Error && err.message.includes("duplicate")) {
                // Duplicate key - already exists, skip
              } else {
                console.error(`[BuzzHarvester] Failed to insert tweet ${tweet.externalId}:`, err instanceof Error ? err.message : String(err));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`[BuzzHarvester] Batch insert error:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log(`[BuzzHarvester] Insert complete: ${insertSuccess} succeeded, ${insertFailed} failed`);

  // Log completion with full details
  console.log(`[BuzzHarvester] Completed: ${results.collected} collected, ${results.skipped} skipped, ${results.errors.length} errors`);
  if (results.errors.length > 0) {
    console.error(`[BuzzHarvester] Errors:`, results.errors);
  }
  
  // Batch log completion to DB (single insert instead of multiple)
  await db.insert(systemEvents).values({
    eventType: "buzz_harvest_complete",
    severity: results.errors.length > 0 ? "warn" : "info",
    message: `Buzz harvest completed: ${results.collected} collected, ${results.skipped} skipped, ${results.errors.length} errors`,
    metadata: { 
      ...results, 
      insertSuccess, 
      insertFailed,
      topK: config.buzzTopKPerDay,
    },
  });

  return results;
}

/**
 * Get top buzz posts for pattern mining
 */
export async function getTopBuzzPosts(limit: number = 50): Promise<typeof externalPosts.$inferSelect[]> {
  const posts = await db.query.externalPosts.findMany({
    where: eq(externalPosts.isSpamSuspect, false),
    orderBy: (posts, { desc }) => [desc(posts.buzzScore)],
    limit,
  });
  return posts;
}


