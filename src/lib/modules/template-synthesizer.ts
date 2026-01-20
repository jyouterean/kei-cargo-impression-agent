import { db } from "@/lib/db";
import { templateWeights, systemEvents } from "@/lib/db/schema";
import { getPatternDistribution } from "./pattern-miner";
import { eq, and, gte } from "drizzle-orm";
import { config } from "@/lib/config";

/**
 * Get the start of the current week (Monday)
 */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Calculate weight from distribution data
 * Uses normalized average buzz score
 */
function calculateWeight(avgBuzz: number, count: number, maxBuzz: number): number {
  if (count < 2 || maxBuzz === 0) return 1.0; // Not enough data
  
  // Normalize to 0.5-2.0 range
  const normalized = avgBuzz / maxBuzz;
  return 0.5 + normalized * 1.5;
}

/**
 * Synthesize template weights from pattern distribution
 */
export async function synthesizeTemplates(): Promise<{
  updated: number;
  created: number;
}> {
  const results = { updated: 0, created: 0 };
  const weekStart = getWeekStart();

  // Log start
  await db.insert(systemEvents).values({
    eventType: "template_synthesize_start",
    severity: "info",
    message: "Starting template synthesis",
  });

  // Get pattern distribution from last 7 days
  const distribution = await getPatternDistribution(7);

  // Calculate max values for normalization
  const maxFormatBuzz = Math.max(...Object.values(distribution.formats).map((f) => f.avgBuzz), 0.01);
  const maxHookBuzz = Math.max(...Object.values(distribution.hookTypes).map((h) => h.avgBuzz), 0.01);
  const maxPayloadBuzz = Math.max(
    ...Object.values(distribution.payloadTypes).map((p) => p.avgBuzz),
    0.01
  );

  // Update weights for each platform
  for (const platform of ["x", "threads"] as const) {
    // Format weights
    for (const format of config.formats) {
      const data = distribution.formats[format] || { count: 0, avgBuzz: 0 };
      const weight = calculateWeight(data.avgBuzz, data.count, maxFormatBuzz);

      await upsertWeight({
        weekStart,
        platform,
        format,
        hookType: null,
        payloadType: null,
        weight,
        sampleCount: data.count,
        avgBuzzScore: data.avgBuzz,
      });
      results.created++;
    }

    // Hook type weights
    for (const hookType of config.hookTypes) {
      const data = distribution.hookTypes[hookType] || { count: 0, avgBuzz: 0 };
      const weight = calculateWeight(data.avgBuzz, data.count, maxHookBuzz);

      await upsertWeight({
        weekStart,
        platform,
        format: null,
        hookType,
        payloadType: null,
        weight,
        sampleCount: data.count,
        avgBuzzScore: data.avgBuzz,
      });
      results.created++;
    }

    // Payload type weights
    for (const payloadType of config.payloadTypes) {
      const data = distribution.payloadTypes[payloadType] || { count: 0, avgBuzz: 0 };
      const weight = calculateWeight(data.avgBuzz, data.count, maxPayloadBuzz);

      await upsertWeight({
        weekStart,
        platform,
        format: null,
        hookType: null,
        payloadType,
        weight,
        sampleCount: data.count,
        avgBuzzScore: data.avgBuzz,
      });
      results.created++;
    }
  }

  // Log completion
  await db.insert(systemEvents).values({
    eventType: "template_synthesize_complete",
    severity: "info",
    message: `Template synthesis completed: ${results.created} weights updated`,
    metadata: results,
  });

  return results;
}

/**
 * Upsert a template weight
 */
async function upsertWeight(params: {
  weekStart: Date;
  platform: string;
  format: string | null;
  hookType: string | null;
  payloadType: string | null;
  weight: number;
  sampleCount: number;
  avgBuzzScore: number;
}): Promise<void> {
  // Try to find existing
  const existing = await db.query.templateWeights.findFirst({
    where: and(
      eq(templateWeights.weekStart, params.weekStart),
      eq(templateWeights.platform, params.platform),
      params.format ? eq(templateWeights.format, params.format) : undefined,
      params.hookType ? eq(templateWeights.hookType, params.hookType) : undefined,
      params.payloadType ? eq(templateWeights.payloadType, params.payloadType) : undefined
    ),
  });

  if (existing) {
    await db
      .update(templateWeights)
      .set({
        weight: params.weight,
        sampleCount: params.sampleCount,
        avgBuzzScore: params.avgBuzzScore,
        updatedAt: new Date(),
      })
      .where(eq(templateWeights.id, existing.id));
  } else {
    await db.insert(templateWeights).values({
      weekStart: params.weekStart,
      platform: params.platform,
      format: params.format,
      hookType: params.hookType,
      payloadType: params.payloadType,
      weight: params.weight,
      sampleCount: params.sampleCount,
      avgBuzzScore: params.avgBuzzScore,
    });
  }
}

/**
 * Get current template weights for a platform
 */
export async function getCurrentWeights(platform: "x" | "threads"): Promise<{
  formats: Record<string, number>;
  hookTypes: Record<string, number>;
  payloadTypes: Record<string, number>;
}> {
  const weekStart = getWeekStart();

  const weights = await db.query.templateWeights.findMany({
    where: and(
      eq(templateWeights.platform, platform),
      gte(templateWeights.weekStart, weekStart)
    ),
  });

  const formats: Record<string, number> = {};
  const hookTypes: Record<string, number> = {};
  const payloadTypes: Record<string, number> = {};

  // Initialize with defaults
  for (const f of config.formats) formats[f] = 1.0;
  for (const h of config.hookTypes) hookTypes[h] = 1.0;
  for (const p of config.payloadTypes) payloadTypes[p] = 1.0;

  // Apply learned weights
  for (const w of weights) {
    if (w.format) formats[w.format] = w.weight;
    if (w.hookType) hookTypes[w.hookType] = w.weight;
    if (w.payloadType) payloadTypes[w.payloadType] = w.weight;
  }

  return { formats, hookTypes, payloadTypes };
}

