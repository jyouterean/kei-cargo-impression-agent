import { db } from "@/lib/db";
import {
  publishedPosts,
  scheduledPosts,
  ngExpressions,
  systemEvents,
  learningState,
} from "@/lib/db/schema";
import { checkContentSafety } from "@/lib/clients/openai-client";
import { config } from "@/lib/config";
import { eq, gte, and, desc } from "drizzle-orm";
import crypto from "crypto";

// MinHash implementation for similarity detection
class MinHash {
  private numPerm: number;
  private hashValues: number[];

  constructor(numPerm: number = 128) {
    this.numPerm = numPerm;
    this.hashValues = new Array(numPerm).fill(Infinity);
  }

  // Generate shingles from text
  private getShingles(text: string, k: number = 3): Set<string> {
    const shingles = new Set<string>();
    const normalized = text.toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i <= normalized.length - k; i++) {
      shingles.add(normalized.slice(i, i + k));
    }
    return shingles;
  }

  // Hash function
  private hash(shingle: string, seed: number): number {
    const hash = crypto
      .createHash("md5")
      .update(shingle + seed.toString())
      .digest();
    return hash.readUInt32LE(0);
  }

  // Update signature with text
  update(text: string): void {
    const shingles = this.getShingles(text);
    for (const shingle of shingles) {
      for (let i = 0; i < this.numPerm; i++) {
        const h = this.hash(shingle, i);
        if (h < this.hashValues[i]) {
          this.hashValues[i] = h;
        }
      }
    }
  }

  // Get signature
  getSignature(): number[] {
    return [...this.hashValues];
  }

  // Calculate Jaccard similarity from signatures
  static similarity(sig1: number[], sig2: number[]): number {
    if (sig1.length !== sig2.length) return 0;
    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) matches++;
    }
    return matches / sig1.length;
  }
}

/**
 * Generate content hash for exact match detection
 */
function generateContentHash(content: string): string {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Generate MinHash signature for similarity detection
 */
function generateMinHashSignature(content: string): number[] {
  const mh = new MinHash(64);
  mh.update(content);
  return mh.getSignature();
}

interface PolicyCheckResult {
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

/**
 * Check if posting is allowed (kill switch, rate limits)
 */
export async function checkPostingAllowed(platform: "x" | "threads"): Promise<PolicyCheckResult> {
  // Kill switch
  if (config.killSwitch) {
    return { passed: false, reason: "Kill switch is active" };
  }

  // Check consecutive failures
  const failState = await db.query.learningState.findFirst({
    where: eq(learningState.key, "consecutive_failures"),
  });
  const consecutiveFails = (failState?.value as { count?: number })?.count || 0;
  if (consecutiveFails >= config.maxConsecutiveFails) {
    return {
      passed: false,
      reason: `Too many consecutive failures (${consecutiveFails})`,
    };
  }

  // Check daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayPosts = await db.query.publishedPosts.findMany({
    where: and(eq(publishedPosts.platform, platform), gte(publishedPosts.publishedAt, today)),
  });

  const maxPosts = platform === "x" ? config.maxPostsPerDayX : config.maxPostsPerDayThreads;
  if (todayPosts.length >= maxPosts) {
    return {
      passed: false,
      reason: `Daily limit reached (${todayPosts.length}/${maxPosts})`,
    };
  }

  // Check minimum gap
  const lastPost = await db.query.publishedPosts.findFirst({
    where: eq(publishedPosts.platform, platform),
    orderBy: desc(publishedPosts.publishedAt),
  });

  if (lastPost) {
    const minsSinceLastPost =
      (Date.now() - lastPost.publishedAt.getTime()) / (1000 * 60);
    if (minsSinceLastPost < config.minGapMinutes) {
      return {
        passed: false,
        reason: `Minimum gap not met (${minsSinceLastPost.toFixed(1)}/${config.minGapMinutes} mins)`,
      };
    }
  }

  return { passed: true };
}

/**
 * Check content for duplicates against recent posts
 */
export async function checkDuplicates(
  content: string,
  platform: "x" | "threads"
): Promise<PolicyCheckResult> {
  const hash = generateContentHash(content);
  const signature = generateMinHashSignature(content);

  // Check last 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Exact match check
  const exactMatch = await db.query.publishedPosts.findFirst({
    where: and(eq(publishedPosts.contentHash, hash), gte(publishedPosts.publishedAt, cutoff)),
  });

  if (exactMatch) {
    return { passed: false, reason: "Exact duplicate detected" };
  }

  // Similarity check using MinHash
  const recentPosts = await db.query.publishedPosts.findMany({
    where: and(eq(publishedPosts.platform, platform), gte(publishedPosts.publishedAt, cutoff)),
    orderBy: desc(publishedPosts.publishedAt),
    limit: 100,
  });

  for (const post of recentPosts) {
    if (post.minhashSignature) {
      const similarity = MinHash.similarity(signature, post.minhashSignature as number[]);
      if (similarity > config.duplicateSimThreshold) {
        return {
          passed: false,
          reason: `Similar post detected (similarity: ${(similarity * 100).toFixed(1)}%)`,
          details: { similarPostId: post.id, similarity },
        };
      }
    }
  }

  return { passed: true };
}

/**
 * Check content against NG expressions
 */
export async function checkNGExpressions(content: string): Promise<PolicyCheckResult> {
  const expressions = await db.query.ngExpressions.findMany({
    where: eq(ngExpressions.isActive, true),
  });

  for (const expr of expressions) {
    let matched = false;

    switch (expr.patternType) {
      case "exact":
        matched = content.includes(expr.pattern);
        break;
      case "contains":
        matched = content.toLowerCase().includes(expr.pattern.toLowerCase());
        break;
      case "regex":
        try {
          const regex = new RegExp(expr.pattern, "i");
          matched = regex.test(content);
        } catch {
          // Invalid regex, skip
        }
        break;
    }

    if (matched) {
      return {
        passed: false,
        reason: `NG expression detected: ${expr.category || expr.pattern}`,
        details: { pattern: expr.pattern, category: expr.category },
      };
    }
  }

  return { passed: true };
}

/**
 * Check content safety using LLM
 */
export async function checkSafety(content: string): Promise<PolicyCheckResult> {
  try {
    const result = await checkContentSafety(content);

    if (result.isSpam) {
      return { passed: false, reason: "Content flagged as spam" };
    }

    if (result.ragebaitScore > config.ragebaitScoreThreshold) {
      return {
        passed: false,
        reason: `Ragebait score too high (${result.ragebaitScore})`,
        details: { issues: result.issues },
      };
    }

    if (result.issues.length > 0) {
      return {
        passed: true,
        details: { warnings: result.issues },
      };
    }

    return { passed: true };
  } catch (error) {
    // On safety check failure, err on the side of caution but don't block
    await db.insert(systemEvents).values({
      eventType: "safety_check_error",
      severity: "warn",
      message: `Safety check failed: ${error}`,
    });
    return { passed: true, details: { safetyCheckFailed: true } };
  }
}

/**
 * Run all policy checks on content
 */
export async function runAllChecks(
  content: string,
  platform: "x" | "threads"
): Promise<{
  passed: boolean;
  failures: PolicyCheckResult[];
  warnings: string[];
}> {
  const failures: PolicyCheckResult[] = [];
  const warnings: string[] = [];

  // Check 1: Posting allowed
  const postingCheck = await checkPostingAllowed(platform);
  if (!postingCheck.passed) {
    failures.push(postingCheck);
  }

  // Check 2: Duplicates
  const dupCheck = await checkDuplicates(content, platform);
  if (!dupCheck.passed) {
    failures.push(dupCheck);
  }

  // Check 3: NG expressions
  const ngCheck = await checkNGExpressions(content);
  if (!ngCheck.passed) {
    failures.push(ngCheck);
  }

  // Check 4: Safety
  const safetyCheck = await checkSafety(content);
  if (!safetyCheck.passed) {
    failures.push(safetyCheck);
  } else if (safetyCheck.details?.warnings) {
    warnings.push(...(safetyCheck.details.warnings as string[]));
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}

/**
 * Record a failure for consecutive failure tracking
 */
export async function recordFailure(): Promise<void> {
  const existing = await db.query.learningState.findFirst({
    where: eq(learningState.key, "consecutive_failures"),
  });

  const currentCount = (existing?.value as { count?: number })?.count || 0;

  if (existing) {
    await db
      .update(learningState)
      .set({
        value: { count: currentCount + 1 },
        updatedAt: new Date(),
      })
      .where(eq(learningState.id, existing.id));
  } else {
    await db.insert(learningState).values({
      key: "consecutive_failures",
      value: { count: 1 },
    });
  }
}

/**
 * Reset failure counter on successful post
 */
export async function resetFailures(): Promise<void> {
  const existing = await db.query.learningState.findFirst({
    where: eq(learningState.key, "consecutive_failures"),
  });

  if (existing) {
    await db
      .update(learningState)
      .set({
        value: { count: 0 },
        updatedAt: new Date(),
      })
      .where(eq(learningState.id, existing.id));
  }
}

/**
 * Generate content hash and signature for storage
 */
export function prepareContentForStorage(content: string): {
  contentHash: string;
  minhashSignature: number[];
} {
  return {
    contentHash: generateContentHash(content),
    minhashSignature: generateMinHashSignature(content),
  };
}

