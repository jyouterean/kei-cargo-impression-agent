import { db } from "@/lib/db";
import { armPriors, metrics, publishedPosts, systemEvents } from "@/lib/db/schema";
import { config } from "@/lib/config";
import { eq, and, gte, desc } from "drizzle-orm";
import { getCurrentWeights } from "./template-synthesizer";

interface Arm {
  platform: string;
  format: string;
  hookType: string;
  topic: string;
  lengthBucket: string;
  timeBucket: string;
  dayOfWeek: number;
  emojiDensity: string;
}

interface ArmStats {
  armId: string;
  alpha: number;
  beta: number;
  totalReward: number;
  pullCount: number;
}

/**
 * Generate arm ID from arm parameters
 */
function getArmId(arm: Partial<Arm>): string {
  return [
    arm.platform || "*",
    arm.format || "*",
    arm.hookType || "*",
    arm.topic || "*",
    arm.lengthBucket || "*",
    arm.timeBucket || "*",
    arm.dayOfWeek?.toString() || "*",
    arm.emojiDensity || "*",
  ].join(":");
}

/**
 * Thompson Sampling: sample from Beta distribution
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use Gamma distribution to sample from Beta
  // Beta(a,b) = Gamma(a,1) / (Gamma(a,1) + Gamma(b,1))
  const gammaA = gammaVariate(alpha);
  const gammaB = gammaVariate(beta);
  return gammaA / (gammaA + gammaB);
}

/**
 * Generate Gamma variate using Marsaglia and Tsang's method
 */
function gammaVariate(shape: number): number {
  if (shape < 1) {
    return gammaVariate(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = gaussianRandom();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Box-Muller transform for Gaussian random number
 */
function gaussianRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * UCB1 score calculation
 */
function calculateUCB(totalReward: number, pullCount: number, totalPulls: number): number {
  if (pullCount === 0) return Infinity;
  const exploitation = totalReward / pullCount;
  const exploration = Math.sqrt((2 * Math.log(totalPulls + 1)) / pullCount);
  return exploitation + exploration;
}

/**
 * Get or create arm stats
 */
async function getArmStats(armId: string, platform: string): Promise<ArmStats> {
  const existing = await db.query.armPriors.findFirst({
    where: eq(armPriors.armId, armId),
  });

  if (existing) {
    return {
      armId: existing.armId,
      alpha: existing.alpha,
      beta: existing.beta,
      totalReward: existing.totalReward || 0,
      pullCount: existing.pullCount || 0,
    };
  }

  // Create new with default priors
  return {
    armId,
    alpha: 1.0,
    beta: 1.0,
    totalReward: 0,
    pullCount: 0,
  };
}

/**
 * Select best arm using Thompson Sampling with template weight priors
 */
export async function selectArm(
  platform: "x" | "threads",
  options: {
    candidateFormats?: string[];
    candidateHooks?: string[];
    candidateTopics?: string[];
  } = {}
): Promise<{
  format: string;
  hookType: string;
  topic: string;
  armId: string;
}> {
  // Get current template weights (from external learning)
  const weights = await getCurrentWeights(platform);

  const formats = options.candidateFormats || [...config.formats];
  const hooks = options.candidateHooks || [...config.hookTypes];
  const topics = options.candidateTopics || config.topics;

  // Get current day/time bucket
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const timeBucket = getTimeBucket(hour);

  let bestScore = -Infinity;
  let bestChoice = {
    format: formats[0],
    hookType: hooks[0],
    topic: topics[0],
    armId: "",
  };

  // Sample each combination
  for (const format of formats) {
    for (const hookType of hooks) {
      for (const topic of topics) {
        const arm: Partial<Arm> = {
          platform,
          format,
          hookType,
          topic,
          timeBucket,
          dayOfWeek,
        };

        const armId = getArmId(arm);
        const stats = await getArmStats(armId, platform);

        // Apply external learning priors
        const formatWeight = weights.formats[format] || 1.0;
        const hookWeight = weights.hookTypes[hookType] || 1.0;

        // Adjust alpha based on external weights
        const adjustedAlpha = stats.alpha * formatWeight * hookWeight;

        // Thompson Sampling
        const sample = sampleBeta(adjustedAlpha, stats.beta);

        if (sample > bestScore) {
          bestScore = sample;
          bestChoice = { format, hookType, topic, armId };
        }
      }
    }
  }

  return bestChoice;
}

/**
 * Get time bucket from hour
 */
function getTimeBucket(hour: number): string {
  if (hour >= 5 && hour < 7) return "early_morning";
  if (hour >= 7 && hour < 9) return "morning";
  if (hour >= 9 && hour < 12) return "late_morning";
  if (hour >= 12 && hour < 15) return "afternoon";
  if (hour >= 15 && hour < 18) return "evening";
  if (hour >= 18 && hour < 21) return "night";
  return "late_night";
}

/**
 * Update arm with reward from metrics
 */
export async function updateArm(
  armId: string,
  platform: string,
  reward: number
): Promise<void> {
  const existing = await db.query.armPriors.findFirst({
    where: eq(armPriors.armId, armId),
  });

  // Normalize reward to 0-1 range for Beta distribution
  const normalizedReward = Math.min(1, Math.max(0, reward / 10));

  if (existing) {
    // Update using Bayesian update
    await db
      .update(armPriors)
      .set({
        alpha: existing.alpha + normalizedReward,
        beta: existing.beta + (1 - normalizedReward),
        totalReward: (existing.totalReward || 0) + reward,
        pullCount: (existing.pullCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(armPriors.id, existing.id));
  } else {
    // Parse arm components from armId
    const parts = armId.split(":");
    await db.insert(armPriors).values({
      armId,
      platform,
      format: parts[1] !== "*" ? parts[1] : null,
      hookType: parts[2] !== "*" ? parts[2] : null,
      topic: parts[3] !== "*" ? parts[3] : null,
      lengthBucket: parts[4] !== "*" ? parts[4] : null,
      timeBucket: parts[5] !== "*" ? parts[5] : null,
      dayOfWeek: parts[6] !== "*" ? parseInt(parts[6]) : null,
      emojiDensity: parts[7] !== "*" ? parts[7] : null,
      alpha: 1 + normalizedReward,
      beta: 2 - normalizedReward,
      totalReward: reward,
      pullCount: 1,
      source: "self_learning",
    });
  }
}

/**
 * Calculate reward from impressions
 */
export function calculateReward(
  impressions24h: number,
  penalties: { duplicate?: boolean; lowQuality?: boolean; overPosting?: boolean } = {}
): number {
  // Base reward: log of impressions
  let reward = Math.log(1 + impressions24h);

  // Apply penalties
  if (penalties.duplicate) reward -= 2;
  if (penalties.lowQuality) reward -= 1;
  if (penalties.overPosting) reward -= 0.5;

  return Math.max(0, reward);
}

/**
 * Run learning update for recent posts with collected metrics
 */
export async function runLearningUpdate(): Promise<{
  updated: number;
  skipped: number;
}> {
  const results = { updated: 0, skipped: 0 };

  // Get published posts with 24h metrics that haven't been learned from
  const postsToLearn = await db.query.publishedPosts.findMany({
    where: and(
      gte(publishedPosts.publishedAt, new Date(Date.now() - 48 * 60 * 60 * 1000))
    ),
    orderBy: desc(publishedPosts.publishedAt),
    limit: 50,
  });

  for (const post of postsToLearn) {
    if (!post.armId) {
      results.skipped++;
      continue;
    }

    // Get 24h metrics
    const postMetrics = await db.query.metrics.findFirst({
      where: and(
        eq(metrics.publishedPostId, post.id),
        eq(metrics.hoursAfterPublish, 24)
      ),
    });

    if (!postMetrics) {
      results.skipped++;
      continue;
    }

    // Calculate reward
    const reward = calculateReward(postMetrics.impressionCount || 0);

    // Update arm
    await updateArm(post.armId, post.platform, reward);
    results.updated++;
  }

  // Log (even if no posts were updated)
  if (results.updated === 0 && results.skipped === 0) {
    await db.insert(systemEvents).values({
      eventType: "learning_update_complete",
      severity: "info",
      message: `Learning update completed: no posts with metrics found`,
      metadata: results,
    });
  } else {
    await db.insert(systemEvents).values({
      eventType: "learning_update_complete",
      severity: "info",
      message: `Learning update completed: ${results.updated} arms updated`,
      metadata: results,
    });
  }

  return results;
}

/**
 * Inject external priors from pattern mining
 */
export async function injectExternalPriors(
  platform: "x" | "threads",
  distribution: {
    formats: Record<string, { count: number; avgBuzz: number }>;
    hookTypes: Record<string, { count: number; avgBuzz: number }>;
  }
): Promise<void> {
  const maxFormatBuzz = Math.max(
    ...Object.values(distribution.formats).map((f) => f.avgBuzz),
    0.01
  );
  const maxHookBuzz = Math.max(
    ...Object.values(distribution.hookTypes).map((h) => h.avgBuzz),
    0.01
  );

  for (const [format, data] of Object.entries(distribution.formats)) {
    if (data.count < 3) continue;

    const priorBoost = data.avgBuzz / maxFormatBuzz;
    const armId = getArmId({ platform, format });

    const existing = await db.query.armPriors.findFirst({
      where: eq(armPriors.armId, armId),
    });

    if (existing) {
      await db
        .update(armPriors)
        .set({
          alpha: Math.max(existing.alpha, 1 + priorBoost * 2),
          source: "external_patterns",
          updatedAt: new Date(),
        })
        .where(eq(armPriors.id, existing.id));
    } else {
      await db.insert(armPriors).values({
        armId,
        platform,
        format,
        alpha: 1 + priorBoost * 2,
        beta: 1,
        source: "external_patterns",
      });
    }
  }

  for (const [hookType, data] of Object.entries(distribution.hookTypes)) {
    if (data.count < 3) continue;

    const priorBoost = data.avgBuzz / maxHookBuzz;
    const armId = getArmId({ platform, hookType });

    const existing = await db.query.armPriors.findFirst({
      where: eq(armPriors.armId, armId),
    });

    if (existing) {
      await db
        .update(armPriors)
        .set({
          alpha: Math.max(existing.alpha, 1 + priorBoost * 2),
          source: "external_patterns",
          updatedAt: new Date(),
        })
        .where(eq(armPriors.id, existing.id));
    } else {
      await db.insert(armPriors).values({
        armId,
        platform,
        hookType,
        alpha: 1 + priorBoost * 2,
        beta: 1,
        source: "external_patterns",
      });
    }
  }
}

